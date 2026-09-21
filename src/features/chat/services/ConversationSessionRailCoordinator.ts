import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';

/** Narrow chat-shell port: this coordinator has no conversation state of its own. */
export interface ConversationSessionRailHost {
  isEnabled(): boolean;
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  isActiveTabStreaming(): boolean;
  loadConversation(conversationId: string): Promise<void>;
  showNotice(message: string): void;
}

/**
 * Read-only, wide-pane conversation manager (R-F5).
 *
 * It deliberately reuses the shell's canonical list/load contract. Rename,
 * deletion and export remain in the established history dropdown, avoiding a
 * second action surface and a second source of conversation truth.
 */
export class ConversationSessionRailCoordinator {
  private railEl: HTMLElement | null = null;
  private messagesShellEl: HTMLElement | null = null;

  constructor(private readonly host: ConversationSessionRailHost) {}

  refresh(messagesShellEl: HTMLElement | null): void {
    this.messagesShellEl = messagesShellEl;
    if (!messagesShellEl || !this.host.isEnabled()) {
      this.destroyRail();
      return;
    }

    if (!this.railEl || this.railEl.parentElement !== messagesShellEl) {
      this.destroyRail();
      this.railEl = messagesShellEl.createDiv({
        cls: 'opencodian-session-rail',
        attr: {
          'aria-label': t('chat.sessionRail.title'),
        },
      });
      messagesShellEl.addClass('opencodian-messages-shell--session-rail');
    }

    this.render();
  }

  destroy(): void {
    this.destroyRail();
    this.messagesShellEl = null;
  }

  private render(): void {
    const railEl = this.railEl;
    if (!railEl) {
      return;
    }

    railEl.empty();
    railEl.createDiv({
      cls: 'opencodian-session-rail-title',
      text: t('chat.sessionRail.title'),
    });

    const listEl = railEl.createDiv({
      cls: 'opencodian-session-rail-list',
      attr: { role: 'list' },
    });
    const conversations = this.host.getConversations();
    if (conversations.length === 0) {
      listEl.createDiv({
        cls: 'opencodian-session-rail-empty',
        text: t('chat.sessionRail.empty'),
      });
      return;
    }

    const currentConversationId = this.host.getCurrentConversation()?.id ?? null;
    for (const conversation of conversations) {
      const isCurrent = currentConversationId === conversation.id;
      const title = conversation.title || t('chat.history.untitled');
      const itemWrapperEl = listEl.createDiv({ attr: { role: 'listitem' } });
      const itemEl = itemWrapperEl.createEl('button', {
        cls: `opencodian-session-rail-item${isCurrent ? ' is-current' : ''}`,
        text: '',
        attr: {
          type: 'button',
          'aria-current': isCurrent ? 'page' : 'false',
          'aria-label': isCurrent
            ? t('chat.sessionRail.currentItem', { title })
            : t('chat.sessionRail.openItem', { title }),
        },
      });
      itemEl.createSpan({
        cls: 'opencodian-session-rail-item-title',
        text: title,
      });
      itemEl.createSpan({
        cls: 'opencodian-session-rail-item-date',
        text: this.formatConversationDate(conversation.updatedAt ?? conversation.createdAt),
      });
      itemEl.addEventListener('click', () => {
        void this.selectConversation(conversation.id, isCurrent);
      });
    }
  }

  private async selectConversation(conversationId: string, isCurrent: boolean): Promise<void> {
    if (isCurrent || !this.host.isEnabled()) {
      return;
    }
    if (this.host.isActiveTabStreaming()) {
      this.host.showNotice(t('chat.tab.streamingBlocked'));
      return;
    }
    await this.host.loadConversation(conversationId);
    this.render();
  }

  private destroyRail(): void {
    this.railEl?.remove();
    this.railEl = null;
    this.messagesShellEl?.removeClass('opencodian-messages-shell--session-rail');
  }

  private formatConversationDate(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }
}
