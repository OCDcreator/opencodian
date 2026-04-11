import type {
  ChatMessage,
  Conversation,
  PromptContextItem,
} from '../../../core/types';
import type { EffortLevel, ThinkingBudget } from '../../../core/types/settings';
import { buildContextAttachment } from '../../../shared';
import type { TabId } from '../tabs';

export type SendPreparationServerAvailability =
  'checking'
  | 'running'
  | 'starting'
  | 'offline'
  | 'external';

export interface SendMessageModelOptions {
  provider?: string;
  model?: string;
  reasoningEffort?: EffortLevel;
  thinkingBudget?: ThinkingBudget;
}

export interface PrepareMessageSendOptions {
  content: string;
}

export interface PreparedMessageSend {
  conversation: Conversation;
  tabId: TabId;
  draftContextItems: PromptContextItem[];
  modelOptions: SendMessageModelOptions;
  activeModelId?: string;
  userMessage: ChatMessage;
}

export function buildOptimisticUserMessage(
  content: string,
  draftContextItems: PromptContextItem[],
  now: number = Date.now(),
): ChatMessage {
  const contextAttachments = draftContextItems.map((item) => buildContextAttachment(item));

  return {
    id: `user-${now}`,
    role: 'user',
    content,
    timestamp: now,
    contextAttachments: contextAttachments.length > 0 ? contextAttachments : undefined,
  };
}

export interface MessageSendPreparationHost {
  ensureConversationReady(): Promise<Conversation | null>;
  getActiveTabId(): TabId | null;
  ensureTabRuntime(tabId: TabId | null): boolean;
  isTabForegroundBusy(tabId: TabId | null): boolean;
  notifyForegroundBusy(): void;
  getDraftContextItems(tabId: TabId | null): PromptContextItem[];
  getServerAvailability(): Promise<SendPreparationServerAvailability>;
  refreshServerStatusBadge(): Promise<void>;
  ensureServerReadyForChat(
    availability: Exclude<SendPreparationServerAvailability, 'running' | 'external'>,
  ): Promise<boolean>;
  hasLoadedModelCatalog(): boolean;
  loadAvailableModels(): Promise<void>;
  getSendMessageOptions(): SendMessageModelOptions;
  formatModelId(model: Partial<SendMessageModelOptions> | null | undefined): string | undefined;
  ensureSelectedModelAvailable(provider: string | undefined, model: string | undefined): Promise<boolean>;
  appendModelUnavailableNoticeMessage(): Promise<void>;
  resetBackgroundTaskIndicator(tabId: TabId | null): void;
  armBackgroundTaskIndicatorForUserMessage(message: ChatMessage, tabId: TabId | null): void;
  startConversationSyncLoop(): void;
  saveConversation(conversation: Conversation): Promise<void>;
  setAutoScrollEnabled(tabId: TabId | null, enabled: boolean): void;
  renderMessage(message: ChatMessage): Promise<unknown>;
  scrollToBottom(options: { tabId: TabId | null; enableAutoScroll?: boolean }): void;
  applyFallbackConversationTitle(conversationId: string, firstMessage: string): Promise<void>;
  shouldGenerateAiTitle(): boolean;
  startAiConversationTitleGeneration(
    conversationId: string,
    firstMessage: string,
    modelOptions: SendMessageModelOptions,
  ): void;
  setStreaming(tabId: TabId | null, value: boolean): void;
  syncTabStreamLikeState(tabId: TabId | null): void;
  beginTabContextUsageStream(tabId: TabId | null): void;
  clearPendingEditedFiles(tabId: TabId | null): void;
  clearDraftContextItems(tabId: TabId | null): void;
}

export class MessageSendPreparationService {
  constructor(private readonly host: MessageSendPreparationHost) {}

  async prepareMessageSend(
    options: PrepareMessageSendOptions,
  ): Promise<PreparedMessageSend | null> {
    const conversation = await this.host.ensureConversationReady();
    if (!conversation) {
      return null;
    }

    const tabId = this.host.getActiveTabId();
    if (!tabId || !this.host.ensureTabRuntime(tabId)) {
      return null;
    }

    if (this.host.isTabForegroundBusy(tabId)) {
      this.host.notifyForegroundBusy();
      return null;
    }

    const draftContextItems = this.host.getDraftContextItems(tabId);
    const availability = await this.host.getServerAvailability();
    await this.host.refreshServerStatusBadge();
    if (availability !== 'running' && availability !== 'external') {
      const ready = await this.host.ensureServerReadyForChat(availability);
      if (!ready) {
        return null;
      }
    }

    if (!this.host.hasLoadedModelCatalog()) {
      await this.host.loadAvailableModels();
    }

    const modelOptions = this.host.getSendMessageOptions();
    const activeModelId = this.host.formatModelId(modelOptions);
    const modelAvailable = await this.host.ensureSelectedModelAvailable(
      modelOptions.provider,
      modelOptions.model,
    );
    if (!modelAvailable) {
      await this.host.appendModelUnavailableNoticeMessage();
      return null;
    }

    const userMessage = buildOptimisticUserMessage(options.content, draftContextItems);
    this.host.resetBackgroundTaskIndicator(tabId);
    this.host.armBackgroundTaskIndicatorForUserMessage(userMessage, tabId);
    conversation.messages.push(userMessage);
    conversation.updatedAt = userMessage.timestamp;
    this.host.startConversationSyncLoop();
    await this.host.saveConversation(conversation);
    this.host.setAutoScrollEnabled(tabId, true);
    await this.host.renderMessage(userMessage);
    this.host.scrollToBottom({ tabId, enableAutoScroll: true });

    if (this.isFirstUserMessage(conversation)) {
      await this.host.applyFallbackConversationTitle(conversation.id, options.content);
      if (this.host.shouldGenerateAiTitle()) {
        this.host.startAiConversationTitleGeneration(conversation.id, options.content, modelOptions);
      }
    }

    return {
      conversation,
      tabId,
      draftContextItems,
      modelOptions,
      activeModelId,
      userMessage,
    };
  }

  enterStreamingState(tabId: TabId | null): void {
    this.host.setStreaming(tabId, true);
    this.host.syncTabStreamLikeState(tabId);
    this.host.beginTabContextUsageStream(tabId);
  }

  completePreparedStreamStart(tabId: TabId | null): void {
    this.host.clearPendingEditedFiles(tabId);
    this.host.clearDraftContextItems(tabId);
  }

  private isFirstUserMessage(conversation: Conversation): boolean {
    return conversation.messages.filter((message) => message.role === 'user').length === 1;
  }
}
