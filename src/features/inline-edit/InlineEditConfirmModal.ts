/**
 * InlineEditConfirmModal — the second confirmation for whole-document inline
 * edits (docs/requirements/flowtext-parity.md R-A6 验收 6).
 *
 * Whole-note replacements almost always degrade to the before/after view
 * (the word-level LCS budget cannot cover a whole note), so the diff review
 * is weaker than the selection form. A dedicated modal gates the single
 * `editor.replaceRange` write: cancel means no write at all, and the preview
 * stays up so the user can still reject it.
 */

import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

import { t } from '../../i18n';

export interface InlineEditDocumentReplaceInfo {
  readonly notePath: string;
  /** Length of the replacement text about to be written. */
  readonly charCount: number;
}

/**
 * Ask the user to confirm a whole-document replace. Resolves `false` when
 * the user cancels or closes the modal; resolves `true` only on an explicit
 * confirmation click.
 */
export function confirmInlineEditDocumentReplace(
  app: App,
  info: InlineEditDocumentReplaceInfo,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const modal = new Modal(app);
    let settled = false;
    const settle = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal.close();
    };

    modal.titleEl.setText(t('inlineEdit.confirm.document.title'));
    modal.contentEl.empty();
    const body = modal.contentEl.createDiv({ cls: 'opencodian-inline-edit-confirm' });
    body.createDiv({
      cls: 'opencodian-inline-edit-confirm-message',
      text: t('inlineEdit.confirm.document.message', {
        path: info.notePath,
        chars: String(info.charCount),
      }),
    });

    new Setting(modal.contentEl)
      .addButton((button) => button
        .setButtonText(t('inlineEdit.confirm.document.cancel'))
        .onClick(() => { settle(false); }))
      .addButton((button) => button
        .setButtonText(t('inlineEdit.confirm.document.accept'))
        .setWarning()
        .onClick(() => { settle(true); }));

    modal.onClose = () => { settle(false); };
    modal.open();
  });
}
