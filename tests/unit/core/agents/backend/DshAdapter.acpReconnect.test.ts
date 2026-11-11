import { describe, expect, it } from '@jest/globals';

import { dshNativeConfigurationRevision } from '../../../../../src/core/agents/backend/configuration/DshNativeConfiguration';
import type { DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import type { DshBackendSettings } from '../../../../../src/core/types/settings';
import { FakeDshClient, settings } from './DshAdapter.fixture';

function fixture() {
  const current = settings(); const clients: FakeDshClient[] = [];
  const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: () => current, createClient: options => {
    const client = new FakeDshClient(options); clients.push(client); return client;
  } });
  return { adapter, current, clients };
}

describe('Native reconnect refuses ACP before any lifecycle operation', () => {
  it('rejects disconnected ACP without creating or starting a client', async () => {
    const { adapter, clients } = fixture();
    await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' });
    expect(clients).toHaveLength(0); expect(adapter.status).toBe('disconnected');
  });

  it('rejects a started ACP client with no sessions without stopping or restarting it', async () => {
    const { adapter, clients } = fixture(); await adapter.start();
    const before = [...clients[0].calls];
    try {
      await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' });
      expect(clients).toHaveLength(1); expect(clients[0].calls).toEqual(before); expect(adapter.status).toBe('connected');
    } finally { await adapter.stop(); }
  });

  it('rejects a reserved ACP catalog session without proof RPCs, cancellation, prompts or restart', async () => {
    const { adapter, clients, current } = fixture(); const reserved = await adapter.readSessionConfiguration();
    current.nativeConfig = { version: 1, overrides: { 'compaction-basic': { auto: false } } };
    const before = [...clients[0].calls];
    try {
      await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' });
      expect(clients).toHaveLength(1); expect(clients[0].calls).toEqual(before);
      expect(adapter.getDefaultModelSelection(reserved.sessionId)).not.toBeNull(); expect(adapter.status).toBe('connected');
    } finally { await adapter.stop(); }
  });

  it('does not stop an existing ACP client when settings have just switched to Native', async () => {
    const { adapter, current, clients } = fixture(); await adapter.start(); current.transport = 'native';
    const before = [...clients[0].calls];
    try {
      await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' });
      expect(clients).toHaveLength(1); expect(clients[0].calls).toEqual(before);
    } finally { await adapter.stop(); }
  });
});

class NativeReconnectClient extends FakeDshClient {
  override handshake: DshJsonObject = { nativeProtocol: 'opencodian.dsh-native/1', agentCapabilities: {},
    configurationCapabilities: { describe: true },
    controlCapabilities: { readback: true, revision: 0, jobs: { present: false }, terminal: { present: false },
      subagents: { present: false }, goal: { present: false } } };
  readonly requests: Array<{ method: string; params: DshJsonObject }> = [];
  async nativeRequest(method: string, params: DshJsonObject = {}): Promise<DshJsonObject> {
    this.requests.push({ method, params });
    if (method === 'control/capabilities') return { controlCapabilities: this.handshake.controlCapabilities };
    if (method === 'config/describe') return { forms: [], profile: { managed: true, writable: true, hasDocument: true },
      appliedRevision: dshNativeConfigurationRevision(this.options.nativeConfig) };
    throw new Error('Unexpected fixture method');
  }
}

describe('Native reconnect still works for an actual Native connection', () => {
  it('replaces the idle native runtime and returns the applied configuration readback', async () => {
    const current = { ...settings(), transport: 'native' as const };
    const clients: NativeReconnectClient[] = [];
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: () => current, createClient: options => {
      const client = new NativeReconnectClient(options); clients.push(client); return client;
    } });
    await adapter.start();
    await expect(adapter.reconnectNativeConfiguration()).resolves.toMatchObject({ appliedRevision: expect.any(String) });
    expect(clients).toHaveLength(2);
    expect(clients[0].calls).toContainEqual({ method: 'stop' });
    expect(clients[1].calls).toContainEqual({ method: 'start' });
    expect(clients[1].requests.some(request => request.method === 'config/describe')).toBe(true);
    await adapter.stop();
  });
});

describe('Omitted transport keeps the documented Native default for reconnect', () => {
  function omittedTransportSettings(): DshBackendSettings {
    return { executablePath: '/opt/dsh', workingDirectory: '/vault', args: [], env: {}, profile: 'acp' };
  }

  it('reconnects a disconnected omitted-transport backend and returns the applied readback', async () => {
    const current = omittedTransportSettings();
    const clients: NativeReconnectClient[] = [];
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: () => current, createClient: options => {
      const client = new NativeReconnectClient(options); clients.push(client); return client;
    } });
    const readback = await adapter.reconnectNativeConfiguration();
    expect(readback.appliedRevision).toBe(dshNativeConfigurationRevision(clients[0].options.nativeConfig));
    expect(clients).toHaveLength(1); expect(adapter.status).toBe('connected');
    await adapter.stop();
  });

  it('reconnects a started omitted-transport Native client by replacing the idle runtime', async () => {
    const current = omittedTransportSettings();
    const clients: NativeReconnectClient[] = [];
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: () => current, createClient: options => {
      const client = new NativeReconnectClient(options); clients.push(client); return client;
    } });
    await adapter.start();
    const readback = await adapter.reconnectNativeConfiguration();
    expect(readback.appliedRevision).toBe(dshNativeConfigurationRevision(clients[1].options.nativeConfig));
    expect(clients).toHaveLength(2);
    expect(clients[0].calls).toContainEqual({ method: 'stop' });
    expect(clients[1].calls).toContainEqual({ method: 'start' });
    await adapter.stop();
  });

  it('still rejects an omitted-transport backend whose started client proves non-Native', async () => {
    const current = omittedTransportSettings();
    const clients: FakeDshClient[] = [];
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: () => current, createClient: options => {
      const client = new FakeDshClient(options); clients.push(client); return client;
    } });
    await adapter.start();
    const before = [...clients[0].calls];
    try {
      await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' });
      expect(clients).toHaveLength(1); expect(clients[0].calls).toEqual(before); expect(adapter.status).toBe('connected');
    } finally { await adapter.stop(); }
  });
});
