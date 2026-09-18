/**
 * InlineEditAnchor — anchor construction for one inline edit, extracted from
 * `InlineEditController` so the controller stays under the file-size gate and
 * the anchoring rules stay pure and unit-testable.
 *
 * Four forms (docs/requirements/inline-edit.md §7.2 + flowtext-parity R-A6):
 *
 * - `selection`: the current selection range and its exact text snapshot;
 * - `cursor-inline` / `cursor-inbetween`: the cursor position plus the text
 *   before/after it on the line;
 * - `document`: the whole note (`from 0` to `doc.length`), used by the
 *   whole-document form — the same anchor fields drive the dirty check, so a
 *   whole-note edit verifies the entire snapshot before writing.
 *
 * Snapshots are always taken with `doc.sliceString` — never
 * `editor.getSelection()`, whose line-ending normalisation would break the
 * dirty check (§7.4).
 */

import type { EditorState } from '@codemirror/state';

import type { InlineEditAnchor, InlineEditMode } from './InlineEditTypes';

export interface BuildInlineEditAnchorOptions {
  /** Note path shown to the model and used in the dirty-check message. */
  readonly notePath: string;
  /** Force a form (the `inline-edit-document` command passes `'document'`). */
  readonly forcedMode?: Exclude<InlineEditMode, 'selection' | 'cursor-inline' | 'cursor-inbetween'>;
}

/**
 * Build the anchor for `state`. Returns `null` only when the note path is
 * missing; snapshot failures propagate as `null` too (the caller notifies and
 * aborts, per §7.4's fail-stop rule).
 */
export function buildInlineEditAnchor(
  state: Pick<EditorState, 'doc' | 'selection'>,
  options: BuildInlineEditAnchorOptions,
): InlineEditAnchor | null {
  const notePath = options.notePath;
  if (!notePath) return null;

  if (options.forcedMode === 'document') {
    let snapshot: string;
    try {
      snapshot = state.doc.sliceString(0, state.doc.length);
    } catch {
      return null;
    }
    return {
      mode: 'document',
      notePath,
      from: 0,
      to: state.doc.length,
      snapshot,
      startLine: 1,
      endLine: state.doc.lines,
      before: '',
      after: '',
    };
  }

  const selection = state.selection.main;
  const from = selection.from;
  const to = selection.to;

  let snapshot: string;
  try {
    snapshot = state.doc.sliceString(from, to);
  } catch {
    return null;
  }

  const startLine = state.doc.lineAt(from).number;
  const endLine = state.doc.lineAt(to).number;
  const mode: InlineEditMode = from !== to
    ? 'selection'
    : state.doc.lineAt(from).text.trim().length > 0
      ? 'cursor-inline'
      : 'cursor-inbetween';

  let before = '';
  let after = '';
  if (mode !== 'selection') {
    const line = state.doc.lineAt(from);
    before = state.doc.sliceString(line.from, from);
    after = state.doc.sliceString(from, line.to);
  }

  return { mode, notePath, from, to, snapshot, startLine, endLine, before, after };
}

/**
 * Re-anchor one edit after the user switched its mode in the floating bar
 * (R-A6). `selection` re-reads the current selection and refuses an empty one
 * (`null`); `document` re-snapshots the whole note; cursor forms re-read the
 * cursor line context.
 */
export function rebuildAnchorForMode(
  state: Pick<EditorState, 'doc' | 'selection'>,
  notePath: string,
  mode: InlineEditMode,
): InlineEditAnchor | null {
  if (mode === 'document') {
    return buildInlineEditAnchor(state, { notePath, forcedMode: 'document' });
  }
  if (mode === 'selection' && state.selection.main.empty) {
    return null;
  }
  return buildInlineEditAnchor(state, { notePath });
}
