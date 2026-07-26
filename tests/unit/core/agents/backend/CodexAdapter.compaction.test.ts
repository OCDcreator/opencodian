import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';

const mockStart = jest.fn<Promise<void>, []>();
const mockCompact = jest.fn();
let handlers = new Map<string, (event: { method: string; params: Record<string, unknown> }) => void>();
let synchronousSubscriptionEvent: { method: string; params: Record<string, unknown> } | null = null;

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockStart, stop: jest.fn(), startThread: jest.fn(), resumeThread: jest.fn(), startTurn: jest.fn(),
      subscribeToSkillsChanged: jest.fn(() => jest.fn()),
      subscribeToThreadNotifications: jest.fn((threadId: string, handler: (event: { method: string; params: Record<string, unknown> }) => void) => {
        if (synchronousSubscriptionEvent) handler(synchronousSubscriptionEvent);
        handlers.set(threadId, handler);
        return { dispose: jest.fn(() => handlers.delete(threadId)) };
      }),
      startThreadCompaction: mockCompact,
    })),
  };
});

function emit(threadId: string, method: string, params: Record<string, unknown>): void {
  handlers.get(threadId)?.({ method, params: { threadId, ...params } });
}

function adapter(): CodexAdapter {
  return new CodexAdapter({ createCodex: jest.fn().mockResolvedValue({}) });
}

function ownThread(subject: CodexAdapter, sessionId = 'codex-local-a', threadId = 'thread-a'): void {
  (subject as unknown as { sessions: Map<string, unknown>; threadAlias: Map<string, string> }).sessions.set(sessionId, { provisionalId: sessionId, threadId, thread: null });
  (subject as unknown as { threadAlias: Map<string, string> }).threadAlias.set(threadId, sessionId);
}

