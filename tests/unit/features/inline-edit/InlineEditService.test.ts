import { describe, expect, it } from '@jest/globals';

import type {
  AgentAuxQueryCapability,
  AuxQueryResult,
  AuxQuerySafetyProof,
  AuxQuerySession,
  AuxQuerySessionConfig,
} from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import {
  AUX_DENIED_CAPABILITIES,
  findWriteToolCalls,
} from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import { canApplyEdit, InlineEditService } from '../../../../src/features/inline-edit/InlineEditService';
import type { InlineEditHostAdapter } from '../../../../src/features/inline-edit/InlineEditTypes';

const SAFETY: AuxQuerySafetyProof = {
  backend: 'opencode',
  enforcedPolicy: 'read-only-allowlist',
  effectiveTools: ['read'],
  deniedCapabilities: AUX_DENIED_CAPABILITIES,
  mechanism: 'test',
};

interface StubSession extends AuxQuerySession {
  readonly queries: string[];
  readonly followUps: string[];
  disposed: boolean;
}

function stubSession(results: AuxQueryResult[]): StubSession {
  const queries: string[] = [];
  const followUps: string[] = [];
  const queue = [...results];
  const session: StubSession = {
    queryId: 'test',
    safety: SAFETY,
    queries,
    followUps,
    disposed: false,
    query(request) {
      queries.push(request.prompt);
      return Promise.resolve(queue.shift() ?? { success: true, text: '<replacement>fallback</replacement>', toolCalls: [] });
    },
    followUp(prompt) {
      followUps.push(prompt);
      return Promise.resolve(queue.shift() ?? { success: true, text: '<replacement>fallback</replacement>', toolCalls: [] });
    },
    cancel() { /* no-op */ },
    dispose() { session.disposed = true; return Promise.resolve(); },
  };
  return session;
}

function adapterWith(
  session: AuxQuerySession | null,
  hasCapability = true,
): { adapter: InlineEditHostAdapter; started: AuxQuerySessionConfig[] } {
  const started: AuxQuerySessionConfig[] = [];
  const capability: AgentAuxQueryCapability = {
    kind: 'opencode',
    displayName: 'OpenCode',
    description: 'test',
    status: 'connected',
    capabilities: new Set(),
    hasCapability: () => true,
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    dispose: () => { /* no-op */ },
    onStatusChange: () => ({ dispose: () => { /* no-op */ } }),
    startAuxQuerySession(config) {
      started.push(config);
      return session ? Promise.resolve(session) : Promise.reject(new Error('no session'));
    },
  };
  return {
    started,
    adapter: {
      kind: 'opencode',
      displayName: 'OpenCode',
      getAuxQuery: () => (hasCapability ? capability : null),
      resolveModel: () => ({ ok: true, model: null }),
    },
  };
}

const selectionRequest = {
  kind: 'selection' as const,
  instruction: 'Tighten this',
  notePath: 'a.md',
  startLine: 1,
  endLine: 1,
  selectionText: 'The cat sat on the mat.',
};

