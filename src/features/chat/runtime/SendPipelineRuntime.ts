import type {
  PreparedMessageSend,
  PrepareMessageSendOptions,
} from '../services/MessageSendPreparationService';
import type {
  SendPipelineDebugContentBlock,
  SendPipelineDebugPort,
  SendPipelineExecutionHost,
  SendPipelineFinalizationPort,
  SendPipelineHost,
  SendPipelinePersistencePort,
  SendPipelinePreparationPort,
  SendPipelineRuntimeHost,
  SendPipelineShellPort,
  SendPipelineStreamController,
  SendPipelineTabRuntime,
  SendPipelineTransportPort,
  SendPipelineViewPort,
} from './SendPipelineTypes';
import { StreamChunkRouter } from './StreamChunkRouter';
import { StreamLocalFinalizer } from './StreamLocalFinalizer';

export type {
  LocalStreamOutcome,
  SendPipelineDebugContentBlock,
  SendPipelineDebugPort,
  SendPipelineExecutionHost,
  SendPipelineFinalizationPort,
  SendPipelineHost,
  SendPipelinePersistencePort,
  SendPipelinePreparationPort,
  SendPipelineRuntimeHost,
  SendPipelineShellPort,
  SendPipelineStreamController,
  SendPipelineStreamElements,
  SendPipelineTabRuntime,
  SendPipelineTraceState,
  SendPipelineTransportPort,
  SendPipelineViewPort,
  StreamChunkRouterOptions,
  StreamChunkRouterResult,
  StreamLocalFinalizerOptions,
  StreamLocalFinalizerResult,
} from './SendPipelineTypes';

export interface SendPipelineSlashCommandPort {
  tryRunSlashCommand(content: string): Promise<boolean | string>;
}

export interface SendPipelineHostDependencies {
  getTabRuntimeState(tabId: import('../tabs').TabId | null): SendPipelineTabRuntime | null;
  getActiveTabId(): import('../tabs').TabId | null;
  shouldAutoScroll(tabId: import('../tabs').TabId | null): boolean;
  scheduleSettledScrollToBottomIfNeeded(shouldScroll?: boolean, tabId?: import('../tabs').TabId | null): void;
  getOrCreateTabStreamController(tabId: import('../tabs').TabId | null): SendPipelineStreamController | null;
  finalizeBackgroundTaskIndicatorAfterPrimaryStream(tabId: import('../tabs').TabId | null): Promise<void>;
  removeEmptyAssistantShells(): void;
  syncTabStreamLikeState(tabId: import('../tabs').TabId | null): void;
  transitionTabSessionLifecycle: SendPipelineHost['transitionTabSessionLifecycle'];
  refreshServerStatusBadge(): Promise<void>;
  sendStreamMessage: SendPipelineHost['sendStreamMessage'];
  detachStream(sessionId: string | undefined): void;
  syncLatestUserMessageFromServer: SendPipelineHost['syncLatestUserMessageFromServer'];
  beginTabContextUsageStream(tabId: import('../tabs').TabId | null): void;
  completeTabContextUsageStream(tabId: import('../tabs').TabId | null): void;
  applyUsageChunkToTab: SendPipelineHost['applyUsageChunkToTab'];
  showPermissionDialog: SendPipelineHost['showPermissionDialog'];
  showQuestionDialog: SendPipelineHost['showQuestionDialog'];
  convertToStreamingChunk: SendPipelineHost['convertToStreamingChunk'];
  getFriendlyStreamErrorMessage(rawMessage: string): string;
  createSendPipelineShellPort(): import('./SendPipelineTypes').SendPipelineShellPort;
  createConversationWriteTicket: SendPipelineHost['createConversationWriteTicket'];
  commitConversationWrite: SendPipelineHost['commitConversationWrite'];
  summarizeContentBlocksForDebug(blocks: SendPipelineDebugContentBlock[] | undefined): Record<string, unknown> | null;
  summarizeCoreStreamChunkForDebug: SendPipelineHost['summarizeCoreStreamChunkForDebug'];
  summarizeChatMessageForDebug: SendPipelineHost['summarizeChatMessageForDebug'];
  logAssistantFinalizationDebug: SendPipelineHost['logAssistantFinalizationDebug'];
  getLogPreview: SendPipelineHost['getLogPreview'];
  stringifyLogPayload: SendPipelineHost['stringifyLogPayload'];
}

