import type {
  BuiltPromptSendPayload,
  PromptRequestPart,
  PromptSyntheticTextPartInput,
} from '../../../core/opencode/OpenCodePromptRequestBuilder';
import type {
  ChatMessage,
  Conversation,
  PromptContextItem,
} from '../../../core/types';
import type { EffortLevel, ThinkingBudget } from '../../../core/types/settings';
import { buildContextAttachment } from '../../../shared';
import { getPromptContextTargetKey } from '../composerContext';
import type { TabId } from '../tabs';
import type { ComposerSendContextPort } from './ComposerContextViewFacade';

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

export type ComposerInputMode = 'prompt' | 'shell';

export interface PromptComposerSubmission {
  kind: 'prompt';
  content: string;
  syntheticTextParts?: PromptSyntheticTextPartInput[];
}

export interface CommandComposerSubmission {
  kind: 'command';
  rawContent: string;
  command: string;
  arguments: string;
  syntheticTextParts?: PromptSyntheticTextPartInput[];
}

export interface ShellComposerSubmission {
  kind: 'shell';
  rawContent: string;
  command: string;
}

export type ComposerInputSubmission =
  | PromptComposerSubmission
  | CommandComposerSubmission
  | ShellComposerSubmission;

export interface PrepareMessageSendOptions {
  content: string;
  syntheticTextParts?: PromptSyntheticTextPartInput[];
}

export interface PreparedMessageSend {
  conversation: Conversation;
  tabId: TabId;
  messageID: string;
  requestParts: PromptRequestPart[];
  optimisticUserParts: PromptRequestPart[];
  draftContextItems: PromptContextItem[];
  contextItems: PromptContextItem[];
  modelOptions: SendMessageModelOptions;
  activeModelId?: string;
  userMessage: ChatMessage;
}

export function buildOptimisticUserMessage(
  content: string,
  contextItems: PromptContextItem[],
  now: number = Date.now(),
  structuredSend?: {
    optimisticUserParts?: PromptRequestPart[];
  },
): ChatMessage {
  const contextAttachments = contextItems.map((item) => buildContextAttachment(item));

  return {
    id: `user-${now}`,
    role: 'user',
    content,
    timestamp: now,
    contextAttachments: contextAttachments.length > 0 ? contextAttachments : undefined,
    ...(structuredSend?.optimisticUserParts ? { parts: structuredSend.optimisticUserParts } : {}),
  };
}

export interface MessageSendPreparationHost {
  ensureConversationReady(): Promise<Conversation | null>;
  getActiveTabId(): TabId | null;
  ensureTabRuntime(tabId: TabId | null): boolean;
  isTabForegroundBusy(tabId: TabId | null): boolean;
  notifyForegroundBusy(): void;
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
  buildStructuredPromptSendPayload(
    content: string,
    options: {
      contextItems: PromptContextItem[];
      syntheticTextParts?: PromptSyntheticTextPartInput[];
    },
  ): BuiltPromptSendPayload;
  seedCanonicalUserMessage(input: {
    sessionID: string;
    messageID: string;
    parts: PromptRequestPart[];
    timestamp?: number;
  }): void;
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
}

export class MessageSendPreparationService {
  constructor(
    private readonly host: MessageSendPreparationHost,
    private readonly composerSendContext: ComposerSendContextPort,
  ) {}

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

    const draftContextItems = this.composerSendContext.getDraftContextItems(tabId);
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

    const persistentContextItems = await this.composerSendContext.resolvePersistentContextItems(
      conversation.externalContextPaths,
    );
    const contextItems = this.mergeContextItems(persistentContextItems, draftContextItems);
    const structuredSend = this.host.buildStructuredPromptSendPayload(options.content, {
      contextItems,
      syntheticTextParts: options.syntheticTextParts,
    });
    const userMessage = buildOptimisticUserMessage(
      options.content,
      contextItems,
      Date.now(),
      { optimisticUserParts: structuredSend.optimisticUserParts },
    );
    this.host.seedCanonicalUserMessage({
      sessionID: conversation.openCodeSessionId,
      messageID: structuredSend.messageID,
      parts: structuredSend.optimisticUserParts,
      timestamp: userMessage.timestamp,
    });
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
      messageID: structuredSend.messageID,
      requestParts: structuredSend.requestParts,
      optimisticUserParts: structuredSend.optimisticUserParts,
      draftContextItems,
      contextItems,
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
    this.composerSendContext.clearDraftContextItems(tabId);
  }

  private isFirstUserMessage(conversation: Conversation): boolean {
    return conversation.messages.filter((message) => message.role === 'user').length === 1;
  }

  private mergeContextItems(
    persistentContextItems: PromptContextItem[],
    draftContextItems: PromptContextItem[],
  ): PromptContextItem[] {
    const itemsByTarget = new Map<string, PromptContextItem>();

    for (const item of persistentContextItems) {
      itemsByTarget.set(getPromptContextTargetKey(item), item);
    }

    for (const item of draftContextItems) {
      itemsByTarget.set(getPromptContextTargetKey(item), item);
    }

    return [...itemsByTarget.values()];
  }
}
