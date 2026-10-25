import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import type { DshBackendSettings } from '../../../../../src/core/types/settings';

const live = process.env.RUN_DSH_NATIVE_LIVE === '1' ? describe : describe.skip;

live('installed Harness native protocol (zero model requests)', () => {
  beforeAll(() => {
    const source = execFileSync(process.execPath, ['--input-type=module', '-e',
      'import {bundleDshServiceSource} from "./scripts/build-utils.mjs"; process.stdout.write(bundleDshServiceSource());'], { cwd: process.cwd(), encoding: 'utf8' });
    Object.defineProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE', { value: source, configurable: true });
  });
  afterAll(() => { Reflect.deleteProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE'); });

  function fixture(args: string[] = []) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'opencodian-dsh-native-test-'));
    const current: DshBackendSettings = { executablePath: '', workingDirectory: root, args, env: {}, profile: 'acp', transport: 'native', mcpServers: [] };
    const adapter = new DshAdapter({ workingDirectory: root, getSettings: () => current,
      getExtraEnv: () => ({ HOME: root, DSH_HOME: path.join(root, '.dsh'), XDG_CONFIG_HOME: path.join(root, '.config'), XDG_DATA_HOME: path.join(root, '.local/share') }) });
    return { root, current, adapter };
  }

  it('lists actual models/tools/commands, updates MCP over stdio and HTTP, and stops owned children', async () => {
    const { root, adapter, current } = fixture();
    const methods: string[] = [];
    const server = createServer((request, response) => {
      let body = ''; request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        if (request.method !== 'POST') { response.writeHead(405); response.end(); return; }
        const frame = JSON.parse(body) as { id?: number; method: string; params?: { protocolVersion?: string } };
        methods.push(frame.method);
        if (frame.id === undefined) { response.writeHead(202); response.end(); return; }
        const result = frame.method === 'initialize'
          ? { protocolVersion: frame.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'owned-http', version: '1' } }
          : { tools: [{ name: 'owned_http_echo', description: 'Owned native protocol probe', inputSchema: { type: 'object', properties: {} } }] };
        response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('HTTP probe address unavailable');
    const pidFile = path.join(root, 'mcp.pid');
    const script = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));
      require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;
      const result=m.method==='initialize'?{protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned',version:'1'}}:{tools:[]};
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});`;
    let childPid = 0;
    try {
      const id = await adapter.createSession();
      expect((await adapter.readSessionConfiguration(id)).images).toBe(true);
      expect((await adapter.listTools('', '')).length).toBeGreaterThan(0);
      expect((await adapter.getRuntimeCommands(id)).length).toBeGreaterThan(0);
      await adapter.updateSessionTitle(id, 'Native protocol probe');
      await expect(adapter.getSessionMessages(id)).resolves.toEqual([]);
      current.mcpServers = [{ name: 'owned_stdio', command: process.execPath, args: ['-e', script], env: [] }];
      await expect(adapter.applyMcpConfiguration()).resolves.toBe(1);
      childPid = Number(readFileSync(pidFile, 'utf8'));
      current.mcpServers = [{ type: 'http', name: 'owned_http', url: `http://127.0.0.1:${address.port}/mcp`, headers: [] }];
      await adapter.applyMcpConfiguration();
      expect(methods).toEqual(expect.arrayContaining(['initialize', 'tools/list']));
      expect((await adapter.refreshToolIds()).some((name) => name.includes('owned_http_echo'))).toBe(true);
      current.mcpServers = []; await adapter.applyMcpConfiguration();
      await expect(adapter.forkSession(id)).rejects.toThrow('boundary');
    } finally {
      await adapter.stop(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    expect(childPid).toBeGreaterThan(0);
    expect(() => process.kill(childPid, 0)).toThrow();
    expect(existsSync(path.join(root, '.dsh/profiles/sdk'))).toBe(false);
  }, 60_000);

  it('reads an existing SDK profile without rewriting it and preserves relative plugin paths', async () => {
    const { root, adapter } = fixture();
    const profile = path.join(root, '.dsh/profiles/sdk'); mkdirSync(profile, { recursive: true });
    const files = {
      'package.json': JSON.stringify({ name: 'owned-sdk-profile', private: true, dependencies: {},
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app'] } } }),
      'cordis.yml': '# Owned profile sentinel: preserve exact bytes.\n',
      'cordis.patch.yml': '- insert:\n    - id: owned-profile-probe\n      name: ./probe.mjs\n      inject: [commands]\n',
      'probe.mjs': `export const name='owned-profile-probe'; export function apply(ctx){ctx.commands.register({name:'owned_profile_probe',description:'Owned profile probe',handler:async()=>({kind:'success',text:'PROFILE_PRESERVED'})});}`,
    };
    for (const [name, contents] of Object.entries(files)) writeFileSync(path.join(profile, name), contents);
    try {
      const id = await adapter.createSession();
      let text = '';
      for await (const chunk of adapter.sendMessage({ sessionId: id, content: '/owned_profile_probe' })) {
        if (chunk.type === 'text') text += chunk.content;
        if (chunk.type === 'error') throw new Error(chunk.content);
      }
      expect(text).toBe('PROFILE_PRESERVED');
    } finally { await adapter.stop(); }
    for (const [name, contents] of Object.entries(files)) expect(readFileSync(path.join(profile, name), 'utf8')).toBe(contents);
  }, 45_000);

  it('answers and cancels actual native user-question requests through the adapter', async () => {
    const pluginRoot = mkdtempSync(path.join(os.tmpdir(), 'opencodian-dsh-question-test-'));
    const plugin = path.join(pluginRoot, 'probe.mjs');
    const patch = path.join(pluginRoot, 'probe.patch.yml');
    writeFileSync(plugin, `export const name='owned-native-question-probe'; export function apply(ctx){
      ctx.commands.register({name:'owned_question_probe',description:'Owned question probe',handler:async({agent,signal})=>{
        const answer=await ctx.userQuestions.ask({agent,signal,questions:[{id:'choice',question:'Proceed with this test?',header:'Native test',options:[{label:'Yes'},{label:'No'}]}]});
        return {kind:'success',text:JSON.stringify(answer)};
      }}); }`);
    writeFileSync(patch, `- insert:\n    - id: owned-question-probe\n      name: ${JSON.stringify(plugin)}\n      inject: [commands, userQuestions]\n`);
    const { adapter } = fixture(['--patch', patch]);
    try {
      const id = await adapter.createSession();
      let answer = '';
      for await (const chunk of adapter.sendMessage({ sessionId: id, content: '/owned_question_probe',
        options: { memoryInjection: 'Context preceding slash commands must not consume the command.' } })) {
        if (chunk.type === 'question_request') await adapter.replyToQuestion(chunk.request.id, [['Yes']]);
        if (chunk.type === 'text') answer += chunk.content;
        if (chunk.type === 'error') throw new Error(chunk.content);
      }
      expect(JSON.parse(answer)).toEqual({ answers: [{ id: 'choice', selected: ['Yes'] }] });
      let sawQuestion = false;
      for await (const chunk of adapter.sendMessage({ sessionId: id, content: '/owned_question_probe' })) {
        if (chunk.type === 'question_request') { sawQuestion = true; await adapter.cancelStream(id); }
        if (chunk.type === 'error') throw new Error(chunk.content);
      }
      expect(sawQuestion).toBe(true); await expect(adapter.getPendingQuestions()).resolves.toEqual([]);
    } finally { await adapter.stop(); }
  }, 45_000);
});
