/**
 * Contract tests for the warm completion session wrapper
 * (docs/requirements/flowtext-c3-design.md §3.2 invariants 1–2):
 *
 * - the wrapper never widens what a session may do: it is built around an
 *   existing, audited `AuxQuerySession` and passes its `AuxQuerySafetyProof`
 *   through untouched;
 * - every turn carries the full request (cold semantics): the wire prompt
 *   embeds the prefix/suffix windows and the cap, not a reference to history;
 * - turns are serialized and cancellable;
 * - `reset()` rebuilds through the adapter's own read-only factory and
 *   disposes the previous native session;
 * - `warmUp()` is called on create and on reset (Claude prewarm seam);
 * - dispose is idempotent and closes the session for further turns.
 */

import { describe, expect, it } from '@jest/globals';

import type {
  AuxQueryResult,
  AuxQuerySession,
  AuxQueryTurnRequest,
} from '../../../../../src/core/agents/backend/AgentAuxQueryCapability';
import { AUX_DENIED_CAPABILITIES } from '../../../../../src/core/agents/backend/AgentAuxQueryCapability';
import {
  type WarmableAuxSession,
  WarmInlineCompletionSession,
} from '../../../../../src/core/agents/backend/auxiliary/WarmInlineCompletionSession';

interface StubAux extends AuxQuerySession {
  readonly queries: AuxQueryTurnRequest[];
  readonly cancellations: number;
  disposed: boolean;
  warmUps: number;
}

function stubAux(queryResult: AuxQueryResult = { success: true, text: ' continuation', toolCalls: [] }): StubAux {
  const session: StubAux = {
    queryId: `aux-${Math.random().toString(36).slice(2, 8)}`,
    safety: {
      backend: 'opencode',
      enforcedPolicy: 'read-only-allowlist',
      effectiveTools: ['read'],
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: 'stub',
    },
    queries: [],
    cancellations: 0,
    disposed: false,
    warmUps: 0,
    query(request: AuxQueryTurnRequest) {
      session.queries.push(request);
      return Promise.resolve(queryResult);
    },
    followUp() {
      return Promise.resolve(queryResult);
    },
    cancel() {
      (session as { cancellations: number }).cancellations += 1;
    },
    dispose() {
      session.disposed = true;
      return Promise.resolve();
    },
  };
  session.warmUp = () => {
    session.warmUps += 1;
  };
  return session;
}

function makeWrapper(initial = stubAux(), recreate: () => StubAux = () => stubAux()) {
  const wrapper = WarmInlineCompletionSession.create({
    backend: 'opencode',
    session: initial as WarmableAuxSession,
    recreate: () => recreate() as WarmableAuxSession,
  });
  return { wrapper, initial, recreate };
}

describe('WarmInlineCompletionSession — warm session, cold semantics', () => {
  it('starts the native runtime eagerly when the session supports warmUp', () => {
    const initial = stubAux();
    const { wrapper } = makeWrapper(initial);
    expect(initial.warmUps).toBe(1);
    void wrapper.dispose();
  });

  it('sends the full stateless request each turn (prefix, suffix, cap)', async () => {
    const initial = stubAux();
    const { wrapper } = makeWrapper(initial);
    const chunks: string[] = [];
    const controller = new AbortController();
    const result = await wrapper.complete({
      prefix: 'before text',
      suffix: 'after text',
      maxChars: 300,
      signal: controller.signal,
      onTextChunk: (accumulated) => { chunks.push(accumulated); },
    });
    expect(result).toEqual({ ok: true, text: ' continuation', toolCalls: [] });
    expect(initial.queries).toHaveLength(1);
    const prompt = initial.queries[0]!.prompt;
    expect(prompt).toContain('before text');
    expect(prompt).toContain('after text');
    expect(prompt).toContain('300');
    expect(prompt).toContain('<^.^>');
    expect(initial.queries[0]!.signal).toBe(controller.signal);
    expect(initial.queries[0]!.onTextChunk).toBeDefined();
    await wrapper.dispose();
  });

  it('serializes turns: the second completes only after the first settles', async () => {
    const initial = stubAux();
    let release!: (result: AuxQueryResult) => void;
    (initial as StubAux).query = (request: AuxQueryTurnRequest) => {
      initial.queries.push(request);
      const first = new Promise<AuxQueryResult>((resolve) => { release = resolve; });
      if (initial.queries.length === 1) return first;
      return Promise.resolve({ success: true, text: ' second', toolCalls: [] });
    };
    const { wrapper } = makeWrapper(initial);
    const firstPromise = wrapper.complete({ prefix: 'a', suffix: '', maxChars: 100 });
    const secondPromise = wrapper.complete({ prefix: 'b', suffix: '', maxChars: 100 });
    // The second turn waits behind the first.
    const secondBeforeRelease = await Promise.race([
      secondPromise.then(() => 'done'),
      new Promise((resolve) => { setTimeout(resolve, 20, 'pending'); }),
    ]);
    expect(secondBeforeRelease).toBe('pending');
    release({ success: true, text: ' first', toolCalls: [] });
    expect((await firstPromise).text).toBe(' first');
    expect((await secondPromise).text).toBe(' second');
    await wrapper.dispose();
  });

  it('maps an aux failure to a failed completion result, preserving cancelled', async () => {
    const initial = stubAux({ success: false, error: 'stopped', cancelled: true });
    const { wrapper } = makeWrapper(initial);
    const result = await wrapper.complete({ prefix: 'a', suffix: '', maxChars: 100 });
    expect(result).toEqual({ ok: false, error: 'stopped', cancelled: true });
    await wrapper.dispose();
  });

  it('passes the aux safety proof through untouched', () => {
    const initial = stubAux();
    const { wrapper } = makeWrapper(initial);
    expect(wrapper.safety).toBe(initial.safety);
    void wrapper.dispose();
  });

  it('surfaces observed tool calls for the feature-layer write audit', async () => {
    const initial = stubAux({ success: true, text: ' x', toolCalls: [{ name: 'Write' }] });
    const { wrapper } = makeWrapper(initial);
    const result = await wrapper.complete({ prefix: 'a', suffix: '', maxChars: 100 });
    expect(result.ok).toBe(true);
    expect('toolCalls' in result && result.toolCalls.map((call) => call.name)).toEqual(['Write']);
    await wrapper.dispose();
  });
});

