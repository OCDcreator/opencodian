import { describe, expect, it, jest } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { dshNativeConfigurationRevision } from '../../../../../src/core/agents/backend/configuration/DshNativeConfiguration';
import type { DshAcpClientOptions, DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import type { DshNativeControlUpdate } from '../../../../../src/core/agents/backend/dsh/DshNativeControls';
import { collect, deferred, FakeDshClient, settings, tick } from './DshAdapter.fixture';

const FLAGS = {
  permissionPresets: { get: true, set: true }, plan: { get: true, set: true }, todos: { list: true, updates: true },
  jobs: { list: true, get: true, read: true, readAt: true, wait: true, kill: true, updates: true },
  terminal: { availability: true, list: true, spawn: true, read: true, send: true, signal: true, kill: true },
  subagents: { list: true, get: true, cancel: true }, mcp: { apply: true, status: true, connectionStatus: false },
};
const PERMISSION = {
  catalog: { options: [{ value: 'default', name: 'Default' }], defaultOptions: [{ value: 'default', name: 'Default' }], defaultPreset: 'default' },
  current: 'default', defaultPreset: 'default',
};
const TODO = { id: 'todo-0', content: 'Read the actual state', status: 'in_progress' };
function job(owner: string, status = 'completed', id = 'job-1') {
  return { id, kind: 'bash', label: 'Check', owner, status, startedAt: 10, output: { total: 5, earliest: 0 } };
}
class NativeClient extends FakeDshClient {
  override handshake: DshJsonObject = {
    nativeProtocol: 'opencodian.dsh-native/1', agentCapabilities: {}, controlCapabilities: JSON.parse(JSON.stringify(FLAGS)),
    configurationCapabilities: { describe: true, credentials: { describe: true, set: true, unset: true }, extensionSettings: { mutate: true },
      extensions: { list: true, inspect: true, versions: true, enablePlugin: true, enableBundle: true, install: true, update: true, remove: true, cancel: true, exempt: true, managedProfile: true } },
  };
  readonly nativeCalls: Array<{ method: string; params: DshJsonObject; timeoutMs?: number }> = [];
  reply: (method: string, params: DshJsonObject) => Promise<DshJsonObject | undefined> = async () => undefined;
  async nativeRequest(method: string, params: DshJsonObject = {}, timeoutMs?: number): Promise<DshJsonObject> {
    this.nativeCalls.push({ method, params, timeoutMs });
    const response = await this.reply(method, params);
    if (response !== undefined) return response;
    switch (method) {
      case 'config/describe': return { forms: [], profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: dshNativeConfigurationRevision(this.options.nativeConfig) };
      case 'config/credentials': return { credentials: [{ ref: 'API_KEY', configured: false, writable: true }] };
      case 'config/extensions': return { plugins: [], bundles: [], operationId: 'native-op' };
      case 'session/permission-presets': return PERMISSION;
      case 'session/plan': return { active: false };
      case 'session/goal': return { goal: null };
      case 'session/todos': return { todos: [TODO] };
      case 'session/jobs': return params.action === 'list' ? { jobs: [] } : { job: job(String(params.sessionId)) };
      case 'session/terminal': return params.action === 'availability' ? { available: true, backends: ['bash'] } : { terminals: [] };
      case 'session/subagents': return { children: [] };
      case 'session/mcp': return { servers: [{ name: 'local', state: 'unknown', connected: null, toolCount: 2, reason: 'Native status unavailable' }] };
      default: throw new Error(`Unexpected fixture method ${method}`);
    }
  }
}
function fixture(configure?: (client: NativeClient) => void) {
  const current = { ...settings(), transport: 'native' as const };
  const clients: NativeClient[] = [];
  const adapter = new DshAdapter({ workingDirectory: '/true-vault', getSettings: () => current,
    createClient: (options: DshAcpClientOptions) => {
      const client = new NativeClient(options); configure?.(client); clients.push(client); return client;
    } });
  return { adapter, clients, current };
}

describe('DshAdapter native control evidence and ownership', () => {
  it('advertises Todos only with Native handshake proof and never enables OpenCode Subagents controls', async () => {
    const { adapter, clients } = fixture();
    expect(adapter.hasCapability(AgentCapability.Todos)).toBe(true);
    await adapter.start();
    expect(adapter.hasCapability(AgentCapability.Todos)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Subagents)).toBe(false);
    expect(adapter.getNativeControlCapabilities().controls.terminal.send).toBe(true);
    await adapter.stop();
    clients[0].emitUpdate('old', { sessionUpdate: 'todo_update', todos: [TODO] });
    const downgraded = fixture(client => { client.handshake = { agentCapabilities: {} }; });
    await downgraded.adapter.start();
    expect(downgraded.adapter.hasCapability(AgentCapability.Todos)).toBe(false);
    await expect(downgraded.adapter.getSessionPlanState('not-owned')).rejects.toMatchObject({ code: 'unavailable' });
    expect(downgraded.clients[0].calls.some(call => call.method === 'session/resume')).toBe(false);
    await downgraded.adapter.stop();
  });

  it('gates each method independently and rejects ACP without issuing Native calls', async () => {
    const { adapter, clients } = fixture(client => {
      client.handshake.controlCapabilities = { ...FLAGS, plan: { get: true, set: false }, todos: { list: true, updates: false } };
    });
    const sessionId = await adapter.createSession();
    expect(adapter.hasCapability(AgentCapability.Todos)).toBe(false);
    await expect(adapter.setSessionPlanState(sessionId, true)).rejects.toMatchObject({ code: 'unavailable' });
    expect(clients[0].nativeCalls).toHaveLength(0);
    await adapter.stop();
    const acp = new DshAdapter({ workingDirectory: '/vault', getSettings: settings, createClient: options => new FakeDshClient(options) });
    expect(acp.hasCapability(AgentCapability.Todos)).toBe(false);
    await expect(acp.getNativeConfiguration()).rejects.toMatchObject({ code: 'unavailable' });
    await acp.stop();
  });

  it('keeps permission and Plan readbacks distinct and never echoes a requested mutation', async () => {
    const { adapter, clients } = fixture();
    const id = await adapter.createSession();
    clients[0].reply = async method => method === 'session/plan' ? { active: false, pending: true, disposition: 'queued' } : undefined;
    await expect(adapter.setSessionPermissionPreset(id, 'auto')).resolves.toEqual(PERMISSION);
    await expect(adapter.setSessionPlanState(id, true)).resolves.toEqual({ active: false, pending: true, disposition: 'queued' });
    expect(clients[0].nativeCalls.map(call => ({ method: call.method, params: call.params }))).toEqual([
      { method: 'session/permission-presets', params: { sessionId: id, action: 'set', preset: 'auto' } },
      { method: 'session/plan', params: { sessionId: id, action: 'set', active: true } },
    ]);
    await adapter.stop();
  });

  it('emits Todo and control notifications for the owning session, including idle state, and cleans observers', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    const todos = jest.fn(); const updates = jest.fn();
    const todoSubscription = adapter.subscribeToSessionTodoUpdates(todos);
    const subscription = adapter.subscribeToNativeControlUpdates(updates);
    clients[0].emitUpdate('foreign', { sessionUpdate: 'todo_update', todos: [TODO] });
    clients[0].emitUpdate(id, { sessionUpdate: 'todo_update', todos: [TODO] });
    clients[0].emitUpdate(id, { sessionUpdate: 'plan_update', active: true });
    clients[0].emitUpdate(id, { sessionUpdate: 'permission_presets_update', ...PERMISSION });
    expect(todos).toHaveBeenCalledTimes(1);
    expect(todos).toHaveBeenCalledWith({ sessionID: id, todos: [TODO] });
    expect(updates).toHaveBeenCalledWith({ kind: 'session', sessionId: id, update: { sessionUpdate: 'plan_update', active: true } });
    todoSubscription.dispose(); subscription.dispose();
    clients[0].emitUpdate(id, { sessionUpdate: 'todo_update', todos: [TODO] });
    expect(todos).toHaveBeenCalledTimes(1);
    await adapter.stop();
  });

  it('drops late Native responses and notifications after lifecycle invalidation', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    const gate = deferred(); const updates = jest.fn(); adapter.subscribeToNativeControlUpdates(updates);
    clients[0].reply = async () => gate.promise;
    const reading = adapter.getSessionPlanState(id); await tick();
    clients[0].disconnect();
    expect(adapter.getNativeControlCapabilities().native).toBe(false);
    gate.resolve({ active: true });
    await expect(reading).rejects.toMatchObject({ code: 'superseded' });
    updates.mockClear();
    clients[0].emitUpdate(id, { sessionUpdate: 'plan_update', active: true });
    clients[0].options.onControlUpdate?.({ operationId: 'stale', action: 'install', event: 'settled' });
    expect(updates).not.toHaveBeenCalled(); await adapter.stop();
  });

  it('rejects a stale readback after replacing the connection even when the same session id is reused', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    const gate = deferred(); clients[0].reply = async () => gate.promise;
    const old = adapter.getSessionTodos(id); await tick();
    await adapter.stop(); await adapter.createSession();
    gate.resolve({ todos: [TODO] });
    await expect(old).rejects.toMatchObject({ code: 'superseded' });
    await expect(adapter.getSessionTodos(id)).resolves.toEqual([TODO]); await adapter.stop();
  });

  it('rejects foreign and unowned Jobs while forwarding caller identity on every action', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    clients[0].reply = async () => ({ jobs: [job('someone-else')] });
    await expect(adapter.listSessionJobs(id)).rejects.toMatchObject({ code: 'invalid-response' });
    clients[0].reply = async () => ({ job: { ...job(id), owner: undefined } });
    await expect(adapter.getSessionJob(id, 'job-1')).rejects.toMatchObject({ code: 'invalid-response' });
    clients[0].reply = async (_method, params) => {
      if (params.action === 'readAt') return { chunks: [{ at: 3, text: 'ok' }], next: 5, lossy: false };
      if (params.action === 'kill') return { disposition: 'requested', job: job(id, 'stopping') };
      return { job: job(id) };
    };
    await expect(adapter.readSessionJobAt(id, 'job-1', { from: 3 })).resolves.toMatchObject({ next: 5 });
    await expect(adapter.waitForSessionJob(id, 'job-1', { timeoutMs: 50 })).resolves.toMatchObject({ owner: id });
    await expect(adapter.killSessionJob(id, 'job-1', { reason: 'Requested by user' })).resolves.toMatchObject({ disposition: 'requested', job: { status: 'stopping' } });
    expect(clients[0].nativeCalls.every(call => call.params.sessionId === id)).toBe(true);
    expect(clients[0].nativeCalls.at(-1)?.params).toEqual({ action: 'kill', sessionId: id, jobId: 'job-1', reason: 'Requested by user' });
    await adapter.stop();
  });

  it('does not publish foreign Jobs or malformed Plan/Todo events', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession(); const updates = jest.fn();
    adapter.subscribeToNativeControlUpdates(updates);
    clients[0].emitUpdate(id, { sessionUpdate: 'jobs_update', event: { type: 'settled', job: job('foreign') } });
    clients[0].emitUpdate(id, { sessionUpdate: 'jobs_update', event: { type: 'output', id: 'unowned', total: 5 } });
    clients[0].emitUpdate(id, { sessionUpdate: 'plan_update', active: 'true' });
    clients[0].emitUpdate(id, { sessionUpdate: 'todo_update', todos: [{ content: 'missing identity' }] });
    expect(updates).not.toHaveBeenCalled();
    clients[0].emitUpdate(id, { sessionUpdate: 'jobs_update', event: { type: 'settled', job: job(id) } });
    expect(updates).toHaveBeenCalledTimes(1); await adapter.stop();
  });

  it('forwards exact terminal arguments and keeps timeout separate from process completion', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    clients[0].reply = async (_method, params) => {
      if (params.action === 'spawn') return { sessionId: 'pty-1', type: 'bash', status: { kind: 'running' }, motd: 'Ready' };
      if (params.action === 'send') return { viewport: 'still working', waitReason: 'timeout', sessionStatus: { kind: 'running' }, truncated: false };
      if (params.action === 'signal') return { delivered: true, targetPgid: 42 };
      return { text: 'history', totalLines: 2, lineBegin: 0, lineEnd: 2, truncated: false };
    };
    await adapter.spawnSessionTerminal(id, { type: 'bash', name: 'owned', cwd: '/vault' });
    await adapter.readSessionTerminal(id, 'pty-1', { offset: 0, count: 2 });
    await expect(adapter.sendSessionTerminal(id, 'pty-1', { text: 'pwd', submit: true })).resolves.toMatchObject({ waitReason: 'timeout', sessionStatus: { kind: 'running' } });
    await adapter.signalSessionTerminal(id, 'pty-1', 'SIGINT');
    expect(clients[0].nativeCalls.map(call => call.params)).toEqual([
      { action: 'spawn', sessionId: id, type: 'bash', name: 'owned', cwd: '/vault' },
      { action: 'read', sessionId: id, terminalId: 'pty-1', offset: 0, count: 2 },
      { action: 'send', sessionId: id, terminalId: 'pty-1', text: 'pwd', submit: true },
      { action: 'signal', sessionId: id, terminalId: 'pty-1', signal: 'SIGINT' },
    ]); await adapter.stop();
  });

  it('preserves child identity and actual status while forwarding only explicit cancellation', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    const child = { id: 'child', mode: 'continuable', label: 'Review', createdAt: 1, status: 'running', activity: 'active' };
    clients[0].reply = async (_method, params) => params.action === 'list' ? { children: [child] }
      : params.action === 'cancel' ? { accepted: true, child } : { child };
    await expect(adapter.listSessionSubagents(id)).resolves.toEqual([child]);
    await expect(adapter.getSessionSubagent(id, child.id)).resolves.toEqual(child);
    await expect(adapter.cancelSessionSubagent(id, child.id)).resolves.toEqual({ accepted: true, child });
    expect(clients[0].nativeCalls.at(-1)?.params).toEqual({ sessionId: id, action: 'cancel', childSessionId: 'child' });
    expect(adapter.hasCapability(AgentCapability.Subagents)).toBe(false);
    clients[0].reply = async () => ({ child: { ...child, id: 'other-child' } });
    await expect(adapter.getSessionSubagent(id, child.id)).rejects.toMatchObject({ code: 'invalid-response' });
    await adapter.stop();
  });

});

