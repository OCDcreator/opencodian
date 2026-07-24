/**
 * CodexAdapter three-axis runtime evidence lifecycle tests (round 3 item 1).
 *
 * Covers: pending before/during a thread start; verified/unavailable after a
 * successful response; failed after a request failure; stale `verified` cleared
 * when a later response omits the field; concurrent-session isolation (no
 * global-singleton bleed); and getLatestThreadEffectiveEvidence for the
 * Capability Lab consumer.
 */
import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import type { StreamChunk } from '../../../../../src/core/types/chat';

const mockAppServerStart = jest.fn<Promise<void>, []>();
const mockStartThread = jest.fn();
const mockResumeThread = jest.fn();
const mockStartTurn = jest.fn();
let mockClient: {
  start: jest.Mock; stop: jest.Mock; startThread: jest.Mock; resumeThread: jest.Mock;
  startTurn: jest.Mock; interruptTurn: jest.Mock; subscribeToThreadNotifications: jest.Mock;
  registerServerRequestHandler: jest.Mock; unregisterServerRequestHandler: jest.Mock;
  getThreadEffectiveSettings: jest.Mock; clearThreadEffectiveSettings: jest.Mock;
};
let notificationHandler: ((event: { method: string; params: unknown }) => void) | null = null;

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => {
      mockClient = {
        start: mockAppServerStart,
        stop: jest.fn(),
        startThread: mockStartThread,
        resumeThread: mockResumeThread,
        startTurn: mockStartTurn,
        interruptTurn: jest.fn(),
        subscribeToThreadNotifications: jest.fn((_threadId: string, handler: typeof notificationHandler) => {
          notificationHandler = handler;
          return { dispose: jest.fn() };
        }),
        registerServerRequestHandler: jest.fn(),
        unregisterServerRequestHandler: jest.fn(),
        getThreadEffectiveSettings: jest.fn(),
      clearThreadEffectiveSettings: jest.fn(),
      };
      return mockClient;
    }),
  };
});

function createMockCodex() {
  return {
    startThread: jest.fn().mockReturnValue({ runStreamed: jest.fn().mockResolvedValue({ events: (async function* () { /* */ })() }) }),
    resumeThread: jest.fn().mockReturnValue({ runStreamed: jest.fn().mockResolvedValue({ events: (async function* () { /* */ })() }) }),
  };
}

function completeTurn(): void {
  setTimeout(() => {
    notificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', error: null } } });
  }, 0);
}

async function drain(adapter: CodexAdapter, sessionId: string): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of adapter.sendMessage({ sessionId, content: 'go' })) {
    chunks.push(chunk);
  }
  return chunks;
}

function resetMocks(): void {
  jest.clearAllMocks();
  notificationHandler = null;
  mockAppServerStart.mockResolvedValue(undefined);
  mockStartThread.mockResolvedValue({ id: 'thread-1' });
  mockResumeThread.mockResolvedValue({ id: 'thread-1' });
  mockStartTurn.mockImplementation(async () => {
    completeTurn();
    return { id: 'turn-1' };
  });
}

// Adapter wired with model/cwd/effort/approval=never/sandbox so those fields
// have application=verified; modelProvider/activePermissionProfile are never
// wired by the plugin → application=not-applicable.
function wiredAdapter() {
  return new CodexAdapter({
    createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    model: 'gpt-5',
    workingDirectory: '/vault',
    modelReasoningEffort: 'high',
    approvalPolicy: 'never',
    sandboxMode: 'workspace-write',
  });
}

