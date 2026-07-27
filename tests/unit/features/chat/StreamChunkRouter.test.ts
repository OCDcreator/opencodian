import type {
  SendPipelineStreamController,
  SendPipelineTabRuntime,
  StreamChunkRouterHost,
} from '../../../../src/features/chat/runtime/SendPipelineTypes';
import { StreamChunkRouter } from '../../../../src/features/chat/runtime/StreamChunkRouter';
import type { PreparedMessageSend } from '../../../../src/features/chat/services/MessageSendPreparationService';

function createHost(): jest.Mocked<StreamChunkRouterHost> {
  return {
    getActiveTabId: jest.fn(() => 'tab-1'),
    shouldAutoScroll: jest.fn(() => false),
    scheduleSettledScrollToBottomIfNeeded: jest.fn(),
    syncTabStreamLikeState: jest.fn(),
    detachStream: jest.fn(),
    syncLatestUserMessageFromServer: jest.fn().mockResolvedValue(undefined),
    beginTabContextUsageStream: jest.fn(),
    completeTabContextUsageStream: jest.fn(),
    applyUsageChunkToTab: jest.fn(),
    showPermissionDialog: jest.fn().mockResolvedValue(undefined),
    showQuestionDialog: jest.fn().mockResolvedValue(undefined),
    convertToStreamingChunk: jest.fn(() => null),
    getFriendlyStreamErrorMessage: jest.fn((message: string) => message || 'No response received'),
    revealStreamingAssistantMessageElement: jest.fn(() => document.createElement('div')),
    summarizeContentBlocksForDebug: jest.fn(() => null),
    logAssistantFinalizationDebug: jest.fn(),
    getLogPreview: jest.fn((text: string) => text),
    summarizeCoreStreamChunkForDebug: jest.fn(() => null),
  } as jest.Mocked<StreamChunkRouterHost>;
}

function createPreparedSend(): PreparedMessageSend {
  return {
    conversation: {
      id: 'conversation-1',
      title: 'Conversation',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'session-1',
    },
    tabId: 'tab-1',
    messageID: 'msg_prompt',
    requestParts: [],
    optimisticUserParts: [],
    draftContextItems: [],
    contextItems: [],
    modelOptions: {},
    userMessage: {
      id: 'user-1',
      role: 'user',
      content: 'Hello',
      timestamp: 1,
    },
  } as PreparedMessageSend;
}

describe('StreamChunkRouter structured output capture', () => {
  it('captures structured_output backend_event into the result', async () => {
    const host = createHost();
    const runtime: SendPipelineTabRuntime = {
      isStreaming: true,
      streamingMessageEl: null,
      streamingContentEl: null,
      pendingEditedFiles: new Set(),
      pendingQuestionResolution: null,
      isConversationSyncInFlight: false,
    };
    const streamController: SendPipelineStreamController = {
      startStream: jest.fn(),
      handleChunk: jest.fn().mockResolvedValue(undefined),
      cancelStream: jest.fn(),
      getContentBlocks: jest.fn(() => []),
    };
    const structuredPayload = { status: 'ok', items: [1, 2, 3] };

    async function* stream() {
      yield { type: 'message_start' } as const;
      yield {
        type: 'backend_event',
        source: 'claude-code',
        event: 'structured_output',
        status: 'received',
        metadata: { structuredOutput: structuredPayload },
      } as const;
      yield { type: 'message_stop' } as const;
    }

    const router = new StreamChunkRouter({
      host,
      preparedSend: createPreparedSend(),
      runtime,
      stream: stream(),
      streamController,
      contentEl: document.body.createDiv(),
    });

    const result = await router.consume();
    expect(result.structuredOutput).toEqual(structuredPayload);
  });

  it('ignores non-structured_output backend_events', async () => {
    const host = createHost();
    const runtime: SendPipelineTabRuntime = {
      isStreaming: true,
      streamingMessageEl: null,
      streamingContentEl: null,
      pendingEditedFiles: new Set(),
      pendingQuestionResolution: null,
      isConversationSyncInFlight: false,
    };
    const streamController: SendPipelineStreamController = {
      startStream: jest.fn(),
      handleChunk: jest.fn().mockResolvedValue(undefined),
      cancelStream: jest.fn(),
      getContentBlocks: jest.fn(() => []),
    };

    async function* stream() {
      yield { type: 'message_start' } as const;
      yield {
        type: 'backend_event',
        source: 'claude-code',
        event: 'hook',
        status: 'received',
        metadata: {},
      } as const;
      yield { type: 'message_stop' } as const;
    }

    const router = new StreamChunkRouter({
      host,
      preparedSend: createPreparedSend(),
      runtime,
      stream: stream(),
      streamController,
      contentEl: document.body.createDiv(),
    });

    const result = await router.consume();
    expect(result.structuredOutput).toBeUndefined();
  });
});

