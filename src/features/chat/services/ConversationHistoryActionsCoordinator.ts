import { setIcon } from 'obsidian';

import type { Conversation } from '../../../core/types';
import { t, type TranslationKey } from '../../../i18n';
import { createLogger } from '../../../shared';

const logger = createLogger('ConversationHistoryActionsCoordinator');

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

export interface ConversationHistoryActionsHost {
  getConversations(): Conversation[];
  getCurrentConversation(): Conversation | null;
  isActiveTabStreaming(): boolean;
  loadConversation(conversationId: string): Promise<void>;
  getConversationById(conversationId: string): Promise<Conversation | null>;
  cancelConversationTitleGeneration(conversationId: string): void;
  updateConversationTitle(conversationId: string, title: string): Promise<void>;
  deleteConversationsAndCleanupTabs(conversationIds: string[]): Promise<void>;
  deleteAllConversationsAndReset(conversationIds: string[]): Promise<void>;
  showNotice(message: string): void;
}

export class ConversationHistoryActionsCoordinator {
  private historyDropdownEl: HTMLElement | null = null;
  private historyDropdownClickOutsideHandler: ((event: MouseEvent) => void) | null = null;
  private historyDropdownPositionFrameId: number | null = null;

  constructor(private readonly host: ConversationHistoryActionsHost) {}

