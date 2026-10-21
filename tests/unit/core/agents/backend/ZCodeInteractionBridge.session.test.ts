import { ZCodeInteractionBridge } from '../../../../../src/core/agents/backend/zcode/ZCodeInteractionBridge';

const ask = (requestId: string, sessionId: string, toolName = 'Write') => ({
  requestId,
  sessionId,
  toolCallId: `call_${requestId}`,
  turnId: `turn_${requestId}`,
  toolName,
  input: { file_path: 'acceptance.txt' },
  options: [{ kind: 'allow_once', response: { decision: 'allow' } }],
});

it('keeps a session approval scoped to the original native session and tool', async () => {
  const bridge = new ZCodeInteractionBridge();
  const emitted: string[] = [];
  const emit = (sessionId: string) => { emitted.push(sessionId); };
  const first = bridge.registerAskForAdapter('permission', ask('one', 'session-a'), emit);
  bridge.respondToPermission('one', 'session');
  await expect(first).resolves.toEqual({ decision: 'allow', reason: 'Approved for this session' });

  await expect(bridge.registerAskForAdapter('permission', ask('two', 'session-a'), emit))
    .resolves.toEqual({ decision: 'allow', reason: 'Approved for this session' });
  expect(emitted).toEqual(['session-a']);

  const otherSession = bridge.registerAskForAdapter('permission', ask('three', 'session-b'), emit);
  const otherTool = bridge.registerAskForAdapter('permission', ask('four', 'session-a', 'Bash'), emit);
  expect(emitted).toEqual(['session-a', 'session-b', 'session-a']);
  bridge.settlePendingForTeardown();
  await expect(otherSession).resolves.toMatchObject({ decision: 'deny' });
  await expect(otherTool).resolves.toMatchObject({ decision: 'deny' });
});

it('times out a pure permission request as deny and rejects a late approval', async () => {
  jest.useFakeTimers();
  try {
    const bridge = new ZCodeInteractionBridge();
    const emit = jest.fn();
    const first = bridge.registerAskForAdapter('permission', ask('timeout-a', 'session-a'), emit);
    jest.advanceTimersByTime(30_000);
    const other = bridge.registerAskForAdapter('permission', ask('still-b', 'session-b'), emit);
    expect(bridge.getPending('permission')).toHaveLength(2);

    jest.advanceTimersByTime(30_000);
    await expect(first).resolves.toMatchObject({ decision: 'deny', reason: 'Permission request timed out.' });
    expect(() => bridge.respondToPermission('timeout-a', 'once')).toThrow('not pending');
    await expect(bridge.registerAskForAdapter('permission', ask('timeout-a', 'session-a'), emit))
      .resolves.toMatchObject({ decision: 'deny' });
    expect(bridge.getPending('permission').map((entry) => entry.id)).toEqual(['still-b']);
    bridge.settlePendingForTeardown();
    await expect(other).resolves.toMatchObject({ decision: 'deny' });
  } finally {
    jest.useRealTimers();
  }
});

