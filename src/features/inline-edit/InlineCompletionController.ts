/**
 * InlineCompletionController — the per-editor state machine behind R-C3.
 *
 * One warm pool (`InlineCompletionService`) serves every editor; this
 * controller owns the editor-side state that makes the interaction correct:
 *
 * - a **generation counter per editor view** (design §3.2.5): every trigger
 *   bumps it, every cancel bumps it, and any response (final or streamed
 *   chunk) whose generation is no longer current is dropped. Together with
 *   the turn `AbortSignal` this is the double guard against a late backend
 *   response overwriting a ghost the user already moved past (acceptance 2);
 * - the trigger precondition chain in cost order: enabled → no active inline
 *   edit (the two features never share an editor state, §3.2.7) → not
 *   composing (IME) → not readOnly → the editor has a host note;
 * - the accept path: one dispatched transaction inserts the suggestion and
 *   clears the ghost (single undo step, acceptance 3), and only after a
 *   position/prefix re-check proves the document still matches the request
 *   (design §4.2);
 * - Esc dismisses: effect clear + abort, zero document change (acceptance 4).
 *
 * The controller never talks to a backend directly — the pool hands out the
 * audited warm session, and every turn's observed tool calls go through the
 * shared `findWriteToolCalls` audit.
 */

import type { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';

import { findWriteToolCalls } from '../../core/agents/backend/AgentAuxQueryCapability';
import { t } from '../../i18n';
import {
  applyInlineCompletionGhostEffect,
  ensureInlineCompletionGhostField,
  readInlineCompletionGhost,
  setInlineCompletionGhost,
} from './InlineCompletionGhost';
import {
  buildInlineCompletionWindows,
  inlineCompletionPrefixTail,
  validateCompletion,
} from './InlineCompletionPrompt';
import type {
  InlineCompletionPoolError,
  InlineCompletionService,
} from './InlineCompletionService';
import { getEditorView } from './InlineEditEditorView';

export interface InlineCompletionControllerOptions {
  readonly pool: InlineCompletionService;
  /** Whether `inlineCompletionEnabled` is on (same gate the extension uses). */
  readonly isEnabled: () => boolean;
  /** True while any inline edit is active in any editor (mutual exclusion). */
  readonly hasActiveInlineEdits: () => boolean;
  /** Surfaces user-visible messages; injectable so tests do not need Obsidian. */
  readonly notify?: (message: string) => void;
}

/** Editor-side state for the in-flight (or last finished) request. */
interface CompletionViewState {
  generation: number;
  abort: AbortController | null;
}

const INITIAL_VIEW_STATE: CompletionViewState = { generation: 0, abort: null };

export class InlineCompletionController {
  private readonly views = new WeakMap<EditorView, CompletionViewState>();

  constructor(private readonly options: InlineCompletionControllerOptions) {}

  /**
   * Trigger one completion at the cursor (Alt gesture or the bound command).
   *
   * Every precondition failure is a silent no-op — a trigger that cannot run
   * must never disturb typing. Failures after a session exists (start
   * failures, unsupported backends) surface honestly through the pool.
   */
  trigger(editor: Editor, notePath: string): void {
    if (!this.options.isEnabled()) return;
    if (this.options.hasActiveInlineEdits()) return;
    const view = getEditorView(editor);
    if (!view) return;
    if (view.composing) return;
    if (view.state.readOnly) return;
    if (!notePath) return;

    // A new trigger cancels any in-flight request and any live ghost first.
    this.cancelForView(view);
    ensureInlineCompletionGhostField(view);
    const state = this.stateFor(view);
    state.generation += 1;
    const generation = state.generation;
    const pos = view.state.selection.main.head;
    const { prefix, suffix } = buildInlineCompletionWindows(
      view.state.doc.toString(),
      pos,
    );
    const prefixTail = inlineCompletionPrefixTail(prefix);
    const abort = new AbortController();
    state.abort = abort;

    void this.runTurn(view, {
      generation,
      abort,
      pos,
      prefix,
      suffix,
      prefixTail,
      notePath,
    });
  }

  /**
   * Cancel the in-flight request and clear the ghost for one view.
   *
   * Called for typing (any document change), selection movement, Esc, and a
   * fresh trigger. Idempotent, and safe on views without state.
   */
  cancelForView(view: EditorView): void {
    const state = this.views.get(view);
    if (state) {
      // The counter makes any late turn result stale even if the backend
      // misses the abort (design §3.2.5 — the double guard).
      state.generation += 1;
      state.abort?.abort();
      state.abort = null;
    }
    if (readInlineCompletionGhost(view.state)) {
      applyInlineCompletionGhostEffect(view, setInlineCompletionGhost.of(null));
    }
  }

  /**
   * Document changed or selection moved (ghost extension update listener):
   * same cancellation path as typing.
   */
  onEditorActivity(view: EditorView): void {
    this.cancelForView(view);
  }

  /**
   * Tab with a live ghost: insert the suggestion in one dispatched
   * transaction (single undo step) and clear the ghost in the same
   * transaction. Returns whether the key was consumed.
   */
  accept(view: EditorView): boolean {
    const ghost = readInlineCompletionGhost(view.state);
    if (!ghost) return false;
    // §4.2: the suggestion is only inserted when the document still ends the
    // way it did when the request was built. Any drift drops the suggestion —
    // never append text at a position whose context has moved.
    if (ghost.pos < 0 || ghost.pos > view.state.doc.length) {
      this.cancelForView(view);
      return true;
    }
    const currentTail = view.state.doc.sliceString(
      Math.max(0, ghost.pos - ghost.prefixTail.length),
      ghost.pos,
    );
    if (currentTail !== ghost.prefixTail) {
      this.cancelForView(view);
      return true;
    }
    view.dispatch({
      changes: { from: ghost.pos, insert: ghost.text },
      selection: { anchor: ghost.pos + ghost.text.length },
      effects: setInlineCompletionGhost.of(null),
      userEvent: 'input.complete',
    });
    return true;
  }

  /**
   * Esc with a live ghost: dismiss only — the document is untouched
   * (acceptance 4). Returns whether the key was consumed.
   */
  dismiss(view: EditorView): boolean {
    const ghost = readInlineCompletionGhost(view.state);
    if (!ghost) return false;
    this.cancelForView(view);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private stateFor(view: EditorView): CompletionViewState {
    let state = this.views.get(view);
    if (!state) {
      state = { generation: INITIAL_VIEW_STATE.generation, abort: null };
      this.views.set(view, state);
    }
    return state;
  }

  private isStale(view: EditorView, generation: number): boolean {
    return this.views.get(view)?.generation !== generation;
  }

  private async runTurn(
    view: EditorView,
    request: {
      readonly generation: number;
      readonly abort: AbortController;
      readonly pos: number;
      readonly prefix: string;
      readonly suffix: string;
      readonly prefixTail: string;
      readonly notePath: string;
    },
  ): Promise<void> {
    const obtained = await this.options.pool.obtain();
    if (this.isStale(view, request.generation)) return;
    if (!obtained.ok) {
      this.reportPoolError(obtained.error);
      return;
    }
    const { session, maxChars, backend, displayName } = obtained;
    let result: Awaited<ReturnType<typeof session.complete>>;
    try {
      result = await session.complete({
        prefix: request.prefix,
        suffix: request.suffix,
        maxChars,
        signal: request.abort.signal,
        onTextChunk: (accumulated) => {
          // Progressive ghost: every chunk is stale-checked, validated, and
          // position-checked exactly like a final result (first chunk = first
          // byte of the latency budget).
          if (this.isStale(view, request.generation)) return;
          this.showValidated(view, request, accumulated, maxChars);
        },
      });
    } catch {
      // A rejecting turn is handled like a failed one: no suggestion, the
      // pool's failure chain decides whether the session stays warm.
      if (!request.abort.signal.aborted && !this.isStale(view, request.generation)) {
        this.options.pool.reportTurnFailure(backend);
      }
      return;
    }
    if (this.isStale(view, request.generation)) return;
    if (!result.ok) {
      if (!result.cancelled) {
        this.options.pool.reportTurnFailure(backend);
      }
      return;
    }
    this.options.pool.reportTurnSuccess(backend);

    // Per-turn write audit (design §3.2.3): a completion turn must observe
    // zero write-class tools. A violation discards the suggestion, disposes
    // the session, and marks the backend unsupported — honestly, with a
    // notice. The ghost never entered the document, so nothing else is needed.
    const violations = findWriteToolCalls(result.toolCalls);
    if (violations.length > 0) {
      this.options.pool.reportWriteToolViolation(backend, displayName, violations);
      return;
    }
    this.showValidated(view, request, result.text, maxChars);
  }

  /** Validate and display one candidate (final or streamed), stale-checked. */
  private showValidated(
    view: EditorView,
    request: {
      readonly generation: number;
      readonly pos: number;
      readonly prefixTail: string;
    },
    text: string,
    maxChars: number,
  ): void {
    if (this.isStale(view, request.generation)) return;
    const validated = validateCompletion({
      prefixTail: request.prefixTail,
      text,
      maxChars,
    });
    // Rejections are silent by design (low-interruption interaction); the
    // renderer simply shows nothing for this candidate.
    if (!validated.ok) return;
    if (this.cursorDrifted(view, request.pos, request.prefixTail)) return;
    const state = this.views.get(view);
    if (state) state.abort = null;
    applyInlineCompletionGhostEffect(view, setInlineCompletionGhost.of({
      pos: request.pos,
      text: validated.text,
      prefixTail: request.prefixTail,
    }));
  }

  /**
   * True when the document around the request position changed since the
   * request was built — the same check the accept path performs, applied
   * before showing a candidate so a stale ghost never appears at all.
   */
  private cursorDrifted(view: EditorView, pos: number, prefixTail: string): boolean {
    if (pos < 0 || pos > view.state.doc.length) return true;
    const currentTail = view.state.doc.sliceString(
      Math.max(0, pos - prefixTail.length),
      pos,
    );
    return currentTail !== prefixTail;
  }

  private reportPoolError(error: InlineCompletionPoolError): void {
    switch (error.reason) {
      case 'unsupported':
        this.notify(t('inlineCompletion.error.unsupported', { backend: error.backend }));
        return;
      case 'capability-unavailable':
        this.notify(t('inlineCompletion.error.capabilityUnavailable'));
        return;
      case 'model-unavailable':
        this.notify(t('inlineEdit.error.modelUnavailable') + (error.detail ? ` ${error.detail}` : ''));
        return;
      default:
        // 'disabled' (gated path — silent) and 'session-unavailable'
        // (already noticed by the pool) stay silent here.
        return;
    }
  }

  private notify(message: string): void {
    this.options.notify?.(message);
  }
}