  show(event: MouseEvent): void {
    const conversations = this.host.getConversations();
    if (conversations.length === 0) {
      this.host.showNotice(t('chat.history.empty'));
      return;
    }

    const anchorEl = this.resolveAnchorElement(event);
    if (!anchorEl) {
      return;
    }

    const selectedConversationIds = new Set<string>();
    const currentConversationId = this.host.getCurrentConversation()?.id ?? null;

    this.closeHistoryDropdown();

    this.historyDropdownEl = document.createElement('div');
    this.historyDropdownEl.addClass('opencodian-history-dropdown');

    const scrollContainer = this.historyDropdownEl.createDiv({
      cls: 'opencodian-history-scroll',
    });

    let updateDeleteActionText: (() => void) | null = null;

    for (const conversation of conversations) {
      const isActive = currentConversationId === conversation.id;
      const title = conversation.title || t('chat.history.untitled');
      const itemEl = scrollContainer.createDiv({
        cls: `opencodian-history-item${isActive ? ' is-active' : ''}`,
      });

      const checkboxWrapperEl = itemEl.createDiv({
        cls: 'opencodian-history-item-checkbox',
      });
      checkboxWrapperEl.addEventListener('click', (innerEvent) => {
        innerEvent.stopPropagation();
      });

      const checkboxEl = checkboxWrapperEl.createEl('input', {
        attr: {
          type: 'checkbox',
          'aria-label': `${t('chat.history.selectConversation')}: ${title}`,
        },
      });
      checkboxEl.addEventListener('click', (innerEvent) => {
        innerEvent.stopPropagation();
      });
      checkboxEl.addEventListener('change', (innerEvent) => {
        innerEvent.stopPropagation();
        const isSelected = checkboxEl.checked;
        itemEl.toggleClass('is-selected', isSelected);
        if (isSelected) {
          selectedConversationIds.add(conversation.id);
        } else {
          selectedConversationIds.delete(conversation.id);
        }
        updateDeleteActionText?.();
      });

      const iconEl = itemEl.createSpan({ cls: 'opencodian-history-item-icon' });
      setIcon(iconEl, isActive ? 'check' : 'message-square');

      const contentEl = itemEl.createDiv({ cls: 'opencodian-history-item-content' });
      contentEl.createDiv({
        cls: 'opencodian-history-item-title',
        text: title,
      });
      const metaEl = contentEl.createDiv({ cls: 'opencodian-history-item-meta' });
      metaEl.createDiv({
        cls: 'opencodian-history-item-date',
        text: this.formatConversationDate(conversation.createdAt),
      });
      if (
        conversation.titleGenerationStatus === 'pending'
        || conversation.titleGenerationStatus === 'failed'
      ) {
        metaEl.createSpan({
          cls: `opencodian-history-item-status is-${conversation.titleGenerationStatus}`,
          text: t(`chat.history.titleGeneration.${conversation.titleGenerationStatus}`),
        });
      }

      const controlsEl = itemEl.createDiv({ cls: 'opencodian-history-item-controls' });
      const renameBtn = controlsEl.createEl('button', {
        cls: 'opencodian-history-item-edit',
        attr: {
          type: 'button',
          title: t('chat.history.rename'),
          'aria-label': t('chat.history.rename'),
        },
      });
      setIcon(renameBtn, 'pencil');
      renameBtn.addEventListener('click', (innerEvent) => {
        innerEvent.stopPropagation();
        void this.renameConversation(conversation.id);
      });

      itemEl.addEventListener('click', (innerEvent) => {
        innerEvent.stopPropagation();
        this.closeHistoryDropdown();
        if (this.host.isActiveTabStreaming()) {
          this.host.showNotice(t('chat.tab.streamingBlocked'));
          return;
        }
        if (!isActive) {
          window.requestAnimationFrame(() => {
            void this.host.loadConversation(conversation.id);
          });
        }
      });
    }

    const footerEl = this.historyDropdownEl.createDiv({
      cls: 'opencodian-history-footer',
    });
    footerEl.createDiv({ cls: 'opencodian-history-separator' });

    const actionsEl = footerEl.createDiv({ cls: 'opencodian-history-actions' });
    const deleteTargetEl = actionsEl.createDiv({ cls: 'opencodian-history-action' });
    const deleteTargetIcon = deleteTargetEl.createSpan({
      cls: 'opencodian-history-action-icon',
    });
    setIcon(deleteTargetIcon, 'trash');
    const deleteTargetTextEl = deleteTargetEl.createSpan({
      cls: 'opencodian-history-action-text',
    });
    updateDeleteActionText = () => {
      deleteTargetTextEl.setText(
        selectedConversationIds.size > 0
          ? t('chat.history.deleteSelected')
          : t('chat.history.deleteCurrent'),
      );
    };
    updateDeleteActionText();
    deleteTargetEl.addEventListener('click', (innerEvent) => {
      innerEvent.stopPropagation();
      const selectedIds = Array.from(selectedConversationIds);
      this.closeHistoryDropdown();
      if (selectedIds.length > 0) {
        void this.deleteSelectedConversations(selectedIds);
        return;
      }
      void this.deleteCurrentConversation();
    });

    if (conversations.length > 1) {
      const deleteAllEl = actionsEl.createDiv({ cls: 'opencodian-history-action' });
      const deleteAllIcon = deleteAllEl.createSpan({
        cls: 'opencodian-history-action-icon',
      });
      setIcon(deleteAllIcon, 'trash-2');
      deleteAllEl.createSpan({
        cls: 'opencodian-history-action-text',
        text: t('chat.history.deleteAll'),
      });
      deleteAllEl.addEventListener('click', (innerEvent) => {
        innerEvent.stopPropagation();
        this.closeHistoryDropdown();
        void this.deleteAllConversations();
      });
    }

    document.body.appendChild(this.historyDropdownEl);
    this.historyDropdownEl.style.position = 'fixed';
    this.historyDropdownEl.style.top = '0';
    this.historyDropdownEl.style.left = '0';
    this.historyDropdownEl.style.zIndex = '1000';
    this.historyDropdownEl.style.visibility = 'hidden';
    this.scheduleHistoryDropdownPosition(anchorEl.getBoundingClientRect());

    this.historyDropdownClickOutsideHandler = (innerEvent: MouseEvent) => {
      if (!this.historyDropdownEl?.contains(innerEvent.target as Node)) {
        this.closeHistoryDropdown();
      }
    };

    window.setTimeout(() => {
      if (this.historyDropdownClickOutsideHandler) {
        document.addEventListener('click', this.historyDropdownClickOutsideHandler);
      }
    }, 0);
  }

  destroy(): void {
    this.closeHistoryDropdown();
  }

  private resolveAnchorElement(event: MouseEvent): HTMLElement | null {
    if (event.currentTarget instanceof HTMLElement) {
      return event.currentTarget;
    }
    if (event.target instanceof HTMLElement) {
      return event.target;
    }
    return null;
  }

