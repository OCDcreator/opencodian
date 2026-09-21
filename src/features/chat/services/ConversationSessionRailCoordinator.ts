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
  private static nextInstanceId = 0;
  private readonly titleId: string;
  private railEl: HTMLElement | null = null;
  private messagesShellEl: HTMLElement | null = null;

  constructor(private readonly host: ConversationSessionRailHost) {
    this.titleId = `opencodian-session-rail-title-${++ConversationSessionRailCoordinator.nextInstanceId}`;
  }

  refresh(messagesShellEl: HTMLElement | null): void {
    this.messagesShellEl = messagesShellEl;
    if (!messagesShellEl || !this.host.isEnabled()) {
      this.destroyRail();
      return;
    }

    if (!this.railEl || this.railEl.parentElement !== messagesShellEl) {
      this.destroyRail();
      // `role="navigation"` because the rail's purpose is navigating between
      // conversations (each item loads a different session) — the ARIA
      // definition of a navigation landmark. `complementary` would describe it
      // as tangential supporting content, which understates the primary session
      // switcher in a wide pane. A bare `div` with only `aria-label` has no
      // nameable role, so screen readers may ignore the label entirely; the
      // landmark is named from its own visible title via `aria-labelledby`.
      this.railEl = messagesShellEl.createDiv({
        cls: 'opencodian-session-rail',
        attr: {
          role: 'navigation',
          'aria-labelledby': this.titleId,
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
      // Heading semantics so the visible title is announced as the landmark's
      // heading, and doubles as the `aria-labelledby` name source.
      attr: {
        id: this.titleId,
        role: 'heading',
        'aria-level': '2',
      },
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