export function createSendPipelineRuntimeHost(deps: SendPipelineHostDependencies): SendPipelineHost {
  const viewPort: SendPipelineViewPort = {
    getTabRuntimeState: (tabId) => deps.getTabRuntimeState(tabId),
    getActiveTabId: () => deps.getActiveTabId(),
    shouldAutoScroll: (tabId) => deps.shouldAutoScroll(tabId),
    scheduleSettledScrollToBottomIfNeeded: (shouldScroll?, tabId?) => {
      deps.scheduleSettledScrollToBottomIfNeeded(shouldScroll, tabId);
    },
    getOrCreateTabStreamController: (tabId) => deps.getOrCreateTabStreamController(tabId),
    finalizeBackgroundTaskIndicatorAfterPrimaryStream: (tabId) =>
      deps.finalizeBackgroundTaskIndicatorAfterPrimaryStream(tabId),
    removeEmptyAssistantShells: () => deps.removeEmptyAssistantShells(),
    syncTabStreamLikeState: (tabId) => deps.syncTabStreamLikeState(tabId),
    transitionTabSessionLifecycle: (tabId, phase, reason) =>
      deps.transitionTabSessionLifecycle(tabId, phase, reason),
    refreshServerStatusBadge: () => deps.refreshServerStatusBadge(),
  };
  const transportPort: SendPipelineTransportPort = {
    sendStreamMessage: (content, options) => deps.sendStreamMessage(content, options),
    detachStream: (sessionId) => deps.detachStream(sessionId),
    syncLatestUserMessageFromServer: (conversation, optimisticMessageId, tabId) =>
      deps.syncLatestUserMessageFromServer(conversation, optimisticMessageId, tabId),
    beginTabContextUsageStream: (tabId) => deps.beginTabContextUsageStream(tabId),
    completeTabContextUsageStream: (tabId) => deps.completeTabContextUsageStream(tabId),
    applyUsageChunkToTab: (tabId, chunk) => deps.applyUsageChunkToTab(tabId, chunk),
    showPermissionDialog: (request, tabId) => deps.showPermissionDialog(request, tabId),
    showQuestionDialog: (request, tabId) => deps.showQuestionDialog(request, tabId),
    convertToStreamingChunk: (chunk) => deps.convertToStreamingChunk(chunk),
    getFriendlyStreamErrorMessage: (rawMessage) => deps.getFriendlyStreamErrorMessage(rawMessage),
  };
  const shellPort: SendPipelineShellPort = deps.createSendPipelineShellPort();
  const persistencePort: SendPipelinePersistencePort = {
    createConversationWriteTicket: (conversationId) =>
      deps.createConversationWriteTicket(conversationId),
    commitConversationWrite: (conversation, ticket, reason, write) =>
      deps.commitConversationWrite(conversation, ticket, reason, write),
  };
  const debugPort: SendPipelineDebugPort = {
    summarizeContentBlocksForDebug: (blocks) =>
      deps.summarizeContentBlocksForDebug(blocks as SendPipelineDebugContentBlock[] | undefined),
    summarizeCoreStreamChunkForDebug: (chunk) => deps.summarizeCoreStreamChunkForDebug(chunk),
    summarizeChatMessageForDebug: (message) => deps.summarizeChatMessageForDebug(message),
    logAssistantFinalizationDebug: (label, payload) => deps.logAssistantFinalizationDebug(label, payload),
    getLogPreview: (text, maxLength) => deps.getLogPreview(text, maxLength),
    stringifyLogPayload: (payload) => deps.stringifyLogPayload(payload),
  };

  return {
    ...viewPort,
    ...transportPort,
    ...shellPort,
    ...persistencePort,
    ...debugPort,
  };
}

