/**
 * InlineEditStreamPreview — progressive parsing and throttled rendering for
 * the streaming diff preview (docs/requirements/flowtext-parity.md R-A3).
 *
 * The XML tag protocol is ambiguous mid-stream: until the closing tag
 * arrives, the model may still complete it, add a second tag, or never tag at
 * all (clarification). This module holds the *render-only* interpretation of
 * the accumulated text:
 *
 * - `parseInlineEditStream` classifies the accumulated text into preamble
 *   (spinner), streaming tag body, or a protocol violation, holding back a
 *   trailing partial tag token so `<repl` never renders as body text.
 * - `createInlineEditStreamBatcher` coalesces chunk notifications into at
 *   most one dispatch per animation frame, so a 1000-chunk turn dispatches
 *   ~60 decoration updates, not 1000.
 * - `InlineEditStreamSession` combines both for one generating turn: chunks
 *   update the parse state, a per-frame flush pushes the current state to the
 *   preview channel (tag body) or the reply channel (plain text), and a
 *   detected violation freezes the last good frame — the strict
 *   `parseInlineEditResponse()` at turn end stays the only authority for
 *   what gets written, so a frozen or divergent preview can never be applied.
 *
 * Everything here is pure (no CM6, no Obsidian) so the whole streaming state
 * machine is unit-testable.
 */

/** Progressive parse states for the accumulated model text. */
export type InlineEditStreamState =
  | { readonly kind: 'preamble' }
  | {
    readonly kind: 'streaming';
    readonly mode: 'replacement' | 'insertion';
    /** Tag body so far (safe-cut; trailing partial tokens held back). */
    readonly text: string;
    /** True once the matching closing tag has arrived (body is final). */
    readonly closed: boolean;
  }
  | { readonly kind: 'violation'; readonly error: 'multiple-tags' | 'malformed-tag' };

/** Complete protocol tag tokens, used for the trailing-partial holdback. */
const TAG_TOKENS: readonly string[] = [
  '<replacement>',
  '<insertion>',
  '</replacement>',
  '</insertion>',
];

const TAG_SCAN = /<(\/?)(replacement|insertion)>/g;

/**
 * Length of `text` that is safe to scan for tag tokens: a trailing fragment
 * that is a strict prefix of a possible tag token is held back (it may still
 * become a tag on the next chunk). Anything from `<` that cannot grow into a
 * token is scanned as ordinary text.
 */
function findSafeScanEnd(text: string): number {
  const lt = text.lastIndexOf('<');
  if (lt < 0) return text.length;
  const tail = text.slice(lt);
  const partial = TAG_TOKENS.some((token) => token.startsWith(tail) && token !== tail);
  return partial ? lt : text.length;
}

/**
 * Progressively classify the accumulated model text.
 *
 * Deliberately consistent with the strict parser
 * (`parseInlineEditResponse`, InlineEditPrompt.ts): every violation state
 * here maps to a strict-parse error, and any text this function reports as a
 * complete tag also parses as one tag strictly. Differences only ever resolve
 * in favor of the strict parser at turn end.
 */
export function parseInlineEditStream(accumulated: string): InlineEditStreamState {
  const scanEnd = findSafeScanEnd(accumulated);
  const region = accumulated.slice(0, scanEnd);
  const tokens = [...region.matchAll(TAG_SCAN)];
  if (tokens.length === 0) {
    return { kind: 'preamble' };
  }
  const first = tokens[0];
  if (first[1] === '/') {
    // A closing tag with no opening tag: strict parse reports malformed-tag.
    return { kind: 'violation', error: 'malformed-tag' };
  }
  if (tokens.length === 1) {
    return {
      kind: 'streaming',
      mode: first[2] as 'replacement' | 'insertion',
      text: region.slice((first.index ?? 0) + first[0].length),
      closed: false,
    };
  }
  const second = tokens[1];
  if (tokens.length === 2 && second[1] === '/' && second[2] === first[2]) {
    // Exactly one open + matching close: strict parse accepts this.
    return {
      kind: 'streaming',
      mode: first[2] as 'replacement' | 'insertion',
      text: region.slice((first.index ?? 0) + first[0].length, second.index ?? 0),
      closed: true,
    };
  }
  // Two openings, mismatched open/close, or more than two tokens: strict
  // parse reports multiple-tags (or malformed-tag for ordering issues) — all
  // are "several protocol tags", which is the surface the requirement names.
  return { kind: 'violation', error: 'multiple-tags' };
}

