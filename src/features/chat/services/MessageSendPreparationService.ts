/* eslint-disable max-lines -- Send preparation keeps preflight, optimistic bootstrap, and one-slot follow-up enqueue in one runtime owner. */
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
import {
  SkillContentExpander,
  type SkillRecord,
} from '../../../core/opencode/SkillContentExpander';
import type {
  ChatMessage,
  Conversation,
  PromptContextItem,
} from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import { t } from '../../../i18n';
import { buildContextAttachment, createLogger } from '../../../shared';
import { getPromptContextTargetKey } from '../composerContext';
import type { SendPipelineStreamElements } from '../runtime/SendPipelineTypes';
import type { TabId } from '../tabs';
import type { ComposerSendContextPort } from './ComposerContextViewFacade';
import type { ConversationWriteTicket } from './ConversationWriteSerializationService';
import type { WritableTabSessionPhase } from './TabSessionPhase';

const logger = createLogger('MessageSendPreparationService');

export type SendPreparationServerAvailability =
  'checking'
  | 'disabled'
  | 'running'
  | 'starting'
  | 'offline'
  | 'external';

export interface SendMessageModelOptions {
  provider?: string;
  model?: string;
  variant?: string;
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
  /** Text preceding the /command when the slash command appears mid-input (e.g. "hello /review" → "hello"). */
  precedingText?: string;
  /** The full original input before mid-text command extraction. Used as fallback prompt when the command is not recognized. */
  originalContent?: string;
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
  targetTabId?: TabId;
  skipSlashCommand?: boolean;
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
  queueFollowUpSend(tabId: TabId | null, request: PrepareMessageSendOptions): boolean;
  consumeQueuedFollowUpSend(tabId: TabId | null): PrepareMessageSendOptions | null;
  notifyForegroundBusy(): void;
  getServerAvailability(): Promise<SendPreparationServerAvailability>;
  refreshServerStatusBadge(): Promise<void>;
  refreshSettingsTabStatus(): void;
  getServerMode(): 'local' | 'remote';
  createAssistantShellContainer(): SendPipelineStreamElements;
  getUnavailableServerPromptMessage(availability: 'checking' | 'disabled' | 'starting' | 'offline'): string;
  finalizeAssistantMessageWithServerError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    error: unknown,
  ): Promise<void>;
  finalizeAssistantMessageWithServerUnavailableError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    availability: 'checking' | 'disabled' | 'starting' | 'offline',
  ): Promise<void>;
  openPluginSettingsAtServerSection(): void;
  startServer(): Promise<void>;
  hasLoadedModelCatalog(): boolean;
  loadAvailableModels(): Promise<void>;
  getSendMessageOptions(): SendMessageModelOptions;
  formatModelId(model: Partial<SendMessageModelOptions> | null | undefined): string | undefined;
  shouldUseModelCatalog(conversation: Conversation): boolean;
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
  loadSkills(): Promise<SkillRecord[]>;
  seedCanonicalUserMessage(input: {
    sessionID: string;
    messageID: string;
    parts: PromptRequestPart[];
    timestamp?: number;
  }): void;
  resetBackgroundTaskIndicator(tabId: TabId | null): void;
  armBackgroundTaskIndicatorForUserMessage(message: ChatMessage, tabId: TabId | null): void;
  startConversationSyncLoop(): void;
  createConversationWriteTicket(conversationId: string): ConversationWriteTicket;
  commitConversationWrite(
    conversation: Conversation,
    ticket: ConversationWriteTicket,
    reason: string,
    write: () => void | Promise<void>,
  ): Promise<boolean>;
  setAutoScrollEnabled(tabId: TabId | null, enabled: boolean): void;
  transitionTabSessionLifecycle(tabId: TabId | null, phase: WritableTabSessionPhase, reason: string): boolean;
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

