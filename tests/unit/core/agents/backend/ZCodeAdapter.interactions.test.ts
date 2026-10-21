/**
 * ZCodeAdapter.interactions.test.ts — the permission / question interaction
 * loop (ticket 04).
 *
 * Covers approval, rejection, question answers, stale input, duplicate
 * responses, and teardown — every fail-closed path must never accidentally
 * approve, and every native reply is exactly-once with the proven strict
 * reply shapes (JL for permissions, action/content for user input).
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { ZCodeAppServerTransport } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import type { ZCodeProviderConfigSnapshot } from '../../../../../src/core/agents/backend/zcode/ZCodeProviderConfigDiscovery';
import type { ZCodeRuntimeResolution } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';
import type { StreamChunk } from '../../../../../src/core/types/chat';

const providerConfig: ZCodeProviderConfigSnapshot = {
  dataRoot: '/home/tester/.zcode',
  configPath: '/home/tester/.zcode/v2/provider_config.json',
  builtinConfigPath: '/builtin/zcode-builtin.json',
  state: 'validated',
  providerCount: 7,
  detail: null,
  env: { ZCODE_STORAGE_DIR: '/home/tester/.zcode' },
};

const readyResolution: ZCodeRuntimeResolution = {
  mode: 'ready',
  launch: {
    command: '/runtime/zcode-agent',
    args: ['app-server', '--stdio'],
    entryKind: 'native-binary',
    entryPath: '/runtime/zcode-agent',
    source: 'app-bundled',
    extraEnv: {},
  },
};

const permissionAskParams = {
  input: { command: 'echo hello' },
  reason: 'Tool Bash requires approval',
  requestId: 'perm_1',
  riskLevel: 'medium',
  sessionId: 'sess_a',
  toolCallId: 'call_1',
  toolName: 'Bash',
  turnId: 'turn_1',
  options: [
    { optionId: 'once', kind: 'once', name: 'Allow once', response: { decision: 'allow', reason: 'Approved once' } },
    { optionId: 'always', kind: 'allow_always', name: 'Always allow', response: { decision: 'allow', reason: 'Always allowed' } },
  ],
};

const questionAskParams = {
  input: { questions: [{ question: 'Favorite color?', header: 'Color', options: [] }] },
  prompt: 'Tool AskUserQuestion requires user interaction',
  questions: [
    {
      question: 'Favorite color?',
      header: 'Color',
      multiSelect: false,
      options: [
        { label: 'red', value: 'red', description: 'Red' },
        { label: 'green', value: 'green', description: 'Green' },
      ],
    },
  ],
  requestId: 'perm_q1',
  schema: { toolName: 'AskUserQuestion' },
  sessionId: 'sess_a',
  toolCallId: 'call_q1',
  toolName: 'AskUserQuestion',
  turnId: 'turn_1',
};

describe('ZCodeAdapter — permission and question interaction loop', () => {
  let serverHandlers: Map<string, (params: Record<string, unknown>) => unknown>;
  let sessionEventHandler: ((params: Record<string, unknown>) => void) | null;
  let adapter: ZCodeAdapter;

  async function startAdapter(): Promise<void> {
    serverHandlers = new Map();
    sessionEventHandler = null;
    const fake = {
      start: jest.fn(async () => {}),
      request: jest.fn(async (method: string) => (method === 'runtime/capabilities' ? { independentPlanState: true } : {})),
      dispose: jest.fn(),
      onNotification: jest.fn((method: string, handler: (params: Record<string, unknown>) => void) => {
        if (method === 'session/event') sessionEventHandler = handler;
        return { dispose: jest.fn() };
      }),
      onServerRequest: jest.fn((method: string, handler: (params: Record<string, unknown>) => unknown) => {
        serverHandlers.set(method, handler);
        return { dispose: jest.fn() };
      }),
    };
    adapter = new ZCodeAdapter({
      resolveRuntime: () => readyResolution,
      discoverProviderConfig: () => providerConfig,
      createTransport: () => fake as unknown as ZCodeAppServerTransport,
    });
    await adapter.start();
  }

  function tick(): Promise<void> {
    return new Promise((resolve) => { setTimeout(resolve, 0); });
  }

  function finishTurn(): void {
    sessionEventHandler?.({ type: 'turn.completed', seq: 99, sessionId: 'sess_a', payload: { response: 'done', usage: {} } });
  }

  /** Open a stream; the caller ends the turn via finishTurn() so no teardown
   * side effects can race the assertions. */
  async function openStream(): Promise<{ chunks: StreamChunk[]; done: Promise<void> }> {
    const chunks: StreamChunk[] = [];
    const done = (async () => {
      for await (const chunk of adapter.sendMessage({ sessionId: 'sess_a', content: 'hi' })) {
        chunks.push(chunk);
      }
    })();
    await tick();
    return { chunks, done };
  }

  afterEach(async () => {
    finishTurn();
    await tick();
    adapter.dispose();
    jest.restoreAllMocks();
  });

  it('streams a permission ask with stable identities and approves exactly once', async () => {
    await startAdapter();
    const { chunks, done } = await openStream();
    const nativeReply = serverHandlers.get('interaction/requestPermission')?.(permissionAskParams);
    const retriedReply = serverHandlers.get('interaction/requestPermission')?.({ ...permissionAskParams });
    const changedReply = serverHandlers.get('interaction/requestPermission')?.({
      ...permissionAskParams,
      input: { command: 'different' },
    });
    await tick();

    const ask = chunks.find((chunk) => chunk.type === 'permission_request');
    expect(ask).toMatchObject({ type: 'permission_request', id: 'perm_1', sessionID: 'sess_a', permission: 'Bash' });
    expect(chunks.filter((chunk) => chunk.type === 'permission_request')).toHaveLength(1);
    expect(await adapter.getPendingPermissions()).toHaveLength(1);
    await expect(changedReply as Promise<unknown>).resolves.toMatchObject({ decision: 'deny' });

    await adapter.respondToPermission('perm_1', 'once');
    await expect(nativeReply as Promise<unknown>).resolves.toEqual({ decision: 'allow', reason: 'Approved once' });
    await expect(retriedReply as Promise<unknown>).resolves.toEqual({ decision: 'allow', reason: 'Approved once' });
    // Exactly once: the second response must fail and never re-reply.
    await expect(adapter.respondToPermission('perm_1', 'once')).rejects.toThrow('not pending');
    expect(await adapter.getPendingPermissions()).toHaveLength(0);
    finishTurn();
    await done;
  });

  it('rejects with a deny carrying the user reason', async () => {
    await startAdapter();
    const { done } = await openStream();
    const nativeReply = serverHandlers.get('interaction/requestPermission')?.(permissionAskParams);
    await tick();
    await adapter.respondToPermission('perm_1', 'reject', 'not today');
    await expect(nativeReply as Promise<unknown>).resolves.toMatchObject({ decision: 'deny', reason: 'not today' });
    finishTurn();
    await done;
  });

  it('maps always to the offered allow-always response and session to a plugin-side record (no native rule write)', async () => {
    await startAdapter();
    const first = await openStream();
    const firstReply = serverHandlers.get('interaction/requestPermission')?.(permissionAskParams);
    await tick();
    await adapter.respondToPermission('perm_1', 'always');
    await expect(firstReply as Promise<unknown>).resolves.toEqual({ decision: 'allow', reason: 'Always allowed' });
    finishTurn();
    await first.done;

    const second = await openStream();
    const secondReply = serverHandlers.get('interaction/requestPermission')?.(permissionAskParams);
    await tick();
    await adapter.respondToPermission('perm_1', 'session');
    const sessionReply = await (secondReply as Promise<unknown>);
    expect(sessionReply).toMatchObject({ decision: 'allow' });
    // Session approvals never write native configuration.
    expect(JSON.stringify(sessionReply)).not.toContain('permissionUpdates');
    finishTurn();
    await second.done;
  });

  it('routes question answers preserving option order and question keys', async () => {
    await startAdapter();
    const { chunks, done } = await openStream();
    const nativeReply = serverHandlers.get('interaction/requestUserInput')?.(questionAskParams);
    await tick();

    const ask = chunks.find((chunk) => chunk.type === 'question_request');
    expect(ask).toMatchObject({
      type: 'question_request',
      request: {
        id: 'perm_q1',
        sessionId: 'sess_a',
        questions: [{ question: 'Favorite color?', options: [{ label: 'red' }, { label: 'green' }] }],
      },
    });

    await adapter.replyToQuestion('perm_q1', [['green']]);
    await expect(nativeReply as Promise<unknown>).resolves.toEqual({
      action: 'accept',
      content: { answers: { 'Favorite color?': ['green'] } },
    });
    finishTurn();
    await done;
  });

  it('reuses one native answer for an identical repeated question ask', async () => {
    await startAdapter();
    const { done } = await openStream();
    const handler = serverHandlers.get('interaction/requestUserInput');
    const first = handler?.(questionAskParams) as Promise<unknown>;
    const concurrentRetry = handler?.(questionAskParams) as Promise<unknown>;
    await tick();
    expect(await adapter.getPendingQuestions()).toHaveLength(1);

    await adapter.replyToQuestion('perm_q1', [['green']]);
    const expected = { action: 'accept', content: { answers: { 'Favorite color?': ['green'] } } };
    await expect(first).resolves.toEqual(expected);
    await expect(concurrentRetry).resolves.toEqual(expected);
    await expect(handler?.(questionAskParams) as Promise<unknown>).resolves.toEqual(expected);
    await expect(handler?.({ ...questionAskParams, sessionId: 'sess_other' }) as Promise<unknown>)
      .resolves.toMatchObject({ action: 'decline' });
    expect(await adapter.getPendingQuestions()).toHaveLength(0);
    finishTurn();
    await done;
  });

  it('rejects questions through the native decline action', async () => {
    await startAdapter();
    const { done } = await openStream();
    const nativeReply = serverHandlers.get('interaction/requestUserInput')?.(questionAskParams);
    await tick();
    await adapter.rejectQuestion('perm_q1');
    await expect(nativeReply as Promise<unknown>).resolves.toEqual({ action: 'decline' });
    finishTurn();
    await done;
  });

  it('denies/declines unknown request shapes fail-closed with no pending state', async () => {
    await startAdapter();
    const { done } = await openStream();
    const permissionReply = await serverHandlers.get('interaction/requestPermission')?.({ junk: true }) as Record<string, unknown>;
    expect(permissionReply['decision']).toBe('deny');
    const questionReply = await serverHandlers.get('interaction/requestUserInput')?.({ junk: true }) as Record<string, unknown>;
    expect(questionReply['action']).toBe('decline');
    expect(await adapter.getPendingPermissions()).toHaveLength(0);
    expect(await adapter.getPendingQuestions()).toHaveLength(0);
    finishTurn();
    await done;
  });

  it('rejects stale and mismatched responses without reaching the native ask', async () => {
    await startAdapter();
    const { done } = await openStream();
    const nativeReply = serverHandlers.get('interaction/requestPermission')?.(permissionAskParams);
    await tick();
    await expect(adapter.respondToPermission('perm_unknown', 'once')).rejects.toThrow('not pending');
    await expect(adapter.replyToQuestion('perm_1', [['x']])).rejects.toThrow('not pending');
    // The original ask is still pending and answerable exactly once.
    await adapter.respondToPermission('perm_1', 'once');
    await expect(nativeReply as Promise<unknown>).resolves.toMatchObject({ decision: 'allow' });
    finishTurn();
    await done;
  });

  it('settles pending asks fail-closed on session teardown (stop)', async () => {
    await startAdapter();
    const { done } = await openStream();
    const nativeReply = serverHandlers.get('interaction/requestPermission')?.(permissionAskParams);
    await tick();
    await adapter.stop();
    await expect(nativeReply as Promise<unknown>).resolves.toMatchObject({
      decision: 'deny',
      reason: expect.stringContaining('Session stopped'),
    });
    expect(await adapter.getPendingPermissions()).toHaveLength(0);
    await done;
  });

  it('declines a question on teardown with the native cancel action', async () => {
    await startAdapter();
    const { done } = await openStream();
    const nativeReply = serverHandlers.get('interaction/requestUserInput')?.(questionAskParams);
    await tick();
    await adapter.stop();
    await expect(nativeReply as Promise<unknown>).resolves.toMatchObject({ action: 'cancel' });
    expect(await adapter.getPendingQuestions()).toHaveLength(0);
    await done;
  });
});

