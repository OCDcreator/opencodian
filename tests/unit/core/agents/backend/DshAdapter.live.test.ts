import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';

const liveDescribe = process.env.RUN_DSH_LIVE === '1' ? describe : describe.skip;

liveDescribe('DshAdapter live ACP probe', () => {
  it('mounts and closes an owned native stdio MCP server without prompting a model', async () => {
    const isolatedHome = mkdtempSync(path.join(os.tmpdir(), 'opencodian-dsh-mcp-'));
    const logFile = path.join(isolatedHome, 'mcp-methods.jsonl');
    const script = `
const fs = require('node:fs');
const readline = require('node:readline');
readline.createInterface({input:process.stdin}).on('line', line => {
  const request = JSON.parse(line);
  fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({method:request.method,pid:process.pid}) + '\\n');
  if (request.id === undefined) return;
  const result = request.method === 'initialize'
    ? {protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'opencodian-owned-probe',version:'1'}}
    : request.method === 'tools/list' ? {tools:[]} : {};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result}) + '\\n');
});
`;
    const adapter = new DshAdapter({
      workingDirectory: '/tmp',
      getSettings: () => ({ executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'acp',
        mcpServers: [{ name: 'owned_probe', command: process.execPath, args: ['-e', script], env: [] }] }),
      getExtraEnv: () => ({ HOME: isolatedHome, DSH_HOME: path.join(isolatedHome, '.dsh'),
        XDG_CONFIG_HOME: path.join(isolatedHome, '.config'), XDG_DATA_HOME: path.join(isolatedHome, '.local', 'share') }),
    });
    let nativeMcpPid = 0;
    try {
      const sessionId = await adapter.createSession();
      const calls = readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { method: string; pid: number });
      const methods = calls.map((call) => call.method);
      nativeMcpPid = calls[0].pid;
      expect(methods).toContain('initialize');
      expect(methods).toContain('tools/list');
      const config = await adapter.readSessionConfiguration(sessionId);
      process.stdout.write(`${JSON.stringify({ stage: 'native-mcp-mounted', sessionId, methods, images: config.images, controls: config.controls.length })}\n`);
      for (const id of ['reasoning_effort', 'model']) {
        const before = (await adapter.readSessionConfiguration(sessionId)).controls.find((control) => control.id === id);
        const alternative = before?.choices.find((choice) => choice.value !== before.value);
        if (!before || !alternative) {
          process.stdout.write(`${JSON.stringify({ stage: 'native-config', id, status: 'unavailable' })}\n`);
          continue;
        }
        await adapter.setSessionConfigOption(sessionId, id, alternative.value);
        const observed = (await adapter.readSessionConfiguration(sessionId)).controls.find((control) => control.id === id)?.value;
        expect(observed).toBe(alternative.value);
        const after = (await adapter.readSessionConfiguration(sessionId)).controls.find((control) => control.id === id);
        let restored: string | null = null;
        if (after?.choices.some((choice) => choice.value === before.value)) {
          await adapter.setSessionConfigOption(sessionId, id, before.value);
          restored = (await adapter.readSessionConfiguration(sessionId)).controls.find((control) => control.id === id)?.value ?? null;
        }
        expect(restored).toBe(after?.choices.some((choice) => choice.value === before.value) ? before.value : null);
        process.stdout.write(`${JSON.stringify({ stage: 'native-config', id, status: 'verified', previous: before.value,
          requested: alternative.value, observed, restored, restoreStatus: restored === null ? 'not-advertised' : 'verified',
          returnedChoices: after?.choices.map((choice) => choice.value) })}\n`);
      }
    } finally { await adapter.stop(); }
    expect(adapter.status).toBe('disconnected');
    const deadline = Date.now() + 5000;
    let alive = true;
    while (alive && Date.now() < deadline) {
      try { process.kill(nativeMcpPid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; else throw error; }
      if (alive) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(alive).toBe(false);
  }, 30_000);

  it('creates, lists, closes, and resumes one isolated native session without prompting a model', async () => {
    const isolatedHome = mkdtempSync(path.join(os.tmpdir(), 'opencodian-dsh-live-'));
    const adapter = new DshAdapter({
      workingDirectory: '/tmp',
      getSettings: () => ({ executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp', transport: 'acp' }),
      getExtraEnv: () => ({
        HOME: isolatedHome,
        DSH_HOME: path.join(isolatedHome, '.dsh'),
        XDG_CONFIG_HOME: path.join(isolatedHome, '.config'),
        XDG_DATA_HOME: path.join(isolatedHome, '.local', 'share'),
      }),
    });

    try {
      await adapter.start();
      expect(adapter.status).toBe('connected');
      const sessionId = await adapter.createSession('OpenCodian DSH probe');
      expect(sessionId).toEqual(expect.any(String));
      process.stdout.write(`${JSON.stringify({ stage: 'created-active', sessionId })}\n`);
      await expect(adapter.listSessions()).resolves.not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: sessionId }),
      ]));
      await adapter.stop();
      await adapter.start();
      await expect(adapter.listSessions()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: sessionId, sessionId }),
      ]));
      process.stdout.write(`${JSON.stringify({ stage: 'listed-inactive', sessionId })}\n`);
      await expect(adapter.createSession(undefined, { resumeSessionId: sessionId })).resolves.toBe(sessionId);
      process.stdout.write(`${JSON.stringify({ stage: 'resumed', sessionId })}\n`);
    } finally {
      await adapter.stop();
    }
  }, 30_000);
});