describe('CodexAdapter three-axis runtime evidence lifecycle', () => {
  beforeEach(() => resetMocks());

  it('wired+echoed field → application & runtime both verified; server-only field → application not-applicable', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({
      model: 'gpt-5', sandbox: { type: 'workspaceWrite' }, cwd: '/vault',
      approvalPolicy: 'never', reasoningEffort: 'high',
    });
    await drain(adapter, 'codex-local-1');
    const ev = adapter.getThreadEffectiveEvidence('codex-local-1');
    // model is wired AND echoed → both axes verified.
    expect(ev.model.application).toBe('verified');
    expect(ev.model.runtime).toBe('verified');
    expect(ev.model.persistence).toBe('not-applicable');
    expect(ev.sandbox.application).toBe('verified');
    expect(ev.approvalPolicy.application).toBe('verified');
    // modelProvider is never wired by the plugin → application not-applicable
    // (and not echoed here → runtime unavailable). Crucially a runtime echo
    // would NOT fabricate application=verified.
    expect(ev.modelProvider.application).toBe('not-applicable');
    expect(ev.modelProvider.runtime).toBe('unavailable');
  });

  it('a wired field NOT echoed → application verified, runtime unavailable (honest split)', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue(null); // older server, no echo
    await drain(adapter, 'codex-local-2');
    const ev = adapter.getThreadEffectiveEvidence('codex-local-2');
    expect(ev.model.application).toBe('verified'); // wired
    expect(ev.model.runtime).toBe('unavailable'); // not echoed
    expect(ev.sandbox.application).toBe('verified');
    expect(ev.sandbox.runtime).toBe('unavailable');
  });

  it('resume success → runtime verified for echoed fields', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5' });
    await drain(adapter, 'codex-local-3');
    mockResumeThread.mockClear();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5', sandbox: { type: 'readOnly' } });
    await drain(adapter, 'codex-local-3');
    const ev = adapter.getThreadEffectiveEvidence('codex-local-3');
    expect(ev.sandbox.runtime).toBe('verified');
    expect(mockResumeThread).toHaveBeenCalled();
  });

  it('request failure (startThread returns null) → failed on all axes', async () => {
    mockStartThread.mockResolvedValueOnce(null);
    const adapter = wiredAdapter();
    await adapter.start();
    await drain(adapter, 'codex-local-4');
    const ev = adapter.getThreadEffectiveEvidence('codex-local-4');
    expect(ev.sandbox.application).toBe('failed');
    expect(ev.sandbox.runtime).toBe('failed');
  });

  it('a later response omitting a field clears stale runtime verified (no inheritance)', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    // First response: sandbox echoed → runtime verified.
    mockClient.getThreadEffectiveSettings.mockReturnValueOnce({ sandbox: { type: 'workspaceWrite' } });
    await drain(adapter, 'codex-local-5');
    expect(adapter.getThreadEffectiveEvidence('codex-local-5').sandbox.runtime).toBe('verified');
    // Second response (resume): sandbox absent → runtime must NOT inherit verified.
    mockClient.getThreadEffectiveSettings.mockReturnValueOnce({});
    await drain(adapter, 'codex-local-5');
    expect(adapter.getThreadEffectiveEvidence('codex-local-5').sandbox.runtime).toBe('unavailable');
  });

  it('concurrent sessions are isolated (no global-singleton bleed)', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockImplementation((threadId: string) =>
      threadId === 'thread-A' ? { model: 'gpt-5', approvalPolicy: 'never' } : { model: 'claude-ish', sandbox: { type: 'readOnly' } });
    mockStartThread.mockImplementationOnce(async () => ({ id: 'thread-A' }));
    mockStartThread.mockImplementationOnce(async () => ({ id: 'thread-B' }));
    await drain(adapter, 'codex-local-A');
    await drain(adapter, 'codex-local-B');
    const evA = adapter.getThreadEffectiveEvidence('codex-local-A');
    const evB = adapter.getThreadEffectiveEvidence('codex-local-B');
    expect(evA.approvalPolicy.runtime).toBe('verified');
    expect(evA.sandbox.runtime).toBe('unavailable');
    expect(evB.sandbox.runtime).toBe('verified');
    expect(evB.approvalPolicy.runtime).toBe('unavailable');
  });

  it('pending is observable while a start is in flight, then resolves', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5' });
    let resolveStart!: (v: { id: string }) => void;
    mockStartThread.mockReturnValueOnce(new Promise((r) => { resolveStart = r as typeof resolveStart; }));
    const stream = adapter.sendMessage({ sessionId: 'codex-local-pending', content: 'go' });
    const iteration = stream.next();
    await new Promise((r) => setTimeout(r, 5));
    // While in flight both axes are pending.
    expect(adapter.getThreadEffectiveEvidence('codex-local-pending').model.application).toBe('pending');
    expect(adapter.getThreadEffectiveEvidence('codex-local-pending').model.runtime).toBe('pending');
    resolveStart({ id: 'thread-1' });
    await iteration;
    for await (const _ of stream) { void _; }
    // After: application verified (wired), runtime verified (echoed).
    const ev = adapter.getThreadEffectiveEvidence('codex-local-pending');
    expect(ev.model.application).toBe('verified');
    expect(ev.model.runtime).toBe('verified');
  });

  it('getLatestThreadEffectiveEvidence returns evidence + server values for the latest session', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5', approvalPolicy: 'never' });
    await drain(adapter, 'codex-latest-1');
    const latest = adapter.getLatestThreadEffectiveEvidence();
    expect(latest?.sessionId).toBe('codex-latest-1');
    expect(latest?.evidence.model.runtime).toBe('verified');
    expect(latest?.settings?.model).toBe('gpt-5');
    expect(latest?.settings?.approvalPolicy).toBe('never');
  });
});