export interface MessageSendPreparationHostDependencies {
  getCurrentConversation: () => Conversation | null;
  createNewConversation: () => Promise<Conversation | null>;
  createConversationWriteTicket: (conversationId: string) => ConversationWriteTicket;
  commitConversationWrite: (
    conversation: Conversation,
    ticket: ConversationWriteTicket,
    reason: string,
    write: () => void | Promise<void>,
  ) => Promise<boolean>;
  getActiveTabId: () => TabId | null;
  ensureTabRuntimeState: (tabId: TabId) => unknown;
  isTabForegroundBusy: (tabId: TabId) => boolean;
  conversationTabRuntimeCoordinator: {
    setAutoScrollEnabled(tabId: TabId | null, enabled: boolean): void;
    transitionTabSessionLifecycle(tabId: TabId | null, phase: WritableTabSessionPhase, reason: string): boolean;
    setStreaming(tabId: TabId | null, value: boolean): void;
    clearPendingEditedFiles(tabId: TabId | null): void;
    queueFollowUpSend(tabId: TabId | null, request: PrepareMessageSendOptions): boolean;
    consumeQueuedFollowUpSend(tabId: TabId | null): PrepareMessageSendOptions | null;
  };
  getServerAvailability: () => Promise<SendPreparationServerAvailability>;
  chatHeaderPresenter: { refreshServerStatusBadge(): Promise<void> };
  settingsTab: { refreshServerStatusDisplay(): void } | null;
  getServerMode: () => 'local' | 'remote';
  openPluginSettingsAtServerSection: () => void;
  startServer: () => Promise<void>;
  notifyForegroundBusy: () => void;
  assistantShellViewHostAdapter: { createAssistantShellContainer(): SendPipelineStreamElements };
  messageFinalizationService: {
    getUnavailableServerPromptMessage(availability: 'checking' | 'disabled' | 'starting' | 'offline'): string;
    finalizeAssistantMessageWithServerError(
      messageEl: HTMLElement,
      contentEl: HTMLElement,
      error: unknown,
    ): Promise<void>;
    finalizeAssistantMessageWithServerUnavailableError(
      messageEl: HTMLElement,
      contentEl: HTMLElement,
      availability: 'checking' | 'disabled' | 'starting' | 'offline',
    ): Promise<void>;
  };
  chatSelectionControlsCoordinator: {
    hasLoadedModelCatalog(): boolean;
    formatModelId(model: Partial<SendMessageModelOptions> | null | undefined): string | undefined;
    ensureSelectedModelAvailable(
      provider: string | undefined,
      model: string | undefined,
    ): Promise<boolean>;
  };
  reloadModelCatalog: () => Promise<void>;
  getSendMessageOptions: () => SendMessageModelOptions;
  appendModelUnavailableNoticeMessage: () => Promise<void>;
  openCodeService: {
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
    sdk: { app: { skills(): Promise<unknown> } };
  };
  backgroundTaskHost: {
    resetBackgroundTaskIndicator(tabId: TabId | null): void;
    armBackgroundTaskIndicatorForUserMessage(message: ChatMessage, tabId: TabId | null): void;
  };
  conversationSyncBridgePorts: { getLoopControl(): { startConversationSyncLoop(): void } };
  conversationRenderService: { renderMessage(message: ChatMessage): Promise<unknown> };
  scrollToBottom: (options: { tabId: TabId | null; enableAutoScroll?: boolean }) => void;
  applyFallbackConversationTitle: (conversationId: string, firstMessage: string) => Promise<void>;
  getTitleMode: () => string;
  startAiConversationTitleGeneration: (
    conversationId: string,
    firstMessage: string,
    modelOptions: SendMessageModelOptions,
  ) => void;
  activeTabContextUsageCoordinator: { beginTabContextUsageStream(tabId: TabId | null): void };
  syncTabStreamLikeState: (tabId: TabId | null) => void;
}

export class MessageSendPreparationService {
  private readonly agentInvocationService = new AgentInvocationService();
  private readonly skillContentExpander: SkillContentExpander;

  constructor(
    private readonly host: MessageSendPreparationHost,
    private readonly composerSendContext: ComposerSendContextPort,
  ) {
    this.skillContentExpander = new SkillContentExpander({
      loadSkills: () => this.host.loadSkills(),
    });
  }

