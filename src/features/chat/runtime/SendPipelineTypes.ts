import type {
  SessionActivityStatus,
} from '../../../core/opencode';
import type {
  ChatMessage,
  Conversation,
  ImageAttachment,
  PromptContextItem,
  QuestionRequest,
  QuestionResolution,
  StreamChunk as CoreStreamChunk,
} from '../../../core/types';
import type { AgentBackendKind } from '../../../core/types/chat';
import type {
  ContentBlock as StreamingContentBlock,
  StreamChunk as StreamingChunk,
} from '../../../utils/streaming';
import type { ConversationWriteTicket } from '../services/ConversationWriteSerializationService';
import type { FinalizeMessageOptions } from '../services/MessageFinalizationService';
import type {
  PreparedMessageSend,
  PrepareMessageSendOptions,
  SendMessageModelOptions,
} from '../services/MessageSendPreparationService';
import type { WritableTabSessionPhase } from '../services/TabSessionPhase';
import type { TabId } from '../tabs';

export interface SendPipelineTabRuntime {
  isStreaming: boolean;
  streamingMessageEl: HTMLElement | null;
  streamingContentEl: HTMLElement | null;
  pendingEditedFiles: Set<string>;
  pendingQuestionResolution: QuestionResolution | null;
  isConversationSyncInFlight: boolean;
  sessionStatusSessionId?: string | null;
  sessionStatus?: SessionActivityStatus | null;
}

export interface SendPipelineStreamController {
  startStream(contentEl: HTMLElement): void;
  handleChunk(chunk: StreamingChunk): Promise<void>;
  cancelStream(): void;
  getContentBlocks(): StreamingContentBlock[];
}

export interface SendPipelineStreamElements {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
}

export interface SendPipelineDebugContentBlock {
  type?: string;
  text?: string;
  content?: string;
  toolId?: string;
  toolName?: string;
  toolCall?: { id?: string; name?: string } | null;
}

export interface SendPipelinePreparationPort {
  prepareMessageSend(options: PrepareMessageSendOptions): Promise<PreparedMessageSend | null>;
  enterStreamingState(tabId: TabId | null): void;
  completePreparedStreamStart(tabId: TabId | null): void;
  consumeQueuedFollowUpSend(tabId: TabId | null): PrepareMessageSendOptions | null;
}

export interface SendPipelineFinalizationPort {
  finalizeAfterStream(options: FinalizeMessageOptions): Promise<void>;
}

export interface SendPipelineViewPort {
  getTabRuntimeState(tabId: TabId | null): SendPipelineTabRuntime | null;
  getActiveTabId(): TabId | null;
  shouldAutoScroll(tabId: TabId | null): boolean;
  scheduleSettledScrollToBottomIfNeeded(shouldScroll?: boolean, tabId?: TabId | null): void;
  getOrCreateTabStreamController(tabId: TabId | null): SendPipelineStreamController | null;
  finalizeBackgroundTaskIndicatorAfterPrimaryStream(tabId: TabId | null): Promise<void>;
  removeEmptyAssistantShells(): void;
  syncTabStreamLikeState(tabId: TabId | null): void;
  transitionTabSessionLifecycle(tabId: TabId | null, phase: WritableTabSessionPhase, reason: string): boolean;
  refreshServerStatusBadge(): Promise<void>;
}

