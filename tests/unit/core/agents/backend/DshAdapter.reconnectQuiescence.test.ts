import { describe, expect, it } from '@jest/globals';

import { dshNativeConfigurationRevision } from '../../../../../src/core/agents/backend/configuration/DshNativeConfiguration';
import type { DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import { deferred, FakeDshClient, settings, tick } from './DshAdapter.fixture';

const capabilities: DshJsonObject = {
  readback: true, revision: 0,
  jobs: { present: true, list: true, get: true, read: true, readAt: true, wait: true, kill: true, updates: true },
  terminal: { present: true, availability: true, list: true, spawn: true, read: true, send: true, signal: true, kill: true },
  subagents: { present: true, list: true, get: true, cancel: true }, goal: { present: true },
};
class ReconnectClient extends FakeDshClient {
  override handshake: DshJsonObject = { nativeProtocol: 'opencodian.dsh-native/1', agentCapabilities: {},
    configurationCapabilities: { describe: true, extensions: { enableBundle: true } }, controlCapabilities: JSON.parse(JSON.stringify(capabilities)) };
  readonly requests: Array<{ method: string; params: DshJsonObject }> = [];
  goal: DshJsonObject | null = null;
  liveCapabilities: DshJsonObject | null = null;
  respond: (method: string, params: DshJsonObject) => Promise<DshJsonObject | undefined> = async () => undefined;
  async nativeRequest(method: string, params: DshJsonObject = {}): Promise<DshJsonObject> {
    this.requests.push({ method, params });
    const custom = await this.respond(method, params); if (custom !== undefined) return custom;
    if (method === 'control/capabilities') return { controlCapabilities: this.liveCapabilities ?? this.handshake.controlCapabilities };
    if (method === 'config/describe') return { forms: [], profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: dshNativeConfigurationRevision(this.options.nativeConfig) };
    if (method === 'session/goal') return { goal: this.goal };
    if (method === 'session/jobs') return { jobs: [] };
    if (method === 'session/subagents') return { children: [] };
    if (method === 'session/terminal') return params.action === 'availability' ? { available: true, backends: ['bash'] } : { terminals: [] };
    throw new Error('Unexpected fixture method');
  }
}
function fixture(configure?: (client: ReconnectClient) => void) {
  const current = { ...settings(), transport: 'native' as const };
  const clients: ReconnectClient[] = [];
  const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: () => current, createClient: options => {
    const client = new ReconnectClient(options); configure?.(client); clients.push(client); return client;
  } });
  return { adapter, current, clients };
}
function noImplicitStop(client: ReconnectClient): void {
  expect(client.calls.filter(call => ['stop', 'session/cancel', 'session/close'].includes(call.method))).toEqual([]);
  expect(client.requests.filter(call => ['kill', 'cancel', 'pause', 'clear'].includes(String(call.params.action)))).toEqual([]);
}