// MATRIX012: production registered handlers, synthetic run queues, no send/model/native path.
type Matrix012ReplyState = { status: string; body: unknown; error: string | null };
type Matrix012PendingEntry = { settled: boolean; settle: (body: unknown) => void };
const matrix012Setup = async () => {
  const counts = { nativeSpawnAttempts: 0, realFsReads: 0, configWrites: 0, modelAdmissions: 0, toolAdmissions: 0, httpAdmissions: 0, pendingSettles: 0, fakeHandshakeRequests: 0 };
  const cp = jest.requireActual<typeof import('node:child_process')>('node:child_process');
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const obsidian = jest.requireMock<typeof import('obsidian')>('obsidian');
  for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) jest.spyOn(cp, method).mockImplementation(() => { counts.nativeSpawnAttempts++; throw new Error('FAKE_MATRIX012_native_forbidden'); });
  for (const method of ['readFileSync', 'existsSync', 'readdirSync', 'statSync'] as const) jest.spyOn(fs, method).mockImplementation(() => { counts.realFsReads++; throw new Error('FAKE_MATRIX012_real_fs_forbidden'); });
  for (const method of ['writeFileSync', 'mkdirSync'] as const) jest.spyOn(fs, method).mockImplementation(() => { counts.configWrites++; throw new Error('FAKE_MATRIX012_config_write_forbidden'); });
  jest.spyOn(ZCodeAdapter.prototype, 'sendMessage').mockImplementation(() => { counts.modelAdmissions++; throw new Error('FAKE_MATRIX012_send_forbidden'); });
  jest.spyOn(ZCodeAdapter.prototype, 'startAuxQuerySession').mockImplementation(() => { counts.modelAdmissions++; throw new Error('FAKE_MATRIX012_aux_forbidden'); });
  jest.spyOn(obsidian, 'requestUrl').mockImplementation(() => { counts.httpAdmissions++; throw new Error('FAKE_MATRIX012_http_forbidden'); });
  const handlers = new Map<string, (params: Record<string, unknown>) => unknown>();
  const fake = { start: jest.fn(async () => {}), dispose: jest.fn(), request: jest.fn(async (method: string) => {
    if (method !== 'runtime/capabilities') { counts.toolAdmissions++; throw new Error('FAKE_MATRIX012_unexpected_request'); }
    counts.fakeHandshakeRequests++; return { independentPlanState: true };
  }), onNotification: jest.fn(() => ({ dispose: jest.fn() })), onServerRequest: jest.fn((method: string, handler: (params: Record<string, unknown>) => unknown) => { handlers.set(method, handler); return { dispose: jest.fn() }; }) };
  const adapter = new ZCodeAdapter({ resolveRuntime: () => readyResolution, discoverProviderConfig: () => ({ ...providerConfig, dataRoot: '/FAKE_MATRIX012_data', configPath: '/FAKE_MATRIX012_config', builtinConfigPath: '/FAKE_MATRIX012_builtin', env: {} }), createTransport: () => fake as unknown as ZCodeAppServerTransport });
  await adapter.start();
  const bridge = (adapter as unknown as { interactions: import('../../../../../src/core/agents/backend/zcode/ZCodeInteractionBridge').ZCodeInteractionBridge }).interactions;
  const runs = (adapter as unknown as { sessionRuns: Map<string, { chunks: StreamChunk[]; closed: boolean; cancelled: boolean; wake: null }> }).sessionRuns;
  runs.set('FAKE_MATRIX012_A', { chunks: [], closed: false, cancelled: false, wake: null }); runs.set('FAKE_MATRIX012_B', { chunks: [], closed: false, cancelled: false, wake: null });
  const trace: Record<string, unknown> = { inputs: [], states: [], settles: [], snapshots: [], nativeObserved: null, providerObserved: null };
  const states: Matrix012ReplyState[] = [], captured: Promise<void>[] = [], watched = new WeakSet<Matrix012PendingEntry>();
  const snapshot = () => ({ cards: [...runs].map(([sessionId, run]) => ({ sessionId, chunks: JSON.parse(JSON.stringify(run.chunks)) as unknown })), questions: bridge.getPending('user-input'), permissions: bridge.getPending('permission'), counts: { ...counts } });
  const invoke = (kind: 'permission' | 'user-input', input: Record<string, unknown>) => {
    (trace['inputs'] as unknown[]).push({ kind, input: JSON.parse(JSON.stringify(input)) as unknown });
    const state: Matrix012ReplyState = { status: 'pending', body: null, error: null }; states.push(state);
    let promise: Promise<unknown>; try { promise = Promise.resolve(handlers.get(kind === 'permission' ? 'interaction/requestPermission' : 'interaction/requestUserInput')?.(input)); } catch (error) { promise = Promise.reject(error); }
    captured.push(promise.then(body => { state.status = 'resolved'; state.body = body; }, error => { state.status = 'rejected'; state.error = String(error); }));
    const pending = (bridge as unknown as { pending: Map<string, Matrix012PendingEntry> }).pending;
    for (const entry of pending.values()) if (!watched.has(entry)) { watched.add(entry); const settle = entry.settle; entry.settle = body => { if (!entry.settled) { counts.pendingSettles++; (trace['settles'] as unknown[]).push(body); } settle(body); }; }
    return state;
  };
  const checkpoint = (label: string) => { (trace['snapshots'] as unknown[]).push({ label, ...snapshot(), states: JSON.parse(JSON.stringify(states)) as unknown }); };
  const cleanup = async () => { checkpoint('before-owned-teardown'); bridge.settlePendingForTeardown('FAKE_MATRIX012_A'); bridge.settlePendingForTeardown('FAKE_MATRIX012_B'); await Promise.all(captured); checkpoint('after-owned-teardown'); trace['states'] = states; trace['counts'] = counts; adapter.dispose(); console.warn('MATRIX012_ACTUAL ' + JSON.stringify({ fullName: expect.getState().currentTestName, ...trace })); jest.restoreAllMocks(); jest.useRealTimers(); };
  return { adapter, bridge, trace, counts, invoke, checkpoint, cleanup, snapshot };
};
const matrix012Question = (requestId: string, options: unknown[] = [{ label: 'alpha' }, { label: 'beta' }]) => ({ requestId, sessionId: 'FAKE_MATRIX012_A', toolCallId: 'FAKE_MATRIX012_tool', turnId: 'FAKE_MATRIX012_turn', questions: [{ question: 'FAKE_MATRIX012_q', header: 'FAKE_MATRIX012_h', options }] });
const matrix012Tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const matrix012HardZero = (counts: Awaited<ReturnType<typeof matrix012Setup>>['counts']) => { expect({ nativeSpawnAttempts: counts.nativeSpawnAttempts, realFsReads: counts.realFsReads, configWrites: counts.configWrites, modelAdmissions: counts.modelAdmissions, toolAdmissions: counts.toolAdmissions, httpAdmissions: counts.httpAdmissions }).toEqual({ nativeSpawnAttempts: 0, realFsReads: 0, configWrites: 0, modelAdmissions: 0, toolAdmissions: 0, httpAdmissions: 0 }); };