describe('InlineEditService', () => {
  it('starts a session with the current locale system prompt, not a chat prompt', async () => {
    const session = stubSession([{ success: true, text: '<replacement>ok</replacement>', toolCalls: [] }]);
    const { adapter, started } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'zh' });
    await service.submit(selectionRequest);
    expect(started).toHaveLength(1);
    expect(started[0]?.workingDirectory).toBe('/vault');
    expect(started[0]?.systemPrompt).toContain('行内编辑');
    await service.dispose();
  });

  it('returns a preview for a replacement response', async () => {
    const session = stubSession([{ success: true, text: '<replacement>New</replacement>', toolCalls: [] }]);
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await expect(service.submit(selectionRequest)).resolves.toEqual({
      status: 'preview', mode: 'replacement', text: 'New',
    });
    await service.dispose();
  });

  it('returns a clarification when the reply has no tag', async () => {
    const session = stubSession([{ success: true, text: 'Which tone?', toolCalls: [] }]);
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await expect(service.submit(selectionRequest)).resolves.toEqual({
      status: 'clarification', text: 'Which tone?',
    });
    await service.dispose();
  });

  it('reuses the same session for the clarification loop', async () => {
    const session = stubSession([
      { success: true, text: 'Which tone?', toolCalls: [] },
      { success: true, text: '<replacement>Formal</replacement>', toolCalls: [] },
    ]);
    const { adapter, started } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await service.submit(selectionRequest);
    const outcome = await service.clarify('Formal please');
    expect(outcome).toEqual({ status: 'preview', mode: 'replacement', text: 'Formal' });
    expect(started).toHaveLength(1);
    // The clarification round goes through followUp so the backend reuses its
    // native session state.
    expect(session.followUps).toEqual(['Formal please']);
    expect(session.queries).toHaveLength(1);
    await service.dispose();
  });

  it('discards the result and disposes the session when a write-class tool was observed', async () => {
    const session = stubSession([{
      success: true,
      text: '<replacement>sneaky</replacement>',
      toolCalls: [{ name: 'write' }],
    }]);
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const outcome = await service.submit(selectionRequest);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.reason).toBe('write-tool-observed');
    expect(outcome.detail).toContain('write');
    expect(session.disposed).toBe(true);
    await service.dispose();
  });

  it('fails closed when the backend has no aux query capability', async () => {
    const { adapter } = adapterWith(null, false);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const outcome = await service.submit(selectionRequest);
    expect(outcome).toEqual({
      status: 'error', reason: 'capability-unavailable', detail: 'opencode',
    });
    await service.dispose();
  });

  it('surfaces a session start failure instead of falling back', async () => {
    const { adapter } = adapterWith(null, true);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const outcome = await service.submit(selectionRequest);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.reason).toBe('session-unavailable');
    expect(outcome.detail).toContain('no session');
    await service.dispose();
  });

  it('reports a rejected request without starting a session', async () => {
    const session = stubSession([]);
    const { adapter, started } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const outcome = await service.submit({ ...selectionRequest, selectionText: '</editor_selection>' });
    expect(outcome).toEqual({
      status: 'error', reason: 'selection-contains-protocol-tag',
    });
    expect(started).toHaveLength(0);
    await service.dispose();
  });

  it('stops accepting turns after dispose', async () => {
    const session = stubSession([{ success: true, text: 'Which tone?', toolCalls: [] }]);
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await service.submit(selectionRequest);
    await service.dispose();
    expect(await service.clarify('more')).toEqual({ status: 'error', reason: 'no-session' });
  });
});


function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function adapterStartingWith(start: (call: number) => Promise<AuxQuerySession>) {
  const harness = adapterWith(null);
  harness.adapter.getAuxQuery()!.startAuxQuerySession = (config) => {
    harness.started.push(config);
    return start(harness.started.length);
  };
  return harness;
}

