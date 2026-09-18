/**
 * InlineCompletionGhost — the CodeMirror 6 ghost-text layer for R-C3.
 *
 * The decoration contract has two load-bearing rules
 * (docs/requirements/flowtext-c3-design.md §3.3):
 *
 * 1. The suggestion renders as a `Decoration.widget` (side 1) **only**. It is
 *    never a `Decoration.replace`: a replace would move the document text the
 *    user sees, corrupt the undo stack, and break the snapshot dirty checks
 *    the rest of this feature relies on. The ghost lives outside the document.
 * 2. `EditorView.atomicRanges` covers the suggestion's extent so the cursor
 *    cannot come to rest "inside" the suggestion: ArrowLeft/ArrowRight skip
 *    over it and Backspace/Delete act on the document text before it. The
 *    atomic facet is display-independent — it carries invisible `mark` ranges
 *    over the ghost's extent (a point widget decoration is zero-width and
 *    would never satisfy CM6's `pos > from && pos < to` skip test), so no
 *    replace decoration is created anywhere.
 *
 * Any document change or selection movement clears the ghost at the
 * state-field level, so a stale suggestion can never outlive the text it was
 * built from. The controller learns about the same events through
 * `onEditorActivity` and cancels the in-flight request (abort + generation
 * counter) there.
 */

import type { Extension } from '@codemirror/state';
import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { Decoration, EditorView, keymap, WidgetType } from '@codemirror/view';

import { AltSoloGestureTracker } from './InlineCompletionTrigger';

/** CSS class of the ghost widget span (see src/style/features/inline-edit.css). */
export const INLINE_COMPLETION_GHOST_CLASS = 'cm-inline-completion-ghost';

/** Everything stored for one live suggestion. */
export interface InlineCompletionGhostPayload {
  /** Document position the suggestion continues from. */
  readonly pos: number;
  /** Validated suggestion text (already capped and audited). */
  readonly text: string;
  /**
   * Tail of the prefix the request was built from — the accept path
   * re-checks it so a document that changed since the request is never
   * appended to (design §4.2), matching the typing-race generation counter.
   */
  readonly prefixTail: string;
}

/** Set (payload) or clear (null) the ghost suggestion in one editor. */
export const setInlineCompletionGhost = StateEffect.define<InlineCompletionGhostPayload | null>();

interface InlineCompletionGhostState {
  readonly ghost: InlineCompletionGhostPayload | null;
}

const EMPTY_GHOST_STATE: InlineCompletionGhostState = { ghost: null };

const inlineCompletionGhostField = StateField.define<InlineCompletionGhostState>({
  create: () => EMPTY_GHOST_STATE,
  update: (state, transaction) => {
    // Any document change or explicit selection update drops the suggestion
    // before the effects are applied; a fresh set-effect in the same
    // transaction still wins (Tab's accept transaction clears this way, and
    // so does re-trigger).
    let ghost = transaction.docChanged || transaction.selection !== undefined ? null : state.ghost;
    for (const effect of transaction.effects) {
      if (effect.is(setInlineCompletionGhost)) ghost = effect.value;
    }
    if (ghost && (ghost.pos < 0 || ghost.pos > transaction.state.doc.length)) ghost = null;
    if (ghost === state.ghost) return state;
    return { ghost };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => ghostDecorations(value)),
    // The atomic marker ranges are display-independent: invisible mark
    // decorations over the suggestion's extent (see module doc, rule 2).
    EditorView.atomicRanges.from(field, (value) => () => ghostAtomicRanges(value)),
  ],
});

/** The field, exported for contract tests (state-level assertions). */
export const inlineCompletionGhostFieldForTests = inlineCompletionGhostField;

/** Inject the ghost field into an editor the first time it is used. */
export function ensureInlineCompletionGhostField(view: EditorView): void {
  if (view.state.field(inlineCompletionGhostField, false)) return;
  view.dispatch({ effects: StateEffect.appendConfig.of(inlineCompletionGhostField) });
}

/** Dispatch a ghost effect into an editor that has the field. */
export function applyInlineCompletionGhostEffect(
  view: EditorView,
  effect: StateEffect<unknown>,
): void {
  if (!view.state.field(inlineCompletionGhostField, false)) return;
  view.dispatch({ effects: effect });
}

/** The live suggestion in this editor state, if any. */
export function readInlineCompletionGhost(state: EditorState): InlineCompletionGhostPayload | null {
  return state.field(inlineCompletionGhostField, false)?.ghost ?? null;
}

