import { describe, expect, it } from '@jest/globals';

import {
  createInlineEditStreamBatcher,
  createInlineEditStreamSession,
  type InlineEditFrameScheduler,
  parseInlineEditStream,
} from '../../../../src/features/inline-edit/InlineEditStreamPreview';

/** Manual-frame scheduler: the test decides when a frame fires. */
function manualScheduler() {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  const scheduler: InlineEditFrameScheduler = {
    schedule: (cb) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancel: (id) => { pending.delete(id); },
  };
  return {
    scheduler,
    fire(): boolean {
      const entry = pending.entries().next();
      if (entry.done) return false;
      pending.delete(entry.value[0]);
      entry.value[1]();
      return true;
    },
    pendingCount: () => pending.size,
  };
}

describe('parseInlineEditStream', () => {
  it('reports preamble before any tag arrives', () => {
    expect(parseInlineEditStream('')).toEqual({ kind: 'preamble' });
    expect(parseInlineEditStream('Sure, rewriting')).toEqual({ kind: 'preamble' });
    expect(parseInlineEditStream('2 < 3 and prose')).toEqual({ kind: 'preamble' });
  });

  it('enters streaming mode once an open tag arrives, accumulating the body', () => {
    expect(parseInlineEditStream('<replacement>hello')).toEqual({
      kind: 'streaming', mode: 'replacement', text: 'hello', closed: false,
    });
    expect(parseInlineEditStream('<insertion>new line')).toEqual({
      kind: 'streaming', mode: 'insertion', text: 'new line', closed: false,
    });
  });

  it('marks the body closed when the matching closing tag arrives', () => {
    expect(parseInlineEditStream('<replacement>hello</replacement>')).toEqual({
      kind: 'streaming', mode: 'replacement', text: 'hello', closed: true,
    });
    // Trailing prose after the close tag is ignored by the strict parser and
    // by the progressive one.
    const withTrailing = parseInlineEditStream('<insertion>x</insertion> done');
    expect(withTrailing).toEqual({
      kind: 'streaming', mode: 'insertion', text: 'x', closed: true,
    });
  });

  it('holds back a trailing partial tag token instead of rendering it', () => {
    expect(parseInlineEditStream('<repl')).toEqual({ kind: 'preamble' });
    expect(parseInlineEditStream('<replacement>abc<')).toEqual({
      kind: 'streaming', mode: 'replacement', text: 'abc', closed: false,
    });
    expect(parseInlineEditStream('<replacement>abc</re')).toEqual({
      kind: 'streaming', mode: 'replacement', text: 'abc', closed: false,
    });
  });

  it('flags two openings as a multiple-tags violation', () => {
    expect(parseInlineEditStream('<replacement>a</replacement><replacement>b')).toEqual({
      kind: 'violation', error: 'multiple-tags',
    });
  });

  it('flags a mismatched second tag as a violation', () => {
    expect(parseInlineEditStream('<replacement>a<insertion>b</insertion>')).toEqual({
      kind: 'violation', error: 'multiple-tags',
    });
  });

  it('flags a closing tag with no opener as malformed', () => {
    expect(parseInlineEditStream('</replacement>oops')).toEqual({
      kind: 'violation', error: 'malformed-tag',
    });
  });

  it('stays consistent with the strict parser on complete one-tag responses', () => {
    // Every text the progressive parser reports as a complete tag must also
    // pass the strict parser — the strict result is what gets applied.
    const { parseInlineEditResponse } = jest.requireActual<typeof import('../../../../src/features/inline-edit/InlineEditPrompt')>(
      '../../../../src/features/inline-edit/InlineEditPrompt',
    );
    const samples = [
      '<replacement>hello</replacement>',
      'preamble <replacement> multi\nline </replacement> trailing',
      '<insertion>$$E=mc^2$$</insertion>',
    ];
    for (const sample of samples) {
      const progressive = parseInlineEditStream(sample);
      expect(progressive.kind).toBe('streaming');
      if (progressive.kind !== 'streaming') continue;
      expect(progressive.closed).toBe(true);
      const strict = parseInlineEditResponse(sample);
      expect(strict.kind).toBe(progressive.mode);
    }
  });
});

describe('createInlineEditStreamBatcher', () => {
  it('coalesces many notifications into one dispatch per frame', () => {
    const frames = manualScheduler();
    const dispatches: number[] = [];
    const batcher = createInlineEditStreamBatcher(frames.scheduler, () => { dispatches.push(1); });
    for (let i = 0; i < 1000; i++) batcher.notify();
    expect(dispatches).toHaveLength(0);
    expect(frames.fire()).toBe(true);
    expect(dispatches).toHaveLength(1);
    // A second burst schedules exactly one more frame.
    for (let i = 0; i < 500; i++) batcher.notify();
    expect(frames.fire()).toBe(true);
    expect(dispatches).toHaveLength(2);
  });

  it('flush dispatches a pending frame immediately', () => {
    const frames = manualScheduler();
    let count = 0;
    const batcher = createInlineEditStreamBatcher(frames.scheduler, () => { count += 1; });
    batcher.notify();
    batcher.flush();
    expect(count).toBe(1);
    expect(frames.pendingCount()).toBe(0);
  });

  it('cancel drops the pending frame without dispatching', () => {
    const frames = manualScheduler();
    let count = 0;
    const batcher = createInlineEditStreamBatcher(frames.scheduler, () => { count += 1; });
    batcher.notify();
    batcher.cancel();
    expect(frames.fire()).toBe(false);
    expect(count).toBe(0);
  });
});

describe('createInlineEditStreamSession', () => {
  it('routes pre-tag text to the reply channel and tag bodies to the preview channel', () => {
    const frames = manualScheduler();
    const replies: string[] = [];
    const previews: Array<{ mode: string; text: string }> = [];
    const session = createInlineEditStreamSession({
      onReply: (text) => { replies.push(text); },
      onPreview: (mode, text) => { previews.push({ mode, text }); },
    }, frames.scheduler);

    session.handleChunk('Let me ');
    session.handleChunk('Let me think');
    expect(frames.fire()).toBe(true);
    expect(replies).toEqual(['Let me think']);

    session.handleChunk('<replacement>par');
    session.handleChunk('<replacement>partial text');
    expect(frames.fire()).toBe(true);
    expect(previews).toEqual([{ mode: 'replacement', text: 'partial text' }]);
  });

  it('freezes on a protocol violation, keeping the last good frame', () => {
    const frames = manualScheduler();
    const previews: string[] = [];
    const session = createInlineEditStreamSession({
      onReply: () => { /* unused */ },
      onPreview: (_mode, text) => { previews.push(text); },
    }, frames.scheduler);

    session.handleChunk('<replacement>first</replacement>');
    expect(frames.fire()).toBe(true);
    // Second tag arrives: violation — further chunks schedule no further
    // frames and the last good frame stays on screen.
    session.handleChunk('<replacement>first</replacement><replacement>second');
    session.handleChunk('<replacement>first</replacement><replacement>second</replacement>');
    expect(frames.fire()).toBe(false);
    expect(previews).toEqual(['first']);
  });

  it('dispose cancels a pending frame (no residual render after cancel)', () => {
    const frames = manualScheduler();
    let count = 0;
    const session = createInlineEditStreamSession({
      onReply: () => { count += 1; },
      onPreview: () => { count += 1; },
    }, frames.scheduler);
    session.handleChunk('<insertion>x');
    session.dispose();
    expect(frames.fire()).toBe(false);
    expect(count).toBe(0);
  });
});