describe('InlineEditService startup cancellation', () => {
  it('releases one late session for shared submit waiters without querying it', async () => {
    const session = stubSession([]);
    const ready = deferred<AuxQuerySession>();
    const { adapter, started } = adapterStartingWith(() => ready.promise);
    let releases = 0;
    session.dispose = async () => { releases += 1; session.disposed = true; };
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const first = service.submit(selectionRequest);
    const second = service.submit(selectionRequest);
    expect(started).toHaveLength(1);
    const closing = service.dispose();
    ready.resolve(session);
    const outcomes = await Promise.all([first, second]);
    await closing;
    expect(outcomes).toEqual([
      { status: 'error', reason: 'cancelled' },
      { status: 'error', reason: 'cancelled' },
    ]);
    expect(session.queries).toEqual([]);
    expect(session.followUps).toEqual([]);
    expect(releases).toBe(1);
    expect(service.hasSession).toBe(false);
    await service.dispose();
    expect(releases).toBe(1);
  });

  it('keeps repeated dispose calls pending until startup and native teardown finish', async () => {
    const session = stubSession([]);
    const ready = deferred<AuxQuerySession>();
    const teardownStarted = deferred<void>();
    const teardownFinished = deferred<void>();
    const { adapter } = adapterStartingWith(() => ready.promise);
    let releases = 0;
    session.dispose = () => {
      releases += 1;
      teardownStarted.resolve(undefined);
      return teardownFinished.promise;
    };
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const turn = service.submit(selectionRequest);
    let firstClosed = false;
    let secondClosed = false;
    const firstClosing = service.dispose().then(() => { firstClosed = true; });
    const secondClosing = service.dispose().then(() => { secondClosed = true; });
    try {
      await Promise.resolve();
      expect(firstClosed).toBe(false);
      expect(secondClosed).toBe(false);
      ready.resolve(session);
      await teardownStarted.promise;
      expect(firstClosed).toBe(false);
      expect(secondClosed).toBe(false);
      expect(session.queries).toEqual([]);
      expect(releases).toBe(1);
    } finally {
      ready.resolve(session);
      teardownFinished.resolve(undefined);
      await Promise.all([turn, firstClosing, secondClosing]);
    }
    expect(firstClosed).toBe(true);
    expect(secondClosed).toBe(true);
    expect(releases).toBe(1);
  });

  it('cancels pending startup without a query and allows a later retry and clarification', async () => {
    const late = stubSession([]);
    const retry = stubSession([
      { success: true, text: 'Which tone?', toolCalls: [] },
      { success: true, text: '<replacement>Formal</replacement>', toolCalls: [] },
    ]);
    const ready = deferred<AuxQuerySession>();
    const { adapter, started } = adapterStartingWith((call) => call === 1 ? ready.promise : Promise.resolve(retry));
    let releases = 0;
    late.dispose = async () => { releases += 1; late.disposed = true; };
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const cancelled = service.submit(selectionRequest);
    service.cancel();
    ready.resolve(late);
    expect(await cancelled).toEqual({ status: 'error', reason: 'cancelled' });
    expect(late.queries).toEqual([]);
    expect(releases).toBe(1);
    expect(service.hasSession).toBe(false);
    expect(await service.submit(selectionRequest)).toEqual({ status: 'clarification', text: 'Which tone?' });
    expect(await service.clarify('Formal please')).toEqual({ status: 'preview', mode: 'replacement', text: 'Formal' });
    expect(started).toHaveLength(2);
    expect(retry.queries).toHaveLength(1);
    expect(retry.followUps).toEqual(['Formal please']);
    await service.dispose();
    expect(retry.disposed).toBe(true);
    expect(releases).toBe(1);
  });

  it('does not let an old editor service teardown affect a newer service session', async () => {
    const late = stubSession([]);
    const current = stubSession([]);
    const ready = deferred<AuxQuerySession>();
    const { adapter } = adapterStartingWith((call) => call === 1 ? ready.promise : Promise.resolve(current));
    const oldService = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const oldTurn = oldService.submit(selectionRequest);
    const closing = oldService.dispose();
    const newService = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    expect((await newService.submit({ ...selectionRequest, notePath: 'b.md' })).status).toBe('preview');
    ready.resolve(late);
    expect(await oldTurn).toEqual({ status: 'error', reason: 'cancelled' });
    await closing;
    expect(late.disposed).toBe(true);
    expect(current.disposed).toBe(false);
    expect(newService.hasSession).toBe(true);
    expect((await newService.clarify('Keep this editor active')).status).toBe('preview');
    expect(current.followUps).toEqual(['Keep this editor active']);
    await newService.dispose();
    expect(current.disposed).toBe(true);
  });

  it('does not restart or follow up on a disposed service', async () => {
    const session = stubSession([]);
    const { adapter, started } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await service.submit(selectionRequest);
    await service.dispose();
    expect(await service.submit(selectionRequest)).toEqual({ status: 'error', reason: 'cancelled' });
    expect(await service.clarify('more')).toEqual({ status: 'error', reason: 'no-session' });
    expect(started).toHaveLength(1);
    expect(session.queries).toHaveLength(1);
    expect(session.followUps).toEqual([]);
  });

  it.each(['cancel', 'dispose'] as const)('blocks a new query when %s wins the session admission handoff', async (action) => {
    const session = stubSession([]);
    const { adapter, started } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await service.submit(selectionRequest);
    const nextTurn = service.submit(selectionRequest);
    const closing = action === 'dispose' ? service.dispose() : undefined;
    if (action === 'cancel') service.cancel();
    expect(await nextTurn).toEqual({ status: 'error', reason: 'cancelled' });
    await closing;
    expect(started).toHaveLength(1);
    expect(session.queries).toHaveLength(1);
    const canContinue = action === 'cancel';
    expect(service.hasSession).toBe(canContinue);
    expect(session.disposed).toBe(!canContinue);
    expect((await service.clarify('Continue on the same session')).status).toBe(canContinue ? 'preview' : 'error');
    expect(session.followUps).toEqual(canContinue ? ['Continue on the same session'] : []);
    await service.dispose();
  });

  it('preserves an established session for clarification after cancel', async () => {
    const session = stubSession([
      { success: true, text: 'Which tone?', toolCalls: [] },
      { success: true, text: '<replacement>Formal</replacement>', toolCalls: [] },
    ]);
    const { adapter, started } = adapterWith(session);
    let cancellations = 0;
    session.cancel = () => { cancellations += 1; };
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await service.submit(selectionRequest);
    service.cancel();
    expect(cancellations).toBe(1);
    expect(service.hasSession).toBe(true);
    expect(session.disposed).toBe(false);
    expect(await service.clarify('Formal please')).toEqual({ status: 'preview', mode: 'replacement', text: 'Formal' });
    expect(started).toHaveLength(1);
    expect(session.followUps).toEqual(['Formal please']);
    await service.dispose();
  });
});

