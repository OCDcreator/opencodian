import type {
  ResolvedAgentInvocation,
  SurfaceInvocationIntent,
} from '../../../core/agents';
import type { InvocationPromptPart } from '../../../core/agents';
import { AgentInvocationService } from '../../../core/agents';
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
import { t } from '../../../i18n';
import { buildContextAttachment, createLogger } from '../../../shared';
import { getPromptContextTargetKey } from '../composerContext';
import type { SendPipelineStreamElements } from '../runtime/SendPipelineTypes';
import type { TabId } from '../tabs';
import type { ComposerSendContextPort } from './ComposerContextViewFacade';

const logger = createLogger('MessageSendPreparationService');

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
  invocationIntent?: SurfaceInvocationIntent;
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
  invocationIntent?: SurfaceInvocationIntent;
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
  resolvedAgentInvocation?: ResolvedAgentInvocation;
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
  refreshSettingsTabStatus(): void;
  getServerMode(): 'local' | 'remote';
  createAssistantShellContainer(): SendPipelineStreamElements;
  getUnavailableServerPromptMessage(availability: 'checking' | 'starting' | 'offline'): string;
  finalizeAssistantMessageWithServerError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    error: unknown,
  ): Promise<void>;
  finalizeAssistantMessageWithServerUnavailableError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    availability: 'checking' | 'starting' | 'offline',
  ): Promise<void>;
  openPluginSettingsAtServerSection(): void;
  startServer(): Promise<void>;
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
      invocationParts?: readonly InvocationPromptPart[];
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
  private readonly agentInvocationService = new AgentInvocationService();

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
    await this.refreshStatusSurfaces();
    if (availability !== 'running' && availability !== 'external') {
      const ready = await this.ensureServerReadyForChat(availability);
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

    const resolvedAgentInvocation = this.agentInvocationService.resolveInvocationIntent(
      options.invocationIntent,
    );

    const structuredSend = this.host.buildStructuredPromptSendPayload(options.content, {
      contextItems,
      ...(options.syntheticTextParts ? { syntheticTextParts: options.syntheticTextParts } : {}),
      ...(resolvedAgentInvocation.invocationParts.length > 0
        ? { invocationParts: resolvedAgentInvocation.invocationParts }
        : {}),
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
      resolvedAgentInvocation: resolvedAgentInvocation.invocationParts.length > 0 || resolvedAgentInvocation.agent
        ? resolvedAgentInvocation
        : undefined,
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

  async ensureServerReadyForChat(
    availability: Exclude<SendPreparationServerAvailability, 'running' | 'external'>,
  ): Promise<boolean> {
    const { messageEl, contentEl } = this.host.createAssistantShellContainer();
    const cardEl = contentEl.createDiv({ cls: 'opencodian-server-action-card' });
    cardEl.createDiv({
      cls: 'opencodian-server-action-title',
      text: t('chat.serverPrompt.title'),
    });
    cardEl.createDiv({
      cls: 'opencodian-server-action-desc',
      text: this.host.getUnavailableServerPromptMessage(availability),
    });

    const statusEl = cardEl.createDiv({
      cls: 'opencodian-server-action-status',
      text: `${t('chat.serverPrompt.currentStatus')} ${t(
        availability === 'starting'
          ? 'chat.serverStatus.starting'
          : 'chat.serverStatus.offline'
      )}`,
    });

    const buttonRow = cardEl.createDiv({ cls: 'opencodian-server-action-buttons' });
    const serverMode = this.host.getServerMode();
    const primaryButtonLabel = serverMode === 'local'
      ? t('chat.serverPrompt.start')
      : t('chat.serverPrompt.retry');
    const startBtn = buttonRow.createEl('button', {
      cls: 'opencodian-server-action-btn mod-cta',
      text: primaryButtonLabel,
    });
    const skipBtn = buttonRow.createEl('button', {
      cls: 'opencodian-server-action-btn',
      text: t('chat.serverPrompt.skip'),
    });
    const settingsBtn = buttonRow.createEl('button', {
      cls: 'opencodian-server-action-btn',
      text: t('chat.serverPrompt.settings'),
    });

    const choice = await new Promise<'start' | 'skip' | 'settings'>((resolve) => {
      startBtn.addEventListener('click', () => resolve('start'));
      skipBtn.addEventListener('click', () => resolve('skip'));
      settingsBtn.addEventListener('click', () => resolve('settings'));
    });

    if (choice === 'settings') {
      this.host.openPluginSettingsAtServerSection();
      await this.refreshStatusSurfaces();
      const latestAvailability = await this.host.getServerAvailability();
      if (latestAvailability === 'running' || latestAvailability === 'external') {
        messageEl.remove();
        return true;
      }
      await this.host.finalizeAssistantMessageWithServerUnavailableError(
        messageEl,
        contentEl,
        latestAvailability as 'checking' | 'starting' | 'offline',
      );
      return false;
    }

    if (choice === 'skip') {
      await this.refreshStatusSurfaces();
      const latestAvailability = await this.host.getServerAvailability();
      if (latestAvailability === 'running' || latestAvailability === 'external') {
        messageEl.remove();
        return true;
      }
      await this.host.finalizeAssistantMessageWithServerUnavailableError(
        messageEl,
        contentEl,
        latestAvailability as 'checking' | 'starting' | 'offline',
      );
      return false;
    }

    startBtn.disabled = true;
    skipBtn.disabled = true;
    settingsBtn.disabled = true;
    cardEl.addClass('is-starting');
    statusEl.setText(
      serverMode === 'local'
        ? t('chat.serverPrompt.starting')
        : t('chat.serverStatus.checking'),
    );

    try {
      await this.host.startServer();
      await this.refreshStatusSurfaces();
      messageEl.remove();
      this.host.scrollToBottom({ tabId: this.host.getActiveTabId(), enableAutoScroll: true });
      return true;
    } catch (error) {
      logger.error('Failed to start server from chat prompt:', error);
      await this.refreshStatusSurfaces();
      await this.host.finalizeAssistantMessageWithServerError(
        messageEl,
        contentEl,
        error,
      );
      return false;
    }
  }

  private async refreshStatusSurfaces(): Promise<void> {
    await this.host.refreshServerStatusBadge();
    this.host.refreshSettingsTabStatus();
  }

  createServerReadinessDelegate(): {
    ensureServerReadyForChat: (
      availability: Exclude<SendPreparationServerAvailability, 'running' | 'external'>,
    ) => Promise<boolean>;
  } {
    return {
      ensureServerReadyForChat: (availability) =>
        this.ensureServerReadyForChat(availability),
    };
  }
}