describe('MATRIX012 adapter controls', () => {
  it('MATRIX012 zero-admission smoke adapter', async () => {
    const f = await matrix012Setup(); try { f.checkpoint('smoke'); expect(f.snapshot().questions).toEqual([]); expect(f.counts.fakeHandshakeRequests).toBe(1); matrix012HardZero(f.counts); } finally { await f.cleanup(); }
  }, 2000);
  it.each([['ZC012-01-null-option', null], ['ZC012-02-label-number', { label: 7 }], ['ZC012-02-label-array', { label: [] }], ['ZC012-02-value-null', { value: null }], ['ZC012-02-label-empty', { label: '' }], ['ZC012-02-value-empty', { value: '' }]])('MATRIX012 %s fails closed before card/pending and rejects answers', async (id, option) => {
    const f = await matrix012Setup(); try {
      const requestId = `FAKE_MATRIX012_${String(id)}`, state = f.invoke('user-input', matrix012Question(requestId, [option])); await matrix012Tick(); f.checkpoint('before-response-probe');
      const response = await f.adapter.replyToQuestion(requestId, [['FAKE_MATRIX012_disallowed_answer']]).then(() => ({ accepted: true, error: null }), error => ({ accepted: false, error: String(error) }));
      await matrix012Tick(); f.trace['answerProbe'] = response; f.checkpoint('after-response-probe'); matrix012HardZero(f.counts);
      expect(response.accepted).toBe(false); expect(state.body).toMatchObject({ action: 'decline' }); expect(f.snapshot().questions).toEqual([]); expect(f.snapshot().cards).toEqual([{ sessionId: 'FAKE_MATRIX012_A', chunks: [] }, { sessionId: 'FAKE_MATRIX012_B', chunks: [] }]);
    } finally { await f.cleanup(); }
  }, 2000);
  it('MATRIX012 ZC012-02-value-string positive fallback preserves option order', async () => {
    const f = await matrix012Setup(); try {
      const state = f.invoke('user-input', matrix012Question('FAKE_MATRIX012_fallback', [{ value: 'beta' }, { value: 'alpha' }])); f.checkpoint('pending');
      expect(f.snapshot().questions[0]).toMatchObject({ questions: [{ options: [{ label: 'beta' }, { label: 'alpha' }] }] }); await f.adapter.replyToQuestion('FAKE_MATRIX012_fallback', [['alpha']]); await matrix012Tick();
      expect(state.body).toEqual({ action: 'accept', content: { answers: { FAKE_MATRIX012_q: ['alpha'] } } }); expect(f.counts.pendingSettles).toBe(1); matrix012HardZero(f.counts);
    } finally { await f.cleanup(); }
  }, 2000);
  it('MATRIX012 ZC012-03 changed session keeps original owner pending and answers once', async () => {
    const f = await matrix012Setup(); try {
      const input = matrix012Question('FAKE_MATRIX012_same'), original = f.invoke('user-input', input), other = f.invoke('user-input', { ...input, sessionId: 'FAKE_MATRIX012_B' }); await matrix012Tick(); f.checkpoint('changed-session');
      expect(other.body).toMatchObject({ action: 'decline' }); expect(original.status).toBe('pending'); expect(f.snapshot().questions).toMatchObject([{ id: input.requestId, sessionId: 'FAKE_MATRIX012_A' }]); expect(f.snapshot().cards[1].chunks).toEqual([]);
      await f.adapter.replyToQuestion(input.requestId, [['beta', 'alpha']]); await matrix012Tick(); expect(original.body).toEqual({ action: 'accept', content: { answers: { FAKE_MATRIX012_q: ['beta', 'alpha'] } } }); await expect(f.adapter.replyToQuestion(input.requestId, [['alpha']])).rejects.toThrow('not pending'); expect(f.counts.pendingSettles).toBe(1); matrix012HardZero(f.counts);
    } finally { await f.cleanup(); }
  }, 2000);
  it('MATRIX012 ZC012-04 changed kind and wrong-kind response cannot settle permission', async () => {
    const f = await matrix012Setup(); try {
      const requestId = 'FAKE_MATRIX012_kind', input = { ...permissionAskParams, requestId, sessionId: 'FAKE_MATRIX012_A', toolName: 'FAKE_MATRIX012_marker' }, permission = f.invoke('permission', input), question = f.invoke('user-input', matrix012Question(requestId)); await matrix012Tick();
      await expect(f.adapter.replyToQuestion(requestId, [['alpha']])).rejects.toThrow('not pending'); f.checkpoint('wrong-kind'); expect(question.body).toMatchObject({ action: 'decline' }); expect(permission.status).toBe('pending'); expect(f.snapshot().permissions).toHaveLength(1);
      await f.adapter.respondToPermission(requestId, 'reject', 'FAKE_MATRIX012_exact_reject'); await matrix012Tick(); expect(permission.body).toEqual({ decision: 'deny', reason: 'FAKE_MATRIX012_exact_reject' }); expect(f.counts.pendingSettles).toBe(1); matrix012HardZero(f.counts);
    } finally { await f.cleanup(); }
  }, 2000);
  it('MATRIX012 ZC012-06 native resolution from other session leaves owner untouched', async () => {
    const f = await matrix012Setup(); try {
      const requestId = 'FAKE_MATRIX012_scoped', state = f.invoke('user-input', matrix012Question(requestId)); f.bridge.settleNativeResolvedRequest('FAKE_MATRIX012_B', requestId); await matrix012Tick(); f.checkpoint('other-resolution'); expect(state.status).toBe('pending'); expect(f.snapshot().questions).toHaveLength(1);
      f.bridge.settleNativeResolvedRequest('FAKE_MATRIX012_A', requestId); f.bridge.settleNativeResolvedRequest('FAKE_MATRIX012_A', requestId); await matrix012Tick(); f.checkpoint('owner-resolution'); await expect(f.adapter.replyToQuestion(requestId, [['alpha']])).rejects.toThrow('not pending'); expect(state.body).toEqual({ action: 'cancel', reason: 'Request already resolved by the ZCode runtime.' }); expect(state.body).not.toHaveProperty('content'); expect(f.counts.pendingSettles).toBe(1); matrix012HardZero(f.counts);
    } finally { await f.cleanup(); }
  }, 2000);
  it.each([['ZC012-07-cache-29999', 29999, 'accept'], ['ZC012-07-cache-30000', 30000, 'decline']])('MATRIX012 %s honors exact cache boundary without new surface', async (id, elapsed, action) => {
    jest.useFakeTimers({ now: 0 }); const f = await matrix012Setup(); try {
      const input = matrix012Question(`FAKE_MATRIX012_${id}`), answer = [['beta', 'alpha']], first = f.invoke('user-input', input); await f.adapter.replyToQuestion(input.requestId, answer); answer[0].push('FAKE_MATRIX012_mutation'); await matrix012Tick(); jest.advanceTimersByTime(Number(elapsed)); const replay = f.invoke('user-input', input); await matrix012Tick(); f.checkpoint('cache-replay');
      expect(first.body).toEqual({ action: 'accept', content: { answers: { FAKE_MATRIX012_q: ['beta', 'alpha'] } } }); expect(replay.body).toMatchObject({ action }); expect(f.snapshot().cards[0].chunks).toHaveLength(1); expect(f.snapshot().questions).toEqual([]); expect(f.counts.pendingSettles).toBe(1); matrix012HardZero(f.counts);
    } finally { await f.cleanup(); }
  }, 2000);
  it.each(['question-text', 'multiSelect', 'sessionId'])('MATRIX012 ZC012-07-signature-%s never applies cached answers', async changed => {
    jest.useFakeTimers({ now: 0 }); const f = await matrix012Setup(); try {
      const input = matrix012Question(`FAKE_MATRIX012_signature_${changed}`); f.invoke('user-input', input); await f.adapter.replyToQuestion(input.requestId, [['alpha']]); await matrix012Tick();
      const replayInput = changed === 'sessionId' ? { ...input, sessionId: 'FAKE_MATRIX012_B' } : { ...input, questions: input.questions.map(q => ({ ...q, ...(changed === 'question-text' ? { question: 'FAKE_MATRIX012_changed' } : { multiSelect: true }) })) }; const replay = f.invoke('user-input', replayInput); await matrix012Tick(); f.checkpoint('changed-signature');
      expect(replay.body).toMatchObject({ action: 'decline' }); expect(replay.body).not.toHaveProperty('content'); expect(f.snapshot().cards[0].chunks).toHaveLength(1); expect(f.snapshot().cards[1].chunks).toEqual([]); expect(f.counts.pendingSettles).toBe(1); matrix012HardZero(f.counts);
    } finally { await f.cleanup(); }
  }, 2000);
  it('MATRIX012 ZC012-07-cache-changed-kind never uses a question answer as permission', async () => {
    jest.useFakeTimers({ now: 0 }); const f = await matrix012Setup(); try {
      const input = matrix012Question('FAKE_MATRIX012_recent_kind'); f.invoke('user-input', input); await f.adapter.replyToQuestion(input.requestId, [['alpha']]); await matrix012Tick();
      const permission = f.invoke('permission', { ...permissionAskParams, requestId: input.requestId, sessionId: 'FAKE_MATRIX012_A' }); f.checkpoint('new-permission-kind'); expect(permission.status).toBe('pending'); expect(f.snapshot().permissions).toHaveLength(1);
      await f.adapter.respondToPermission(input.requestId, 'reject', 'FAKE_MATRIX012_kind_reject'); await matrix012Tick(); expect(permission.body).toEqual({ decision: 'deny', reason: 'FAKE_MATRIX012_kind_reject' }); expect(permission.body).not.toHaveProperty('content'); matrix012HardZero(f.counts);
    } finally { await f.cleanup(); }
  }, 2000);
  it('MATRIX012 ZC012-09 valid multiple/custom arrays copy and omit empty selections', async () => {
    const f = await matrix012Setup(); try {
      const input = { ...matrix012Question('FAKE_MATRIX012_multiple'), questions: [{ question: 'FAKE_MATRIX012_q1', multiSelect: true, options: [{ label: 'alpha' }, { label: 'beta' }] }, { question: 'FAKE_MATRIX012_q2', options: [{ label: 'custom' }] }, { question: 'FAKE_MATRIX012_q3', options: [{ label: 'unused' }] }] }, state = f.invoke('user-input', input), answers = [['beta', 'alpha'], ['FAKE_MATRIX012_free'], []]; f.checkpoint('multiple-card'); await f.adapter.replyToQuestion(input.requestId, answers); answers[0].push('FAKE_MATRIX012_mutation'); answers[1][0] = 'FAKE_MATRIX012_mutation'; await matrix012Tick();
      expect(state.body).toEqual({ action: 'accept', content: { answers: { FAKE_MATRIX012_q1: ['beta', 'alpha'], FAKE_MATRIX012_q2: ['FAKE_MATRIX012_free'] } } }); expect(f.snapshot().questions).toEqual([]); expect(f.counts.pendingSettles).toBe(1); matrix012HardZero(f.counts);
    } finally { await f.cleanup(); }
  }, 2000);
  it('MATRIX012 ZC012-09 duplicate-question-text must fail closed without silently overwriting an answer', async () => {
    const f = await matrix012Setup(); try {
      const input = { ...matrix012Question('FAKE_MATRIX012_duplicate_text'), questions: [{ question: 'FAKE_MATRIX012_same_text', options: [{ label: 'alpha' }] }, { question: 'FAKE_MATRIX012_same_text', options: [{ label: 'beta' }] }] }, state = f.invoke('user-input', input); await matrix012Tick(); f.checkpoint('duplicate-before-response');
      const response = await f.adapter.replyToQuestion(input.requestId, [['alpha'], ['beta']]).then(() => ({ accepted: true }), error => ({ accepted: false, error: String(error) })); await matrix012Tick(); f.trace['duplicateAnswerProbe'] = response; f.checkpoint('duplicate-after-response'); matrix012HardZero(f.counts);
      expect(state.body).toMatchObject({ action: 'decline' }); expect(response.accepted).toBe(false); expect(f.snapshot().cards[0].chunks).toEqual([]); expect(f.counts.pendingSettles).toBe(0);
    } finally { await f.cleanup(); }
  }, 2000);
});
