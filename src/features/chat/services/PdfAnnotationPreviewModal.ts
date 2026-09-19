/**
 * PdfAnnotationPreviewModal (R-C4 phase 3, design §3.3 / §4 row 3):
 * the explicit, visible confirmation before the sidecar annotation write.
 *
 * Shows the EXACT markdown entry that will be appended plus the target
 * sidecar path, so the write is never silent (§6.3). When R-B3 revert
 * coverage is unavailable the modal says so instead of writing quietly
 * unrevertable content (§6.7 honesty). Uses Obsidian-native modal styling;
 * the only plugin CSS surface is the shared modal contrast contract (the
 * `opencodian-pdf-annotation-modal` root class scopes
 * plugin-modal-contrast.css, which lifts the CTA label and the warning
 * note above the measured contrast floor).
 */

import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

import { t } from '../../../i18n';

export interface PdfAnnotationPreviewModalOptions {
  /** The exact markdown entry that will be appended. */
  entry: string;
  /** Vault-relative sidecar path shown in the preview. */
  sidecarPath: string;
  /** False when the R-B3 begin/note/end surface is not composed. */
  revertAvailable: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export class PdfAnnotationPreviewModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly options: PdfAnnotationPreviewModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('opencodian-pdf-annotation-modal');
    this.setTitle(t('chat.pdf.annotation.title'));

    new Setting(this.contentEl)
      .setName(t('chat.pdf.annotation.previewLabel'))
      .setDesc(this.options.sidecarPath);

    const pre = this.contentEl.createEl('pre');
    pre.textContent = this.options.entry;

    if (!this.options.revertAvailable) {
      const warning = this.contentEl.createEl('p');
      warning.setText(t('chat.pdf.annotation.noRevertCoverage'));
      // Shared plugin-modal warning ink (plugin-modal-contrast.css):
      // raw --text-error measured 4.20:1 as modal body copy — below floor.
      warning.addClass('opencodian-modal-warning-note');
    }

    new Setting(this.contentEl)
      .addButton((button) => {
        button
          .setButtonText(t('chat.pdf.annotation.confirm'))
          .setCta()
          .onClick(() => this.resolve(true));
      })
      .addButton((button) => {
        button
          .setButtonText(t('chat.pdf.annotation.cancel'))
          .onClick(() => this.resolve(false));
      });
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(false);
  }

  private resolve(confirmed: boolean): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.close();
    if (confirmed) {
      this.options.onConfirm();
    } else {
      this.options.onCancel();
    }
  }
}
