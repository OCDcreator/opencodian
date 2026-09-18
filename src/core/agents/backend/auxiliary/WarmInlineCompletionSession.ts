/**
 * WarmInlineCompletionSession — the shared warm lifecycle over an aux session.
 *
 * R-C3 needs sessions that stay alive across turns (prewarm + TTL) while every
 * turn keeps aux's cold, stateless request semantics. Instead of four per-
 * backend re-implementations, each backend adapter builds its existing,
 * audited `AuxQuerySession` (OpenCode isolated scope, Claude tools allowlist +
 * `system/init` readback, Codex read-only sandbox, Pi `set_tools` readback)
 * and this wrapper adds only the lifecycle pieces the aux contract does not
 * have:
 *
 * - turn serialization: a new `complete()` waits for the previous turn to
 *   settle. Aborted turns settle quickly, so cancel-then-retrigger pacing
 *   never blocks on a full turn;
 * - `reset()`: disposes the native session and rebuilds it through the
 *   adapter-supplied factory, so no server-side residue survives a note or
 *   model switch (design §3.2 invariant 1);
 * - the shared completion turn-prompt, so the wire format is identical on all
 *   four backends.
 *
 * The read-only mechanisms live entirely in the aux sessions and are reused,
 * not copied: the `AuxQuerySafetyProof` passes through untouched, and every
 * observed tool call is surfaced for the feature layer's `findWriteToolCalls`
 * audit. Nothing here can widen what a session may do.
 *
 * See docs/requirements/flowtext-c3-design.md §3.2.
 */

import type { AgentBackendKind } from '../../../types/chat';
import type { AuxQuerySession } from '../AgentAuxQueryCapability';
import type {
  InlineCompletionSession,
  InlineCompletionTurnRequest,
  InlineCompletionTurnResult,
} from '../AgentInlineCompletionCapability';
import { buildInlineCompletionTurnPrompt } from '../AgentInlineCompletionCapability';

/**
 * Aux sessions that can start their native runtime eagerly expose `warmUp`.
 * Claude spawns its CLI lazily on the first turn; a prewarm that never starts
 * the process would leave the full cold start inside the trigger path, so the
 * completion wrapper calls this when present (additive, enforcement-neutral).
 */
export type WarmableAuxSession = AuxQuerySession & { warmUp?: () => void };

export interface WarmInlineCompletionSessionOptions {
  readonly backend: AgentBackendKind;
  /** The initial, already-constructed aux session (ownership moves here). */
  readonly session: WarmableAuxSession;
  /**
   * Rebuild an equivalent aux session for `reset()`. Must use the same
   * read-only configuration as the original construction.
   */
  readonly recreate: () => Promise<WarmableAuxSession>;
}

export class WarmInlineCompletionSession implements InlineCompletionSession {
  readonly queryId: string;

  private current: WarmableAuxSession;
  private tail: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private resetting = false;

  private constructor(
    private readonly options: WarmInlineCompletionSessionOptions,
    initial: WarmableAuxSession,
  ) {
    this.current = initial;
    this.queryId = `warm-${options.backend}-${initial.queryId}`;
  }

  static create(options: WarmInlineCompletionSessionOptions): WarmInlineCompletionSession {
    // Prewarm benefit: start the native runtime eagerly when the underlying
    // session supports that (Claude) — the trigger path then pays neither
    // spawn nor handshake.
    options.session.warmUp?.();
    return new WarmInlineCompletionSession(options, options.session);
  }

  get safety(): WarmableAuxSession['safety'] {
    return this.current.safety;
  }

  async complete(request: InlineCompletionTurnRequest): Promise<InlineCompletionTurnResult> {
    // Serialize behind the previous turn. A cancelled turn settles as soon as
    // its transport unwinds; this only ever waits for cleanup, not for a full
    // generation, and the feature layer's generation counter discards stale
    // results regardless of ordering.
    const run = this.tail.then(() => this.runTurn(request));
    const settle = run.then(
      () => undefined,
      () => undefined,
    );
    this.tail = settle;
    return run;
  }

  async reset(): Promise<void> {
    if (this.disposed || this.resetting) return;
    this.resetting = true;
    const previous = this.current;
    // Wait for the tail so the old session's in-flight turn cannot race the
    // dispose, then rebuild through the adapter's own (read-only) factory.
    await this.tail;
    if (this.disposed) {
      this.resetting = false;
      return;
    }
    try {
      const next = await this.options.recreate();
      next.warmUp?.();
      this.current = next;
    } finally {
      this.resetting = false;
    }
    await previous.dispose().catch(() => { /* Old session teardown is best effort. */ });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const session = this.current;
    this.current = disposedSession(this.options.backend, session.queryId);
    await this.tail;
    await session.dispose().catch(() => { /* Native teardown is best effort. */ });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async runTurn(request: InlineCompletionTurnRequest): Promise<InlineCompletionTurnResult> {
    const session = this.current;
    if (this.disposed) {
      return { ok: false, error: 'Inline completion session is closed.', cancelled: true };
    }
    const result = await session.query({
      prompt: buildInlineCompletionTurnPrompt(request),
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.onTextChunk ? { onTextChunk: request.onTextChunk } : {}),
    });
    if (!result.success) {
      return {
        ok: false,
        error: result.error,
        ...(result.cancelled ? { cancelled: true } : {}),
      };
    }
    return { ok: true, text: result.text, toolCalls: result.toolCalls };
  }
}

/** Placeholder that keeps `this.current` non-null between swap and dispose. */
function disposedSession(backend: AgentBackendKind, queryId: string): WarmableAuxSession {
  const message = `${backend} inline completion session is disposed.`;
  return {
    queryId,
    safety: {
      backend,
      enforcedPolicy: 'none',
      effectiveTools: [],
      deniedCapabilities: [],
      mechanism: 'disposed placeholder (never used for turns)',
    },
    query: () => Promise.resolve({ success: false, error: message, cancelled: true }),
    followUp: () => Promise.resolve({ success: false, error: message, cancelled: true }),
    cancel: () => { /* nothing in flight */ },
    dispose: () => Promise.resolve(),
  };
}