  // eslint-disable-next-line complexity -- Send preflight deliberately keeps readiness, model, canonical seed, and follow-up enqueue ordering together.
  async prepareMessageSend(
    options: PrepareMessageSendOptions,
  ): Promise<PreparedMessageSend | null> {
    const tabId = options.targetTabId ?? this.host.getActiveTabId();
    if (!tabId || !this.isTargetTabActive(options.targetTabId)) {
      return null;
    }
    // Check server availability BEFORE creating a conversation/session,
    // so we never bootstrap an orphan session when the backend is disabled/offline.
    const earlyAvailability = await this.host.getServerAvailability();
    if (earlyAvailability !== 'running' && earlyAvailability !== 'external') {
      if (!(await this.ensureServerReadyForChat(earlyAvailability))) {
        return null;
      }
    }
    const conversation = await this.host.ensureConversationReady();
    if (!conversation) return null;
    const backendSessionId = getConversationBackendSessionId(conversation);
    if (!backendSessionId) {
      this.resetPreparingLifecycle(tabId);
      return null;
    }
    if (!this.isTargetTabActive(options.targetTabId) || !this.host.ensureTabRuntime(tabId)) return null;
    if (this.host.isTabForegroundBusy(tabId)) {
      if (!this.queueFollowUpSend(tabId, options)) this.host.notifyForegroundBusy();
      return null;
    }
    this.host.transitionTabSessionLifecycle(tabId, 'preparing', 'send-preflight');
    const draftContextItems = this.composerSendContext.getDraftContextItems(tabId);
    const availability = await this.host.getServerAvailability();
    await this.refreshStatusSurfaces();
    if (availability !== 'running' && availability !== 'external') {
      if (!(await this.ensureServerReadyForChat(availability))) {
        this.resetPreparingLifecycle(tabId);
        return null;
      }
    }
    const usesModelCatalog = this.host.shouldUseModelCatalog(conversation);
    const modelOptions = usesModelCatalog ? await this.prepareModelOptions(tabId) : {};
    if (!modelOptions) {
      return null;
    }
    const activeModelId = this.host.formatModelId(modelOptions);
    const persistentContextItems = await this.composerSendContext.resolvePersistentContextItems(conversation.externalContextPaths);
    const contextItems = this.mergeContextItems(persistentContextItems, draftContextItems);
    const resolvedAgentInvocation = this.agentInvocationService.resolveInvocationIntent(options.invocationIntent);
    const requestContent = this.agentInvocationService.removeMentionFallbackText(options.content, resolvedAgentInvocation);
    const skillExpansion = await this.skillContentExpander.expand(requestContent);
    const syntheticTextParts: PromptSyntheticTextPartInput[] = [
      ...(options.syntheticTextParts ?? []),
      ...skillExpansion.syntheticParts.map((part) => ({
        text: part.text,
        ignored: false,
        metadata: { kind: 'skill-expansion', skillName: part.skillName },
      })),
    ];
    const structuredSend = this.host.buildStructuredPromptSendPayload(requestContent, {
      contextItems,
      ...(syntheticTextParts.length > 0 ? { syntheticTextParts } : {}),
      ...(resolvedAgentInvocation.invocationParts.length > 0 ? { invocationParts: resolvedAgentInvocation.invocationParts } : {}),
    });
    const userMessage = buildOptimisticUserMessage(options.content, contextItems, Date.now(), { optimisticUserParts: structuredSend.optimisticUserParts });
    const writeTicket = this.host.createConversationWriteTicket(conversation.id);
    const writeApplied = await this.host.commitConversationWrite(
      conversation,
      writeTicket,
      'optimistic-user-message',
      () => {
        conversation.messages.push(userMessage);
        conversation.updatedAt = userMessage.timestamp;
      },
    );
    if (!writeApplied) {
      this.resetPreparingLifecycle(tabId);
      return null;
    }

    this.host.seedCanonicalUserMessage({
      sessionID: backendSessionId, messageID: structuredSend.messageID,
      parts: structuredSend.optimisticUserParts, timestamp: userMessage.timestamp,
    });
    this.host.resetBackgroundTaskIndicator(tabId);
    this.host.armBackgroundTaskIndicatorForUserMessage(userMessage, tabId);
    this.host.startConversationSyncLoop();
    this.host.setAutoScrollEnabled(tabId, true);
    await this.host.renderMessage(userMessage);
    this.host.scrollToBottom({ tabId, enableAutoScroll: true });
    if (this.isFirstUserMessage(conversation) && (conversation.backend ?? 'opencode') === 'opencode') {
      await this.host.applyFallbackConversationTitle(conversation.id, options.content);
      if (this.host.shouldGenerateAiTitle()) this.host.startAiConversationTitleGeneration(conversation.id, options.content, modelOptions);
    }
    return {
      conversation, tabId, messageID: structuredSend.messageID,
      requestParts: structuredSend.requestParts, optimisticUserParts: structuredSend.optimisticUserParts,
      draftContextItems, contextItems, modelOptions, activeModelId, userMessage,
      resolvedAgentInvocation: resolvedAgentInvocation.invocationParts.length > 0 || resolvedAgentInvocation.agent ? resolvedAgentInvocation : undefined,
    };
  }