export interface SendPipelineTransportPort {
  sendStreamMessage(
    conversation: Conversation,
    content: string,
    options: SendMessageModelOptions & {
      sessionId?: string;
      agent?: string;
      contextItems: PromptContextItem[];
      messageID: PreparedMessageSend['messageID'];
      requestParts: PreparedMessageSend['requestParts'];
      /** One-shot structured-output schema for Claude Code `/json` trigger. Not persisted. */
      outputFormat?: Record<string, unknown>;
      images?: ImageAttachment[];
    },
  ): AsyncGenerator<CoreStreamChunk>;
  detachStream(sessionId: string | undefined): void;
  syncLatestUserMessageFromServer(
    conversation: Conversation,
    optimisticMessageId: string,
    tabId: TabId | null,
  ): Promise<void>;
  beginTabContextUsageStream(tabId: TabId | null): void;
  completeTabContextUsageStream(tabId: TabId | null): void;
  applyUsageChunkToTab(
    tabId: TabId | null,
    chunk: Extract<CoreStreamChunk, { type: 'usage' }>,
  ): void;
  applyContextUsageSnapshotToTab(
    tabId: TabId | null,
    snapshot: Extract<CoreStreamChunk, { type: 'context_usage' }>['snapshot'],
  ): void;
  showPermissionDialog(
    request: Extract<CoreStreamChunk, { type: 'permission_request' }>,
    tabId: TabId | null,
  ): Promise<void>;
  showQuestionDialog(request: QuestionRequest, tabId: TabId | null): Promise<void>;
  convertToStreamingChunk(chunk: CoreStreamChunk): StreamingChunk | null;
  getFriendlyStreamErrorMessage(rawMessage: string, backend: AgentBackendKind): string;
}

export interface SendPipelineShellPort {
  createAssistantMessageElement(
    tabId: TabId | null,
    hiddenUntilVisible: boolean,
  ): SendPipelineStreamElements;
  revealStreamingAssistantMessageElement(tabId: TabId | null): HTMLElement | null;
  renderAssistantPlaceholderAsNotice(
    messageEl: HTMLElement,
    noticeMessage: ChatMessage,
    reason?: string,
  ): Promise<void>;
  addTimestampWithCopyButton(options: {
    messageEl: HTMLElement;
    timestamp: number;
    content?: string;
    modelId?: string;
    statusLabel?: string;
  }): void;
  renderStructuredOutputIfPresent(
    messageEl: HTMLElement,
    structuredOutput: unknown,
  ): void;
}

export interface SendPipelinePersistencePort {
  createConversationWriteTicket(conversationId: string): ConversationWriteTicket;
  commitConversationWrite(
    conversation: Conversation,
    ticket: ConversationWriteTicket,
    reason: string,
    write: () => void | Promise<void>,
  ): Promise<boolean>;
}

export interface SendPipelineDebugPort {
  summarizeContentBlocksForDebug(
    blocks: SendPipelineDebugContentBlock[] | undefined,
  ): Record<string, unknown> | null;
  logAssistantFinalizationDebug(label: string, payload: unknown): void;
  getLogPreview(text: string, maxLength?: number): string;
  summarizeCoreStreamChunkForDebug(chunk: CoreStreamChunk): Record<string, unknown> | null;
  summarizeChatMessageForDebug(message: ChatMessage | null | undefined): Record<string, unknown> | null;
  stringifyLogPayload(payload: unknown): string;
}

export interface SendPipelineHost extends
  SendPipelineViewPort,
  SendPipelineTransportPort,
  SendPipelineShellPort,
  SendPipelinePersistencePort,
  SendPipelineDebugPort {}

export type SendPipelineExecutionHost =
  Pick<SendPipelineViewPort, 'getTabRuntimeState' | 'getOrCreateTabStreamController'>
  & Pick<SendPipelineTransportPort, 'sendStreamMessage'>
  & Pick<SendPipelineShellPort, 'createAssistantMessageElement'>;

export type PendingIndicatorHost =
  Pick<SendPipelineViewPort, 'getActiveTabId' | 'shouldAutoScroll' | 'scheduleSettledScrollToBottomIfNeeded'>
  & Pick<SendPipelineShellPort, 'revealStreamingAssistantMessageElement'>;

export type SendPipelineTraceHost =
  Pick<SendPipelineDebugPort, 'summarizeContentBlocksForDebug' | 'logAssistantFinalizationDebug' | 'getLogPreview'>;