describe('CodexAdapter evidence — thrown rejection + deleteSession cleanup', () => {
  beforeEach(() => resetMocks());

  it('a thrown startThread rejection flips pending → failed (never stuck pending)', async () => {
    mockStartThread.mockRejectedValueOnce(new Error('transport boom'));
    const adapter = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue(createMockCodex()) });
    await adapter.start();
    // Provisional id → startThread path; the stream surfaces an error chunk.
    await drain(adapter, 'codex-local-throw').catch(() => undefined);
    const ev = adapter.getThreadEffectiveEvidence('codex-local-throw');
    // sandbox is always wired by the adapter → failed; never-wired fields are NA.
    expect(ev.sandbox.application).toBe('failed');
    expect(ev.sandbox.runtime).toBe('failed');
    expect(ev.modelProvider.application).toBe('not-applicable');
  });

  it('deleteSession clears that session\'s evidence and the latest pointer', async () => {
    const adapter = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue(createMockCodex()) });
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5' });
    await drain(adapter, 'codex-del-1');
    expect(adapter.getLatestThreadEffectiveEvidence()?.sessionId).toBe('codex-del-1');
    await adapter.deleteSession('codex-del-1');
    expect(adapter.getLatestThreadEffectiveEvidence()).toBeNull();
    expect(adapter.getThreadEffectiveEvidence('codex-del-1').sandbox.application).toBe('unavailable');
  });
});

describe('CodexAdapter evidence — phase-aware application + delete-by-alias (item B)', () => {
  beforeEach(() => resetMocks());

  it('effort is turn-only: pending at thread phase → verified after turn success', async () => {
    const adapter = wiredAdapter(); // has modelReasoningEffort:'high'
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ reasoningEffort: 'high' });
    // Use a deferred start to observe the thread-phase evidence (before turn/completed).
    let resolveStart!: (v: { id: string }) => void;
    mockStartThread.mockReturnValueOnce(new Promise((r) => { resolveStart = r as typeof resolveStart; }));
    const stream = adapter.sendMessage({ sessionId: 'codex-local-effort', content: 'go' });
    const iter = stream.next();
    await new Promise((r) => setTimeout(r, 5));
    // Thread in flight: effort application should be pending (turn not started yet).
    expect(adapter.getThreadEffectiveEvidence('codex-local-effort').reasoningEffort.application).toBe('pending');
    resolveStart({ id: 'thread-effort' });
    await iter;
    for await (const _ of stream) { void _; }
    // After turn success: effort crosses the turn boundary → application verified.
    expect(adapter.getThreadEffectiveEvidence('codex-local-effort').reasoningEffort.application).toBe('verified');
  });

  it('never-wired fields (modelProvider, activePermissionProfile) are application not-applicable after success', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5', modelProvider: 'openai', activePermissionProfile: { id: 'p' } });
    await drain(adapter, 'codex-local-nw');
    const ev = adapter.getThreadEffectiveEvidence('codex-local-nw');
    // Plugin never wires modelProvider/activePermissionProfile → application not-applicable
    // EVEN THOUGH the server echoed them (runtime verified).
    expect(ev.modelProvider.application).toBe('not-applicable');
    expect(ev.modelProvider.runtime).toBe('verified');
    expect(ev.activePermissionProfile.application).toBe('not-applicable');
    expect(ev.activePermissionProfile.runtime).toBe('verified');
  });

  it('turn/completed with error → failed + settings cleared', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5' });
    // Make the turn complete with an error.
    mockStartTurn.mockImplementationOnce(async () => {
      setTimeout(() => {
        notificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', error: { type: 'turn_failed', message: 'turn boom' } } } });
      }, 0);
      return { id: 'turn-1' };
    });
    await drain(adapter, 'codex-local-terr');
    const ev = adapter.getThreadEffectiveEvidence('codex-local-terr');
    expect(ev.model.application).toBe('failed');
    expect(ev.model.runtime).toBe('failed');
    // Settings cleared.
    expect(adapter.getLatestThreadEffectiveEvidence()?.settings).toBeNull();
  });

  it('deleteSession by real thread id/alias cleans evidence + latest', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5' });
    // Force a known thread id.
    mockStartThread.mockImplementationOnce(async () => ({ id: 'thread-alias-x' }));
    await drain(adapter, 'codex-local-alias');
    expect(adapter.getLatestThreadEffectiveEvidence()?.sessionId).toBe('codex-local-alias');
    // Delete by the real thread id (not the provisional id).
    await adapter.deleteSession('thread-alias-x');
    expect(adapter.getLatestThreadEffectiveEvidence()).toBeNull();
    expect(adapter.getThreadEffectiveEvidence('codex-local-alias').model.application).toBe('unavailable');
  });
});