describe('DSH reconnect quiescence proofs', () => {
  it('refuses an active armed Goal even with no turn, Job, terminal or child', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    clients[0].goal = { id: 'goal', phase: 'active', status: 'active', activation: 'armed', armed: true };
    try {
      await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' });
      noImplicitStop(clients[0]);
      expect(clients[0].requests).toContainEqual({ method: 'session/goal', params: { sessionId: id, action: 'get' } });
    } finally { await adapter.stop(); }
  });

  it.each([{}, { goal: {} }, { goal: { phase: 'active' } }, { goal: { phase: 'paused', activation: 'armed', armed: true } }])('fails closed for an unconfirmable Goal response %#', async response => {
    const { adapter, clients } = fixture(); await adapter.createSession();
    clients[0].respond = async method => method === 'session/goal' ? response : undefined;
    try { await expect(adapter.reconnectNativeConfiguration()).rejects.toBeDefined(); noImplicitStop(clients[0]); }
    finally { await adapter.stop(); }
  });

  it.each([
    null,
    { phase: 'paused', status: 'paused', activation: 'disarmed', armed: false },
    { phase: 'complete', status: 'complete', activation: 'disarmed', armed: false },
  ])('allows only observed absent, paused or completed Goal %#', async goal => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession(); clients[0].goal = goal;
    try {
      await expect(adapter.reconnectNativeConfiguration()).resolves.toMatchObject({ appliedRevision: expect.any(String) });
      expect(clients[0].requests).toContainEqual({ method: 'session/goal', params: { sessionId: id, action: 'get' } });
      expect(clients).toHaveLength(2);
    } finally { await adapter.stop(); }
  });

  it('pending config reads and reconnect checks use the original connected client and its reserved session', async () => {
    const { adapter, current, clients } = fixture(); const catalog = await adapter.readSessionConfiguration();
    const originalRevision = dshNativeConfigurationRevision(clients[0].options.nativeConfig);
    current.nativeConfig = { version: 1, overrides: { 'compaction-basic': { auto: false } } };
    const readback = await adapter.getNativeConfiguration();
    expect(readback.appliedRevision).toBe(originalRevision);
    expect(readback.appliedRevision).not.toBe(dshNativeConfigurationRevision(current.nativeConfig));
    expect(clients).toHaveLength(1); noImplicitStop(clients[0]);
    await expect(adapter.createSession()).rejects.toThrow('settings changed');
    await expect(adapter.reconnectNativeConfiguration()).resolves.toMatchObject({ appliedRevision: dshNativeConfigurationRevision(current.nativeConfig) });
    expect(clients[0].requests.filter(request => request.method.startsWith('session/')).every(request => request.params.sessionId === catalog.sessionId)).toBe(true);
    expect(clients[1].requests.some(request => request.method.startsWith('session/'))).toBe(false);
    await adapter.stop();
  });

  it('allows a missing optional terminal service only after an explicit unavailable readback', async () => {
    const { adapter, current, clients } = fixture(client => {
      (client.handshake.controlCapabilities as DshJsonObject).readback = false;
      (client.handshake.controlCapabilities as DshJsonObject).terminal = { availability: true, list: false, spawn: false, read: false, send: false, signal: false, kill: false };
      client.respond = async (method, params) => method === 'session/terminal' && params.action === 'availability' ? { available: false, backends: [] } : undefined;
    });
    const { sessionId } = await adapter.readSessionConfiguration();
    current.nativeConfig = { version: 1, overrides: { 'compaction-basic': { auto: false } } };
    try {
      await expect(adapter.reconnectNativeConfiguration()).resolves.toMatchObject({ appliedRevision: dshNativeConfigurationRevision(current.nativeConfig) });
      expect(clients[0].requests).toContainEqual({ method: 'session/terminal', params: { sessionId, action: 'availability' } });
      expect(clients[0].requests.some(request => request.method === 'session/terminal' && request.params.action === 'list')).toBe(false);
    } finally { await adapter.stop(); }
  });

  it('reconnects after a reserved catalog session when the optional terminal service is explicitly absent', async () => {
    const { adapter, clients, current } = fixture(client => {
      (client.handshake.controlCapabilities as DshJsonObject).terminal = { present: false, availability: false, list: false,
        spawn: false, read: false, send: false, signal: false, kill: false };
    });
    const { sessionId } = await adapter.readSessionConfiguration();
    const oldRevision = dshNativeConfigurationRevision(clients[0].options.nativeConfig);
    current.nativeConfig = { version: 1, overrides: { 'compaction-basic': { auto: false } } };
    try {
      expect(adapter.getNativeControlCapabilities().controls.terminal.present).toBe(false);
      await expect(adapter.getNativeConfiguration()).resolves.toMatchObject({ appliedRevision: oldRevision });
      await expect(adapter.reconnectNativeConfiguration()).resolves.toMatchObject({ appliedRevision: dshNativeConfigurationRevision(current.nativeConfig) });
      expect(clients[0].requests.some(request => request.method === 'session/terminal')).toBe(false);
      expect(clients[0].requests).toContainEqual({ method: 'session/goal', params: { sessionId, action: 'get' } });
    } finally { await adapter.stop(); }
  });

  it.each(['jobs', 'subagents', 'goal'])('skips only explicit absent %s service without guessing from method flags', async family => {
    const { adapter, clients } = fixture(client => { (client.handshake.controlCapabilities as DshJsonObject)[family] = { present: false }; });
    await adapter.createSession();
    try {
      await expect(adapter.reconnectNativeConfiguration()).resolves.toMatchObject({ appliedRevision: expect.any(String) });
      expect(clients[0].requests.some(request => request.method === `session/${family}`)).toBe(false);
    } finally { await adapter.stop(); }
  });

  it.each(['jobs', 'subagents', 'terminal'])('blocks missing presence and missing %s read capability', async family => {
    const { adapter, clients } = fixture(client => {
      (client.handshake.controlCapabilities as DshJsonObject).readback = false;
      (client.handshake.controlCapabilities as DshJsonObject)[family] = {};
    });
    await adapter.createSession();
    try {
      expect(adapter.getNativeControlCapabilities().controls[family as 'jobs' | 'subagents' | 'terminal'].present).toBeNull();
      await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' });
      noImplicitStop(clients[0]);
    } finally { await adapter.stop(); }
  });

  it('does not treat an unavailable Goal method as proof of no Goal service', async () => {
    const { adapter, clients } = fixture(client => {
      (client.handshake.controlCapabilities as DshJsonObject).readback = false;
      (client.handshake.controlCapabilities as DshJsonObject).goal = { get: false };
      client.respond = async method => { if (method === 'session/goal') throw new Error('native Goal unavailable'); return undefined; };
    });
    await adapter.createSession();
    try { await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'failed' }); noImplicitStop(clients[0]); }
    finally { await adapter.stop(); }
  });

  it('does not skip a terminal service with contradictory absent presence and active methods', async () => {
    const { adapter, clients } = fixture(client => { (client.handshake.controlCapabilities as DshJsonObject).terminal = { present: false, list: true, spawn: true }; });
    await adapter.createSession();
    try { await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' }); noImplicitStop(clients[0]); }
    finally { await adapter.stop(); }
  });

  it('still blocks a present terminal service whose live sessions cannot be listed', async () => {
    const { adapter, clients } = fixture(client => {
      (client.handshake.controlCapabilities as DshJsonObject).terminal = { present: true, availability: true, list: false, spawn: false };
      client.respond = async (method, params) => method === 'session/terminal' && params.action === 'availability' ? { available: false, backends: [] } : undefined;
    });
    await adapter.createSession();
    try { await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' }); noImplicitStop(clients[0]); }
    finally { await adapter.stop(); }
  });

  it('rechecks Goal activation after awaiting Job and child proofs', async () => {
    const { adapter, clients } = fixture(); await adapter.createSession(); let reads = 0;
    clients[0].respond = async method => method === 'session/goal'
      ? { goal: ++reads === 1 ? null : { phase: 'active', status: 'active', activation: 'armed', armed: true } } : undefined;
    try {
      await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' });
      expect(reads).toBe(2); noImplicitStop(clients[0]);
    } finally { await adapter.stop(); }
  });

  it('rejects a superseded Goal response without stopping the replacement client', async () => {
    const { adapter, clients } = fixture(); await adapter.createSession(); const gate = deferred();
    clients[0].respond = async method => method === 'session/goal' ? gate.promise : undefined;
    const checking = adapter.reconnectNativeConfiguration(); await tick();
    await adapter.stop(); gate.resolve({ goal: null });
    await expect(checking).rejects.toMatchObject({ code: 'superseded' });
    await adapter.start(); expect(clients[1].calls.some(call => call.method === 'stop')).toBe(false); await adapter.stop();
  });
});

