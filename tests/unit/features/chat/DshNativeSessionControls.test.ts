import { capturedNotices, clearCapturedNotices } from 'obsidian';

import { dshNativeControlCapabilities, type DshNativeControlUpdate, type DshPermissionPresetState } from '../../../../src/core/agents/backend/dsh/DshNativeControls';
import { type DshChatControlService, DshNativeSessionControls } from '../../../../src/features/chat/services/selection/DshNativeSessionControls';

const SETTLE = () => new Promise((done) => setTimeout(done, 0));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

const capabilities = () => dshNativeControlCapabilities({ nativeProtocol: 'opencodian.dsh-native/1', controlCapabilities: {
  permissionPresets: { get: true, set: true }, plan: { get: true, set: true },
  jobs: { list: true, get: true, read: true, readAt: true, wait: true, kill: true, updates: true },
  terminal: { availability: true, list: true, spawn: true, read: true, send: true, signal: true, kill: true },
  subagents: { list: true, get: true, cancel: true },
} }, true);

function presetState(current = 'workspace'): DshPermissionPresetState {
  return { current, defaultPreset: 'workspace', catalog: {
    options: [{ value: 'workspace', name: 'Workspace' }, { value: 'full', name: 'Full access' }], defaultOptions: [], defaultPreset: 'workspace' } };
}

/** Headless preset owner behind the generic composer selector. */
function presetFixture() {
  const listeners = new Set<(event: DshNativeControlUpdate) => void>();
  const connectionListeners = new Set<(status: string) => void>();
  let preset = presetState();
  const refreshCapabilities = jest.fn(async () => capabilities());
  const service = {
    getNativeControlCapabilities: jest.fn(() => capabilities()),
    refreshNativeControlCapabilities: refreshCapabilities,
    onStatusChange: jest.fn((listener: (status: string) => void) => { connectionListeners.add(listener); return { dispose: () => connectionListeners.delete(listener) }; }),
    subscribeToNativeControlUpdates: jest.fn((listener: (event: DshNativeControlUpdate) => void) => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; }),
    getSessionPermissionPreset: jest.fn(async () => preset),
    setSessionPermissionPreset: jest.fn(async (_id: string, value: string) => { preset = { ...preset, current: value }; return preset; }),
  };
  let sessionId: string | null = 'session-a'; let acp = false; let streaming = false;
  let active: DshChatControlService | null = service;
  const changes = jest.fn();
  const controls = new DshNativeSessionControls({
    getSessionId: () => sessionId, getService: () => active, isAcp: () => acp, isStreaming: () => streaming, onChange: changes,
  });
  controls.update();
  return { controls, service, refreshCapabilities, changes,
    emit: (event: DshNativeControlUpdate) => { for (const listener of listeners) listener(event); },
    reconnect: () => { for (const listener of connectionListeners) listener('connected'); },
    setSession: (id: string | null) => { sessionId = id; controls.update(); },
    useAcp: () => { acp = true; controls.update(); },
    setBusy: () => { streaming = true; controls.update(); },
    replaceService: () => { active = { ...service }; controls.update(); },
    customPreset: () => { preset = { ...preset, current: 'custom' };
      for (const listener of listeners) listener({ kind: 'session', sessionId: 'session-a', update: { sessionUpdate: 'permission_presets_update', ...preset } }); },
  };
}

const presetSuites: DshNativeSessionControls[] = [];
afterEach(() => { presetSuites.splice(0).forEach((controls) => controls.destroy()); clearCapturedNotices(); jest.restoreAllMocks(); });
const createPreset = () => { const f = presetFixture(); presetSuites.push(f.controls); return f; };