describe('CodexAdapter foreground compaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handlers = new Map();
    synchronousSubscriptionEvent = null;
    mockStart.mockResolvedValue(undefined);
    mockCompact.mockResolvedValue({ status: 'accepted', acknowledged: true });
  });

  it('keeps empty ACK pending until matching compaction completion and fresh authoritative usage, in either notification order', async () => {
    const subject = adapter();
    await subject.start();
    // Establish an app-server-owned, non-provisional session mapping.
    ownThread(subject);

    const first = subject.compactForegroundThread('codex-local-a', { timeoutMs: 1000 });
    expect(await new Promise((resolve) => setTimeout(resolve, 0))).toBeUndefined();
    expect(mockCompact).toHaveBeenCalledWith('thread-a', expect.anything());

    emit('thread-a', 'thread/tokenUsage/updated', { turnId: 'turn-a', tokenUsage: { total: { totalTokens: 12 }, last: {}, modelContextWindow: 100 } });
    emit('thread-a', 'item/started', { item: { id: 'compact-a', type: 'contextCompaction' } });
    emit('thread-a', 'item/completed', { item: { id: 'compact-a', type: 'contextCompaction' } });

    await expect(first).resolves.toMatchObject({ status: 'verified', acknowledged: true, runtimeVerified: true, threadId: 'thread-a' });
    await expect(subject.getContextUsageSnapshot('codex-local-a')).resolves.toMatchObject({ totalTokens: 12, contextWindow: 100 });
  });

  it('reads availability without side effects using the same no-client, ownership, active-turn, and pending gates', async () => {
    const noClient = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue({}), createAppServerClient: () => null });
    await noClient.start();
    expect(noClient.getForegroundCompactionAvailability('thread-a')).toEqual({ status: 'unavailable' });

    const subject = adapter();
    await subject.start();
    expect(subject.getForegroundCompactionAvailability('codex-local-missing')).toEqual({ status: 'invalid-thread' });
    ownThread(subject);
    expect(subject.getForegroundCompactionAvailability('codex-local-a')).toEqual({ status: 'available', threadId: 'thread-a' });

    (subject as unknown as { activeAppServerTurns: Map<string, unknown> }).activeAppServerTurns.set('codex-local-a', { threadId: 'thread-a', turnId: 'turn-active' });
    expect(subject.getForegroundCompactionAvailability('codex-local-a')).toEqual({ status: 'busy', threadId: 'thread-a' });
    (subject as unknown as { activeAppServerTurns: Map<string, unknown> }).activeAppServerTurns.clear();

    const pending = subject.compactForegroundThread('codex-local-a', { timeoutMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(subject.getForegroundCompactionAvailability('codex-local-a')).toEqual({ status: 'busy', threadId: 'thread-a' });
    await subject.stop();
    await pending;
    expect(mockCompact).toHaveBeenCalledTimes(1);
  });

  it('does not reuse old snapshots, accepts no SDK fallback/provisional/non-owned IDs, fences other threads, and clears timeout for retry', async () => {
    const subject = adapter();
    await subject.start();
    ownThread(subject);

    await expect(subject.compactForegroundThread('codex-local-missing')).resolves.toMatchObject({ status: 'invalid-thread', acknowledged: false, runtimeVerified: false });
    const pending = subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 });
    await expect(subject.compactForegroundThread('codex-local-a')).resolves.toMatchObject({ status: 'busy', acknowledged: false, runtimeVerified: false });
    emit('thread-other', 'item/completed', { item: { id: 'compact-other', type: 'contextCompaction' } });
    await expect(pending).resolves.toMatchObject({ status: 'timed-out', acknowledged: true, runtimeVerified: false });
    await expect(subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 })).resolves.toMatchObject({ status: 'timed-out', acknowledged: true, runtimeVerified: false });
  });

  it('refuses an active foreground app-server turn before dispatching compaction', async () => {
    const subject = adapter();
    await subject.start();
    ownThread(subject);
    (subject as unknown as { activeAppServerTurns: Map<string, unknown> }).activeAppServerTurns.set('codex-local-a', { threadId: 'thread-a', turnId: 'turn-active' });

    await expect(subject.compactForegroundThread('codex-local-a')).resolves.toMatchObject({ status: 'busy', acknowledged: false, runtimeVerified: false });
    expect(mockCompact).not.toHaveBeenCalled();
  });

  it('ignores synchronous subscription events emitted before the compaction RPC is dispatched', async () => {
    synchronousSubscriptionEvent = {
      method: 'thread/tokenUsage/updated',
      params: { threadId: 'thread-a', turnId: 'old-turn', tokenUsage: { total: { totalTokens: 999 }, last: {}, modelContextWindow: 1000 } },
    };
    const subject = adapter();
    await subject.start();
    ownThread(subject);

    await expect(subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 })).resolves.toMatchObject({
      status: 'timed-out', acknowledged: true, tokenUsageObserved: false, runtimeVerified: false,
    });
    await expect(subject.getContextUsageSnapshot('codex-local-a')).resolves.toBeNull();
  });

  it('does not verify token-only or pre-ACK runtime events', async () => {
    const subject = adapter();
    await subject.start();
    ownThread(subject);

    const tokenOnly = subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    emit('thread-a', 'thread/tokenUsage/updated', { turnId: 'token-only', tokenUsage: { total: { totalTokens: 50 }, last: {}, modelContextWindow: 100 } });
    await expect(tokenOnly).resolves.toMatchObject({ status: 'timed-out', acknowledged: true, completed: false, tokenUsageObserved: true, runtimeVerified: false });

    mockCompact.mockImplementationOnce(() => new Promise(() => { /* ACK never arrives */ }));
    const beforeAck = subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    emit('thread-a', 'item/completed', { item: { id: 'before-ack', type: 'contextCompaction' } });
    emit('thread-a', 'thread/tokenUsage/updated', { turnId: 'before-ack', tokenUsage: { total: { totalTokens: 51 }, last: {}, modelContextWindow: 100 } });
    await expect(beforeAck).resolves.toMatchObject({ status: 'timed-out', acknowledged: false, completed: false, tokenUsageObserved: true, runtimeVerified: false });
  });

  it('cleans pending compaction on stop and deletion, fencing late notifications', async () => {
    const stopping = adapter();
    await stopping.start();
    ownThread(stopping);
    const stoppingPending = stopping.compactForegroundThread('codex-local-a', { timeoutMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await stopping.stop();
    await expect(stoppingPending).resolves.toMatchObject({ status: 'unavailable', acknowledged: true, runtimeVerified: false });
    emit('thread-a', 'item/completed', { item: { id: 'late-stop', type: 'contextCompaction' } });

    const deleting = adapter();
    await deleting.start();
    ownThread(deleting);
    const deletingPending = deleting.compactForegroundThread('codex-local-a', { timeoutMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await deleting.deleteSession('codex-local-a');
    await expect(deletingPending).resolves.toMatchObject({ status: 'invalid-thread', acknowledged: true, runtimeVerified: false });
    emit('thread-a', 'thread/tokenUsage/updated', { turnId: 'late-delete', tokenUsage: { total: { totalTokens: 52 }, last: {}, modelContextWindow: 100 } });
    await expect(deleting.getContextUsageSnapshot('codex-local-a')).resolves.toBeNull();
  });

  it('requires a matching started/completed item pair before token usage can verify compaction', async () => {
    const subject = adapter();
    await subject.start();
    ownThread(subject);

    const completionWithoutStart = subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    emit('thread-a', 'item/completed', { item: { id: 'compact-unpaired', type: 'contextCompaction' } });
    emit('thread-a', 'thread/tokenUsage/updated', { turnId: 'turn-unpaired', tokenUsage: { total: { totalTokens: 23 }, last: {}, modelContextWindow: 200 } });
    await expect(completionWithoutStart).resolves.toMatchObject({ status: 'timed-out', completed: false, started: false, tokenUsageObserved: true, runtimeVerified: false });

    const mismatchedPair = subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    emit('thread-a', 'item/started', { item: { id: 'compact-started', type: 'contextCompaction' } });
    emit('thread-a', 'item/completed', { item: { id: 'compact-other', type: 'contextCompaction' } });
    emit('thread-a', 'thread/tokenUsage/updated', { turnId: 'turn-mismatch', tokenUsage: { total: { totalTokens: 24 }, last: {}, modelContextWindow: 200 } });
    await expect(mismatchedPair).resolves.toMatchObject({ status: 'timed-out', completed: false, started: true, tokenUsageObserved: true, runtimeVerified: false });

    const pairedReverseOrder = subject.compactForegroundThread('codex-local-a', { timeoutMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    emit('thread-a', 'item/started', { item: { id: 'compact-paired', type: 'contextCompaction' } });
    emit('thread-a', 'item/completed', { item: { id: 'compact-paired', type: 'contextCompaction' } });
    emit('thread-a', 'thread/tokenUsage/updated', { turnId: 'turn-paired', tokenUsage: { total: { totalTokens: 25 }, last: {}, modelContextWindow: 200 } });
    await expect(pairedReverseOrder).resolves.toMatchObject({ status: 'verified', completed: true, started: true, tokenUsageObserved: true, runtimeVerified: true });

    const ackOnly = subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 });
    await expect(ackOnly).resolves.toMatchObject({ status: 'timed-out', acknowledged: true, completed: false, tokenUsageObserved: false, runtimeVerified: false });

    const completedOnly = subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    emit('thread-a', 'item/completed', { item: { id: 'compact-only', type: 'contextCompaction' } });
    await expect(completedOnly).resolves.toMatchObject({ status: 'timed-out', acknowledged: true, completed: false, tokenUsageObserved: false, runtimeVerified: false });
  });

  it('rejects SDK/no-client use, returns explicit route failure, and ignores late events after timeout cleanup', async () => {
    const noClient = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue({}), createAppServerClient: () => null });
    await noClient.start();
    await expect(noClient.compactForegroundThread('thread-a')).resolves.toMatchObject({ status: 'unavailable', acknowledged: false, runtimeVerified: false });

    const subject = adapter();
    await subject.start();
    ownThread(subject);
    mockCompact.mockResolvedValueOnce({ status: 'failed', acknowledged: false, errorReason: 'route rejected' });
    await expect(subject.compactForegroundThread('codex-local-a')).resolves.toMatchObject({ status: 'failed', acknowledged: false, runtimeVerified: false, errorReason: 'route rejected' });

    const timedOut = subject.compactForegroundThread('codex-local-a', { timeoutMs: 10 });
    await expect(timedOut).resolves.toMatchObject({ status: 'timed-out', acknowledged: true });
    emit('thread-a', 'item/completed', { item: { id: 'late', type: 'contextCompaction' } });
    emit('thread-a', 'thread/tokenUsage/updated', { turnId: 'late', tokenUsage: { total: { totalTokens: 99 }, last: {}, modelContextWindow: 100 } });
    await expect(subject.getContextUsageSnapshot('codex-local-a')).resolves.toBeNull();
  });
});
