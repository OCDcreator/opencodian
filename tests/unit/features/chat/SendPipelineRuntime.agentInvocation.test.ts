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
  type SendPipelineStreamController,
  type SendPipelineTabRuntime,
} from '../../../../src/features/chat/runtime/SendPipelineRuntime';
import type {
  PreparedMessageSend,
  PrepareMessageSendOptions,
} from '../../../../src/features/chat/services/MessageSendPreparationService';
import type {
  ContentBlock as StreamingContentBlock,
  StreamChunk as StreamingChunk,
} from '../../../../src/utils/streaming';

function createConversation(messages: ChatMessage[] = []): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

function createPreparedSend(): PreparedMessageSend {
  return {
    conversation: createConversation([{
      id: 'user-1',
      role: 'user',
      content: 'Hello',
      timestamp: 1,
    }]),
    tabId: 'tab-1',
    messageID: 'message-1',
    requestParts: [
      { id: 'part-1', type: 'text', text: 'Hello' },
      { id: 'part-2', type: 'agent', name: 'reviewer' },
    ],
    optimisticUserParts: [
      { id: 'part-1', type: 'text', text: 'Hello' },
      { id: 'part-2', type: 'agent', name: 'reviewer' },
    ],
    draftContextItems: [],
    contextItems: [],
    modelOptions: {
      provider: 'openai',
      model: 'gpt-5.4',
    },
    activeModelId: 'openai/gpt-5.4',
    userMessage: {
      id: 'user-1',
      role: 'user',
      content: 'Hello',
      timestamp: 1,
    },
    resolvedAgentInvocation: {
      agent: 'plan',
      invocationParts: [{ type: 'agent', name: 'reviewer' }],
    },
  };
}

function createTabRuntime(): SendPipelineTabRuntime {
  return {
    isStreaming: true,
    streamingMessageEl: null,
    streamingContentEl: null,
    pendingEditedFiles: new Set<string>(),
    pendingQuestionResolution: null,
    isConversationSyncInFlight: false,
  };
}

async function* createAsyncStream(chunks: CoreStreamChunk[]): AsyncGenerator<CoreStreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

type MockedPreparationPort = {
  [Key in keyof SendPipelinePreparationPort]:
    SendPipelinePreparationPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SendPipelinePreparationPort[Key];
};

type MockedFinalizationPort = {
  [Key in keyof SendPipelineFinalizationPort]:
    SendPipelineFinalizationPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SendPipelineFinalizationPort[Key];
};

type MockedSendPipelineHost = {
  [Key in keyof SendPipelineHost]:
    SendPipelineHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SendPipelineHost[Key];
};

function createStreamController(): SendPipelineStreamController {
  const contentBlocks: StreamingContentBlock[] = [];

  return {
    startStream: jest.fn(),
    handleChunk: jest.fn().mockImplementation(async (chunk: StreamingChunk) => {
      if (chunk.type === 'text') {
        contentBlocks.push({ type: 'text', content: chunk.content });
      }
    }),
    cancelStream: jest.fn(),
    getContentBlocks: jest.fn().mockReturnValue(contentBlocks),
  };
}

function createPreparationPort(
  preparedSend: PreparedMessageSend,
): MockedPreparationPort {
  return {
    prepareMessageSend: jest.fn().mockResolvedValue(preparedSend),
    enterStreamingState: jest.fn(),
    completePreparedStreamStart: jest.fn(),
    consumeQueuedFollowUpSend: jest.fn().mockReturnValue(null),
  };
}

function createFinalizationPort(): MockedFinalizationPort {
  return {
    finalizeAfterStream: jest.fn().mockResolvedValue(undefined),
  };
}

function createHost(
  runtime: SendPipelineTabRuntime,
  streamController: SendPipelineStreamController,
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
    sendStreamMessage: jest.fn().mockImplementation(() => createAsyncStream([
      { type: 'message_start' },
      { type: 'error', content: 'agent rejected' },
    ])),
    detachStream: jest.fn(),
    createAssistantMessageElement: jest.fn().mockReturnValue({ messageEl, contentEl }),
    getOrCreateTabStreamController: jest.fn().mockReturnValue(streamController),
    summarizeContentBlocksForDebug: jest.fn().mockReturnValue({ count: 0 }),
    logAssistantFinalizationDebug: jest.fn(),
    getLogPreview: jest.fn().mockImplementation((text: string) => text),
    summarizeCoreStreamChunkForDebug: jest.fn().mockReturnValue({ type: 'error' }),
    getFriendlyStreamErrorMessage: jest.fn().mockImplementation((rawMessage: string) => rawMessage),
    revealStreamingAssistantMessageElement: jest.fn().mockReturnValue(messageEl),
    syncLatestUserMessageFromServer: jest.fn().mockResolvedValue(undefined),
    beginTabContextUsageStream: jest.fn(),
    completeTabContextUsageStream: jest.fn(),
    applyUsageChunkToTab: jest.fn(),
    showPermissionDialog: jest.fn().mockResolvedValue(undefined),
    showQuestionDialog: jest.fn().mockResolvedValue(undefined),
    convertToStreamingChunk: jest.fn().mockReturnValue(null),
    renderAssistantPlaceholderAsNotice: jest.fn().mockResolvedValue(undefined),
    addTimestampWithCopyButton: jest.fn(),
    finalizeBackgroundTaskIndicatorAfterPrimaryStream: jest.fn().mockResolvedValue(undefined),
    removeEmptyAssistantShells: jest.fn(),
    syncTabStreamLikeState: jest.fn(),
    transitionTabSessionLifecycle: jest.fn().mockReturnValue(true),
    refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    createConversationWriteTicket: jest.fn().mockImplementation((conversationId: string) => ({
      conversationId,
      version: 0,
    })),
    commitConversationWrite: jest.fn().mockImplementation(async (conversation, _ticket, _reason, write) => {
      await write();
      await host.saveConversation(conversation);
      return true;
    }),
    summarizeChatMessageForDebug: jest.fn().mockReturnValue(null),
    stringifyLogPayload: jest.fn().mockImplementation((payload: unknown) => JSON.stringify(payload)),
  };
  return host;
}

describe('SendPipelineRuntime agent invocation', () => {
  it('preserves explicit agent invocation options on the transport path even when the runtime rejects the send', async () => {
    const preparedSend = createPreparedSend();
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(preparedSend);
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController);
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);
    const input: PrepareMessageSendOptions = {
      content: 'Hello',
      invocationIntent: {
        kind: 'prompt',
        primaryAgent: 'plan',
        mentions: [{ agentId: 'reviewer' }],
      },
    };

    await runtime.sendMessage(input);

    expect(preparationPort.prepareMessageSend).toHaveBeenCalledWith(input);
    expect(host.sendStreamMessage).toHaveBeenCalledTimes(1);
    expect(host.sendStreamMessage).toHaveBeenCalledWith('Hello', {
      sessionId: 'session-1',
      provider: 'openai',
      model: 'gpt-5.4',
      agent: 'plan',
      contextItems: [],
      messageID: 'message-1',
      requestParts: [
        { id: 'part-1', type: 'text', text: 'Hello' },
        { id: 'part-2', type: 'agent', name: 'reviewer' },
      ],
    });
    expect(finalizationPort.finalizeAfterStream).toHaveBeenCalledWith(expect.objectContaining({
      shouldSyncFromServer: false,
    }));
  });
});
