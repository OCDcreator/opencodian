import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DshAcpClient } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshNativeClient } from '../../../../../src/core/agents/backend/dsh/DshNativeClient';

describe('DshNativeClient owned launch files', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'DSH_NATIVE_SERVICE_SOURCE');
  beforeEach(() => {
    Object.defineProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE', { value: 'export const name = "fixture";', configurable: true });
    jest.spyOn(DshAcpClient.prototype, 'start').mockResolvedValue();
    jest.spyOn(DshAcpClient.prototype, 'stop').mockResolvedValue();
    jest.spyOn(DshAcpClient.prototype, 'handshake', 'get').mockReturnValue({ nativeProtocol: 'opencodian.dsh-native/1' });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (descriptor) Object.defineProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE', descriptor);
    else Reflect.deleteProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE');
  });
  function fixture() {
    const launch = { command: process.execPath, args: [path.resolve('fixture-dsh-bin.js'), '--profile', 'acp'], env: {} };
    return { launch, client: new DshNativeClient({ launch, cwd: process.cwd() }) };
  }
  it('runs an npm CLI with external Node instead of the embedding Electron executable', async () => {
    const launch = { command: process.execPath, args: ['--profile', 'acp'], env: {} };
    const client = new DshNativeClient({ launch, cwd: process.cwd() });
    try {
      await client.start();
      expect(launch.command).toBe('node');
    } finally { await client.stop(); }
  });
  it('uses an SDK launch overlay and removes exactly its own private files on concurrent stop', async () => {
    const { client, launch } = fixture();
    await client.start();
    expect(launch.command).toBe(process.execPath);
    const launcher = launch.args[0]; const scope = path.dirname(launcher);
    const patch = path.join(scope, 'native.patch.yml');
    expect(readFileSync(launcher, 'utf8')).toContain('launchNativeRuntime');
    expect(launch.args).toHaveLength(1);
    expect(readFileSync(patch, 'utf8')).toContain('sdk-jsonrpc-server');
    expect(readFileSync(path.join(scope, 'service.mjs'), 'utf8')).toContain('fixture');
    expect(process.platform === 'win32' ? [0o600, 0o666] : [0o600]).toContain(statSync(patch).mode & 0o777);
    await Promise.all([client.stop(), client.stop()]);
    expect(existsSync(scope)).toBe(false);
    expect(DshAcpClient.prototype.stop).toHaveBeenCalledTimes(1);
  });
  it('removes partial files after preparation fails', async () => {
    const before = readdirSync(os.tmpdir()).filter((name) => name.startsWith('opencodian-dsh-')).sort();
    Reflect.deleteProperty(globalThis, 'DSH_NATIVE_SERVICE_SOURCE');
    const { client } = fixture();
    await expect(client.start()).rejects.toThrow();
    const after = readdirSync(os.tmpdir()).filter((name) => name.startsWith('opencodian-dsh-')).sort();
    expect(after).toEqual(before);
  });
  it('prevents a stopped preparation from starting a late native process', async () => {
    const { client } = fixture();
    const start = client.start();
    const stopping = client.stop();
    await expect(start).rejects.toThrow('cancelled'); await stopping;
    expect(DshAcpClient.prototype.start).not.toHaveBeenCalled();
  });
});
