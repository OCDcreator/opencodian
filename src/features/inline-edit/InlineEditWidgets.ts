/**
 * InlineEditWidgets — the CodeMirror 6 decoration layer for inline edit
 * previews.
 *
 * One `StateField<DecorationSet>` plus two `StateEffect`s drive the preview
 * (docs/requirements/inline-edit.md §7.4). The instruction input moved to the
 * floating `InlineEditInputOverlay`; only the in-flow diff preview belongs in
 * the text stream here. Decorations are rebuilt from the effect payload, and
 * `map(tr.changes)` keeps them attached while the user edits; nothing here
 * dispatches a transaction from inside `update()`.
 */

import type { EditorState } from '@codemirror/state';
import { StateEffect, StateField } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

import { renderDiffInto } from './InlineEditDiff';
import type { InlineEditWidgetCallbacks } from './InlineEditTypes';

const CSS_INPUT = 'opencodian-inline-edit';
const CSS_PREVIEW = 'opencodian-inline-edit-preview';
const CSS_INSERT = 'opencodian-inline-edit-insert';
const CSS_DELETE = 'opencodian-inline-edit-delete';
const CSS_ACTION = 'opencodian-inline-edit-action';

/** Payload for the accept/reject preview widget. */
export interface InlineEditPreviewPayload {
  readonly token: string;
  readonly from: number;
  readonly to: number;
  /** Replacement previews diff against this text; insertions show `after` only. */
  readonly before: string;
  readonly after: string;
  /** `true` for `<insertion>`: the range is empty and nothing is replaced. */
  readonly insertion: boolean;
  readonly busy: boolean;
  readonly callbacks: InlineEditWidgetCallbacks;
  readonly acceptLabel: string;
  readonly rejectLabel: string;
}

export const showInlineEditPreview = StateEffect.define<InlineEditPreviewPayload>();
export const clearInlineEdit = StateEffect.define<null>();

const inlineEditField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(clearInlineEdit)) {
        return Decoration.none;
      }
      if (effect.is(showInlineEditPreview)) {
        const payload = effect.value;
        const widget = new InlineEditPreviewWidget(payload);
        if (payload.insertion) {
          return Decoration.set([
            Decoration.widget({ widget, block: true, side: 1 }).range(payload.from),
          ]);
        }
        // Inline (not block) replace: a block replace decoration is expanded to
        // whole-line boundaries by CodeMirror, which would break the accept
        // path's snapshot dirty-check and write range for partial-line selections.
        return Decoration.set([
          Decoration.replace({ widget }).range(payload.from, payload.to),
        ]);
      }
    }
    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Inject the inline-edit field into an editor the first time it is used. */
export function ensureInlineEditField(view: EditorView): void {
  if (view.state.field(inlineEditField, false)) return;
  view.dispatch({ effects: StateEffect.appendConfig.of(inlineEditField) });
}

/** Dispatch one of the inline-edit effects into an editor that has the field. */
export function applyInlineEditEffect(
  view: EditorView,
  effect: StateEffect<unknown>,
): void {
  if (!view.state.field(inlineEditField, false)) return;
  view.dispatch({ effects: effect });
}

/** The current inline-edit decorations, if the field is installed. */
export function readInlineEditDecorations(state: EditorState): DecorationSet | null {
  return state.field(inlineEditField, false) ?? null;
}

/**
 * Current document range of the inline-edit decoration.
 *
 * The decoration set is mapped through every transaction, so this is the
 * selection range *now* — which is what the accept path needs in order to write
 * at the right offsets after the user has edited elsewhere in the note.
 */
export function readInlineEditRange(state: EditorState): { from: number; to: number } | null {
  const decorations = readInlineEditDecorations(state);
  if (!decorations || decorations.size === 0) return null;
  const range = decorations.iter();
  return { from: range.from, to: range.to };
}

// -----------------------------------------------------------------------------
// Widgets
// -----------------------------------------------------------------------------

/** Word-level diff preview with accept/reject actions. */
class InlineEditPreviewWidget extends WidgetType {
  constructor(private readonly payload: InlineEditPreviewPayload) {
    super();
  }

  eq(other: InlineEditPreviewWidget): boolean {
    return other.payload.token === this.payload.token
      && other.payload.busy === this.payload.busy
      && other.payload.after === this.payload.after
      && other.payload.before === this.payload.before;
  }

  toDOM(): HTMLElement {
    const root = activeDocument.createElement('div');
    root.className = `${CSS_INPUT}-preview`;
    root.addClass(CSS_INPUT);
    root.addClass(CSS_PREVIEW);

    const body = root.createDiv({ cls: `${CSS_INPUT}-body` });
    if (this.payload.insertion) {
      body.createDiv({ cls: CSS_INSERT, text: this.payload.after });
    } else {
      renderDiffInto(body, this.payload.before, this.payload.after, {
        insert: CSS_INSERT,
        delete: CSS_DELETE,
      });
    }

    const actions = root.createDiv({ cls: `${CSS_INPUT}-actions` });
    const accept = actions.createEl('button', { text: this.payload.acceptLabel, cls: CSS_ACTION });
    const reject = actions.createEl('button', { text: this.payload.rejectLabel, cls: CSS_ACTION });
    accept.type = 'button';
    reject.type = 'button';
    accept.disabled = this.payload.busy;
    reject.disabled = this.payload.busy;
    accept.addEventListener('click', (event) => {
      event.preventDefault();
      this.payload.callbacks.onAccept();
    });
    reject.addEventListener('click', (event) => {
      event.preventDefault();
      this.payload.callbacks.onReject();
    });

    return root;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