  enterStreamingState(tabId: TabId | null): void {
    this.host.transitionTabSessionLifecycle(tabId, 'streaming', 'send-stream-start');
    this.host.setStreaming(tabId, true);
    this.host.syncTabStreamLikeState(tabId);
    this.host.beginTabContextUsageStream(tabId);
  }

  completePreparedStreamStart(tabId: TabId | null): void {
    this.host.clearPendingEditedFiles(tabId);
    this.composerSendContext.clearDraftContextItems(tabId);
  }

  consumeQueuedFollowUpSend(tabId: TabId | null): PrepareMessageSendOptions | null {
    return this.host.consumeQueuedFollowUpSend(tabId);
  }

  private isTargetTabActive(targetTabId: TabId | undefined): boolean {
    return !targetTabId || this.host.getActiveTabId() === targetTabId;
  }

  private resetPreparingLifecycle(tabId: TabId | null): void {
    this.host.transitionTabSessionLifecycle(tabId, 'idle', 'send-preflight-aborted');
  }

  private queueFollowUpSend(tabId: TabId, options: PrepareMessageSendOptions): boolean {
    return this.host.queueFollowUpSend(tabId, {
      content: options.content,
      ...(options.syntheticTextParts ? { syntheticTextParts: [...options.syntheticTextParts] } : {}),
      ...(options.invocationIntent ? { invocationIntent: options.invocationIntent } : {}),
      targetTabId: tabId,
    });
  }

  private isFirstUserMessage(conversation: Conversation): boolean {
    return conversation.messages.filter((message) => message.role === 'user').length === 1;
  }

