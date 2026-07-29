import type {
  ChatMessage,
  Conversation,
  StreamChunk as CoreStreamChunk,
} from '../../../../src/core/types';
import {
  type SendPipelineFinalizationPort,
  type SendPipelineHost,
  type SendPipelinePreparationPort,
  SendPipelineRuntime,
  type SendPipelineSlashCommandPort,
  type SendPipelineStreamController,
  type SendPipelineTabRuntime,
} from '../../../../src/features/chat/runtime/SendPipelineRuntime';
import type { PreparedMessageSend } from '../../../../src/features/chat/services/MessageSendPreparationService';
import type {
  ContentBlock as StreamingContentBlock,
  StreamChunk as StreamingChunk,
} from '../../../../src/utils/streaming';

export function createUserMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'user-1',
    role: 'user',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

export function createConversation(messages: ChatMessage[] = []): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

export function createPreparedSend(overrides: Partial<PreparedMessageSend> = {}): PreparedMessageSend {
  const userMessage = overrides.userMessage ?? createUserMessage();
  return {
    conversation: overrides.conversation ?? createConversation([userMessage]),
    tabId: overrides.tabId ?? 'tab-1',
    messageID: overrides.messageID ?? 'message-1',
    requestParts: overrides.requestParts ?? [{ id: 'part-1', type: 'text', text: 'Hello' }],
    optimisticUserParts: overrides.optimisticUserParts ?? [{ id: 'part-1', type: 'text', text: 'Hello' }],
    draftContextItems: overrides.draftContextItems ?? [],
    contextItems: overrides.contextItems ?? [],
    modelOptions: overrides.modelOptions ?? {
      provider: 'openai',
      model: 'gpt-5.4',
    },
    activeModelId: overrides.activeModelId ?? 'openai/gpt-5.4',
    userMessage,
    ...(overrides.resolvedAgentInvocation
      ? { resolvedAgentInvocation: overrides.resolvedAgentInvocation }
      : {}),
  };
}

export function createTabRuntime(): SendPipelineTabRuntime {
  return {
    isStreaming: true,
    streamingMessageEl: null,
    streamingContentEl: null,
    pendingEditedFiles: new Set<string>(),
    pendingQuestionResolution: null,
    isConversationSyncInFlight: false,
  };
}

export async function* createAsyncStream(chunks: CoreStreamChunk[]): AsyncGenerator<CoreStreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

export type MockedPreparationPort = {
  [Key in keyof SendPipelinePreparationPort]:
    SendPipelinePreparationPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SendPipelinePreparationPort[Key];
};

export type MockedFinalizationPort = {
  [Key in keyof SendPipelineFinalizationPort]:
    SendPipelineFinalizationPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SendPipelineFinalizationPort[Key];
};

export type MockedSendPipelineHost = {
  [Key in keyof SendPipelineHost]:
    SendPipelineHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SendPipelineHost[Key];
};

export type MockedSlashCommandPort = {
  [Key in keyof SendPipelineSlashCommandPort]:
    SendPipelineSlashCommandPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SendPipelineSlashCommandPort[Key];
};

export function createStreamController(callOrder: string[] = []): SendPipelineStreamController {
  const contentBlocks: StreamingContentBlock[] = [];

  return {
    startStream: jest.fn().mockImplementation(() => {
      callOrder.push('startStream');
    }),
    handleChunk: jest.fn().mockImplementation(async (chunk: StreamingChunk) => {
      callOrder.push(`handleChunk:${chunk.type}`);
      if (chunk.type === 'text') {
        contentBlocks.push({ type: 'text', content: chunk.content });
      } else if (chunk.type === 'thinking') {
        contentBlocks.push({
          type: 'thinking',
          content: chunk.content,
          partId: chunk.partId,
          durationSeconds: chunk.durationSeconds,
        });
      } else if (chunk.type === 'tool_use') {
        contentBlocks.push({
          type: 'tool_call',
          toolCall: {
            id: chunk.id,
            name: chunk.name,
            kind: chunk.kind,
            input: chunk.input,
            status: 'completed',
          },
        });
      }
    }),
    cancelStream: jest.fn(),
    getContentBlocks: jest.fn().mockImplementation(() => contentBlocks),
  };
}

export function createPreparationPort(
  preparedSend: PreparedMessageSend | null,
  callOrder: string[] = [],
  overrides: Partial<MockedPreparationPort> = {},
): MockedPreparationPort {
  return {
    prepareMessageSend: jest.fn().mockResolvedValue(preparedSend),
    enterStreamingState: jest.fn().mockImplementation(() => {
      callOrder.push('enterStreamingState');
    }),
    completePreparedStreamStart: jest.fn().mockImplementation(() => {
      callOrder.push('completePreparedStreamStart');
    }),
    consumeQueuedFollowUpSend: jest.fn().mockReturnValue(null),
    ...overrides,
  };
}

