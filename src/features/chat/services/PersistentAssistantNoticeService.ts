import type { ChatMessage, Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type { TabConversationSyncFingerprintRuntimePort } from './QuestionTodoBackgroundTaskRuntimeServiceBundle';

export interface PersistentAssistantNoticeMessageOptions {
  title: string;
  content: string;
  tone?: ChatMessage['noticeTone'];
  noticeActions?: ChatMessage['noticeActions'];
  conversation?: Conversation | null;
  tabId?: TabId | null;
  timestamp?: number;
  noticeMeta?: ChatMessage['noticeMeta'];
}

export interface PersistentAssistantNoticeServiceHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  getConversationSyncRuntime(): TabConversationSyncFingerprintRuntimePort;
  renderAssistantMessage(message: ChatMessage): Promise<void>;
  saveConversation(conversation: Conversation): Promise<void>;
  handleVisibleNoticeMessageAppended(): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export class PersistentAssistantNoticeService {
  constructor(private readonly host: PersistentAssistantNoticeServiceHost) {}

  hasMatchingMessage(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation: Conversation | null = this.host.getCurrentConversation(),
  ): boolean {
    return conversation?.messages.some((message) =>
      message.role === 'assistant'
      && message.displayStyle === 'notice'
      && message.noticeTitle === title
      && message.noticeTone === tone
      && message.content === content,
    ) ?? false;
  }

  async appendMessage(options: PersistentAssistantNoticeMessageOptions): Promise<void> {
    const timestamp = options.timestamp ?? Date.now();
    const noticeMessage: ChatMessage = {
      id: `assistant-notice-${timestamp}`,
      role: 'assistant',
      content: options.content,
      timestamp,
      displayStyle: 'notice',
      noticeTitle: options.title,
      noticeTone: options.tone ?? 'warning',
      noticeActions: options.noticeActions,
      noticeMeta: options.noticeMeta,
    };

    const targetConversation = options.conversation ?? this.host.getCurrentConversation();
    if (!targetConversation) {
      return;
    }

    const targetTabId = options.tabId ?? this.host.getActiveTabId();
    const conversationSyncRuntime = this.host.getConversationSyncRuntime();
    const fingerprint = conversationSyncRuntime.getConversationSyncFingerprint([
      ...targetConversation.messages,
      noticeMessage,
    ]);
    const targetConversationIsVisible =
      this.host.getCurrentConversation()?.id === targetConversation.id;

    if (targetConversationIsVisible) {
      await this.host.renderAssistantMessage(noticeMessage);
    }

    targetConversation.messages.push(noticeMessage);
    targetConversation.updatedAt = timestamp;
    await this.host.saveConversation(targetConversation);
    conversationSyncRuntime.setTabConversationSyncFingerprint(targetTabId, fingerprint);

    if (targetConversationIsVisible) {
      this.host.handleVisibleNoticeMessageAppended();
      return;
    }

    this.host.setTabNeedsAttention(targetTabId, true);
  }
}