  private async prepareModelOptions(tabId: TabId): Promise<SendMessageModelOptions | null> {
    if (!this.host.hasLoadedModelCatalog()) await this.host.loadAvailableModels();
    const modelOptions = this.host.getSendMessageOptions();
    const modelAvailable = await this.host.ensureSelectedModelAvailable(
      modelOptions.provider,
      modelOptions.model,
    );
    if (!modelAvailable) {
      await this.host.appendModelUnavailableNoticeMessage();
      this.resetPreparingLifecycle(tabId);
      return null;
    }
    return modelOptions;
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
          : availability === 'disabled'
            ? 'chat.serverStatus.disabled'
            : 'chat.serverStatus.offline'
      )}`,
    });

    const buttonRow = cardEl.createDiv({ cls: 'opencodian-server-action-buttons' });
    const serverMode = this.host.getServerMode();
    const primaryButtonLabel = availability === 'disabled'
      ? t('chat.serverPrompt.enableBackend')
      : serverMode === 'local'
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

    if (choice === 'start' && availability === 'disabled') {
      this.host.openPluginSettingsAtServerSection();
      // Bail out — the user must enable a backend and re-send manually.
      await this.host.finalizeAssistantMessageWithServerUnavailableError(
        messageEl,
        contentEl,
        'disabled',
      );
      return false;
    }

    if (choice === 'settings') this.host.openPluginSettingsAtServerSection();
    if (choice === 'settings' || choice === 'skip') {
      await this.refreshStatusSurfaces();
      const latestAvailability = await this.host.getServerAvailability();
      if (latestAvailability === 'running' || latestAvailability === 'external') {
        messageEl.remove();
        return true;
      }
      await this.host.finalizeAssistantMessageWithServerUnavailableError(
        messageEl, contentEl, latestAvailability as 'checking' | 'disabled' | 'starting' | 'offline',
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

export function createMessageSendPreparationHost(
  deps: MessageSendPreparationHostDependencies,
): MessageSendPreparationHost {
  const { conversationTabRuntimeCoordinator: tabRuntime, chatSelectionControlsCoordinator: selectionCtrl, messageFinalizationService: finalization, assistantShellViewHostAdapter: shellAdapter, chatHeaderPresenter, openCodeService, backgroundTaskHost, conversationSyncBridgePorts, conversationRenderService, activeTabContextUsageCoordinator } = deps;
  return {
    ensureConversationReady: async () => {
      if (!deps.getCurrentConversation()) await deps.createNewConversation();
      return deps.getCurrentConversation();
    },
    getActiveTabId: () => deps.getActiveTabId(),
    ensureTabRuntime: (tabId) => Boolean(tabId && deps.ensureTabRuntimeState(tabId)),
    isTabForegroundBusy: (tabId) => (tabId ? deps.isTabForegroundBusy(tabId) : false),
    queueFollowUpSend: (tabId, request) => tabRuntime.queueFollowUpSend(tabId, request),
    consumeQueuedFollowUpSend: (tabId) => tabRuntime.consumeQueuedFollowUpSend(tabId),
    notifyForegroundBusy: () => deps.notifyForegroundBusy(),
    getServerAvailability: () => deps.getServerAvailability(),
    refreshServerStatusBadge: () => chatHeaderPresenter.refreshServerStatusBadge(),
    refreshSettingsTabStatus: () => deps.settingsTab?.refreshServerStatusDisplay(),
    getServerMode: () => deps.getServerMode(),
    createAssistantShellContainer: () => shellAdapter.createAssistantShellContainer(),
    getUnavailableServerPromptMessage: (a) => finalization.getUnavailableServerPromptMessage(a),
    finalizeAssistantMessageWithServerError: (m, c, e) => finalization.finalizeAssistantMessageWithServerError(m, c, e),
    finalizeAssistantMessageWithServerUnavailableError: (m, c, a) => finalization.finalizeAssistantMessageWithServerUnavailableError(m, c, a),
    openPluginSettingsAtServerSection: () => deps.openPluginSettingsAtServerSection(),
    startServer: () => deps.startServer(),
    hasLoadedModelCatalog: () => selectionCtrl.hasLoadedModelCatalog(),
    loadAvailableModels: () => deps.reloadModelCatalog(),
    getSendMessageOptions: () => deps.getSendMessageOptions(),
    formatModelId: (model) => selectionCtrl.formatModelId(model),
    shouldUseModelCatalog: (conversation) => {
      const backend = conversation.backend ?? 'opencode';
      return backend === 'opencode' || backend === 'claude-code';
    },
    ensureSelectedModelAvailable: (provider, model) => selectionCtrl.ensureSelectedModelAvailable(provider, model),
    appendModelUnavailableNoticeMessage: () => deps.appendModelUnavailableNoticeMessage(),
    buildStructuredPromptSendPayload: (content, options) => openCodeService.buildStructuredPromptSendPayload(content, options),
    loadSkills: async () => {
      const response = await openCodeService.sdk.app.skills();
      return Array.isArray(response) ? response : [];
    },
    seedCanonicalUserMessage: (input) => openCodeService.seedCanonicalUserMessage(input),
    resetBackgroundTaskIndicator: (tabId) => backgroundTaskHost.resetBackgroundTaskIndicator(tabId),
    armBackgroundTaskIndicatorForUserMessage: (message, tabId) => backgroundTaskHost.armBackgroundTaskIndicatorForUserMessage(message, tabId),
    startConversationSyncLoop: () => conversationSyncBridgePorts.getLoopControl().startConversationSyncLoop(),
    createConversationWriteTicket: (conversationId) =>
      deps.createConversationWriteTicket(conversationId),
    commitConversationWrite: (conversation, ticket, reason, write) =>
      deps.commitConversationWrite(conversation, ticket, reason, write),
    setAutoScrollEnabled: (tabId, enabled) => tabRuntime.setAutoScrollEnabled(tabId, enabled),
    transitionTabSessionLifecycle: (tabId, phase, reason) =>
      tabRuntime.transitionTabSessionLifecycle(tabId, phase, reason),
    renderMessage: (message) => conversationRenderService.renderMessage(message),
    scrollToBottom: (options) => deps.scrollToBottom(options),
    applyFallbackConversationTitle: (conversationId, firstMessage) => deps.applyFallbackConversationTitle(conversationId, firstMessage),
    shouldGenerateAiTitle: () => deps.getTitleMode() === 'ai',
    startAiConversationTitleGeneration: (conversationId, firstMessage, modelOptions) => deps.startAiConversationTitleGeneration(conversationId, firstMessage, modelOptions),
    setStreaming: (tabId, value) => tabRuntime.setStreaming(tabId, value),
    syncTabStreamLikeState: (tabId) => deps.syncTabStreamLikeState(tabId),
    beginTabContextUsageStream: (tabId) => activeTabContextUsageCoordinator.beginTabContextUsageStream(tabId),
    clearPendingEditedFiles: (tabId) => tabRuntime.clearPendingEditedFiles(tabId),
  };
}