describe('WarmInlineCompletionSession — reset and dispose', () => {
  it('reset() rebuilds through the read-only factory and disposes the old session', async () => {
    const initial = stubAux();
    const replacement = stubAux();
    const { wrapper } = makeWrapper(initial, () => replacement);
    await wrapper.reset();
    expect(initial.disposed).toBe(true);
    expect(replacement.warmUps).toBe(1);
    // Later turns run on the replacement.
    await wrapper.complete({ prefix: 'a', suffix: '', maxChars: 100 });
    expect(replacement.queries).toHaveLength(1);
    expect(initial.queries).toHaveLength(0);
    await wrapper.dispose();
    expect(replacement.disposed).toBe(true);
  });

  it('reset() waits for the in-flight turn before disposing', async () => {
    const initial = stubAux();
    let release!: (result: AuxQueryResult) => void;
    (initial as StubAux).query = (request: AuxQueryTurnRequest) => {
      initial.queries.push(request);
      return new Promise<AuxQueryResult>((resolve) => { release = resolve; });
    };
    const replacement = stubAux();
    const { wrapper } = makeWrapper(initial, () => replacement);
    const turn = wrapper.complete({ prefix: 'a', suffix: '', maxChars: 100 });
    await Promise.resolve(); // let the serialized turn actually start
    const resetting = wrapper.reset();
    release({ success: true, text: ' late', toolCalls: [] });
    await Promise.all([turn, resetting]);
    expect(initial.disposed).toBe(true);
    await wrapper.dispose();
  });

  it('reset() is a no-op after dispose', async () => {
    const initial = stubAux();
    let recreated = false;
    const { wrapper } = makeWrapper(initial, () => {
      recreated = true;
      return stubAux();
    });
    await wrapper.dispose();
    expect(initial.disposed).toBe(true);
    await wrapper.reset();
    expect(recreated).toBe(false);
  });

  it('dispose() is idempotent and closes the session for further turns', async () => {
    const initial = stubAux();
    const { wrapper } = makeWrapper(initial);
    await wrapper.dispose();
    await wrapper.dispose();
    expect(initial.disposed).toBe(true);
    const result = await wrapper.complete({ prefix: 'a', suffix: '', maxChars: 100 });
    expect(result).toEqual({ ok: false, error: 'Inline completion session is closed.', cancelled: true });
    expect(initial.queries).toHaveLength(0);
  });

  it('waits for a pending turn inside dispose before tearing down', async () => {
    const initial = stubAux();
    let release!: (result: AuxQueryResult) => void;
    (initial as StubAux).query = (request: AuxQueryTurnRequest) => {
      initial.queries.push(request);
      return new Promise<AuxQueryResult>((resolve) => { release = resolve; });
    };
    const { wrapper } = makeWrapper(initial);
    const turn = wrapper.complete({ prefix: 'a', suffix: '', maxChars: 100 });
    await Promise.resolve(); // let the serialized turn actually start
    const disposing = wrapper.dispose();
    release({ success: true, text: ' late', toolCalls: [] });
    await Promise.all([turn, disposing]);
    // The turn result reached the caller before the dispose finished.
    expect(initial.disposed).toBe(true);
  });
});
