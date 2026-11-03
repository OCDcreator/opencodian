import { type spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';

import { ZCodeAccountService } from '../../../../../src/core/agents/backend/zcode/ZCodeAccountService';

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = jest.fn(() => { queueMicrotask(() => this.emit('close', null)); return true; });
}

async function fixture(timeoutMs = 300_000) {
  const parent = path.join(process.cwd(), '.obsidian-debug', 'zcode-settings-20261102', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'account-'));
  const calls: Array<{ args: readonly string[]; env: NodeJS.ProcessEnv; cwd: string; child: FakeChild }> = [];
  const spawnImpl = jest.fn((_command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
    const child = new FakeChild(); calls.push({ args, ...options, child }); return child;
  });
  const options = { rootPath: root, spawnImpl: spawnImpl as unknown as typeof spawn, timeoutMs,
    getLaunch: () => ({ command: 'node', args: ['/fake/zcode.cjs', 'app-server', '--stdio'], entryKind: 'node-bundle', entryPath: '/fake/zcode.cjs', source: 'configured', extraEnv: {} }),
    getEnvironment: () => ({ ZCODE_DATA_BASE_DIR: '/desktop-must-not-use', ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: '/desktop/config.json', ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: '/native/builtin.json' }),
  } as const;
  const service = new ZCodeAccountService(options);
  return { root, service, calls, options };
}

async function waitForSpawn(calls: unknown[]): Promise<void> {
  const end = Date.now() + 5_000;
  while (!calls.length && Date.now() < end) await new Promise<void>((resolve) => setTimeout(resolve, 5));
  expect(calls).toHaveLength(1);
}