describe('DshAdapter native configuration evidence', () => {
  it('returns actual configuration, credential metadata and extension results without secrets or raw exceptions', async () => {
    const { adapter, clients } = fixture(); await adapter.start();
    clients[0].reply = async method => {
      if (method === 'config/describe') return { forms: [{ id: 'provider', value: { apiKey: 'DO_NOT_LEAK', maxTokens: 500 } }],
        profile: { managed: true, writable: false, hasDocument: true }, appliedRevision: 'different-runtime-revision' };
      if (method === 'config/credentials') return { credentials: [{ ref: 'API_KEY', configured: false, writable: true, value: 'DO_NOT_LEAK' }] };
      return { operationId: 'actual-native-op', state: 'failed', apiKey: 'DO_NOT_LEAK' };
    };
    const readback = await adapter.getNativeConfiguration(['llm-pi']);
    expect(readback.appliedRevision).toBe('different-runtime-revision');
    expect(JSON.stringify(readback)).not.toContain('DO_NOT_LEAK');
    await expect(adapter.setNativeCredential('API_KEY', 'DO_NOT_LEAK')).resolves.toEqual({ credentials: [{ ref: 'API_KEY', configured: false, writable: true }] });
    await expect(adapter.mutateNativeExtension({ action: 'install', spec: 'package-name' })).resolves.toMatchObject({ operationId: 'actual-native-op', state: 'failed' });
    clients[0].reply = async () => { throw new Error('Authorization: Bearer DO_NOT_LEAK'); };
    await expect(adapter.getNativeCredentialDescriptors()).rejects.toThrow('Harness control failed');
    await adapter.stop();
  });

  it('forwards extension settings CAS edits and returns only the actual confirmed form', async () => {
    const { adapter, clients } = fixture(); await adapter.start();
    const confirmed = { form: { ns: 'extension', revision: 8, value: { enabled: false } }, persistence: { source: 'managed-profile', status: 'verified' },
      application: { status: 'verified' }, readback: { status: 'verified' } };
    clients[0].reply = async () => confirmed;
    await expect(adapter.mutateNativeExtensionSettings({ ns: 'extension', expectedRevision: 7,
      ops: [{ op: 'set', path: ['enabled'], value: true }] })).resolves.toEqual(confirmed);
    expect(clients[0].nativeCalls.at(-1)?.params).toEqual({ action: 'mutate', ns: 'extension', expectedRevision: 7, ops: [{ op: 'set', path: ['enabled'], value: true }] });
    const unavailable = { ...confirmed, form: null, application: { status: 'unavailable', reason: 'extension-form-no-longer-active' }, readback: { status: 'unavailable' } };
    clients[0].reply = async () => unavailable;
    await expect(adapter.mutateNativeExtensionSettings({ ns: 'extension', expectedRevision: 8, ops: [{ op: 'unset', path: ['enabled'] }] })).resolves.toEqual(unavailable);
    clients[0].reply = async () => { throw new Error('[SETTINGS_CONFLICT] raw secret'); };
    await expect(adapter.mutateNativeExtensionSettings({ ns: 'extension', expectedRevision: 7, ops: [{ op: 'unset', path: ['enabled'] }] })).rejects.toMatchObject({ code: 'conflict' });
    expect(() => adapter.mutateNativeExtensionSettings({ ns: 'extension', expectedRevision: 7, ops: [{ op: 'set', path: ['__proto__'], value: {} }] })).toThrow('invalid control state');
    await adapter.stop();
  });

  it('preserves mismatched effective observations even when the applied revision matches the request', async () => {
    const { adapter, clients, current } = fixture();
    current.nativeConfig = { version: 1, overrides: { jobs: { retainBytes: 2048 } } };
    await adapter.start();
    const observations = [{ ns: 'jobs', status: 'verified', valueSource: 'effective', value: { retainBytes: 1024 } },
      { ns: 'permission', status: 'unavailable', valueSource: 'effective', reason: 'native-effective-readback-failed' }];
    clients[0].reply = async () => ({ forms: [], observations, profile: { managed: true, writable: true, hasDocument: true }, appliedRevision: dshNativeConfigurationRevision(current.nativeConfig) });
    const readback = await adapter.getNativeConfiguration();
    expect(readback.appliedRevision).toBe(dshNativeConfigurationRevision(current.nativeConfig));
    expect(readback.observations).toEqual(observations);
    expect(readback.observations?.[0].value).not.toEqual(current.nativeConfig.overrides.jobs);
    clients[0].reply = async () => ({ forms: [], observations: [{ ns: 'jobs', status: 'verified', valueSource: 'requested', value: { retainBytes: 2048 } }],
      profile: { managed: true, writable: true, hasDocument: true } });
    await expect(adapter.getNativeConfiguration()).rejects.toMatchObject({ code: 'invalid-response' });
    await adapter.stop();
  });

  it('does not turn a missing applied revision into requested configuration evidence', async () => {
    const { adapter, clients } = fixture(); await adapter.start();
    clients[0].reply = async () => ({ forms: [], profile: { managed: true, writable: true, hasDocument: true } });
    await expect(adapter.getNativeConfiguration()).resolves.toMatchObject({ appliedRevision: null });
    await adapter.stop();
  });

  it('publishes bounded extension metadata only for the current connection and detaches on dispose', async () => {
    const { adapter, clients } = fixture(); await adapter.start(); const updates = jest.fn();
    adapter.subscribeToNativeControlUpdates(updates);
    clients[0].options.onControlUpdate?.({ operationId: 'op', action: 'install', event: 'output', output: 'Authorization: Bearer DO_NOT_LEAK' });
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({ kind: 'extension' }));
    expect(JSON.stringify(updates.mock.calls)).not.toContain('DO_NOT_LEAK');
    adapter.dispose(); updates.mockClear();
    clients[0].options.onControlUpdate?.({ operationId: 'op', action: 'install', event: 'settled' });
    expect(updates).not.toHaveBeenCalled(); await adapter.stop();
  });

  it('fences MCP apply and does not stop live Jobs or children on a control timeout', async () => {
    const { adapter, clients, current } = fixture(); const id = await adapter.createSession();
    current.mcpServers = [{ name: 'local', command: '/opt/mcp', args: [], env: [] }];
    clients[0].reply = async () => { throw new Error('session/mcp timed out with secret'); };
    await expect(adapter.applyMcpConfiguration()).rejects.toMatchObject({ code: 'failed' });
    expect(clients[0].calls.some(call => call.method === 'stop' || call.method === 'session/cancel')).toBe(false);
    clients[0].reply = async () => ({ servers: [{ name: 'local', mounted: false }] });
    await expect(adapter.applyMcpConfiguration()).rejects.toMatchObject({ code: 'invalid-response' });
    clients[0].reply = async () => ({ servers: [{ name: 'local', mounted: true, connected: null }] });
    await expect(adapter.applyMcpConfiguration()).resolves.toBe(1);
    expect(clients[0].nativeCalls.at(-1)?.params).toEqual({ action: 'apply', sessionId: id, replace: current.mcpServers });
    const gate = deferred(); clients[0].reply = async () => gate.promise;
    const applying = adapter.applyMcpConfiguration(); await tick(); await adapter.stop();
    gate.resolve({ servers: [{ name: 'local', mounted: true }] });
    await expect(applying).rejects.toMatchObject({ code: 'superseded' });
  });

  it('keeps unknown MCP connection status honest and creates only a catalog draft for an optional session', async () => {
    const { adapter, clients } = fixture();
    await expect(adapter.getSessionMcpStatus()).resolves.toEqual({ servers: [{ name: 'local', state: 'unknown', connected: null, toolCount: 2, reason: 'Native status unavailable' }] });
    expect(clients[0].calls.filter(call => call.method === 'session/new')).toHaveLength(1);
    expect(clients[0].calls.some(call => call.method === 'session/prompt')).toBe(false);
    clients[0].reply = async method => method === 'session/information' ? { servers: [{ name: 'local', connected: null }], agents: [] } : undefined;
    await expect(adapter.readSessionInformation('created-1')).resolves.toMatchObject({ mcp: { servers: [{ name: 'local', status: 'unknown' }] } });
    await adapter.stop();
  });
});

