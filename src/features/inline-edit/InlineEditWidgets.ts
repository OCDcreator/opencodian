/**
 * InlineEditWidgets — the CodeMirror 6 decoration layer for inline edit
 * previews.
 *
 * One `StateField` plus three `StateEffect`s drive the previews, keyed by
 * `editId` so parallel edits in one editor each own an independent preview
 * (docs/requirements/flowtext-parity.md R-A5):
 *
 * - `upsertInlineEditPreview(payload)` inserts or replaces one edit's preview;
 * - `removeInlineEditPreview(editId)` drops a single preview;
 * - `clearAllInlineEditPreviews` empties the set (editor teardown).
 *
 * The instruction input lives in the floating `InlineEditInputOverlay`; only
 * the in-flow diff preview belongs in the text stream here. Two decoration
 * semantics are load-bearing and must survive every refactor (R-A5 技术约束):
 * insertions render as `block: true` widgets, replacements render as *inline*
 * (not block) replace decorations — a block replace is expanded to whole-line
 * boundaries by CodeMirror, which would break the accept path's snapshot
 * dirty-check and write range for partial-line selections. Decorations and
 * the per-edit payload offsets are mapped through every transaction, and
 * nothing here dispatches from inside `update()`.
 */

import type { EditorState, Range } from '@codemirror/state';
import { StateEffect, StateField } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { setIcon } from 'obsidian';

import { t } from '../../i18n';
import { OPENCODIAN_APP_ICON_ID } from '../../shared/brandingWordmark';
import { canComputeWordDiff, renderDiffInto } from './InlineEditDiff';
import type { InlineEditWidgetCallbacks } from './InlineEditTypes';

const CSS_INPUT = 'opencodian-inline-edit';
const CSS_PREVIEW = 'opencodian-inline-edit-preview';
const CSS_INSERT = 'opencodian-inline-edit-insert';
const CSS_DELETE = 'opencodian-inline-edit-delete';
const CSS_ACTION = 'opencodian-inline-edit-action';

/** Payload for the accept/reject preview widget. */
export interface InlineEditPreviewPayload {
  /** Owning edit; the decoration set is keyed by this id. */
  readonly editId: string;
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

export const upsertInlineEditPreview = StateEffect.define<InlineEditPreviewPayload>();
export const removeInlineEditPreview = StateEffect.define<string>();
export const clearAllInlineEditPreviews = StateEffect.define<null>();

interface InlineEditPreviewEntry {
  readonly payload: InlineEditPreviewPayload;
  /** Live offsets, mapped through every document change. */
  from: number;
  to: number;
}

interface InlineEditPreviewState {
  /** Live decorations; authoritative for display (mapped by CodeMirror). */
  readonly decorations: DecorationSet;
  /** Latest payload per edit, with tracked offsets for reads and rebuilds. */
  readonly entries: ReadonlyMap<string, InlineEditPreviewEntry>;
}

const EMPTY_PREVIEWS: InlineEditPreviewState = {
  decorations: Decoration.none,
  entries: new Map(),
};

/** One entry as a decoration range. Collapsed replace ranges render nothing. */
function buildPreviewRange(entry: InlineEditPreviewEntry): Range<Decoration> | null {
  const { payload } = entry;
  const widget = new InlineEditPreviewWidget(payload);
  if (payload.insertion) {
    return Decoration.widget({ widget, block: true, side: 1 }).range(entry.from);
  }
  // Inline (not block) replace: a block replace decoration is expanded to
  // whole-line boundaries by CodeMirror, which would break the accept
  // path's snapshot dirty-check and write range for partial-line selections.
  if (entry.from >= entry.to) return null;
  return Decoration.replace({ widget }).range(entry.from, entry.to);
}

function buildPreviewSet(entries: ReadonlyMap<string, InlineEditPreviewEntry>): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const entry of entries.values()) {
    const range = buildPreviewRange(entry);
    if (range) ranges.push(range);
  }
  if (ranges.length === 0) return Decoration.none;
  // Decoration.set requires sorted input; upsert order is arbitrary (Map
  // insertion order), so sort by position then start side before building.
  ranges.sort((left, right) => (left.from - right.from) || (left.value.startSide - right.value.startSide));
  return Decoration.set(ranges);
}

/**
 * Map one entry through a document change.
 *
 * Replace ranges mirror `EditorSelection.range` mapping (from assoc +1, to
 * assoc -1); insertion widgets sit after their position (side 1). The safety
 * net is the accept-time dirty check, which rejects any drift either way.
 */
