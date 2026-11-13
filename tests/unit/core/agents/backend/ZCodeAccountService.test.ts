import { type spawn } from 'node:child_process';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
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

async function fixture(timeoutMs = 300_000, getEnvironment?: () => Record<string, string>, extraEnv?: Record<string, string>) {
  const parent = path.join(process.cwd(), '.obsidian-debug', 'zcode-settings-20261102', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'account-'));
  const calls: Array<{ args: readonly string[]; env: NodeJS.ProcessEnv; cwd: string; child: FakeChild }> = [];
  const spawnImpl = jest.fn((_command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
    const child = new FakeChild(); calls.push({ args, ...options, child }); return child;
  });
  const options = { rootPath: root, spawnImpl: spawnImpl as unknown as typeof spawn, timeoutMs,
    getLaunch: () => ({ command: 'node', args: ['/fake/zcode.cjs', 'app-server', '--stdio'], entryKind: 'node-bundle', entryPath: '/fake/zcode.cjs', source: 'configured', extraEnv: extraEnv ?? {} }),
    getEnvironment: getEnvironment ?? (() => ({ ZCODE_DATA_BASE_DIR: '/desktop-must-not-use', ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: '/desktop/config.json', ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: '/native/builtin.json' })),
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

  it('pins the managed secret exclusively for children, clearing competing secret-file sources', async () => {
    const { service, calls } = await fixture(
      300_000,
      () => ({ ZCODE_CREDENTIAL_SECRET_FILE: '/configured/credential-secret' }),
      { ZCODE_CREDENTIAL_SECRET_FILE: '/inherited/credential-secret' },
    );
    // The plugin owns the account secret: children must see exactly one managed-secret
    // source (the pinned env value), never a configured or inherited secret file.
    const env = service.getEnvironment();
    expect(env.ZCODE_CREDENTIAL_SECRET_FILE).toBe('');
    expect(env.ZCODE_CREDENTIAL_SECRET).toBeTruthy();
    const login = service.login('zai', jest.fn());
    await waitForSpawn(calls);
    expect(calls[0].env.ZCODE_CREDENTIAL_SECRET_FILE).toBe('');
    expect(calls[0].env.ZCODE_CREDENTIAL_SECRET).toBe(env.ZCODE_CREDENTIAL_SECRET);
    expect(calls[0].env.ZCODE_CREDENTIAL_SECRET_FILE).not.toBe('/configured/credential-secret');
    expect(calls[0].env.ZCODE_CREDENTIAL_SECRET_FILE).not.toBe('/inherited/credential-secret');
    service.cancelLogin();
    calls[0].child.kill();
    await expect(login).rejects.toThrow('cancelled');
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

/** Native systemCredentialCipher seal shape (v3.18.2): key = sha256(secret),
 * fingerprint = sha256(key bytes).hex.slice(0, 24), AES-256-GCM base64url payload. */
function sealProfile(profile: string, secret: string, format: 'v1' | 'v2:env' | 'v2:os'): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(profile, 'utf8'), cipher.final()]);
  const payload = [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
  if (format === 'v1') return `enc:v1:${payload}`;
  const fingerprint = createHash('sha256').update(key).digest('hex').slice(0, 24);
  return `enc:v2:${format.slice(3)}:${fingerprint}:${payload}`;
}

/** Flip the first ciphertext character inside any envelope so GCM authentication fails
 * while the envelope shape and base64url charset stay valid. The first character always
 * carries data bits (unlike the final one, whose low bits can be base64 padding and
 * decode to identical bytes). */
function tamperSealedCiphertext(envelope: string): string {
  const segments = envelope.split(':');
  const payload = segments[segments.length - 1].split('.');
  const ciphertext = payload[2];
  payload[2] = ciphertext.startsWith('A') ? `B${ciphertext.slice(1)}` : `A${ciphertext.slice(1)}`;
  segments[segments.length - 1] = payload.join('.');
  return segments.join(':');
}

async function codecFixture(getEnvironment?: () => Record<string, string>) {
  const parent = path.join(process.cwd(), '.obsidian-debug', 'zcode-settings-20261102', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'codec-'));
  const options = {
    rootPath: root,
    getLaunch: () => ({ command: 'node', args: ['/fake/zcode.cjs', 'app-server', '--stdio'], entryKind: 'node-bundle', entryPath: '/fake/zcode.cjs', source: 'configured', extraEnv: {} }),
    getEnvironment,
  } as const;
  return { service: new ZCodeAccountService(options), root };
}

async function writeCredentials(service: ZCodeAccountService, record: Record<string, string>): Promise<void> {
  await mkdir(path.dirname(service.credentialsPath), { recursive: true });
  await writeFile(service.credentialsPath, JSON.stringify(record), { mode: 0o600 });
}

