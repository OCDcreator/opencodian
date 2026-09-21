/**
 * EditRevertPreviewModal — explicit R-F3 safety handshake before R-B3 writes.
 *
 * This feature.chat-ui surface renders the already-read-only preview supplied
 * by the consumer port. It never imports the storage service or performs a
 * vault mutation itself; confirmation only releases the existing action.
 */

import { App, Modal, setIcon } from 'obsidian';

import { t } from '../../../i18n';
import type { EditRevertPreview } from '../../../shared';

export interface EditRevertPreviewModalOptions {
  readonly preview?: EditRevertPreview;
  readonly error?: string;
  onConfirm?(): void;
  onCancel?(): void;
}

export class EditRevertPreviewModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly options: EditRevertPreviewModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('opencodian-edit-revert-preview-modal');
    this.setTitle(t('editRevert.preview.title'));
    if (this.options.error || !this.options.preview || this.options.preview.rows.length === 0) {
      this.renderFailure();
      return;
    }
    if (this.options.preview.roundOpen) {
      this.renderFailure(t('editRevert.preview.roundOpen'));
      return;
    }
    this.renderPreview(this.options.preview);
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(false);
  }

  private renderFailure(message?: string): void {
    const failureEl = this.contentEl.createDiv({ cls: 'opencodian-edit-revert-preview-failure' });
    const iconEl = failureEl.createSpan({ cls: 'opencodian-edit-revert-preview-failure-icon' });
    setIcon(iconEl, 'triangle-alert');
    failureEl.createDiv({
      cls: 'opencodian-edit-revert-preview-copy',
      text: message ?? (this.options.error
        ? t('editRevert.preview.failed', { error: this.options.error })
        : t('editRevert.preview.empty')),
    });
    this.addActions(false, false);
  }

  private renderPreview(preview: EditRevertPreview): void {
    const hasConflicts = preview.rows.some((row) => row.conflict);
    this.contentEl.createDiv({
      cls: 'opencodian-edit-revert-preview-copy',
      text: hasConflicts
        ? t('editRevert.preview.conflictIntro')
        : t('editRevert.preview.safeIntro'),
    });
    const listEl = this.contentEl.createDiv({ cls: 'opencodian-edit-revert-preview-list' });
    for (const row of preview.rows) {
      const rowEl = listEl.createDiv({
        cls: `opencodian-edit-revert-preview-row${row.conflict ? ' is-conflict' : ''}`,
      });
      rowEl.createDiv({
        cls: 'opencodian-edit-revert-preview-path',
        text: row.path,
      }).title = row.path;
      rowEl.createDiv({
        cls: 'opencodian-edit-revert-preview-lines',
        text: t('editRevert.preview.lines', {
          before: this.formatLines(row.beforeLines),
          after: this.formatLines(row.afterLines),
        }),
      });
      if (row.conflict) {
        const conflictEl = rowEl.createDiv({ cls: 'opencodian-edit-revert-preview-conflict' });
        const iconEl = conflictEl.createSpan({ cls: 'opencodian-edit-revert-preview-conflict-icon' });
        setIcon(iconEl, 'triangle-alert');
        conflictEl.createSpan({
          text: row.conflictReason === 'baseline-unavailable'
            ? t('editRevert.preview.baselineUnavailable')
            : t('editRevert.preview.changedAfterCapture'),
        });
      }
    }
    this.addActions(hasConflicts);
  }

  private addActions(hasConflicts: boolean, allowConfirm = true): void {
    const actionsEl = this.contentEl.createDiv({ cls: 'opencodian-edit-revert-preview-actions' });
    const cancelButton = actionsEl.createEl('button', {
      cls: 'opencodian-edit-revert-preview-cancel',
      text: t('editRevert.preview.cancel'),
      attr: { type: 'button' },
    });
    cancelButton.addEventListener('click', () => this.resolve(false));
    if (!allowConfirm || !this.options.onConfirm) {
      return;
    }
    const confirmButton = actionsEl.createEl('button', {
      cls: `opencodian-edit-revert-preview-confirm${hasConflicts ? ' is-conflict' : ''}`,
      text: hasConflicts
        ? t('editRevert.preview.confirmConflict')
        : t('editRevert.preview.confirm'),
      attr: { type: 'button' },
    });
    confirmButton.addEventListener('click', () => this.resolve(true));
  }

  private formatLines(lines: number | null): string {
    return lines === null ? t('editRevert.preview.linesUnavailable') : String(lines);
  }

  private resolve(confirmed: boolean): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.close();
    if (confirmed) {
      this.options.onConfirm?.();
    } else {
      this.options.onCancel?.();
    }
  }
}