describe('DSH native preset owner (generic selector host)', () => {
  it('reads through capability discovery and publishes the live catalog to the selector config', async () => {
    const f = createPreset(); await SETTLE();
    expect(f.refreshCapabilities).toHaveBeenCalled();
    expect(f.service.getSessionPermissionPreset).toHaveBeenCalledWith('session-a');
    expect(f.controls.config.backendLabel).toBe('dsh');
    expect(f.controls.config.options.map((option) => option.label)).toEqual(['Workspace', 'Full access']);
    expect(f.controls.getPermissionMode()).toBe(f.controls.config.options[0].id);
    expect(f.controls.hint()).toContain('Workspace');
  });

  it('switches only after an independent session read confirms the write', async () => {
    const f = createPreset(); await SETTLE();
    const target = f.controls.config.options[1];
    f.service.getSessionPermissionPreset.mockResolvedValueOnce(presetState('full'));
    expect(await f.controls.switchPermissionMode(target.id)).toBe(true);
    expect(f.service.setSessionPermissionPreset).toHaveBeenCalledWith('session-a', 'full');
    // The echoed write lands before the confirmation read; the read is authoritative.
    expect(f.service.getSessionPermissionPreset).toHaveBeenCalledTimes(2);
  });

  it('reports a failed confirmation without pretending the preset changed', async () => {
    const f = createPreset(); await SETTLE();
    const target = f.controls.config.options[1];
    // The echo reports the write, but the independent readback still shows the old preset.
    f.service.getSessionPermissionPreset.mockResolvedValueOnce(presetState('workspace'));
    expect(await f.controls.switchPermissionMode(target.id)).toBe(false);
    expect(capturedNotices.length).toBeGreaterThan(0);
    expect(f.controls.getPermissionMode()).toBe(f.controls.config.options[0].id);
  });

  it('never offers the derived custom value as a switch target', async () => {
    const f = createPreset();
    f.customPreset(); await SETTLE();
    expect(f.controls.getPermissionMode()).toContain('custom');
    expect(f.controls.config.options.map((option) => option.label)).toEqual(['Workspace', 'Full access']);
    expect(await f.controls.switchPermissionMode(f.controls.getPermissionMode())).toBe(false);
    expect(f.service.setSessionPermissionPreset).not.toHaveBeenCalled();
  });

  it('refuses switches while the session is busy or streaming, without any write', async () => {
    const f = createPreset(); await SETTLE();
    f.setBusy();
    expect(await f.controls.switchPermissionMode(f.controls.config.options[1].id)).toBe(false);
    expect(f.service.setSessionPermissionPreset).not.toHaveBeenCalled();
  });

  it('shows checking with no session and never starts a session to read controls', async () => {
    const f = createPreset();
    f.setSession(null); await SETTLE();
    expect(f.controls.getPermissionMode()).toBe('dsh-checking');
    expect(f.controls.hint()).not.toBe('');
    expect(f.service.getSessionPermissionPreset).not.toHaveBeenCalled();
  });

  it('renders ACP as unavailable through the same generic config and performs no reads or writes', async () => {
    const f = createPreset(); await SETTLE();
    f.useAcp(); await SETTLE();
    expect(f.controls.getPermissionMode()).toBe('dsh-unavailable');
    // A stale id cannot match: preset ids carry the owner generation and ACP gates every switch.
    expect(await f.controls.switchPermissionMode('preset-anything')).toBe(false);
    expect(f.service.setSessionPermissionPreset).not.toHaveBeenCalled();
  });

  it('fails closed on a later discovery failure and recovers through reconnect without a stale write', async () => {
    const f = createPreset(); await SETTLE();
    const known = f.controls.config.options[0].id;
    f.service.refreshNativeControlCapabilities!.mockRejectedValueOnce(new Error('discovery failed'));
    await f.controls.refresh();
    expect(f.controls.getPermissionMode()).toBe('dsh-unavailable');
    expect(await f.controls.switchPermissionMode(known)).toBe(false);
    expect(f.service.setSessionPermissionPreset).not.toHaveBeenCalled();
    f.reconnect(); await SETTLE();
    expect(f.controls.getPermissionMode()).toBe(f.controls.config.options[0].id);
  });

  it('drops a stale preset choice after the owning session changes (no write to the new owner)', async () => {
    const f = createPreset(); await SETTLE();
    const staleId = f.controls.config.options[1].id;
    f.setSession('session-b'); await SETTLE();
    expect(await f.controls.switchPermissionMode(staleId)).toBe(false);
    expect(f.service.setSessionPermissionPreset).not.toHaveBeenCalled();
  });

  it('clears cached readback on native invalidation and re-reads only the current session', async () => {
    const f = createPreset(); await SETTLE();
    f.emit({ kind: 'invalidated' }); await SETTLE();
    expect(f.controls.getPermissionMode()).toBe('dsh-unavailable');
    f.service.getSessionPermissionPreset.mockClear();
    f.service.getSessionPermissionPreset.mockResolvedValueOnce(presetState('full'));
    await f.controls.refresh();
    expect(f.service.getSessionPermissionPreset).toHaveBeenCalledTimes(1);
    expect(f.controls.getPermissionMode()).toContain('full');
  });

  it('lets a newer pushed preset state supersede an older in-flight read', async () => {
    const f = createPreset();
    let release!: (value: DshPermissionPresetState) => void;
    f.service.getSessionPermissionPreset.mockImplementation(async () => {
      const gate = deferred<DshPermissionPresetState>();
      release = gate.resolve;
      return gate.promise;
    });
    await SETTLE(); // the constructor read parks on the gate
    f.emit({ kind: 'session', sessionId: 'session-a', update: { sessionUpdate: 'permission_presets_update', ...presetState('full') } });
    release(presetState('workspace')); // the older read resolves after the push
    await SETTLE();
    expect(f.controls.getPermissionMode()).toContain('full');
  });
});