  private formatConversationDate(createdAt: number): string {
    const date = new Date(createdAt);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(
      date.getHours(),
    ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(
      date.getSeconds(),
    ).padStart(2, '0')}`;
  }

  private closeHistoryDropdown(): void {
    this.clearScheduledHistoryDropdownPosition();
    if (this.historyDropdownEl) {
      this.historyDropdownEl.remove();
      this.historyDropdownEl = null;
    }
    if (this.historyDropdownClickOutsideHandler) {
      document.removeEventListener('click', this.historyDropdownClickOutsideHandler);
      this.historyDropdownClickOutsideHandler = null;
    }
  }

  private async deleteCurrentConversation(): Promise<void> {
    const currentConversation = this.host.getCurrentConversation();
    if (!currentConversation) {
      return;
    }

    const confirmed = await this.showDeleteCurrentConfirmDialog(
      currentConversation.title || t('chat.history.untitled'),
    );
    if (!confirmed) {
      return;
    }

    await this.host.deleteConversationsAndCleanupTabs([currentConversation.id]);
    this.host.showNotice(t('chat.deleteCurrentConfirm.success') || 'Conversation deleted');
  }

  private async deleteSelectedConversations(conversationIds: string[]): Promise<void> {
    const uniqueConversationIds = Array.from(new Set(conversationIds));
    if (uniqueConversationIds.length === 0) {
      return;
    }

    const confirmed = await this.showDeleteSelectedConfirmDialog(uniqueConversationIds.length);
    if (!confirmed) {
      return;
    }

    await this.host.deleteConversationsAndCleanupTabs(uniqueConversationIds);
    this.host.showNotice(
      t('chat.deleteSelectedConfirm.success') || 'Selected conversations deleted',
    );
  }

  private async deleteAllConversations(): Promise<void> {
    const conversations = this.host.getConversations();
    if (conversations.length === 0) {
      return;
    }

    const confirmed = await this.showDeleteAllConfirmDialog(conversations.length);
    if (!confirmed) {
      return;
    }

    await this.host.deleteAllConversationsAndReset(
      conversations.map((conversation) => conversation.id),
    );
    this.host.showNotice(t('chat.deleteAllConfirm.success') || 'All conversations deleted');
  }

  private async renameConversation(conversationId: string): Promise<void> {
    const conversation = await this.host.getConversationById(conversationId);
    if (!conversation) {
      return;
    }

    this.host.cancelConversationTitleGeneration(conversationId);
    const initialValue = conversation.title || t('chat.history.untitled');
    const nextTitle = await this.showRenameConversationDialog(initialValue);
    if (nextTitle === null) {
      return;
    }

    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      this.host.showNotice(t('chat.history.renameInvalid'));
      return;
    }

    try {
      await this.host.updateConversationTitle(conversationId, trimmedTitle);
      this.host.showNotice(t('chat.history.renameSuccess'));
      this.closeHistoryDropdown();
    } catch (error) {
      logger.error('Failed to rename conversation:', error);
      this.host.showNotice(t('chat.history.renameFailed'));
    }
  }

  private async showDeleteCurrentConfirmDialog(title: string): Promise<boolean> {
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

  private async showDeleteSelectedConfirmDialog(count: number): Promise<boolean> {
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

  private async showDeleteAllConfirmDialog(count: number): Promise<boolean> {
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

  private async showDeleteConfirmDialog(options: DeleteConfirmOptions): Promise<boolean> {
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

  private async showRenameConversationDialog(initialValue: string): Promise<string | null> {
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

  private scheduleHistoryDropdownPosition(anchorRect: DOMRect): void {
    this.clearScheduledHistoryDropdownPosition();
    this.historyDropdownPositionFrameId = window.requestAnimationFrame(() => {
      this.historyDropdownPositionFrameId = null;
      const dropdownEl = this.historyDropdownEl;
      if (!dropdownEl?.isConnected) {
        return;
      }

      const dropdownRect = dropdownEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - anchorRect.bottom - 8;
      const spaceAbove = anchorRect.top - 8;

      let top: number;
      if (spaceBelow >= dropdownRect.height || spaceBelow >= spaceAbove) {
        top = anchorRect.bottom + 4;
        if (top + dropdownRect.height > viewportHeight - 8) {
          top = Math.max(8, viewportHeight - dropdownRect.height - 8);
        }
      } else {
        top = anchorRect.top - dropdownRect.height - 4;
        if (top < 8) {
          top = 8;
        }
      }

      let left = anchorRect.left;
      if (left + dropdownRect.width > viewportWidth - 8) {
        left = Math.max(8, viewportWidth - dropdownRect.width - 8);
      }
      if (left < 8) {
        left = 8;
      }

      dropdownEl.style.top = `${top}px`;
      dropdownEl.style.left = `${left}px`;
      dropdownEl.style.visibility = 'visible';
    });
  }

  private clearScheduledHistoryDropdownPosition(): void {
    if (this.historyDropdownPositionFrameId !== null) {
      window.cancelAnimationFrame(this.historyDropdownPositionFrameId);
      this.historyDropdownPositionFrameId = null;
    }
  }
}
