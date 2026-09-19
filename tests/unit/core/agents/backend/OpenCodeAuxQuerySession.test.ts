/**
 * OpenCodeAuxQuerySession — progressive text emission (R-A3).
 *
 * The turn POST only resolves when generation is complete, so without the
 * in-flight history poll the streaming preview never receives partial frames
 * and jumps from busy to complete. These tests pin the polling contract:
 *
 * - partial assistant text is emitted while the POST is still pending, and
 *   emissions strictly grow;
 * - the final, authoritative emission carries the complete turn text;
 * - polling is silent when no `onTextChunk` sink was provided;
 * - no emission can land after the turn settled.
 */

import type { AuxQueryTurnRequest } from '../../../../../src/core/agents/backend/AgentAuxQueryCapability';
import type { AuxHttpRequest, AuxHttpResponse } from '../../../../../src/core/agents/backend/auxiliary/AuxTransport';
import {
  OpenCodeAuxQuerySession,
  type OpenCodeAuxSessionOptions,
} from '../../../../../src/core/agents/backend/auxiliary/OpenCodeAuxQuerySession';
import type { OpenCodeAuxScope } from '../../../../../src/core/agents/backend/auxiliary/OpenCodeAuxScope';

/** Mutable assistant text parts the fake history endpoint serves. */
type HistoryPart = { type: string; text?: string };
type HistoryMessage = { info: { role: string }; parts: HistoryPart[] };

interface FakeTransportOptions {
  /** Resolved when the test wants the turn POST to complete. */
  releasePost: () => void;
  waitForPost: Promise<void>;
  history: HistoryMessage[];
  historyReads: number[];
}

function okResponse(body: unknown): AuxHttpResponse {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve(body),
  };
}

function makeTransport(options: FakeTransportOptions) {
  return (rawUrl: string, request: AuxHttpRequest = {}): Promise<AuxHttpResponse> => {
    const url = rawUrl.split('?')[0] ?? rawUrl;
    const method = request.method ?? 'GET';
    if (method === 'POST' && url.endsWith('/session')) {
      return Promise.resolve(okResponse({ id: 'sess-1' }));
    }
    if (method === 'DELETE' && url.includes('/session/')) {
      return Promise.resolve(okResponse({ ok: true }));
    }
    if (method === 'POST' && url.endsWith('/message')) {
      return new Promise((resolve) => {
        void options.waitForPost.then(() => resolve(okResponse({ ok: true })));
      });
    }
    if (method === 'GET' && url.endsWith('/message')) {
      options.historyReads.push(options.historyReads.length + 1);
      // Snapshot: later polls must observe the history as it is now.
      return Promise.resolve(okResponse(JSON.parse(JSON.stringify(options.history))));
    }
    return Promise.reject(new Error(`unexpected transport call: ${method} ${url}`));
  };
}

function makeSession(transport: ReturnType<typeof makeTransport>): Promise<OpenCodeAuxQuerySession> {
  const scope = {
    ensureStarted: () => Promise.resolve('http://aux.test'),
    getVerification: () => ({
      catalog: [],
      allowed: [],
      denied: [],
      agent: { name: 'read-only-agent', rules: [], toolMap: {} },
    }),
    getSessionDirectory: () => '/tmp/aux-scope',
  } as unknown as OpenCodeAuxScope;
  const options: OpenCodeAuxSessionOptions = {
    systemPrompt: 'sys',
    workingDirectory: '/vault',
    scope,
    agentName: 'read-only-agent',
    transport,
  };
  return OpenCodeAuxQuerySession.create(options);
}

function assistantMessage(parts: HistoryPart[]): HistoryMessage {
  return { info: { role: 'assistant' }, parts };
}

describe('OpenCodeAuxQuerySession progressive text emission (R-A3)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits growing partial text while the turn POST is pending, then the complete text', async () => {
    let releasePost!: () => void;
    const waitForPost = new Promise<void>((resolve) => { releasePost = resolve; });
    const history: HistoryMessage[] = [];
    const historyReads: number[] = [];
    const transport = makeTransport({ releasePost, waitForPost, history, historyReads });
    const session = await makeSession(transport);

    const emissions: string[] = [];
    const request: AuxQueryTurnRequest = {
      prompt: 'continue',
      onTextChunk: (accumulated) => { emissions.push(accumulated); },
    };

    const turn = session.query(request);
    // The poll starts before the first tick; drive three polling windows.
    await jest.advanceTimersByTimeAsync(10);
    expect(emissions).toEqual([]);

    history.push(assistantMessage([{ type: 'text', text: '<replacement>第一' }]));
    await jest.advanceTimersByTimeAsync(260);
    expect(emissions).toEqual(['<replacement>第一']);

    history[0] = assistantMessage([{ type: 'text', text: '<replacement>第一二' }]);
    await jest.advanceTimersByTimeAsync(260);
    expect(emissions).toEqual(['<replacement>第一', '<replacement>第一二']);

    // Settle the POST with the complete text in history: the authoritative
    // post-turn read must emit exactly the complete text.
    history[0] = assistantMessage([{ type: 'text', text: '<replacement>第一二</replacement>' }]);
    releasePost();
    const result = await turn;
    expect(result.success).toBe(true);
    expect(emissions[emissions.length - 1]).toBe('<replacement>第一二</replacement>');
    expect(result.success && result.text).toBe('<replacement>第一二</replacement>');
    // Every emission strictly grew into the next one.
    for (let i = 1; i < emissions.length; i += 1) {
      expect(emissions[i]!.startsWith(emissions[i - 1]!)).toBe(true);
    }

    await session.dispose();
  });

  it('polls nothing when the turn has no onTextChunk sink', async () => {
    let releasePost!: () => void;
    const waitForPost = new Promise<void>((resolve) => { releasePost = resolve; });
    const history: HistoryMessage[] = [assistantMessage([{ type: 'text', text: 'x' }])];
    const historyReads: number[] = [];
    const transport = makeTransport({ releasePost, waitForPost, history, historyReads });
    const session = await makeSession(transport);

    const turn = session.query({ prompt: 'continue' });
    await jest.advanceTimersByTimeAsync(800);
    // Exactly one history read while the POST is pending: the `before`
    // baseline. Polling only exists for an onTextChunk sink.
    expect(historyReads).toEqual([1]);
    releasePost();
    await turn;
    // Exactly one further history read after the turn: the authoritative one.
    expect(historyReads).toEqual([1, 2]);
    await session.dispose();
  });

  it('stops emitting once the turn has settled', async () => {
    let releasePost!: () => void;
    const waitForPost = new Promise<void>((resolve) => { releasePost = resolve; });
    const history: HistoryMessage[] = [];
    const historyReads: number[] = [];
    const transport = makeTransport({ releasePost, waitForPost, history, historyReads });
    const session = await makeSession(transport);

    const emissions: string[] = [];
    const turn = session.query({ prompt: 'continue', onTextChunk: (t) => { emissions.push(t); } });
    history.push(assistantMessage([{ type: 'text', text: 'partial' }]));
    await jest.advanceTimersByTimeAsync(260);
    expect(emissions).toEqual(['partial']);

    releasePost();
    await turn;
    const settledCount = emissions.length;

    // A late history mutation after the turn must not produce new frames.
    history[0] = assistantMessage([{ type: 'text', text: 'partial and more' }]);
    await jest.advanceTimersByTimeAsync(1000);
    expect(emissions.length).toBe(settledCount);
    await session.dispose();
  });
});