describe('findWriteToolCalls', () => {
  it('accepts read-only tool calls', () => {
    expect(findWriteToolCalls([{ name: 'Read' }, { name: 'grep' }, { name: 'glob' }])).toEqual([]);
  });

  it('flags write, shell, package, and subagent tools', () => {
    expect(findWriteToolCalls([{ name: 'Write' }])).toEqual(['Write']);
    expect(findWriteToolCalls([{ name: 'Bash' }])).toEqual(['Bash']);
    expect(findWriteToolCalls([{ name: 'install_package' }])).toEqual(['install_package']);
    expect(findWriteToolCalls([{ name: 'Task' }])).toEqual(['Task']);
  });

  it('flags anything classified as MCP', () => {
    expect(findWriteToolCalls([{ name: 'some_tool', kind: 'mcp' }])).toEqual(['some_tool']);
  });
});

describe('canApplyEdit', () => {
  it('accepts an unchanged snapshot', () => {
    expect(canApplyEdit('a\nb', 'a\nb')).toBe(true);
  });

  it('rejects a changed snapshot', () => {
    expect(canApplyEdit('a\nb', 'a\nc')).toBe(false);
  });

  it('is line-ending sensitive so CRLF drift is caught', () => {
    expect(canApplyEdit('a\nb', 'a\r\nb')).toBe(false);
  });
});