describe('ZCode official login isolation', () => {
  it('uses a private staged native store, then publishes only a successful login', async () => {
    const { service, calls, root } = await fixture();
    const progress = jest.fn();
    const login = service.login('bigmodel', progress);
    await waitForSpawn(calls);
    const call = calls[0];
    expect(call.args).toEqual(['/fake/zcode.cjs', 'login', 'bigmodel', '--json', '--no-browser']);
    expect(call.env.ZCODE_DATA_BASE_DIR).toBe(call.cwd);
    expect(call.env.ZCODE_DATA_BASE_DIR).not.toBe(root);
    expect(call.env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE).toBe(path.join(call.cwd, '.zcode', 'v2', 'provider_config.json'));
    expect(call.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE).toBe('/native/builtin.json');
    expect(await service.revision()).toBe('signed-out');
    call.child.stderr.write('Open this URL to sign in:\nhttps://example.invalid/authorize\n');
    await writeFile(path.join(call.cwd, '.zcode', 'v2', 'credentials.json'), JSON.stringify({
      'oauth:bigmodel:user_info': JSON.stringify({ displayName: 'Fixture account' }), 'oauth:bigmodel:access_token': 'fixture-token',
    }));
    call.child.stdout.write(JSON.stringify({ status: 'ready', provider: 'bigmodel', model: 'account:fixture/model' }));
    call.child.emit('close', 0);
    expect(await login).toMatchObject({ model: 'account:fixture/model', account: { state: 'signed-in', accounts: [{ family: 'bigmodel', name: 'Fixture account' }] } });
    expect(progress).toHaveBeenCalledWith({ authorizeUrl: 'https://example.invalid/authorize' });
    expect(JSON.stringify(await service.read())).not.toContain('fixture-token');
    expect(service.getEnvironment().ZCODE_DATA_BASE_DIR).toBe(root);
    expect(await readFile(service.credentialsPath, 'utf8')).toContain('Fixture account');
  });

  it('discards cancelled and late native results without changing canonical credentials', async () => {
    const { service, calls } = await fixture();
    const login = service.login('zai', jest.fn());
    const rejected = login.then(() => null, (error: unknown) => error);
    await waitForSpawn(calls);
    await writeFile(path.join(calls[0].cwd, '.zcode', 'v2', 'credentials.json'), '{"late":"never-publish"}');
    service.cancelLogin();
    calls[0].child.stdout.write(JSON.stringify({ status: 'ready', provider: 'zai', model: 'account:fixture/model' }));
    expect(await rejected).toBeInstanceOf(Error);
    expect(await service.revision()).toBe('signed-out');
    expect(calls[0].child.kill).toHaveBeenCalled();
  });

  it('keeps credentials on CLI failure and prevents overlapping operations', async () => {
    const { service, calls } = await fixture();
    const login = service.login('zai', jest.fn());
    const failed = login.then(() => null, (error: unknown) => error);
    await waitForSpawn(calls);
    await expect(service.logout()).rejects.toThrow('busy');
    calls[0].child.stderr.write('Error: Authorization failed');
    calls[0].child.emit('close', 1);
    expect(await failed).toBeInstanceOf(Error);
    expect(await service.read()).toEqual({ state: 'signed-out', accounts: [] });
  });

  it('runs native logout against the plugin store only and preserves unrelated keys', async () => {
    const { service, calls } = await fixture();
    await mkdir(path.dirname(service.credentialsPath), { recursive: true });
    await writeFile(service.credentialsPath, JSON.stringify({ unrelated: 'keep', 'oauth:zai:access_token': 'fixture' }));
    const logout = service.logout();
    await waitForSpawn(calls);
    expect(calls[0].args).toEqual(['/fake/zcode.cjs', 'logout', '--json']);
    await writeFile(path.join(calls[0].cwd, '.zcode', 'v2', 'credentials.json'), '{"unrelated":"keep"}');
    calls[0].child.stdout.write('{"status":"logged_out"}'); calls[0].child.emit('close', 0);
    await logout;
    expect(JSON.parse(await readFile(service.credentialsPath, 'utf8'))).toEqual({ unrelated: 'keep' });
  });

  it('times out native authorization without publishing staged credentials', async () => {
    const { service, calls } = await fixture(30);
    const login = service.login('zai', jest.fn());
    const failed = login.then(() => null, (error: unknown) => error);
    await waitForSpawn(calls);
    expect(await failed).toBeInstanceOf(Error);
    expect(calls[0].child.kill).toHaveBeenCalledTimes(1);
    expect(service.revision()).toBe('signed-out');
  });

  it('serializes independent vault instances against the shared local account store', async () => {
    const { service, calls, options } = await fixture();
    const otherVault = new ZCodeAccountService(options);
    const login = service.login('zai', jest.fn());
    await waitForSpawn(calls);
    const logout = otherVault.logout();
    const logoutFinished = logout.then(() => true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(1);
    await writeFile(path.join(calls[0].cwd, '.zcode', 'v2', 'credentials.json'), JSON.stringify({ 'oauth:zai:user_info': '{"name":"Test"}', 'oauth:zai:access_token': 'fixture' }));
    calls[0].child.stdout.write('{"status":"ready","provider":"zai","model":"account:test/one"}'); calls[0].child.emit('close', 0);
    await login;
    const deadline = Date.now() + 2_000;
    while (calls.length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls).toHaveLength(2);
    expect(await readFile(path.join(calls[1].cwd, '.zcode', 'v2', 'credentials.json'), 'utf8')).toContain('fixture');
    await writeFile(path.join(calls[1].cwd, '.zcode', 'v2', 'credentials.json'), '{}');
    calls[1].child.stdout.write('{"status":"logged_out"}'); calls[1].child.emit('close', 0);
    expect(await logoutFinished).toBe(true);
    expect(service.revision()).toBe(otherVault.revision());
    expect(await service.read()).toEqual({ state: 'signed-out', accounts: [] });
  });

  it('rejects publication if native token refresh changed canonical credentials during login', async () => {
    const { service, calls } = await fixture();
    const login = service.login('zai', jest.fn());
    const failed = login.then(() => null, (error: unknown) => error);
    await waitForSpawn(calls);
    await writeFile(service.credentialsPath, '{"external":"keep"}');
    calls[0].child.stdout.write('{"status":"ready","provider":"zai","model":"account:test/one"}'); calls[0].child.emit('close', 0);
    expect(await failed).toBeInstanceOf(Error);
    expect(await readFile(service.credentialsPath, 'utf8')).toBe('{"external":"keep"}');
  });

  it('repairs malformed local credentials only after a fresh login succeeds', async () => {
    const { service, calls } = await fixture();
    await mkdir(path.dirname(service.credentialsPath), { recursive: true });
    await writeFile(service.credentialsPath, '{broken');
    expect((await service.read()).state).toBe('unreadable');
    const login = service.login('zai', jest.fn());
    await waitForSpawn(calls);
    expect(await readFile(path.join(calls[0].cwd, '.zcode', 'v2', 'credentials.json'), 'utf8')).toBe('{}');
    expect(await readFile(service.credentialsPath, 'utf8')).toBe('{broken');
    await writeFile(path.join(calls[0].cwd, '.zcode', 'v2', 'credentials.json'), JSON.stringify({ 'oauth:zai:user_info': '{"name":"Repaired fixture"}', 'oauth:zai:access_token': 'fixture' }));
    calls[0].child.stdout.write('{"status":"ready","provider":"zai","model":"account:test/one"}'); calls[0].child.emit('close', 0);
    expect((await login).account.state).toBe('signed-in');
  });
});
