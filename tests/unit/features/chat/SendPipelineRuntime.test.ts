/* eslint-disable max-lines -- Send pipeline runtime regression coverage intentionally keeps the host/test builders with scenario assertions. */
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

type MockedSlashCommandPort = {
  [Key in keyof SendPipelineSlashCommandPort]:
    SendPipelineSlashCommandPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SendPipelineSlashCommandPort[Key];
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
    finalizeBackgroundTaskIndicatorAfterPrimaryStream: jest.fn().mockResolvedValue(undefined),
    removeEmptyAssistantShells: jest.fn(),
    syncTabStreamLikeState: jest.fn(),
    transitionTabSessionLifecycle: jest.fn().mockReturnValue(true),
    refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
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

describe('SendPipelineRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('delegates handled slash commands before preparing a normal streamed send', async () => {
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(createPreparedSend());
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController);
    const slashCommandPort: MockedSlashCommandPort = {
      tryRunSlashCommand: jest.fn().mockResolvedValue(true),
    };
    const runtime = new SendPipelineRuntime(
      host,
      preparationPort,
      finalizationPort,
      slashCommandPort,
    );

    await runtime.sendMessage('/review');

    expect(slashCommandPort.tryRunSlashCommand).toHaveBeenCalledWith('/review');
    expect(preparationPort.prepareMessageSend).not.toHaveBeenCalled();
    expect(host.sendStreamMessage).not.toHaveBeenCalled();
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

  it('defers completed assistant persistence to canonical post-stream finalization', async () => {
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
        { type: 'message_metadata', messageId: 'assistant-1', timestamp: 42, modelId: 'openai/gpt-5.4', sessionId: 'session-1' },
        { type: 'message_stop' },
      ])),
    });
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Hello');

    expect(preparationPort.enterStreamingState).toHaveBeenCalledWith('tab-1');
    expect(preparationPort.completePreparedStreamStart).toHaveBeenCalledWith('tab-1');
    expect(host.sendStreamMessage).toHaveBeenCalledWith(preparedSend.conversation, 'Hello', {
      sessionId: 'session-1',
      provider: 'openai',
      model: 'gpt-5.4',
      contextItems: [],
      messageID: 'message-1',
      requestParts: [{ id: 'part-1', type: 'text', text: 'Hello' }],
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
    expect(preparedSend.conversation.messages).toHaveLength(1);
    expect(host.addTimestampWithCopyButton).toHaveBeenCalledTimes(1);
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(finalizationPort.finalizeAfterStream).toHaveBeenCalledWith(expect.objectContaining({
      conversation: preparedSend.conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
    }));
    expect(callOrder).not.toContain('saveConversation');
  });

  it('uses backendSessionId for backend-neutral transport when openCodeSessionId is absent', async () => {
    const preparedSend = createPreparedSend({
      conversation: {
        id: 'conversation-claude',
        title: 'Claude',
        createdAt: 1,
        updatedAt: 1,
        backend: 'claude-code',
        backendSessionId: 'claude-session-1',
        messages: [createUserMessage()],
      },
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

    await runtime.sendMessage('Hello Claude');

    expect(host.sendStreamMessage).toHaveBeenCalledWith(preparedSend.conversation, 'Hello Claude', expect.objectContaining({
      sessionId: 'claude-session-1',
    }));
  });

  it('persists completed Claude structured output locally instead of deferring to OpenCode sync', async () => {
    const structuredPayload = {
      status: 'ok',
      items: [{ label: 'ready' }],
    };
    const preparedSend = createPreparedSend({
      conversation: {
        id: 'conversation-claude-structured',
        title: 'Claude structured',
        createdAt: 1,
        updatedAt: 1,
        backend: 'claude-code',
        backendSessionId: 'claude-session-structured',
        messages: [createUserMessage()],
      },
      activeModelId: 'claude-code/sonnet',
      modelOptions: {
        provider: 'claude-code',
        model: 'sonnet',
      },
    });
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(preparedSend);
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController, [], {
      sendStreamMessage: jest.fn().mockImplementation(() => createAsyncStream([
        { type: 'message_start' },
        {
          type: 'message_metadata',
          messageId: 'claude-assistant-1',
          timestamp: 42,
          modelId: 'claude-sonnet-4',
          sessionId: 'claude-session-structured',
        },
        { type: 'text', content: 'Structured answer' },
        {
          type: 'backend_event',
          source: 'claude-code',
          event: 'structured_output',
          status: 'received',
          metadata: { structuredOutput: structuredPayload },
        },
        { type: 'message_stop' },
      ])),
    });
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Return structured data');

    expect(preparedSend.conversation.messages).toHaveLength(2);
    expect(preparedSend.conversation.messages[1]).toMatchObject({
      id: 'claude-assistant-1',
      role: 'assistant',
      content: 'Structured answer',
      modelId: 'claude-sonnet-4',
      sourceMessageId: 'claude-assistant-1',
      structured: structuredPayload,
    });
    expect(host.saveConversation).toHaveBeenCalledWith(preparedSend.conversation);
    expect(finalizationPort.finalizeAfterStream).toHaveBeenCalledWith(expect.objectContaining({
      shouldSyncFromServer: false,
    }));
  });
});