export type StreamChunkRouterHost =
  Pick<SendPipelineViewPort, 'getActiveTabId' | 'shouldAutoScroll' | 'scheduleSettledScrollToBottomIfNeeded' | 'syncTabStreamLikeState'>
  & Pick<SendPipelineTransportPort,
    | 'detachStream'
    | 'syncLatestUserMessageFromServer'
    | 'beginTabContextUsageStream'
    | 'completeTabContextUsageStream'
    | 'applyUsageChunkToTab'
    | 'applyContextUsageSnapshotToTab'
    | 'showPermissionDialog'
    | 'showQuestionDialog'
    | 'convertToStreamingChunk'
    | 'getFriendlyStreamErrorMessage'
  >
  & Pick<SendPipelineShellPort, 'revealStreamingAssistantMessageElement'>
  & SendPipelineTraceHost
  & Pick<SendPipelineDebugPort, 'summarizeCoreStreamChunkForDebug'>;

export type StreamShellFinalizerHost = Pick<
  SendPipelineShellPort,
  'addTimestampWithCopyButton' | 'renderAssistantPlaceholderAsNotice' | 'renderStructuredOutputIfPresent'
>;

export type LocalStreamPersistenceHost =
  SendPipelinePersistencePort
  & Pick<SendPipelineDebugPort, 'summarizeChatMessageForDebug' | 'stringifyLogPayload' | 'getLogPreview'>;

export type StreamLocalFinalizerHost =
  Pick<SendPipelineViewPort,
    | 'getActiveTabId'
    | 'scheduleSettledScrollToBottomIfNeeded'
    | 'finalizeBackgroundTaskIndicatorAfterPrimaryStream'
    | 'removeEmptyAssistantShells'
    | 'syncTabStreamLikeState'
    | 'transitionTabSessionLifecycle'
    | 'refreshServerStatusBadge'
  >
  & Pick<SendPipelineTransportPort, 'completeTabContextUsageStream'>
  & Pick<SendPipelineDebugPort, 'summarizeContentBlocksForDebug'>
  & StreamShellFinalizerHost
  & LocalStreamPersistenceHost;

export type SendPipelineRuntimeHost =
  SendPipelineExecutionHost
  & StreamChunkRouterHost
  & StreamLocalFinalizerHost;

export interface SendPipelineTraceState {
  streamCompleted: boolean;
  streamInterrupted: boolean;
  streamTimedOut: boolean;
  latestErrorMessage: string | null;
  finalizedAssistantMetadata: Extract<CoreStreamChunk, { type: 'message_metadata' }> | null;
  finalizedBackendSessionId: string | null;
  resolvedUserMessageIdentity: string | null;
}

export interface StreamChunkRouterOptions {
  host: StreamChunkRouterHost;
  preparedSend: PreparedMessageSend;
  runtime: SendPipelineTabRuntime;
  stream: AsyncGenerator<CoreStreamChunk>;
  streamController: SendPipelineStreamController | null;
  contentEl: HTMLElement;
}

export interface StreamChunkRouterResult extends SendPipelineTraceState {
  logAssistantFinalizationStage(stage: string, payload?: Record<string, unknown>): void;
  resetStreamingState(): void;
  cleanupPendingIndicator(): void;
  structuredOutput?: unknown;
}

export interface LocalStreamOutcome {
  finalizedTimestamp: number;
  finalizedModelId: string | undefined;
  finalizedAssistantMessageId: string | undefined;
  finalizedBackendSessionId: string | undefined;
  finalizedStreamingMessageEl: HTMLElement | null;
  streamContentBlocks: StreamingContentBlock[] | undefined;
  streamedTextContent: string;
  hasStreamContentBlocks: boolean;
  shouldPersistInterruptedState: boolean;
  streamErrorNoticeMessage: ChatMessage | null;
  interruptedNoticeMessage: ChatMessage | null;
  shouldSyncFromServer: boolean;
  structuredOutput?: unknown;
  resolvedUserMessageIdentity: string | null;
}

export interface StreamLocalFinalizerOptions {
  host: StreamLocalFinalizerHost;
  preparedSend: PreparedMessageSend;
  runtime: SendPipelineTabRuntime;
  streamController: SendPipelineStreamController | null;
  routedStream: StreamChunkRouterResult;
}

export interface StreamLocalFinalizerResult {
  shouldSyncFromServer: boolean;
  logAssistantFinalizationStage(stage: string, payload?: Record<string, unknown>): void;
}