describe('CodexAdapter evidence — stale-value clear + client-cache eviction (item B/C round 6)', () => {
  beforeEach(() => resetMocks());

  it('resume returning null clears stale settings (failed evidence + null values)', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    // First attempt: verified with model value.
    mockClient.getThreadEffectiveSettings.mockReturnValueOnce({ model: 'gpt-5' });
    await drain(adapter, 'codex-local-stale');
    expect(adapter.getLatestThreadEffectiveEvidence()?.settings?.model).toBe('gpt-5');
    // Second attempt (resume): returns null → failed + settings null.
    mockClient.getThreadEffectiveSettings.mockReturnValueOnce(null);
    mockResumeThread.mockResolvedValueOnce(null); // second drain is a resume → null → failed
    await drain(adapter, 'codex-local-stale');
    const ev = adapter.getThreadEffectiveEvidence('codex-local-stale');
    expect(ev.sandbox.application).toBe('failed');
    expect(adapter.getLatestThreadEffectiveEvidence()?.settings).toBeNull();
  });

  it('deleteSession by alias evicts client threadEffectiveSettings cache + context snapshot', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5' });
    mockStartThread.mockImplementationOnce(async () => ({ id: 'thread-evict' }));
    await drain(adapter, 'codex-local-evict');
    // Client cache has the entry.
    expect(mockClient.getThreadEffectiveSettings('thread-evict')).toEqual({ model: 'gpt-5' });
    await adapter.deleteSession('thread-evict');
    // Adapter called the client eviction API with the thread id.
    expect(mockClient.clearThreadEffectiveSettings).toHaveBeenCalledWith('thread-evict');
    // Adapter latest cleared.
    expect(adapter.getLatestThreadEffectiveEvidence()).toBeNull();
  });
});