describe('StreamChunkRouter empty-stream backend routing', () => {
  it('passes the Claude Code backend to the empty-stream error formatter', async () => {
    const host = createHost();
    host.getFriendlyStreamErrorMessage.mockImplementation((message, backend) =>
      message || `No displayable content from ${backend}`,
    );
    const runtime: SendPipelineTabRuntime = {
      isStreaming: true,
      streamingMessageEl: null,
      streamingContentEl: null,
      pendingEditedFiles: new Set(),
      pendingQuestionResolution: null,
      isConversationSyncInFlight: false,
    };
    const streamController: SendPipelineStreamController = {
      startStream: jest.fn(),
      handleChunk: jest.fn().mockResolvedValue(undefined),
      cancelStream: jest.fn(),
      getContentBlocks: jest.fn(() => []),
    };
    const preparedSend = createPreparedSend();
    preparedSend.conversation.backend = 'claude-code';

    async function* stream() {
      yield { type: 'message_start' } as const;
      yield { type: 'message_stop' } as const;
    }

    const router = new StreamChunkRouter({
      host,
      preparedSend,
      runtime,
      stream: stream(),
      streamController,
      contentEl: document.body.createDiv(),
    });

    await router.consume();

    expect(host.getFriendlyStreamErrorMessage).toHaveBeenCalledWith('', 'claude-code');
    expect(streamController.handleChunk).toHaveBeenCalledWith({
      type: 'error',
      content: 'No displayable content from claude-code',
    });
  });
});

describe('StreamChunkRouter stream validation', () => {
  it('handles non-async-iterable stream by returning error result', async () => {
    const host = createHost();
    const runtime: SendPipelineTabRuntime = {
      isStreaming: true,
      streamingMessageEl: null,
      streamingContentEl: null,
      pendingEditedFiles: new Set(),
      pendingQuestionResolution: null,
      isConversationSyncInFlight: false,
    };
    const streamController: SendPipelineStreamController = {
      startStream: jest.fn(),
      handleChunk: jest.fn().mockResolvedValue(undefined),
      cancelStream: jest.fn(),
      getContentBlocks: jest.fn(() => []),
    };

    const router = new StreamChunkRouter({
      host,
      preparedSend: createPreparedSend(),
      runtime,
      stream: {} as AsyncGenerator<never>,
      streamController,
      contentEl: document.body.createDiv(),
    });

    const result = await router.consume();
    expect(result.latestErrorMessage).toContain('Stream is not async iterable');
    expect(result.streamCompleted).toBe(false);
  });
});

describe('StreamChunkRouter timeout handling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('detaches silent streams after 60 seconds when no visible content arrives', async () => {
    const host = createHost();
    const runtime: SendPipelineTabRuntime = {
      isStreaming: true,
      streamingMessageEl: null,
      streamingContentEl: null,
      pendingEditedFiles: new Set(),
      pendingQuestionResolution: null,
      isConversationSyncInFlight: false,
    };
    const cancelled = { value: false };
    const streamController: SendPipelineStreamController = {
      startStream: jest.fn(),
      handleChunk: jest.fn().mockResolvedValue(undefined),
      cancelStream: jest.fn(() => {
        cancelled.value = true;
      }),
      getContentBlocks: jest.fn(() => []),
    };
    async function* stream() {
      yield { type: 'message_start' } as const;
      while (!cancelled.value) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 1000);
        });
      }
    }

    const router = new StreamChunkRouter({
      host,
      preparedSend: createPreparedSend(),
      runtime,
      stream: stream(),
      streamController,
      contentEl: document.body.createDiv(),
    });

    const resultPromise = router.consume();
    await Promise.resolve();
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(59_999);
    expect(host.detachStream).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(streamController.cancelStream).toHaveBeenCalledTimes(1);
    expect(host.detachStream).toHaveBeenCalledWith('session-1');
    expect(runtime.isStreaming).toBe(false);

    await jest.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;
    result.cleanupPendingIndicator();
    expect(result.streamTimedOut).toBe(true);
    expect(result.streamInterrupted).toBe(true);
  });
});