describe('InlineEditService turn options (R-A3 streaming / R-A4 images)', () => {
  it('forwards turn images to the backend session and adds the image note to the prompt', async () => {
    const received: { prompt: string; images?: readonly { mediaType: string; data: string }[] }[] = [];
    const session: AuxQuerySession = {
      queryId: 'test',
      safety: SAFETY,
      query(request) {
        received.push({ prompt: request.prompt, images: request.images });
        return Promise.resolve({ success: true, text: '<insertion>$x$</insertion>', toolCalls: [] });
      },
      followUp: () => Promise.resolve({ success: true, text: '<replacement>fallback</replacement>', toolCalls: [] }),
      cancel() { /* no-op */ },
      dispose: () => Promise.resolve(),
    };
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const image = { mediaType: 'image/png' as const, data: 'aGVsbG8=' };
    const outcome = await service.submit(selectionRequest, { images: [image] });
    expect(outcome).toEqual({ status: 'preview', mode: 'insertion', text: '$x$' });
    expect(received).toHaveLength(1);
    // The image rides the turn request verbatim (no data-URL prefix added).
    expect(received[0]?.images).toEqual([image]);
    // The prompt carries the R-A4 image semantics note.
    expect(received[0]?.prompt).toContain('Image input');
    expect(received[0]?.prompt).toContain('$$…$$');
    await service.dispose();
  });

  it('selects the inline LaTeX delimiter form for cursor-inline anchors', async () => {
    const received: string[] = [];
    const session: AuxQuerySession = {
      queryId: 'test',
      safety: SAFETY,
      query(request) { received.push(request.prompt); return Promise.resolve({ success: true, text: '<insertion>$x$</insertion>', toolCalls: [] }); },
      followUp: () => Promise.resolve({ success: true, text: '<replacement>fallback</replacement>', toolCalls: [] }),
      cancel() { /* no-op */ },
      dispose: () => Promise.resolve(),
    };
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await service.submit({
      kind: 'cursor-inline',
      instruction: 'OCR this',
      notePath: 'a.md',
      line: 3,
      before: 'The formula ',
      after: ' continues.',
    }, { images: [{ mediaType: 'image/png', data: 'aGVsbG8=' }] });
    expect(received[0]).toContain('$…$');
    expect(received[0]).not.toContain('$$…$$');
    await service.dispose();
  });

  it('omits images and the note for text-only turns', async () => {
    const received: { prompt: string; images?: readonly unknown[] }[] = [];
    const session: AuxQuerySession = {
      queryId: 'test',
      safety: SAFETY,
      query(request) { received.push({ prompt: request.prompt, images: request.images }); return Promise.resolve({ success: true, text: '<replacement>ok</replacement>', toolCalls: [] }); },
      followUp: () => Promise.resolve({ success: true, text: '<replacement>fallback</replacement>', toolCalls: [] }),
      cancel() { /* no-op */ },
      dispose: () => Promise.resolve(),
    };
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await service.submit(selectionRequest);
    expect(received[0]?.images).toBeUndefined();
    expect(received[0]?.prompt).not.toContain('Image input');
    await service.dispose();
  });

  it('forwards onTextChunk to the turn request for streaming previews', async () => {
    const session: AuxQuerySession = {
      queryId: 'test',
      safety: SAFETY,
      query(request) {
        request.onTextChunk?.('<replacement>par');
        request.onTextChunk?.('<replacement>partial');
        return Promise.resolve({ success: true, text: '<replacement>partial</replacement>', toolCalls: [] });
      },
      followUp: () => Promise.resolve({ success: true, text: '<replacement>fallback</replacement>', toolCalls: [] }),
      cancel() { /* no-op */ },
      dispose: () => Promise.resolve(),
    };
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const chunks: string[] = [];
    const outcome = await service.submit(selectionRequest, {
      onTextChunk: (accumulated) => { chunks.push(accumulated); },
    });
    expect(chunks).toEqual(['<replacement>par', '<replacement>partial']);
    // The final outcome is still the strict parse of the full text.
    expect(outcome).toEqual({ status: 'preview', mode: 'replacement', text: 'partial' });
    await service.dispose();
  });

  it('clears nothing itself but reports the strict error when streaming and strict disagree', async () => {
    // Streaming rendered a tag body, but the strict parse of the full text
    // fails (two tags): the service must surface the strict error, not the
    // streamed preview (R-A3 需求 4 — the controller clears the preview).
    const session: AuxQuerySession = {
      queryId: 'test',
      safety: SAFETY,
      query(request) {
        request.onTextChunk?.('<replacement>one</replacement>');
        return Promise.resolve({
          success: true,
          text: '<replacement>one</replacement><replacement>two</replacement>',
          toolCalls: [],
        });
      },
      followUp: () => Promise.resolve({ success: true, text: '<replacement>fallback</replacement>', toolCalls: [] }),
      cancel() { /* no-op */ },
      dispose: () => Promise.resolve(),
    };
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const outcome = await service.submit(selectionRequest);
    expect(outcome).toEqual({ status: 'error', reason: 'multiple-tags' });
    await service.dispose();
  });
});