describe('SendPipelineRuntime queued follow-up sends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('submits one queued follow-up through the normal send path after finalization', async () => {
    const firstSend = createPreparedSend();
    const followUpSend = createPreparedSend({
      conversation: createConversation([createUserMessage({ id: 'user-follow-up', content: 'Queued follow-up' })]),
      messageID: 'message-follow-up',
      requestParts: [{ id: 'part-follow-up', type: 'text', text: 'Queued follow-up' }],
      optimisticUserParts: [{ id: 'part-follow-up', type: 'text', text: 'Queued follow-up' }],
      userMessage: createUserMessage({ id: 'user-follow-up', content: 'Queued follow-up' }),
    });
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(null, [], {
      prepareMessageSend: jest.fn()
        .mockResolvedValueOnce(firstSend)
        .mockResolvedValueOnce(followUpSend),
      consumeQueuedFollowUpSend: jest.fn()
        .mockReturnValueOnce({ content: 'Queued follow-up' })
        .mockReturnValueOnce(null),
    });
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController, [], {
      sendStreamMessage: jest.fn().mockImplementation(() => createAsyncStream([
        { type: 'message_start' },
        { type: 'message_stop' },
      ])),
    });
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Hello');

    expect(preparationPort.prepareMessageSend).toHaveBeenNthCalledWith(1, { content: 'Hello' });
    expect(preparationPort.consumeQueuedFollowUpSend).toHaveBeenCalledWith('tab-1');
    expect(preparationPort.prepareMessageSend).toHaveBeenNthCalledWith(2, {
      content: 'Queued follow-up',
      targetTabId: 'tab-1',
    });
    expect(host.sendStreamMessage).toHaveBeenCalledTimes(2);
    expect(finalizationPort.finalizeAfterStream).toHaveBeenCalledTimes(2);
  });

  it('discards a queued follow-up when its tab is no longer active after finalization', async () => {
    const firstSend = createPreparedSend();
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(firstSend, [], {
      consumeQueuedFollowUpSend: jest.fn().mockReturnValue({ content: 'Queued follow-up' }),
    });
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController, [], {
      getActiveTabId: jest.fn().mockReturnValue('tab-2'),
      sendStreamMessage: jest.fn().mockImplementation(() => createAsyncStream([
        { type: 'message_start' },
        { type: 'message_stop' },
      ])),
    });
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Hello');

    expect(preparationPort.consumeQueuedFollowUpSend).toHaveBeenCalledWith('tab-1');
    expect(preparationPort.prepareMessageSend).toHaveBeenCalledTimes(1);
    expect(host.sendStreamMessage).toHaveBeenCalledTimes(1);
  });
});

describe('SendPipelineRuntime transport payload and local notices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
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

    expect(host.sendStreamMessage).toHaveBeenCalledWith(preparedSend.conversation, 'Hello', {
      sessionId: 'session-1',
      provider: 'openai',
      model: 'gpt-5.4',
      contextItems: [contextItem],
      messageID: 'message-1',
      requestParts: [{ id: 'part-1', type: 'text', text: 'Hello' }],
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