// -----------------------------------------------------------------------------
// Decoration builders
// -----------------------------------------------------------------------------

/** The displayed decoration set: exactly one widget, never a replace. */
function ghostDecorations(state: InlineCompletionGhostState): DecorationSet {
  const ghost = state.ghost;
  if (!ghost) return Decoration.none;
  return Decoration.set([
    Decoration
      .widget({ widget: new GhostWidget(ghost.text), side: 1 })
      .range(ghost.pos),
  ]);
}

/** The atomic ranges: [pos, pos + text.length) marked, so the cursor skips. */
function ghostAtomicRanges(state: InlineCompletionGhostState): DecorationSet {
  const ghost = state.ghost;
  if (!ghost || ghost.text.length === 0) return Decoration.none;
  return Decoration.set([
    Decoration
      .mark({ class: `${INLINE_COMPLETION_GHOST_CLASS}-atomic` })
      .range(ghost.pos, ghost.pos + ghost.text.length),
  ]);
}

/** Renders the suggestion text after the cursor; visually muted. */
class GhostWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = INLINE_COMPLETION_GHOST_CLASS;
    span.textContent = this.text;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Extension wiring
// -----------------------------------------------------------------------------

/** Behaviour the ghost extension delegates to the controller. */
export interface InlineCompletionGhostDeps {
  /**
   * Feature gate evaluated per key event (R-A1 gating precedent): the
   * `inlineCompletionEnabled` setting. When false every handler falls through
   * immediately — no gesture tracking, no session, no decoration work.
   */
  readonly canTrigger: () => boolean;
  /** A complete Alt-solo gesture in this view: trigger a completion. */
  readonly onAltTrigger: (view: EditorView) => void;
  /** Tab with a live ghost; return `true` when the suggestion was accepted. */
  readonly onTabAccept: (view: EditorView) => boolean;
  /** Esc with a live ghost; return `true` when the suggestion was dismissed. */
  readonly onEscDismiss: (view: EditorView) => boolean;
  /** The document changed or the selection moved: cancel in-flight state. */
  readonly onEditorActivity: (view: EditorView) => void;
}

/**
 * The CM6 extension; register once with `registerEditorExtension`
 * (Obsidian registers editor extensions at plugin load only — the documented
 * C3-Q1 deviation from acceptance 7's literal wording). Guards are cheap and
 * ordered first so ordinary typing pays almost nothing when the feature is on,
 * and falls through immediately when it is off.
 */
export function inlineCompletionGhostExtension(deps: InlineCompletionGhostDeps): Extension {
  const trackers = new WeakMap<EditorView, AltSoloGestureTracker>();
  const trackerFor = (view: EditorView): AltSoloGestureTracker => {
    let tracker = trackers.get(view);
    if (!tracker) {
      tracker = new AltSoloGestureTracker();
      trackers.set(view, tracker);
    }
    return tracker;
  };
  return [
    inlineCompletionGhostField,
    Prec.highest(keymap.of([
      {
        key: 'Tab',
        run: (view) => {
          if (view.composing) return false;
          if (!deps.canTrigger()) return false;
          return deps.onTabAccept(view);
        },
      },
      {
        key: 'Escape',
        run: (view) => {
          if (!deps.canTrigger()) return false;
          return deps.onEscDismiss(view);
        },
      },
    ])),
    EditorView.domEventHandlers({
      // Every key event feeds the gesture tracker so an intervening key
      // breaks a pending Alt-solo gesture (the tracker resets on non-Alt
      // keys); the cost when the feature is off is one boolean check here.
      keydown: (event, view) => {
        if (!deps.canTrigger()) return false;
        const verdict = trackerFor(view).push({
          key: event.key,
          type: 'keydown',
          isComposing: event.isComposing || view.composing,
        });
        if (verdict === 'trigger') deps.onAltTrigger(view);
        return false;
      },
      keyup: (event, view) => {
        if (!deps.canTrigger()) return false;
        const verdict = trackerFor(view).push({
          key: event.key,
          type: 'keyup',
          isComposing: event.isComposing || view.composing,
        });
        if (verdict === 'trigger') deps.onAltTrigger(view);
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (!deps.canTrigger()) return;
      if (update.docChanged || update.selectionSet) {
        deps.onEditorActivity(update.view);
      }
    }),
  ];
}