describe('CodexAdapter — immutable attempt snapshot (item 1 round 7)', () => {
  beforeEach(() => resetMocks());

  it('mid-flight option mutation does NOT affect the current attempt (snapshot isolation)', async () => {
    // Start with model-A, approval=never, effort=high.
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5', approvalPolicy: 'never', reasoningEffort: 'high' });
    // Defer startThread so we can mutate options while the attempt is in flight.
    let resolveStart!: (v: { id: string }) => void;
    mockStartThread.mockReturnValueOnce(new Promise((r) => { resolveStart = r as typeof resolveStart; }));
    const stream = adapter.sendMessage({ sessionId: 'codex-local-snap', content: 'go' });
    const iter = stream.next();
    await new Promise((r) => setTimeout(r, 5));
    // Mid-flight: mutate to model-B, approval=inherit, effort=undefined.
    adapter.updateModel('model-B');
    adapter.updateApprovalPolicy('inherit');
    adapter.updateModelReasoningEffort(undefined);
    // Resolve the deferred — the attempt MUST use the snapshot (A/never/high).
    resolveStart({ id: 'thread-snap' });
    await iter;
    for await (const _ of stream) { void _; }

    // startThread received model-A + approvalPolicy=never (from the snapshot, not mutated options).
    const threadOpts = mockStartThread.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(threadOpts?.model).toBe('gpt-5');
    expect(threadOpts?.approvalPolicy).toBe('never');
    // startTurn received model-A + approvalPolicy=never + effort=high (from the same snapshot).
    const turnOpts = mockStartTurn.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(turnOpts?.model).toBe('gpt-5');
    expect(turnOpts?.approvalPolicy).toBe('never');
    expect(turnOpts?.effort).toBe('high');
    // Evidence reflects the snapshot (not the mutated options).
    const ev = adapter.getThreadEffectiveEvidence('codex-local-snap');
    expect(ev.model.application).toBe('verified');
    expect(ev.approvalPolicy.application).toBe('verified');
    expect(ev.reasoningEffort.application).toBe('verified');
  });

  it('next attempt captures mutated options (B/inherit/undefined)', async () => {
    const adapter = wiredAdapter();
    // Mutate BEFORE the attempt.
    adapter.updateModel('model-B');
    adapter.updateApprovalPolicy('inherit');
    adapter.updateModelReasoningEffort(undefined);
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue(null);
    await drain(adapter, 'codex-local-snap2');
    // Thread options: model-B, no approvalPolicy (inherit), no config for effort.
    const threadOpts = mockStartThread.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(threadOpts?.model).toBe('model-B');
    expect(threadOpts?.approvalPolicy).toBeUndefined();
    // Turn options: no approvalPolicy, no effort.
    const turnOpts = mockStartTurn.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(turnOpts?.approvalPolicy).toBeUndefined();
    expect(turnOpts?.effort).toBeUndefined();
    // Evidence: approval=inherit → not-applicable; effort=undefined → not-applicable.
    const ev = adapter.getThreadEffectiveEvidence('codex-local-snap2');
    expect(ev.approvalPolicy.application).toBe('not-applicable');
    expect(ev.reasoningEffort.application).toBe('not-applicable');
  });
});