// MATRIX012: fake-clock/session controls use only the production bridge.
const matrix012BridgeFixture = () => {
  const bridge = new ZCodeInteractionBridge();
  const counts = { nativeSpawnAttempts: 0, configWrites: 0, realFsReads: 0, modelAdmissions: 0, toolAdmissions: 0, httpAdmissions: 0, pendingSettles: 0 };
  const cp = jest.requireActual<typeof import('node:child_process')>('node:child_process');
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs');
  for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) jest.spyOn(cp, method).mockImplementation(() => { counts.nativeSpawnAttempts++; throw new Error('FAKE_MATRIX012_native_forbidden'); });
  for (const method of ['readFileSync', 'existsSync', 'readdirSync', 'statSync'] as const) jest.spyOn(fs, method).mockImplementation(() => { counts.realFsReads++; throw new Error('FAKE_MATRIX012_real_fs_forbidden'); });
  for (const method of ['writeFileSync', 'mkdirSync'] as const) jest.spyOn(fs, method).mockImplementation(() => { counts.configWrites++; throw new Error('FAKE_MATRIX012_config_write_forbidden'); });
  const cards: unknown[] = [], inputs: unknown[] = [], states: { status: string; body: unknown; error: string | null }[] = [], settles: unknown[] = [], snapshots: unknown[] = [], captured: Promise<void>[] = [];
  const watched = new WeakSet<object>();
  const invoke = (kind: 'permission' | 'user-input', input: Record<string, unknown>) => {
    inputs.push({ kind, input: JSON.parse(JSON.stringify(input)) as unknown }); const state = { status: 'pending', body: null as unknown, error: null as string | null }; states.push(state);
    const reply = bridge.registerAskForAdapter(kind, input, (sessionId, chunk) => { cards.push({ sessionId, chunk }); });
    captured.push(reply.then(body => { state.status = 'resolved'; state.body = body; }, error => { state.status = 'rejected'; state.error = String(error); }));
    const pending = (bridge as unknown as { pending: Map<string, { settled: boolean; settle: (body: unknown) => void }> }).pending;
    for (const entry of pending.values()) if (!watched.has(entry)) { watched.add(entry); const settle = entry.settle; entry.settle = body => { if (!entry.settled) { counts.pendingSettles++; settles.push(body); } settle(body); }; }
    return state;
  };
  const checkpoint = (label: string) => { snapshots.push({ label, cards: JSON.parse(JSON.stringify(cards)) as unknown, questions: bridge.getPending('user-input'), permissions: bridge.getPending('permission'), states: JSON.parse(JSON.stringify(states)) as unknown, counts: { ...counts } }); };
  const cleanup = async () => { checkpoint('before-owned-teardown'); bridge.settlePendingForTeardown('FAKE_MATRIX012_A'); bridge.settlePendingForTeardown('FAKE_MATRIX012_B'); await Promise.all(captured); checkpoint('after-owned-teardown'); console.warn('MATRIX012_ACTUAL ' + JSON.stringify({ fullName: expect.getState().currentTestName, inputs, cards, states, settles, snapshots, counts, nativeObserved: null, providerObserved: null })); jest.restoreAllMocks(); jest.useRealTimers(); };
  return { bridge, counts, cards, invoke, checkpoint, cleanup };
};

