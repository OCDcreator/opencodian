import childProcess from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { prepareDshManagedLaunch, releaseDshLaunchScope, resolveDshManagedProfile } from '../../../../../../src/core/agents/backend/configuration/DshManagedProfile';
import { dshNativeConfigurationRevision } from '../../../../../../src/core/agents/backend/configuration/DshNativeConfiguration';
import { DshAcpClient, type DshAcpClientOptions } from '../../../../../../src/core/agents/backend/dsh/DshAcpClient';

const serviceFixture = `export async function launchNativeRuntime(options) {
  process.stdin.setEncoding('utf8'); let input = '';
  const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
  process.stdin.on('data', chunk => { input += chunk; for (;;) {
    const end = input.indexOf('\\n'); if (end < 0) break;
    const request = JSON.parse(input.slice(0, end)); input = input.slice(end + 1);
    let result = {};
    if (request.method === 'initialize') result = {protocolVersion:1, agentInfo:{name:'fixture',version:'1.0.0'},agentCapabilities:{},authMethods:[]};
    if (request.method === 'session/new') {
      result = {sessionId:'fixture-session', received:options, mcp:request.params.mcpServers};
      send({jsonrpc:'2.0',method:'config/extensions/update',params:{operationId:'fixture-operation',event:'started'}});
    }
    send({jsonrpc:'2.0',id:request.id,result});
  }});
}`;

function options(): DshAcpClientOptions {
  return { cwd: process.cwd(), vaultPath: process.cwd(), managedProfileRoot: path.join(os.tmpdir(), 'opencodian-launch-fixture-profiles'),
    launch: { command: process.execPath, args: ['--profile', 'acp', '--patch', 'user.yml'], env: {} },
    nativeConfig: { version: 1, overrides: { 'agent-default-model': { provider: 'fixture', model: 'model' } } }, requestTimeoutMs: 3_000 };
}

describe('DSH managed launch boundary', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'DSH_NATIVE_SERVICE_SOURCE');
  beforeEach(() => Object.defineProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE', { value: serviceFixture, configurable: true }));
  afterEach(() => {
    jest.restoreAllMocks();
    if (descriptor) Object.defineProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE', descriptor);
    else Reflect.deleteProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE');
  });

  it('keys profiles by original canonical vault, independent of process cwd and transport', () => {
    const first = options();
    const sdk = resolveDshManagedProfile(first, 'sdk');
    expect(resolveDshManagedProfile({ ...first, cwd: os.tmpdir() }, 'sdk')).toEqual(sdk);
    expect(resolveDshManagedProfile({ ...first, vaultPath: realpathSync(process.cwd()) }, 'sdk')).toEqual(sdk);
    expect(resolveDshManagedProfile(first, 'acp').vaultHash).toEqual(sdk.vaultHash);
    expect(resolveDshManagedProfile(first, 'acp').root).not.toEqual(sdk.root);
    expect(() => resolveDshManagedProfile({ ...first, managedProfileRoot: path.join(process.cwd(), '.profiles') }, 'sdk')).toThrow('outside the vault');
  });

  it('prepares a final protected Native patch with revision and keeps the persistent root outside cleanup', async () => {
    const input = options();
    const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'opencodian-launch-persistence-')));
    input.launch.args.push('--quiet');
    let scope = '';
    const configured = { ...input, managedProfileRoot: directory };
    try {
      await prepareDshManagedLaunch(configured, { ...input.launch, args: [...input.launch.args] }, 'sdk', (value) => { scope = value; });
      const patch = JSON.parse(readFileSync(path.join(scope, 'native.patch.yml'), 'utf8'));
      expect(patch[0]).toEqual({ id: 'sdk-jsonrpc-server', disabled: true });
      expect(patch[1].insert[0].config).toMatchObject({ managedProfileRoot: resolveDshManagedProfile(configured, 'sdk').root,
        nativeConfigRevision: dshNativeConfigurationRevision(configured.nativeConfig) });
      expect(readFileSync(input.launch.args[0], 'utf8')).toContain('"args":["--patch","user.yml","--quiet"]');
    } finally { if (scope) await releaseDshLaunchScope(scope); }
    expect(existsSync(directory)).toBe(true);
    expect(existsSync(scope)).toBe(false);
  });

  it('keeps credential references outside native config rows and out of resolved persisted values', async () => {
    const input: DshAcpClientOptions = { ...options(), nativeConfig: { version: 1, overrides: { 'llm-pi-ai': { providers: {
      proxy: { api: 'openai-completions', baseURL: 'https://fixture.test', headerCredentialRefs: { Authorization: 'PROXY_AUTH' } },
    } } } } };
    let scope = '';
    try {
      await prepareDshManagedLaunch(input, { ...input.launch, args: [...input.launch.args] }, 'sdk', (value) => { scope = value; });
      const script = readFileSync(input.launch.args[0], 'utf8');
      expect(script).toContain('"headerCredentialRefs":{"proxy":{"Authorization":"PROXY_AUTH"}}');
      expect(script).not.toContain('"config":{"providers":{"proxy":{"headerCredentialRefs"');
    } finally { if (scope) await releaseDshLaunchScope(scope); }
  });

  it('rejects invalid defaults before spawning or allocating bridge files', async () => {
    const spy = jest.spyOn(childProcess, 'spawn');
    const input = options();
    const client = new DshAcpClient({ ...input, nativeConfig: { version: 1, overrides: { 'opencodian-native': { disabled: true } } } as never });
    await expect(client.start()).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    expect(input.launch.args).toEqual(['--profile', 'acp', '--patch', 'user.yml']);
  });

  it('applies ACP defaults without Native bridge capabilities and supports a fresh restart', async () => {
    const input = options();
    const onControlUpdate = jest.fn();
    const client = new DshAcpClient({ ...input, onControlUpdate });
    try {
      await client.start();
      const firstScope = path.dirname(input.launch.args[0]);
      const first = await client.newSession(process.cwd());
      expect(first.received).toMatchObject({ managedProfile: { profile: 'acp' },
        configuration: [{ id: 'agent-default-model', config: { provider: 'fixture', model: 'model' } }] });
      expect(client.handshake?.nativeProtocol).toBeUndefined();
      expect(existsSync(path.join(firstScope, 'native.patch.yml'))).toBe(false);
      expect(onControlUpdate).toHaveBeenCalledWith({ operationId: 'fixture-operation', event: 'started' });
      await client.stop();
      expect(existsSync(firstScope)).toBe(false);
      await client.start();
      expect(path.dirname(input.launch.args[0])).not.toEqual(firstScope);
      expect(await client.newSession(process.cwd())).toMatchObject({ sessionId: 'fixture-session', received: { managedProfile: { profile: 'acp' } } });
    } finally { await client.stop(); }
  });

  it('cancels an ACP configuration preparation before a child can start', async () => {
    const spy = jest.spyOn(childProcess, 'spawn');
    const client = new DshAcpClient(options());
    const starting = client.start();
    const stopped = client.stop();
    await expect(starting).rejects.toThrow('cancelled');
    await stopped;
    expect(spy).not.toHaveBeenCalled();
  });
});