describe('CodexAdapter — in-flight cancellation via epoch (item A round 8)', () => {
  beforeEach(() => resetMocks());

  it('deleteSession while deferred start in flight → no startTurn, no evidence revival', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5' });
    let resolveStart!: (v: { id: string }) => void;
    mockStartThread.mockReturnValueOnce(new Promise((r) => { resolveStart = r as typeof resolveStart; }));
    const stream = adapter.sendMessage({ sessionId: 'codex-local-cancel', content: 'go' });
    const iter = stream.next();
    await new Promise((r) => setTimeout(r, 5));
    // While the thread start is deferred, delete the session.
    await adapter.deleteSession('codex-local-cancel');
    // Resolve the deferred — the epoch is now stale; the attempt must abort.
    resolveStart({ id: 'thread-cancel' });
    await iter;
    for await (const _ of stream) { void _; }
    // startTurn must NOT have been called (the attempt was cancelled).
    expect(mockStartTurn).not.toHaveBeenCalled();
    // Evidence must NOT be revived (latest is null).
    expect(adapter.getLatestThreadEffectiveEvidence()).toBeNull();
    // Concurrent session is unaffected.
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5' });
    await drain(adapter, 'codex-local-other');
    expect(adapter.getLatestThreadEffectiveEvidence()?.sessionId).toBe('codex-local-other');
  });

  it('deleteSession fences a deferred start rejection so failed evidence cannot revive', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    let rejectStart!: (reason: Error) => void;
    mockStartThread.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectStart = reject; }));
    const stream = adapter.sendMessage({ sessionId: 'codex-local-reject-delete', content: 'go' });
    const iteration = stream.next();
    await new Promise((resolve) => setTimeout(resolve, 5));

    await adapter.deleteSession('codex-local-reject-delete');
    rejectStart(new Error('late transport failure'));
    await iteration;
    for await (const _ of stream) { void _; }

    expect(adapter.getLatestThreadEffectiveEvidence()).toBeNull();
    expect(adapter.getThreadEffectiveEvidence('codex-local-reject-delete').sandbox.application).toBe('unavailable');
    expect(mockStartTurn).not.toHaveBeenCalled();
  });

  it('stop/restart with the same session id cannot ABA-match an older deferred attempt', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    let rejectOldStart!: (reason: Error) => void;
    mockStartThread.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOldStart = reject; }));
    const oldStream = adapter.sendMessage({ sessionId: 'codex-local-aba', content: 'old' });
    const oldIteration = oldStream.next();
    await new Promise((resolve) => setTimeout(resolve, 5));

    await adapter.stop();
    await adapter.start();
    mockClient.getThreadEffectiveSettings.mockReturnValue({ model: 'gpt-5' });
    await drain(adapter, 'codex-local-aba');
    expect(adapter.getThreadEffectiveEvidence('codex-local-aba').model.runtime).toBe('verified');

    rejectOldStart(new Error('old attempt failed late'));
    await oldIteration;
    for await (const _ of oldStream) { void _; }

    expect(adapter.getThreadEffectiveEvidence('codex-local-aba').model.runtime).toBe('verified');
    expect(adapter.getLatestThreadEffectiveEvidence()?.sessionId).toBe('codex-local-aba');
  });

  it('delete by real-thread alias evicts a real context snapshot and ignores late notifications', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockStartThread.mockResolvedValueOnce({ id: 'thread-context-delete' });
    mockStartTurn.mockResolvedValueOnce({ id: 'turn-context-delete' });
    const stream = adapter.sendMessage({ sessionId: 'codex-local-context-delete', content: 'go' });
    await stream.next();
    notificationHandler?.({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thread-context-delete',
        turnId: 'turn-context-delete',
        tokenUsage: { total: { totalTokens: 42 }, modelContextWindow: 1000 },
      },
    });
    expect(await adapter.getContextUsageSnapshot('thread-context-delete')).toEqual(
      expect.objectContaining({ totalTokens: 42 }),
    );

    await adapter.deleteSession('thread-context-delete');
    expect(await adapter.getContextUsageSnapshot('thread-context-delete')).toBeNull();
    notificationHandler?.({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thread-context-delete',
        turnId: 'turn-context-delete',
        tokenUsage: { total: { totalTokens: 99 }, modelContextWindow: 1000 },
      },
    });
    notificationHandler?.({
      method: 'turn/completed',
      params: { threadId: 'thread-context-delete', turn: { id: 'turn-context-delete', error: null } },
    });

    expect(await adapter.getContextUsageSnapshot('thread-context-delete')).toBeNull();
    expect(adapter.getLatestThreadEffectiveEvidence()).toBeNull();
    await stream.return(undefined);
  });

  it('deleteSession while startTurn is deferred interrupts the late turn and emits no stream state', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockStartThread.mockResolvedValueOnce({ id: 'thread-turn-delete' });
    let resolveTurn!: (turn: { id: string }) => void;
    mockStartTurn.mockReturnValueOnce(new Promise((resolve) => { resolveTurn = resolve; }));
    const stream = adapter.sendMessage({ sessionId: 'codex-local-turn-delete', content: 'go' });
    const iteration = stream.next();
    await new Promise((resolve) => setTimeout(resolve, 5));

    await adapter.deleteSession('codex-local-turn-delete');
    resolveTurn({ id: 'turn-after-delete' });
    const result = await iteration;

    expect(result.done).toBe(true);
    expect(mockClient.interruptTurn).toHaveBeenCalledWith('thread-turn-delete', 'turn-after-delete');
    expect(adapter.getLatestThreadEffectiveEvidence()).toBeNull();
  });

  it('deleteSession aborts an active turn and fences every later stream chunk/notification', async () => {
    const adapter = wiredAdapter();
    await adapter.start();
    mockStartThread.mockResolvedValueOnce({ id: 'thread-active-delete' });
    mockStartTurn.mockResolvedValueOnce({ id: 'turn-active-delete' });
    const stream = adapter.sendMessage({ sessionId: 'codex-local-active-delete', content: 'go' });
    expect(await stream.next()).toEqual({ done: false, value: { type: 'message_start' } });

    await adapter.deleteSession('thread-active-delete');
    notificationHandler?.({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thread-active-delete',
        turnId: 'turn-active-delete',
        tokenUsage: { total: { totalTokens: 77 }, modelContextWindow: 1000 },
      },
    });
    notificationHandler?.({
      method: 'turn/completed',
      params: { threadId: 'thread-active-delete', turn: { id: 'turn-active-delete', error: null } },
    });

    const remaining: StreamChunk[] = [];
    for await (const chunk of stream) remaining.push(chunk);
    expect(remaining).toEqual([]);
    expect(mockClient.interruptTurn).toHaveBeenCalledWith('thread-active-delete', 'turn-active-delete');
    expect(await adapter.getContextUsageSnapshot('thread-active-delete')).toBeNull();
    expect(adapter.getLatestThreadEffectiveEvidence()).toBeNull();
  });
});
