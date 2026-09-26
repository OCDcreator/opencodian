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
