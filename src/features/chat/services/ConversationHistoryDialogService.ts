import { t, type TranslationKey } from '../../../i18n';

interface DeleteConfirmOptions {
  titleKey: TranslationKey;
  warningKey: TranslationKey;
  description: string;
  emphasisKey: TranslationKey;
  cancelKey: TranslationKey;
  confirmKey: TranslationKey;
  confirmTextKey: TranslationKey;
  countdown: number;
}

export class ConversationHistoryDialogService {
  showDeleteCurrentConfirmDialog(title: string): Promise<boolean> {
    return this.showDeleteConfirmDialog({
      titleKey: 'chat.deleteCurrentConfirm.title',
      warningKey: 'chat.deleteCurrentConfirm.warning',
      description: t('chat.deleteCurrentConfirm.description', { title }),
      emphasisKey: 'chat.deleteCurrentConfirm.emphasis',
      cancelKey: 'chat.deleteCurrentConfirm.cancel',
      confirmKey: 'chat.deleteCurrentConfirm.confirm',
      confirmTextKey: 'chat.deleteCurrentConfirm.confirmText',
      countdown: 3,
    });
  }

  showDeleteSelectedConfirmDialog(count: number): Promise<boolean> {
    return this.showDeleteConfirmDialog({
      titleKey: 'chat.deleteSelectedConfirm.title',
      warningKey: 'chat.deleteSelectedConfirm.warning',
      description: t('chat.deleteSelectedConfirm.description', { count: String(count) }),
      emphasisKey: 'chat.deleteSelectedConfirm.emphasis',
      cancelKey: 'chat.deleteSelectedConfirm.cancel',
      confirmKey: 'chat.deleteSelectedConfirm.confirm',
      confirmTextKey: 'chat.deleteSelectedConfirm.confirmText',
      countdown: 3,
    });
  }

  showDeleteAllConfirmDialog(count: number): Promise<boolean> {
    return this.showDeleteConfirmDialog({
      titleKey: 'chat.deleteAllConfirm.title',
      warningKey: 'chat.deleteAllConfirm.warning',
      description: t('chat.deleteAllConfirm.description', { count: String(count) }),
      emphasisKey: 'chat.deleteAllConfirm.emphasis',
      cancelKey: 'chat.deleteAllConfirm.cancel',
      confirmKey: 'chat.deleteAllConfirm.confirm',
      confirmTextKey: 'chat.deleteAllConfirm.confirmText',
      countdown: 6,
    });
  }

  showRenameConversationDialog(initialValue: string): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.addClass('opencodian-rename-dialog-overlay');

      const dialog = document.createElement('div');
      dialog.addClass('opencodian-rename-dialog');

      const titleEl = dialog.createDiv({ cls: 'opencodian-rename-dialog-title' });
      titleEl.setText(t('chat.history.rename'));

      const descEl = dialog.createDiv({ cls: 'opencodian-rename-dialog-desc' });
      descEl.setText(t('chat.history.renamePrompt'));

      const inputEl = dialog.createEl('input', {
        cls: 'opencodian-rename-dialog-input',
        attr: {
          type: 'text',
          value: initialValue,
          maxlength: '120',
          placeholder: t('chat.history.untitled'),
        },
      });

      const buttonsEl = dialog.createDiv({ cls: 'opencodian-rename-dialog-buttons' });
      const cancelBtn = buttonsEl.createEl('button', {
        cls: 'opencodian-rename-dialog-btn',
        text: t('chat.history.renameCancel'),
      });
      const saveBtn = buttonsEl.createEl('button', {
        cls: 'opencodian-rename-dialog-btn mod-cta',
        text: t('chat.history.renameSave'),
      });

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      let settled = false;
      const cleanup = () => {
        overlay.remove();
        document.removeEventListener('keydown', handleKeydown);
      };
      const finish = (value: string | null) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };

      const handleKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          finish(inputEl.value);
        }
      };

      document.addEventListener('keydown', handleKeydown);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          finish(null);
        }
      });
      cancelBtn.addEventListener('click', () => finish(null));
      saveBtn.addEventListener('click', () => finish(inputEl.value));

      window.setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 0);
    });
  }

  private showDeleteConfirmDialog(options: DeleteConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.addClass('opencodian-delete-confirm-overlay');

      const dialog = document.createElement('div');
      dialog.addClass('opencodian-delete-confirm-dialog');

      const titleEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-title' });
      titleEl.setText(t(options.titleKey));

      const warningEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-warning' });
      warningEl.setText(t(options.warningKey));

      const descEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-desc' });
      descEl.setText(options.description);

      const emphasisEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-emphasis' });
      emphasisEl.setText(t(options.emphasisKey));

      const buttonsEl = dialog.createDiv({ cls: 'opencodian-delete-confirm-buttons' });
      const confirmBtn = buttonsEl.createEl('button', {
        cls: 'opencodian-delete-confirm-btn opencodian-delete-confirm-confirm',
        text: t(options.confirmKey, { seconds: String(options.countdown) }),
      });
      confirmBtn.setAttribute('disabled', 'true');
      const cancelBtn = buttonsEl.createEl('button', {
        cls: 'opencodian-delete-confirm-btn opencodian-delete-confirm-cancel',
        text: t(options.cancelKey),
      });

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      let countdown = options.countdown;
      let timerId: number | null = null;
      let countdownStartTimeoutId: number | null = null;
      let settled = false;

      const cleanup = () => {
        if (timerId !== null) {
          window.clearInterval(timerId);
          timerId = null;
        }
        if (countdownStartTimeoutId !== null) {
          window.clearTimeout(countdownStartTimeoutId);
          countdownStartTimeoutId = null;
        }
        document.removeEventListener('keydown', escapeHandler);
        overlay.remove();
      };

      const finish = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };

      const startCountdown = () => {
        if (settled) {
          return;
        }
        timerId = window.setInterval(() => {
          countdown -= 1;
          if (countdown > 0) {
            confirmBtn.setText(t(options.confirmKey, { seconds: String(countdown) }));
            return;
          }

          if (timerId !== null) {
            window.clearInterval(timerId);
            timerId = null;
          }
          confirmBtn.removeAttribute('disabled');
          confirmBtn.setText(t(options.confirmTextKey));
        }, 1000);
      };

      countdownStartTimeoutId = window.setTimeout(startCountdown, 100);

      const handleCancel = () => {
        finish(false);
      };

      const handleConfirm = () => {
        if (countdown > 0) {
          return;
        }
        finish(true);
      };

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          handleCancel();
        }
      });
      cancelBtn.addEventListener('click', handleCancel);
      confirmBtn.addEventListener('click', handleConfirm);

      const escapeHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          handleCancel();
        }
      };
      document.addEventListener('keydown', escapeHandler);
    });
  }
}