// -----------------------------------------------------------------------------
// rAF batching
// -----------------------------------------------------------------------------

/** Frame scheduling seam; the renderer passes rAF, tests pass a fake. */
export interface InlineEditFrameScheduler {
  schedule(callback: () => void): number;
  cancel(id: number): void;
}

/** Browser scheduler; falls back to a 16ms timer where rAF is unavailable. */
export function inlineEditFrameScheduler(host: {
  requestAnimationFrame?: (cb: () => void) => number;
  cancelAnimationFrame?: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}): InlineEditFrameScheduler {
  if (typeof host.requestAnimationFrame === 'function'
    && typeof host.cancelAnimationFrame === 'function') {
    return {
      schedule: (cb) => host.requestAnimationFrame!(cb),
      cancel: (id) => host.cancelAnimationFrame!(id),
    };
  }
  return {
    schedule: (cb) => host.setTimeout(cb, 16) as number,
    cancel: (id) => host.clearTimeout(id),
  };
}

/**
 * Coalesce stream notifications into at most one `dispatch` per frame.
 *
 * Chunks arrive on backend pacing (per token for Codex, per message for the
 * others); decoration updates must never follow chunk pacing, so every chunk
 * only marks the frame dirty and the scheduled frame performs the single
 * batched dispatch.
 */
export function createInlineEditStreamBatcher(
  scheduler: InlineEditFrameScheduler,
  dispatch: () => void,
): {
  /** Mark dirty; schedules a dispatch when none is pending. */
  notify(): void;
  /** Dispatch immediately when a frame is pending (turn end, close). */
  flush(): void;
  /** Drop a pending frame without dispatching (cancel / teardown). */
  cancel(): void;
} {
  let scheduled = false;
  let frameId: number | null = null;

  const run = (): void => {
    frameId = null;
    if (!scheduled) return;
    scheduled = false;
    dispatch();
  };

  return {
    notify() {
      if (scheduled) return;
      scheduled = true;
      frameId = scheduler.schedule(run);
    },
    flush() {
      if (!scheduled) return;
      scheduled = false;
      if (frameId !== null) {
        scheduler.cancel(frameId);
        frameId = null;
      }
      dispatch();
    },
    cancel() {
      scheduled = false;
      if (frameId !== null) {
        scheduler.cancel(frameId);
        frameId = null;
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Per-turn streaming session
// -----------------------------------------------------------------------------

/** Render sinks for one generating turn. */
export interface InlineEditStreamHandlers {
  /** Preamble plain text streams into the reply area above the input. */
  onReply(text: string): void;
  /** A tag body streams into the editor preview channel (busy = generating). */
  onPreview(mode: 'replacement' | 'insertion', text: string): void;
}

export interface InlineEditStreamSession {
  /** Feed one accumulated-text chunk from the backend. */
  handleChunk(accumulated: string): void;
  /** Dispatch any pending frame now (turn settled; final UI takes over). */
  flush(): void;
  /** Drop any pending frame without dispatching. */
  dispose(): void;
}

/**
 * One streaming turn: parse state + frame batching.
 *
 * Violations freeze the last good frame instead of clearing it mid-turn — the
 * turn-end strict parse decides the outcome, and the controller clears the
 * preview only then (docs/requirements/flowtext-parity.md R-A3 需求 4).
 */
export function createInlineEditStreamSession(
  handlers: InlineEditStreamHandlers,
  scheduler: InlineEditFrameScheduler,
): InlineEditStreamSession {
  let state: InlineEditStreamState = { kind: 'preamble' };
  let frozen = false;
  let latestAccumulated = '';
  const batcher = createInlineEditStreamBatcher(scheduler, () => {
    if (state.kind === 'preamble') {
      handlers.onReply(latestAccumulated);
      return;
    }
    if (state.kind === 'streaming') {
      handlers.onPreview(state.mode, state.text);
    }
  });

  return {
    handleChunk(accumulated: string) {
      if (frozen) return;
      latestAccumulated = accumulated;
      const next = parseInlineEditStream(accumulated);
      if (next.kind === 'violation') {
        frozen = true;
        return;
      }
      state = next;
      batcher.notify();
    },
    flush() {
      batcher.flush();
    },
    dispose() {
      batcher.cancel();
    },
  };
}