export function createFinalizationPort(callOrder: string[] = []): MockedFinalizationPort {
  return {
    finalizeAfterStream: jest.fn().mockImplementation(async () => {
      callOrder.push('finalizeAfterStream');
    }),
  };
}

export function createHost(
  runtime: SendPipelineTabRuntime,
  streamController: SendPipelineStreamController,
  callOrder: string[] = [],
  overrides: Partial<MockedSendPipelineHost> = {},
): MockedSendPipelineHost {
  const messageEl = document.createElement('div');
  const contentEl = document.createElement('div');
  messageEl.appendChild(contentEl);
  runtime.streamingMessageEl = messageEl;
  runtime.streamingContentEl = contentEl;

  const host: MockedSendPipelineHost = {
    getTabRuntimeState: jest.fn().mockReturnValue(runtime),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    shouldAutoScroll: jest.fn().mockReturnValue(true),
    scheduleSettledScrollToBottomIfNeeded: jest.fn(),
    sendStreamMessage: jest.fn().mockImplementation(() => createAsyncStream([])),
    detachStream: jest.fn(),
    createAssistantMessageElement: jest.fn().mockReturnValue({ messageEl, contentEl }),
    getOrCreateTabStreamController: jest.fn().mockReturnValue(streamController),
    summarizeContentBlocksForDebug: jest.fn().mockImplementation((blocks) => (
      blocks
        ? { count: blocks.length }
        : { count: 0 }
    )),
    logAssistantFinalizationDebug: jest.fn(),
    getLogPreview: jest.fn().mockImplementation((text: string, maxLength = 180) => (
      text.length > maxLength ? text.slice(0, maxLength) : text
    )),
    summarizeCoreStreamChunkForDebug: jest.fn().mockImplementation((chunk: CoreStreamChunk) => (
      chunk.type === 'message_metadata'
        ? {
            messageId: chunk.messageId,
            timestamp: chunk.timestamp,
            modelId: chunk.modelId ?? null,
          }
        : { type: chunk.type }
    )),
    getFriendlyStreamErrorMessage: jest.fn().mockImplementation((rawMessage: string) => (
      rawMessage ? `Friendly: ${rawMessage}` : 'Friendly: empty'
    )),
    revealStreamingAssistantMessageElement: jest.fn().mockReturnValue(messageEl),
    syncLatestUserMessageFromServer: jest.fn().mockResolvedValue(undefined),
    beginTabContextUsageStream: jest.fn(),
    completeTabContextUsageStream: jest.fn(),
    applyUsageChunkToTab: jest.fn(),
    showPermissionDialog: jest.fn().mockResolvedValue(undefined),
    showQuestionDialog: jest.fn().mockResolvedValue(undefined),
    convertToStreamingChunk: jest.fn().mockImplementation((chunk: CoreStreamChunk) => {
      switch (chunk.type) {
        case 'text':
          return { type: 'text', content: chunk.content };
        case 'thinking':
          return {
            type: 'thinking',
            content: chunk.content,
            partId: chunk.partId,
            durationSeconds: chunk.durationSeconds,
          };
        case 'tool_use':
          return {
            type: 'tool_use',
            id: chunk.id,
            name: chunk.name,
            kind: chunk.kind,
            input: chunk.input,
          };
        case 'tool_result':
          return {
            type: 'tool_result',
            id: chunk.toolUseId,
            content: chunk.content,
            isError: chunk.isError,
          };
        case 'error':
          return { type: 'error', content: chunk.content };
        default:
          return null;
      }
    }),
    renderAssistantPlaceholderAsNotice: jest.fn().mockResolvedValue(undefined),
    addTimestampWithCopyButton: jest.fn(),
    renderStructuredOutputIfPresent: jest.fn(),
    finalizeBackgroundTaskIndicatorAfterPrimaryStream: jest.fn().mockResolvedValue(undefined),
    removeEmptyAssistantShells: jest.fn(),
    syncTabStreamLikeState: jest.fn(),
    transitionTabSessionLifecycle: jest.fn().mockReturnValue(true),
    refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
    refreshOpenCodeDiagnosticsState: jest.fn(),
    saveConversation: jest.fn().mockImplementation(async () => {
      callOrder.push('saveConversation');
    }),
    createConversationWriteTicket: jest.fn().mockImplementation((conversationId: string) => ({
      conversationId,
      version: 0,
    })),
    commitConversationWrite: jest.fn().mockImplementation(async (
      conversation,
      _ticket,
      _reason,
      write,
    ) => {
      await write();
      await host.saveConversation(conversation);
      return true;
    }),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) => (
      message
        ? { id: message.id, role: message.role }
        : null
    )),
    stringifyLogPayload: jest.fn().mockImplementation((payload: unknown) => JSON.stringify(payload)),
    ...overrides,
  };
  return host;
}

export { SendPipelineRuntime };