export class SendPipelineRuntime {
  constructor(
    private readonly host: SendPipelineRuntimeHost,
    private readonly messageSendPreparationService: SendPipelinePreparationPort,
    private readonly messageFinalizationService: SendPipelineFinalizationPort,
    private readonly slashCommandExecutionService?: SendPipelineSlashCommandPort,
  ) {}

  async sendMessage(input: string | PrepareMessageSendOptions): Promise<void> {
    let preparationOptions = typeof input === 'string' ? { content: input } : input;
    let content = preparationOptions.content;

    if (!preparationOptions.skipSlashCommand) {
      const slashCommandResult = await this.slashCommandExecutionService?.tryRunSlashCommand(content);
      if (slashCommandResult === true) {
        return;
      }
      if (typeof slashCommandResult === 'string') {
        preparationOptions = { ...preparationOptions, content: slashCommandResult, skipSlashCommand: true };
        content = slashCommandResult;
      }
    }

    const preparedSend = await this.messageSendPreparationService.prepareMessageSend(preparationOptions);
    if (!preparedSend) {
      return;
    }

    const execution = this.createStreamingExecution(preparedSend, content);
    if (!execution) {
      return;
    }

    const routedStream = await new StreamChunkRouter({
      host: this.host,
      preparedSend,
      runtime: execution.runtime,
      stream: execution.stream,
      streamController: execution.streamController,
      contentEl: execution.contentEl,
    }).consume();
    const localFinalization = await new StreamLocalFinalizer({
      host: this.host,
      preparedSend,
      runtime: execution.runtime,
      streamController: execution.streamController,
      routedStream,
    }).finalize();

    await this.messageFinalizationService.finalizeAfterStream({
      conversation: preparedSend.conversation,
      tabId: preparedSend.tabId,
      shouldSyncFromServer: localFinalization.shouldSyncFromServer,
      editedFiles: [...execution.runtime.pendingEditedFiles],
      logStage: localFinalization.logAssistantFinalizationStage,
    });
    await this.sendQueuedFollowUp(preparedSend.tabId);
  }

  private async sendQueuedFollowUp(tabId: PreparedMessageSend['tabId']): Promise<void> {
    const queuedSend = this.messageSendPreparationService.consumeQueuedFollowUpSend(tabId);
    if (!queuedSend || this.host.getActiveTabId() !== tabId) {
      return;
    }

    await this.sendMessage({ ...queuedSend, targetTabId: tabId });
  }

  private createStreamingExecution(
    preparedSend: PreparedMessageSend,
    content: string,
  ): {
    runtime: SendPipelineTabRuntime;
    stream: ReturnType<SendPipelineExecutionHost['sendStreamMessage']>;
    streamController: SendPipelineStreamController | null;
    contentEl: HTMLElement;
  } | null {
    const runtime = this.host.getTabRuntimeState(preparedSend.tabId);
    if (!runtime) {
      return null;
    }

    this.messageSendPreparationService.enterStreamingState(preparedSend.tabId);
    const stream = this.host.sendStreamMessage(content, {
      sessionId: preparedSend.conversation.openCodeSessionId,
      ...preparedSend.modelOptions,
      ...(preparedSend.resolvedAgentInvocation?.agent
        ? { agent: preparedSend.resolvedAgentInvocation.agent }
        : {}),
      contextItems: preparedSend.contextItems,
      messageID: preparedSend.messageID,
      requestParts: preparedSend.requestParts,
    });
    this.messageSendPreparationService.completePreparedStreamStart(preparedSend.tabId);
    const streamElements = this.host.createAssistantMessageElement(preparedSend.tabId, true);
    const streamController = this.host.getOrCreateTabStreamController(preparedSend.tabId);

    return {
      runtime,
      stream,
      streamController,
      contentEl: streamElements.contentEl,
    };
  }
}