describe('ZCode credential codec summaries', () => {
  const profile = JSON.stringify({ displayName: 'Codec fixture', sub: 'profile-only' });

  async function expectSignedIn(service: ZCodeAccountService, userValue: string): Promise<void> {
    await writeCredentials(service, { 'oauth:zai:user_info': userValue, 'oauth:zai:access_token': 'codec-fixture-token' });
    expect(await service.read()).toEqual({ state: 'signed-in', accounts: [{ family: 'zai', name: 'Codec fixture' }] });
    // Profile-only public API: the token and every non-name profile field stay inside the store.
    const snapshot = JSON.stringify(await service.read());
    expect(snapshot).not.toContain('codec-fixture-token');
    expect(snapshot).not.toContain('profile-only');
  }

  it('decodes the system enc:v2 env envelope that current runtimes write and migrate to', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret' }));
    const sealed = sealProfile(profile, 'codec-managed-secret', 'v2:env');
    expect(sealed).toMatch(/^enc:v2:env:[a-f0-9]{24}:[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expectSignedIn(service, sealed);
  });

  it('still decodes the legacy enc:v1 envelope', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret' }));
    const sealed = sealProfile(profile, 'codec-managed-secret', 'v1');
    expect(sealed).toMatch(/^enc:v1:[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expectSignedIn(service, sealed);
  });

  it('still reads plaintext profiles', async () => {
    const { service } = await codecFixture();
    expect(profile).not.toMatch(/^enc:/);
    await expectSignedIn(service, profile);
  });

  it('decodes enc:v2 sealed with the pinned fallback secret when no explicit secret is configured', async () => {
    const { service } = await codecFixture();
    const pinned = service.getEnvironment().ZCODE_CREDENTIAL_SECRET;
    const sealed = sealProfile(profile, pinned, 'v2:env');
    expect(sealed).toMatch(/^enc:v2:env:[a-f0-9]{24}:/);
    await expectSignedIn(service, sealed);
  });

  it('keeps enc:v2 decodable when a configured secret file path is also present', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret', ZCODE_CREDENTIAL_SECRET_FILE: '/elsewhere/credential-secret' }));
    const sealed = sealProfile(profile, 'codec-managed-secret', 'v2:env');
    expect(service.getEnvironment().ZCODE_CREDENTIAL_SECRET).toBe('codec-managed-secret');
    await expectSignedIn(service, sealed);
  });

  it('reports os-source enc:v2 as unreadable without touching any keychain', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret' }));
    await writeCredentials(service, { 'oauth:zai:user_info': sealProfile(profile, 'codec-managed-secret', 'v2:os'), 'oauth:zai:access_token': 'codec-fixture-token' });
    expect(await service.read()).toEqual({ state: 'unreadable', accounts: [] });
  });

  it('reports unreadable when the configured secret changed and the fingerprint no longer matches', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret' }));
    await writeCredentials(service, { 'oauth:zai:user_info': sealProfile(profile, 'a-different-secret', 'v2:env'), 'oauth:zai:access_token': 'codec-fixture-token' });
    expect(await service.read()).toEqual({ state: 'unreadable', accounts: [] });
  });

  it('reports unreadable when the enc:v2 ciphertext is tampered', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret' }));
    const envelope = tamperSealedCiphertext(sealProfile(profile, 'codec-managed-secret', 'v2:env'));
    await writeCredentials(service, { 'oauth:zai:user_info': envelope, 'oauth:zai:access_token': 'codec-fixture-token' });
    expect(await service.read()).toEqual({ state: 'unreadable', accounts: [] });
  });

  it('reports unreadable for tampered legacy enc:v1 ciphertext', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret' }));
    const envelope = tamperSealedCiphertext(sealProfile(profile, 'codec-managed-secret', 'v1'));
    await writeCredentials(service, { 'oauth:zai:user_info': envelope, 'oauth:zai:access_token': 'codec-fixture-token' });
    expect(await service.read()).toEqual({ state: 'unreadable', accounts: [] });
  });

  it('reports unreadable for malformed enc:v2 envelopes', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret' }));
    const sealed = sealProfile(profile, 'codec-managed-secret', 'v2:env');
    const fingerprint = sealed.split(':')[2];
    for (const envelope of [
      `enc:v2:env:not-a-fingerprint:${sealed.split(':').slice(3).join(':')}`,
      `enc:v2:env:${fingerprint}`,
      `${sealed}:extra-segment`,
    ]) {
      await writeCredentials(service, { 'oauth:zai:user_info': envelope, 'oauth:zai:access_token': 'codec-fixture-token' });
      expect(await service.read()).toEqual({ state: 'unreadable', accounts: [] });
    }
  });

  it('reports unreadable for an unknown enc namespace', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret' }));
    await writeCredentials(service, { 'oauth:zai:user_info': 'enc:v9:future-format', 'oauth:zai:access_token': 'codec-fixture-token' });
    expect(await service.read()).toEqual({ state: 'unreadable', accounts: [] });
  });

  it('keeps one corrupted family from partially signing in a mixed record', async () => {
    const { service } = await codecFixture(() => ({ ZCODE_CREDENTIAL_SECRET: 'codec-managed-secret' }));
    await writeCredentials(service, {
      'oauth:bigmodel:user_info': sealProfile(profile, 'codec-managed-secret', 'v2:env'),
      'oauth:bigmodel:access_token': 'codec-fixture-token',
      'oauth:zai:user_info': tamperSealedCiphertext(sealProfile(profile, 'codec-managed-secret', 'v2:env')),
      'oauth:zai:access_token': 'codec-fixture-token',
    });
    expect(await service.read()).toEqual({ state: 'unreadable', accounts: [] });
  });
});
