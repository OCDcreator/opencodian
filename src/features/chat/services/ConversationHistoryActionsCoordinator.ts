import { setIcon } from 'obsidian';

import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import { ConversationHistoryDialogService } from './ConversationHistoryDialogService';

const logger = createLogger('ConversationHistoryActionsCoordinator');

export interface ConversationHistoryActionsHost {
  getConversations(): Conversation[];
  getCurrentConversation(): Conversation | null;
  getHistoryBackendDisplayName?(): string;
  isActiveTabStreaming(): boolean;
  loadConversation(conversationId: string): Promise<void>;
  getConversationById(conversationId: string): Promise<Conversation | null>;
  cancelConversationTitleGeneration(conversationId: string): void;
  updateConversationTitle(conversationId: string, title: string): Promise<void>;
  deleteConversationsAndCleanupTabs(conversationIds: string[]): Promise<void>;
  deleteAllConversationsAndReset(conversationIds: string[]): Promise<void>;
  showNotice(message: string): void;
  openTitleSettings?(): void;
  /** Open the backend session browser modal. */
  openBackendSessionBrowserModal?(): void;
}

export class ConversationHistoryActionsCoordinator {
  private historyDropdownEl: HTMLElement | null = null;
  private historyDropdownClickOutsideHandler: ((event: MouseEvent) => void) | null = null;
  private historyDropdownPositionFrameId: number | null = null;
  private readonly dialogService = new ConversationHistoryDialogService();

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

    const scopeLabel = this.host.getHistoryBackendDisplayName?.();
    if (scopeLabel) {
      scrollContainer.createDiv({
        cls: 'opencodian-history-scope',
        text: t('chat.history.backendScope', { backend: scopeLabel }),
      });
    }

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

    if (this.host.openTitleSettings) {
      const titleSettingsEl = actionsEl.createDiv({ cls: 'opencodian-history-action' });
      const titleSettingsIcon = titleSettingsEl.createSpan({
        cls: 'opencodian-history-action-icon',
      });
      setIcon(titleSettingsIcon, 'settings');
      titleSettingsEl.createSpan({
        cls: 'opencodian-history-action-text',
        text: t('chat.history.titlePreferences'),
      });
      titleSettingsEl.addEventListener('click', (innerEvent) => {
        innerEvent.stopPropagation();
        this.closeHistoryDropdown();
        this.host.openTitleSettings!();
      });
    }

    if (this.host.openBackendSessionBrowserModal) {
      const browseEl = actionsEl.createDiv({ cls: 'opencodian-history-action' });
      const browseIcon = browseEl.createSpan({
        cls: 'opencodian-history-action-icon',
      });
      setIcon(browseIcon, 'server');
      browseEl.createSpan({
        cls: 'opencodian-history-action-text',
        text: t('chat.backendSessions.browseButton'),
      });
      browseEl.addEventListener('click', (innerEvent) => {
        innerEvent.stopPropagation();
        this.closeHistoryDropdown();
        this.openBackendSessionBrowser();
      });
    }

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

  private openBackendSessionBrowser(): void {
    this.host.openBackendSessionBrowserModal?.();
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

    const confirmed = await this.dialogService.showDeleteCurrentConfirmDialog(
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

    const confirmed = await this.dialogService.showDeleteSelectedConfirmDialog(
      uniqueConversationIds.length,
    );
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

    const confirmed = await this.dialogService.showDeleteAllConfirmDialog(conversations.length);
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
    const nextTitle = await this.dialogService.showRenameConversationDialog(initialValue);
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
