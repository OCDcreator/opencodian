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
import type { PreparedMessageSend } from '../../../../src/features/chat/services/MessageSendPreparationService';
import type {
  ContentBlock as StreamingContentBlock,
  StreamChunk as StreamingChunk,
} from '../../../../src/utils/streaming';

function createUserMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'user-1',
    role: 'user',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

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

function createPreparedSend(overrides: Partial<PreparedMessageSend> = {}): PreparedMessageSend {
  const userMessage = overrides.userMessage ?? createUserMessage();
  return {
    conversation: overrides.conversation ?? createConversation([userMessage]),
    tabId: overrides.tabId ?? 'tab-1',
    draftContextItems: overrides.draftContextItems ?? [],
    contextItems: overrides.contextItems ?? [],
    modelOptions: overrides.modelOptions ?? {
      provider: 'openai',
      model: 'gpt-5.4',
    },
    activeModelId: overrides.activeModelId ?? 'openai/gpt-5.4',
    userMessage,
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

function createStreamController(callOrder: string[] = []): SendPipelineStreamController {
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

function createPreparationPort(
  preparedSend: PreparedMessageSend | null,
  callOrder: string[] = [],
): MockedPreparationPort {
  return {
    prepareMessageSend: jest.fn().mockResolvedValue(preparedSend),
    enterStreamingState: jest.fn().mockImplementation(() => {
      callOrder.push('enterStreamingState');
    }),
    completePreparedStreamStart: jest.fn().mockImplementation(() => {
      callOrder.push('completePreparedStreamStart');
    }),
  };
}

function createFinalizationPort(callOrder: string[] = []): MockedFinalizationPort {
  return {
    finalizeAfterStream: jest.fn().mockImplementation(async () => {
      callOrder.push('finalizeAfterStream');
    }),
  };
}

function createHost(
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

  return {
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
    finalizeBackgroundTaskIndicatorAfterPrimaryStream: jest.fn().mockResolvedValue(undefined),
    removeEmptyAssistantShells: jest.fn(),
    syncTabStreamLikeState: jest.fn(),
    refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
    saveConversation: jest.fn().mockImplementation(async () => {
      callOrder.push('saveConversation');
    }),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) => (
      message
        ? { id: message.id, role: message.role }
        : null
    )),
    stringifyLogPayload: jest.fn().mockImplementation((payload: unknown) => JSON.stringify(payload)),
    ...overrides,
  };
}

describe('SendPipelineRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('aborts cleanly when preparation does not yield a sendable conversation', async () => {
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(null);
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController);
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Hello');

    expect(preparationPort.prepareMessageSend).toHaveBeenCalledWith({ content: 'Hello' });
    expect(preparationPort.enterStreamingState).not.toHaveBeenCalled();
    expect(host.sendStreamMessage).not.toHaveBeenCalled();
    expect(finalizationPort.finalizeAfterStream).not.toHaveBeenCalled();
  });

  it('persists the local assistant message before handing off post-stream finalization', async () => {
    const callOrder: string[] = [];
    const preparedSend = createPreparedSend();
    const runtimeState = createTabRuntime();
    const streamController = createStreamController(callOrder);
    const preparationPort = createPreparationPort(preparedSend, callOrder);
    const finalizationPort = createFinalizationPort(callOrder);
    const host = createHost(runtimeState, streamController, callOrder, {
      sendStreamMessage: jest.fn().mockImplementation(() => createAsyncStream([
        { type: 'message_start' },
        { type: 'usage', inputTokens: 12, outputTokens: 34, sessionId: 'session-1' },
        { type: 'file_edited', file: 'notes.md' },
        { type: 'text', content: 'Hi there' },
        { type: 'message_metadata', messageId: 'assistant-1', timestamp: 42, modelId: 'openai/gpt-5.4' },
        { type: 'message_stop' },
      ])),
    });
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Hello');

    expect(preparationPort.enterStreamingState).toHaveBeenCalledWith('tab-1');
    expect(preparationPort.completePreparedStreamStart).toHaveBeenCalledWith('tab-1');
    expect(host.sendStreamMessage).toHaveBeenCalledWith('Hello', {
      sessionId: 'session-1',
      provider: 'openai',
      model: 'gpt-5.4',
      contextItems: [],
    });
    expect(host.syncLatestUserMessageFromServer).toHaveBeenCalledWith(
      preparedSend.conversation,
      preparedSend.userMessage.id,
      'tab-1',
    );
    expect(host.applyUsageChunkToTab).toHaveBeenCalledWith('tab-1', {
      type: 'usage',
      inputTokens: 12,
      outputTokens: 34,
      sessionId: 'session-1',
    });
    expect(preparedSend.conversation.messages).toHaveLength(2);
    expect(preparedSend.conversation.messages[1]).toEqual(expect.objectContaining({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Hi there',
      timestamp: 42,
      modelId: 'openai/gpt-5.4',
      sourceMessageId: 'assistant-1',
      contentBlocks: [
        { type: 'text', text: 'Hi there' },
      ],
    }));
    expect(host.addTimestampWithCopyButton).toHaveBeenCalledTimes(1);
    expect(host.saveConversation).toHaveBeenCalledWith(preparedSend.conversation);
    expect(finalizationPort.finalizeAfterStream).toHaveBeenCalledWith(expect.objectContaining({
      conversation: preparedSend.conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
    }));
    expect(callOrder.indexOf('saveConversation')).toBeLessThan(callOrder.indexOf('finalizeAfterStream'));
  });

  it('sends the merged prepared context items instead of only draft items', async () => {
    const contextItem = {
      id: 'context-1',
      kind: 'file',
      path: 'notes/guide.md',
      label: 'guide.md',
      mime: 'text/markdown',
    } as const;
    const preparedSend = createPreparedSend({
      draftContextItems: [],
      contextItems: [contextItem],
    });
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(preparedSend);
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController, [], {
      sendStreamMessage: jest.fn().mockImplementation(() => createAsyncStream([
        { type: 'message_start' },
        { type: 'message_stop' },
      ])),
    });
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Hello');

    expect(host.sendStreamMessage).toHaveBeenCalledWith('Hello', {
      sessionId: 'session-1',
      provider: 'openai',
      model: 'gpt-5.4',
      contextItems: [contextItem],
    });
  });

  it('persists a notice when the stream ends with only an error', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(500);
    const preparedSend = createPreparedSend();
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(preparedSend);
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController, [], {
      sendStreamMessage: jest.fn().mockImplementation(() => createAsyncStream([
        { type: 'message_start' },
        { type: 'error', content: 'boom' },
      ])),
    });
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Hello');

    expect(nowSpy).toHaveBeenCalled();
    expect(host.renderAssistantPlaceholderAsNotice).toHaveBeenCalledTimes(1);
    expect(preparedSend.conversation.messages).toHaveLength(2);
    expect(preparedSend.conversation.messages[1]).toEqual(expect.objectContaining({
      displayStyle: 'notice',
      noticeTone: 'error',
      content: 'Friendly: boom',
      timestamp: 500,
    }));
    expect(finalizationPort.finalizeAfterStream).toHaveBeenCalledWith(expect.objectContaining({
      shouldSyncFromServer: false,
    }));
  });
});