describe('MATRIX012 bridge controls', () => {
  it('MATRIX012 zero-admission smoke bridge', async () => {
    const f = matrix012BridgeFixture(); try { f.checkpoint('smoke'); expect(f.bridge.getPending('permission')).toEqual([]); expect(f.cards).toEqual([]); expect(f.counts).toEqual({ nativeSpawnAttempts: 0, configWrites: 0, realFsReads: 0, modelAdmissions: 0, toolAdmissions: 0, httpAdmissions: 0, pendingSettles: 0 }); } finally { await f.cleanup(); }
  }, 2000);
  it.each(['once', 'always'] as const)('MATRIX012 ZC012-05-timeout-late-%s denies exactly and never writes updates', async late => {
    jest.useFakeTimers({ now: 0 }); const f = matrix012BridgeFixture(); try {
      const input = ask(`FAKE_MATRIX012_timeout_${late}`, 'FAKE_MATRIX012_A', 'FAKE_MATRIX012_marker'), state = f.invoke('permission', input); f.checkpoint('pending-before-clock'); jest.advanceTimersByTime(59999); expect(state.status).toBe('pending'); jest.advanceTimersByTime(1); await Promise.resolve();
      expect(() => f.bridge.respondToPermission(input.requestId, late)).toThrow('not pending'); const duplicate = f.invoke('permission', input); await Promise.resolve(); f.checkpoint('timeout-late-duplicate');
      expect(state.body).toEqual({ decision: 'deny', reason: 'Permission request timed out.' }); expect(duplicate.body).toEqual({ decision: 'deny', reason: 'Permission request timed out.' }); expect(state.body).not.toHaveProperty('permissionUpdates'); expect(f.cards).toHaveLength(1); expect(f.bridge.getPending('permission')).toEqual([]); expect(f.counts.pendingSettles).toBe(1); expect(f.counts.configWrites).toBe(0); expect(f.counts.nativeSpawnAttempts).toBe(0); expect(f.counts.modelAdmissions).toBe(0); expect(f.counts.toolAdmissions).toBe(0);
    } finally { await f.cleanup(); }
  }, 2000);
  it('MATRIX012 ZC012-08 teardown releases only A pending asks and approval tracker', async () => {
    jest.useFakeTimers({ now: 0 }); const f = matrix012BridgeFixture(); try {
      for (const session of ['FAKE_MATRIX012_A', 'FAKE_MATRIX012_B']) { const input = ask(`FAKE_MATRIX012_tracker_${session}`, session, 'FAKE_MATRIX012_tracker'); f.invoke('permission', input); f.bridge.respondToPermission(input.requestId, 'session'); }
      await Promise.resolve(); f.checkpoint('tracker-baseline');
      const permissionA = f.invoke('permission', ask('FAKE_MATRIX012_perm_A', 'FAKE_MATRIX012_A', 'FAKE_MATRIX012_marker')), permissionB = f.invoke('permission', ask('FAKE_MATRIX012_perm_B', 'FAKE_MATRIX012_B', 'FAKE_MATRIX012_marker'));
      const questionA = f.invoke('user-input', { requestId: 'FAKE_MATRIX012_q_A', sessionId: 'FAKE_MATRIX012_A', questions: [{ question: 'FAKE_MATRIX012_qA', options: [{ label: 'alpha' }] }] }), questionB = f.invoke('user-input', { requestId: 'FAKE_MATRIX012_q_B', sessionId: 'FAKE_MATRIX012_B', questions: [{ question: 'FAKE_MATRIX012_qB', options: [{ label: 'beta' }] }] }); f.checkpoint('both-pending');
      f.bridge.settlePendingForTeardown('FAKE_MATRIX012_A'); await Promise.resolve(); f.checkpoint('only-A-stopped');
      expect(permissionA.body).toEqual({ decision: 'deny', reason: 'Session stopped before the request was answered.' }); expect(questionA.body).toEqual({ action: 'cancel', reason: 'Session stopped before the question was answered.' }); expect(permissionB.status).toBe('pending'); expect(questionB.status).toBe('pending');
      expect(f.bridge.getPending('permission').map(p => p.id)).toEqual(['FAKE_MATRIX012_perm_B']); expect(f.bridge.getPending('user-input').map(p => p.id)).toEqual(['FAKE_MATRIX012_q_B']); expect(f.bridge.isSessionApproved('FAKE_MATRIX012_A', 'FAKE_MATRIX012_tracker', [])).toBe(false); expect(f.bridge.isSessionApproved('FAKE_MATRIX012_B', 'FAKE_MATRIX012_tracker', [])).toBe(true);
      expect(() => f.bridge.respondToPermission('FAKE_MATRIX012_perm_A', 'always')).toThrow('not pending'); expect(() => f.bridge.replyToQuestion('FAKE_MATRIX012_q_A', [['alpha']])).toThrow('not pending'); f.bridge.respondToPermission('FAKE_MATRIX012_perm_B', 'once'); f.bridge.replyToQuestion('FAKE_MATRIX012_q_B', [['beta']]); await Promise.resolve();
      expect(permissionB.body).toEqual({ decision: 'allow', reason: 'Approved once' }); expect(questionB.body).toEqual({ action: 'accept', content: { answers: { FAKE_MATRIX012_qB: ['beta'] } } }); expect(f.counts.pendingSettles).toBe(6); expect(f.counts.configWrites).toBe(0); expect(f.counts.nativeSpawnAttempts).toBe(0); expect(f.counts.toolAdmissions).toBe(0);
    } finally { await f.cleanup(); }
  }, 2000);
});