function mapEntry(entry: InlineEditPreviewEntry, changes: {
  mapPos(pos: number, assoc?: number): number;
}): InlineEditPreviewEntry {
  const from = changes.mapPos(entry.from, 1);
  const to = entry.payload.insertion
    ? from
    : changes.mapPos(entry.to, -1);
  if (from === entry.from && to === entry.to) return entry;
  return { payload: entry.payload, from, to };
}

const inlineEditField = StateField.define<InlineEditPreviewState>({
  create: () => EMPTY_PREVIEWS,
  update: (state, transaction) => {
    // Mutations always copy-on-write first (see below); the cast only widens.
    let entries = state.entries as Map<string, InlineEditPreviewEntry>;

    if (transaction.docChanged && entries.size > 0) {
      const mapped = new Map<string, InlineEditPreviewEntry>();
      for (const [editId, entry] of entries) {
        mapped.set(editId, mapEntry(entry, transaction.changes));
      }
      entries = mapped;
    }

    let touched = false;
    for (const effect of transaction.effects) {
      if (effect.is(clearAllInlineEditPreviews)) {
        if (entries.size === 0) continue;
        entries = new Map();
        touched = true;
        continue;
      }
      if (effect.is(removeInlineEditPreview)) {
        if (!entries.has(effect.value)) continue;
        entries = new Map(entries);
        entries.delete(effect.value);
        touched = true;
        continue;
      }
      if (effect.is(upsertInlineEditPreview)) {
        const payload = effect.value;
        entries = new Map(entries);
        entries.set(payload.editId, {
          payload,
          from: payload.from,
          to: payload.insertion ? payload.from : payload.to,
        });
        touched = true;
      }
    }

    if (!touched) {
      if (entries === state.entries) return state;
      return { entries, decorations: state.decorations.map(transaction.changes) };
    }
    return { entries, decorations: buildPreviewSet(entries) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/** The preview field, exported for contract tests (state-level assertions). */
export const inlineEditPreviewField = inlineEditField;

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
  const fieldState = state.field(inlineEditField, false);
  return fieldState?.decorations ?? null;
}

/** Ids of the edits that currently hold a preview decoration. */
export function readInlineEditPreviewIds(state: EditorState): readonly string[] {
  const fieldState = state.field(inlineEditField, false);
  return fieldState ? [...fieldState.entries.keys()] : [];
}

/**
 * Current document range of one edit's preview decoration.
 *
 * Entries are mapped through every transaction, so this is the selection range
 * *now* — which is what the accept path needs in order to write at the right
 * offsets after the user has edited elsewhere in the note.
 */
export function readInlineEditRange(
  state: EditorState,
  editId: string,
): { from: number; to: number } | null {
  const fieldState = state.field(inlineEditField, false);
  if (!fieldState) return null;
  const entry = fieldState.entries.get(editId);
  if (!entry) return null;
  return { from: entry.from, to: entry.to };
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
    // `document` matches Obsidian's `activeDocument` in production; using the
    // standard global keeps the widget renderable in tests too.
    const root = document.createElement('div');
    root.className = `${CSS_INPUT}-preview`;
    root.addClass(CSS_INPUT);
    root.addClass(CSS_PREVIEW);
    if (this.payload.busy) root.addClass('is-busy');

    const body = root.createDiv({ cls: `${CSS_INPUT}-body` });
    const degraded = !canComputeWordDiff(this.payload.before, this.payload.after);
    if (this.payload.busy && degraded) {
      // Streaming a whole-document (or otherwise huge) edit: the final frame
      // renders the full before/after fallback, but per-frame DOM churn of
      // two giant blocks would freeze the editor — show a bounded progress
      // body instead (R-A6 diff degradation + R-A3 busy marker).
      body.addClass('opencodian-inline-edit-body-degraded-busy');
      body.createDiv({
        cls: `${CSS_INPUT}-busy-body`,
        text: t('inlineEdit.preview.streamingLarge', {
          chars: String(this.payload.after.length),
        }),
      });
    } else if (this.payload.insertion) {
      body.createDiv({ cls: CSS_INSERT, text: this.payload.after });
    } else {
      renderDiffInto(body, this.payload.before, this.payload.after, {
        insert: CSS_INSERT,
        delete: CSS_DELETE,
        fallbackLabel: t('inlineEdit.preview.degraded'),
      });
    }

    const actions = root.createDiv({ cls: `${CSS_INPUT}-actions` });
    const identity = actions.createSpan({ cls: `${CSS_INPUT}-actions-label` });
    const identityIcon = identity.createSpan();
    setIcon(identityIcon, OPENCODIAN_APP_ICON_ID);
    identity.createSpan({ text: t('inlineEdit.command.name') });
    if (this.payload.busy) {
      // Generating marker (R-A3): an explicit "still streaming" affordance so
      // a mid-stream frame is never mistaken for the final result.
      const busy = actions.createSpan({ cls: `${CSS_INPUT}-busy-label` });
      const busyIcon = busy.createSpan({ cls: `${CSS_INPUT}-busy-icon` });
      setIcon(busyIcon, 'loader-circle');
      busy.createSpan({ text: t('inlineEdit.preview.generating') });
    }
    const reject = actions.createEl('button', { text: this.payload.rejectLabel, cls: `${CSS_ACTION} is-reject` });
    const accept = actions.createEl('button', { text: this.payload.acceptLabel, cls: `${CSS_ACTION} is-accept` });
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

// -----------------------------------------------------------------------------
// Preview dispatch (moved from InlineEditController so it stays in budget)
// -----------------------------------------------------------------------------

/** Structural slice of one active edit the preview dispatch needs. */
export interface InlineEditPreviewDispatchEdit {
  readonly editId: string;
  readonly editorView: EditorView;
  readonly anchor: { readonly from: number; readonly to: number; readonly snapshot: string };
  phase: 'input' | 'generating' | 'preview';
  reply: string;
  previewToken: number | null;
  previewShown: boolean;
  preview: {
    readonly mode: 'replacement' | 'insertion';
    readonly text: string;
    readonly preserveWhitespace?: boolean;
  } | null;
}

/** Controller bridges the dispatch needs (token counter, focus, accept/reject). */
export interface InlineEditPreviewDispatchHost<E> {
  nextPreviewToken(): number;
  focusEdit(editId: string): void;
  isLive(edit: E): boolean;
  accept(editId: string): void;
  reject(editId: string): void;
}

/**
 * Dispatch the preview decoration for one edit (streaming frames reuse the
 * edit's `previewToken` so the widget's `eq()` compares accumulated text; a
 * fresh preview makes the edit the keyboard's current one).
 */
export function dispatchInlineEditPreview<E extends InlineEditPreviewDispatchEdit>(
  host: InlineEditPreviewDispatchHost<E>,
  edit: E,
  busy: boolean,
): void {
  const preview = edit.preview;
  if (!preview) return;
  // The preview replaces the anchored selection range. If the note changed
  // during generation these offsets are stale and the accept-time dirty check
  // refuses the write (fail safe). Offsets are clamped to the current document
  // so a shrunken note cannot produce an out-of-bounds decoration range.
  const docLength = edit.editorView.state.doc.length;
  const from = Math.min(edit.anchor.from, docLength);
  const to = Math.min(Math.max(edit.anchor.to, from), docLength);
  if (edit.previewToken === null) {
    edit.previewToken = host.nextPreviewToken();
  }
  edit.previewShown = true;
  // A fresh preview makes this the edit the keyboard talks to.
  host.focusEdit(edit.editId);
  applyInlineEditEffect(edit.editorView, upsertInlineEditPreview.of({
    editId: edit.editId,
    token: `${edit.previewToken}:preview`,
    from,
    to,
    before: edit.anchor.snapshot,
    after: preview.text,
    insertion: preview.mode === 'insertion',
    busy,
    callbacks: {
      onSubmit: () => { /* no input in the preview phase */ },
      onAccept: () => { host.accept(edit.editId); },
      onReject: () => { host.reject(edit.editId); },
    },
    acceptLabel: t('inlineEdit.action.accept'),
    rejectLabel: t('inlineEdit.action.reject'),
  }));
}

/** Clear a live streaming preview from the editor (error paths). */
export function clearInlineEditPreview(
  edit: Pick<InlineEditPreviewDispatchEdit, 'editId' | 'editorView' | 'previewShown' | 'previewToken'>,
): void {
  if (!edit.previewShown) return;
  edit.previewShown = false;
  edit.previewToken = null;
  applyInlineEditEffect(edit.editorView, removeInlineEditPreview.of(edit.editId));
}

/**
 * Per-frame preview update while a tag body streams in (R-A3). The payload
 * carries `busy: true`, so the widget shows the generating marker and keeps
 * accept/reject disabled until the strict parse settles the turn.
 */
export function dispatchInlineEditStreamingPreview<E extends InlineEditPreviewDispatchEdit>(
  host: InlineEditPreviewDispatchHost<E>,
  edit: E,
  mode: 'replacement' | 'insertion',
  text: string,
): void {
  if (!host.isLive(edit) || edit.phase !== 'generating') return;
  edit.preview = { mode, text };
  edit.reply = '';
  dispatchInlineEditPreview(host, edit, true);
}