describe('DshAdapter explicit configuration reconnect', () => {
  it('includes configuration revision and preserves original vault identity independently of cwd', async () => {
    const { adapter, clients, current } = fixture(); const id = await adapter.createSession();
    expect(clients[0].options.vaultPath).toBe('/true-vault'); expect(clients[0].options.cwd).toBe('/vault');
    current.nativeConfig = { version: 1, overrides: { jobs: { retainBytes: 1024 } } };
    await expect(adapter.start()).rejects.toThrow('settings changed');
    expect(clients).toHaveLength(1);
    const observed = await adapter.reconnectNativeConfiguration();
    expect(observed.appliedRevision).toBe(dshNativeConfigurationRevision(current.nativeConfig));
    expect(clients).toHaveLength(2);
    expect(clients[0].calls.filter(call => ['session/cancel', 'session/close'].includes(call.method))).toHaveLength(0);
    expect(clients[0].nativeCalls.some(call => ['kill', 'cancel'].includes(String(call.params.action)))).toBe(false);
    await adapter.getSessionPlanState(id);
    expect(clients[1].calls).toContainEqual(expect.objectContaining({ method: 'session/resume' })); await adapter.stop();
  });

  it('rejects reconnect during an active turn and sends all busy transitions to observers', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession(); const events: DshNativeControlUpdate[] = [];
    adapter.subscribeToNativeControlUpdates(event => { events.push(event); });
    const running = collect(adapter.sendMessage({ sessionId: id, content: 'Work' })); await tick();
    await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' });
    expect(clients[0].calls.some(call => call.method === 'stop' || call.method === 'session/cancel')).toBe(false);
    clients[0].resolvePrompt(id); await running;
    expect(events.filter(event => event.kind === 'busy')).toEqual([{ kind: 'busy', sessionId: id, busy: true }, { kind: 'busy', sessionId: id, busy: false }]);
    await adapter.stop();
  });

  it('rejects reconnect while cancellation is waiting for native settlement', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    clients[0].autoSettleCancel = false;
    const running = collect(adapter.sendMessage({ sessionId: id, content: 'Work' })); await tick();
    const cancellation = adapter.cancelStream(id); await tick();
    await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' });
    expect(clients[0].calls.some(call => call.method === 'stop')).toBe(false);
    clients[0].resolvePrompt(id); await cancellation; await running; await adapter.stop();
  });

  it('rejects reconnect while a control is in flight without cancelling it', async () => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession(); const gate = deferred();
    clients[0].reply = async () => gate.promise;
    const reading = adapter.getSessionPlanState(id); await tick();
    await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' });
    gate.resolve({ active: true }); await expect(reading).resolves.toEqual({ active: true }); await adapter.stop();
  });

  it.each(['jobs', 'children', 'terminal'])('blocks reconnect for active or unconfirmed %s without cancellation', async family => {
    const { adapter, clients } = fixture(); const id = await adapter.createSession();
    clients[0].reply = async (method, params) => {
      if (family === 'jobs' && method === 'session/jobs') return { jobs: [job(id, 'running')] };
      if (family === 'terminal' && method === 'session/terminal') return { terminals: [{ sessionId: 'pty', type: 'bash', status: { kind: 'running' } }] };
      if (family === 'children' && method === 'session/subagents') {
        const child = { id: 'child', createdAt: 1, mode: 'continuable', label: 'Still working', status: 'idle', activity: 'unknown' };
        return params.action === 'get' ? { child } : { children: [child] };
      }
      return undefined;
    };
    await expect(adapter.reconnectNativeConfiguration()).rejects.toMatchObject({ code: 'busy' });
    expect(clients[0].calls.some(call => call.method === 'stop' || call.method === 'session/cancel')).toBe(false);
    expect(clients[0].nativeCalls.some(call => ['kill', 'cancel'].includes(String(call.params.action)))).toBe(false);
    await adapter.stop();
  });

  it('keeps reconnect failures safe and never reports requested settings as applied', async () => {
    const { adapter, clients } = fixture(); await adapter.createSession();
    clients[0].stopError = new Error('secret launch token');
    await expect(adapter.reconnectNativeConfiguration()).rejects.toThrow('Harness configuration reconnect failed');
    expect(adapter.status).toBe('error'); expect(clients).toHaveLength(1);
    await adapter.stop();
  });
});
