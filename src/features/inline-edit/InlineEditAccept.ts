/**
 * InlineEditAccept — the accept path of one inline edit, extracted from
 * `InlineEditController` so the state machine stays under the file-size gate.
 *
 * The write contract (docs/requirements/inline-edit.md §7.5 +
 * flowtext-parity R-A5/R-A6) lives here:
 *
 * - read the edit's own decoration range by id and compare the live text
 *   against the edit's own snapshot — a sibling edit can neither shift the
 *   comparison nor be rejected by it;
 * - refuse (rejecting only this edit) when the note changed underneath;
 * - whole-document accepts pass a second confirmation before writing, and a
 *   cancel writes nothing (R-A6);
 * - the accepted text reaches the note through exactly one
 *   `editor.replaceRange` call, so Obsidian's undo stack sees a single edit —
 *   whole-document edits included (one Ctrl+Z restores the note).
 */

import type { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';

import { t } from '../../i18n';
import { normalizeInsertionText } from './InlineEditPrompt';
import { canApplyEdit } from './InlineEditService';
import type { InlineEditAnchor } from './InlineEditTypes';
import { readInlineEditRange } from './InlineEditWidgets';

/** The slice of one active edit the accept path needs. */
export interface InlineEditAcceptEdit {
  readonly editId: string;
  readonly anchor: InlineEditAnchor;
  readonly editorView: EditorView;
  readonly editor: Editor;
  readonly preview: { readonly mode: 'replacement' | 'insertion'; readonly text: string } | null;
  /**
   * R-C2: the edit's image-generation state (`pendingAssetPath` is the vault
   * path of the generated asset backing this preview, when the edit is an
   * image-generation insertion). Drives the W-ref failure semantics: a failed
   * or refused reference write keeps the asset and reports its actual path
   * instead of silently dropping it. Ownership is taken (cleared) by this
   * module once the write proceeds, so teardown cannot double-handle.
   */
  readonly imageGen?: {
    readonly pendingAssetPath: string | null;
    takePendingAsset(): string | null;
  };
  /**
   * R-C2: keep the preview text byte-exact through insertion. The image
   * embed's blank-line padding IS the exclusive-line form, so the generic
   * insertion trimming must not strip it.
   */
  readonly preserveWhitespace?: boolean;
}

export interface InlineEditAcceptDeps {
  notify(message: string): void;
  /** Second confirmation for whole-document accepts (R-A6). */
  confirmDocumentReplace?(info: { notePath: string; charCount: number }): Promise<boolean>;
  /** True while `edit` is still the live record (guards across awaits). */
  isCurrent(edit: InlineEditAcceptEdit): boolean;
  closeEdit(editId: string): Promise<void>;
  /** Reject the edit after a failed dirty check (notify + teardown). */
  rejectEdit(editId: string): void;
}

/** Apply the previewed text after the dirty check (§7.5). */
export async function executeInlineEditAccept(
  edit: InlineEditAcceptEdit,
  deps: InlineEditAcceptDeps,
): Promise<void> {
  const preview = edit.preview;
  if (!preview) return;

  const range = readInlineEditRange(edit.editorView.state, edit.editId);
  if (!range) {
    deps.notify(t('inlineEdit.error.editorUnavailable'));
    return;
  }
  const current = edit.editorView.state.doc.sliceString(range.from, range.to);
  if (!canApplyEdit(edit.anchor.snapshot, current)) {
    // The note changed under us; refuse rather than write at stale offsets.
    // Only this edit is rejected — every other edit keeps its own snapshot
    // comparison, so a conflict here cannot corrupt a sibling edit (R-A5).
    //
    // R-C2: with a generated asset behind the preview this is the W-ref
    // dirty-check failure branch — the asset is KEPT and its actual path is
    // reported (fail-visible), never silently dropped.
    if (edit.imageGen?.pendingAssetPath) {
      deps.notify(t('inlineEdit.imageGen.notice.insertFailedKeepAsset', {
        path: edit.imageGen.pendingAssetPath,
      }));
      await deps.closeEdit(edit.editId);
      return;
    }
    deps.notify(t('inlineEdit.error.staleSelection'));
    deps.rejectEdit(edit.editId);
    return;
  }

  const text = preview.mode === 'insertion' && edit.preserveWhitespace !== true
    ? normalizeInsertionText(preview.text)
    : preview.text;

  if (edit.anchor.mode === 'document') {
    // Whole-document accepts replace almost everything the user has; the
    // degraded before/after view is weak review, so a second confirmation
    // gates the single write (R-A6 验收 6). Fail closed when no confirmer is
    // wired: no confirmation, no write.
    const confirmed = await (deps.confirmDocumentReplace?.({
      notePath: edit.anchor.notePath,
      charCount: text.length,
    }) ?? Promise.resolve(false));
    if (!deps.isCurrent(edit)) return;
    if (!confirmed) return;
  }

  // The dirty check passed: this write now owns the asset (taken so the
  // closeEdit teardown cannot treat a successful insert as an orphan).
  const assetPath = edit.imageGen?.takePendingAsset() ?? null;

  void deps.closeEdit(edit.editId).then(() => {
    const start = edit.editor.offsetToPos(range.from);
    const end = edit.editor.offsetToPos(range.to);
    // Single transaction: Ctrl+Z undoes the whole inline edit in one step —
    // whole-document edits included (R-A6 验收 4).
    try {
      edit.editor.replaceRange(text, start, end);
    } catch (error) {
      // W-ref write failure (R-C2): the asset stays on disk and its actual
      // path is reported; the document is unchanged because the transaction
      // never applied.
      if (assetPath) {
        deps.notify(t('inlineEdit.imageGen.notice.insertFailedKeepAsset', { path: assetPath }));
        return;
      }
      deps.notify(t('inlineEdit.error.applyFailed', {
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  });
}