describe('DSH current capabilities after composition changes', () => {
  it('refreshes newly mounted terminal methods without reconnecting', async () => {
    const { adapter, clients } = fixture(client => { (client.handshake.controlCapabilities as DshJsonObject).terminal = { present: false }; });
    const id = await adapter.createSession(); expect(adapter.getNativeControlCapabilities().controls.terminal.list).toBe(false);
    clients[0].liveCapabilities = capabilities;
    await expect(adapter.refreshNativeControlCapabilities()).resolves.toMatchObject({ controls: { terminal: { present: true, list: true } } });
    expect(adapter.getNativeControlCapabilities().controls.terminal.spawn).toBe(true);
    await expect(adapter.listSessionTerminals(id)).resolves.toEqual([]);
    expect(clients).toHaveLength(1); noImplicitStop(clients[0]); await adapter.stop();
  });

  it('refreshes the synchronous snapshot after an extension mutation settles', async () => {
    const { adapter, clients } = fixture(client => { (client.handshake.controlCapabilities as DshJsonObject).terminal = { present: false }; });
    await adapter.start();
    clients[0].respond = async method => {
      if (method !== 'config/extensions') return undefined;
      clients[0].liveCapabilities = capabilities;
      return { operationId: 'native-operation', result: { enabled: true } };
    };
    await expect(adapter.mutateNativeExtension({ action: 'enable-bundle', name: 'terminal-bundle', enabled: true })).resolves.toMatchObject({ operationId: 'native-operation' });
    expect(adapter.getNativeControlCapabilities().controls.terminal.list).toBe(true);
    expect(clients[0].requests.at(-1)?.method).toBe('control/capabilities'); await adapter.stop();
  });

  it('rechecks method gates before requests after the runtime withdraws a service', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    clients[0].liveCapabilities = { ...capabilities, terminal: { present: false } };
    await expect(adapter.listSessionTerminals(id)).rejects.toMatchObject({ code: 'unavailable' });
    expect(adapter.getNativeControlCapabilities().controls.terminal.list).toBe(false);
    expect(clients[0].requests.some(request => request.method === 'session/terminal')).toBe(false); await adapter.stop();
  });

  it('never skips a running terminal based on initial absent presence', async () => {
    const { adapter, clients } = fixture(client => { (client.handshake.controlCapabilities as DshJsonObject).terminal = { present: false }; });
    await adapter.createSession(); clients[0].liveCapabilities = capabilities;
    clients[0].respond = async (method, params) => method === 'session/terminal' && params.action === 'list'
      ? { terminals: [{ sessionId: 'pty-live', type: 'bash', status: { kind: 'running' } }] } : undefined;
    try { await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' }); noImplicitStop(clients[0]); }
    finally { await adapter.stop(); }
  });

  it('rejects a capability change between the first proof and final process-stop boundary', async () => {
    const { adapter, clients } = fixture(client => { (client.handshake.controlCapabilities as DshJsonObject).terminal = { present: false }; });
    await adapter.createSession(); let goals = 0;
    clients[0].respond = async method => {
      if (method === 'session/goal' && ++goals === 2) clients[0].liveCapabilities = capabilities;
      return undefined;
    };
    try { await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' }); noImplicitStop(clients[0]); }
    finally { await adapter.stop(); }
  });

  it('blocks same-method service remounts when only the composition revision changes', async () => {
    const { adapter, clients } = fixture(); await adapter.createSession(); let goals = 0;
    clients[0].respond = async method => {
      if (method === 'session/goal' && ++goals === 2) clients[0].liveCapabilities = { ...capabilities, revision: 1 };
      return undefined;
    };
    try { await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' }); noImplicitStop(clients[0]); }
    finally { await adapter.stop(); }
  });

  it('blocks unpublished terminal activity and fails closed when its advertised proof is missing', async () => {
    const { adapter, clients } = fixture(client => {
      (client.handshake.controlCapabilities as DshJsonObject).terminal = { ...(capabilities.terminal as DshJsonObject), activity: true };
    });
    await adapter.createSession();
    try {
      clients[0].respond = async method => method === 'session/terminal' ? { terminals: [], active: true } : undefined;
      await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' }); noImplicitStop(clients[0]);
      clients[0].respond = async method => method === 'session/terminal' ? { terminals: [] } : undefined;
      await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'invalid-response' }); noImplicitStop(clients[0]);
    } finally { await adapter.stop(); }
  });

  it.each([undefined, -1, 0.5])('rejects a missing or malformed current composition revision %#', async revision => {
    const { adapter, clients } = fixture(); await adapter.createSession();
    clients[0].liveCapabilities = { ...capabilities, revision };
    try { await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'invalid-response' }); noImplicitStop(clients[0]); }
    finally { await adapter.stop(); }
  });

  it('treats handshake absence as unknown when a legacy bridge has no current readback', async () => {
    const { adapter, clients } = fixture(client => {
      (client.handshake.controlCapabilities as DshJsonObject).readback = false;
      (client.handshake.controlCapabilities as DshJsonObject).terminal = { present: false };
    });
    await adapter.createSession();
    try { await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' }); noImplicitStop(clients[0]); }
    finally { await adapter.stop(); }
  });

  it('rejects stale capability responses and does not update a replacement snapshot', async () => {
    const { adapter, clients } = fixture(); await adapter.start(); const gate = deferred();
    clients[0].respond = async method => method === 'control/capabilities' ? gate.promise : undefined;
    const refreshing = adapter.refreshNativeControlCapabilities(); await tick(); await adapter.stop(); await adapter.start();
    gate.resolve({ controlCapabilities: { ...capabilities, terminal: { present: false } } });
    await expect(refreshing).rejects.toMatchObject({ code: 'superseded' });
    expect(adapter.getNativeControlCapabilities().controls.terminal.list).toBe(true); await adapter.stop();
  });
});
