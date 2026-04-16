import type { ChatMessage, Conversation } from '../../../../src/core/types';
import { buildLocalStreamOutcome } from '../../../../src/features/chat/runtime/buildLocalStreamOutcome';
import type {
  SendPipelineStreamController,
  SendPipelineTabRuntime,
  StreamChunkRouterResult,
} from '../../../../src/features/chat/runtime/SendPipelineRuntime';
import type { PreparedMessageSend } from '../../../../src/features/chat/services/MessageSendPreparationService';

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
  const userMessage: ChatMessage = overrides.userMessage ?? {
    id: 'user-1',
    role: 'user',
    content: 'Hello',
    timestamp: 1,
  };

  return {
    conversation: overrides.conversation ?? createConversation([userMessage]),
    tabId: overrides.tabId ?? 'tab-1',
    draftContextItems: overrides.draftContextItems ?? [],
    modelOptions: overrides.modelOptions ?? {
      provider: 'openai',
      model: 'gpt-5.4',
    },
    activeModelId: overrides.activeModelId ?? 'openai/gpt-5.4',
    userMessage,
  };
}

function createRuntime(): SendPipelineTabRuntime {
  return {
    isStreaming: true,
    streamingMessageEl: document.createElement('div'),
    streamingContentEl: document.createElement('div'),
    pendingEditedFiles: new Set<string>(),
    pendingQuestionResolution: null,
    isConversationSyncInFlight: false,
  };
}

function createRoutedStream(
  overrides: Partial<StreamChunkRouterResult> = {},
): StreamChunkRouterResult {
  return {
    streamCompleted: false,
    streamInterrupted: false,
    streamTimedOut: false,
    latestErrorMessage: null,
    finalizedAssistantMetadata: null,
    logAssistantFinalizationStage: jest.fn(),
    resetStreamingState: jest.fn(),
    cleanupPendingIndicator: jest.fn(),
    ...overrides,
  };
}

describe('buildLocalStreamOutcome', () => {
  it('prefers metadata and rendered blocks when building the local outcome', () => {
    const preparedSend = createPreparedSend();
    const runtime = createRuntime();
    const streamController: SendPipelineStreamController = {
      startStream: jest.fn(),
      handleChunk: jest.fn(),
      cancelStream: jest.fn(),
      getContentBlocks: jest.fn().mockReturnValue([
        { type: 'text', content: 'Hello' },
        { type: 'thinking', content: 'Analyzing', partId: 'p1', durationSeconds: 2 },
        { type: 'text', content: ' world' },
      ]),
    };
    const routedStream = createRoutedStream({
      streamCompleted: true,
      finalizedAssistantMetadata: {
        type: 'message_metadata',
        messageId: 'assistant-1',
        timestamp: 42,
        modelId: 'openai/gpt-5.5',
      },
    });
    const outcome = buildLocalStreamOutcome({
      preparedSend,
      runtime,
      streamController,
      routedStream,
    });

    expect(outcome.finalizedTimestamp).toBe(42);
    expect(outcome.finalizedModelId).toBe('openai/gpt-5.5');
    expect(outcome.finalizedAssistantMessageId).toBe('assistant-1');
    expect(outcome.streamedTextContent).toBe('Hello world');
    expect(outcome.hasStreamContentBlocks).toBe(true);
    expect(outcome.shouldPersistInterruptedState).toBe(false);
    expect(outcome.streamErrorNoticeMessage).toBeNull();
    expect(outcome.shouldSyncFromServer).toBe(true);
  });

  it('builds an error notice when the stream ends without visible blocks', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(500);
    const preparedSend = createPreparedSend();
    const runtime = createRuntime();
    const routedStream = createRoutedStream({
      streamInterrupted: true,
      latestErrorMessage: 'Friendly: boom',
    });
    const outcome = buildLocalStreamOutcome({
      preparedSend,
      runtime,
      streamController: null,
      routedStream,
    });

    expect(outcome.streamErrorNoticeMessage).toEqual(expect.objectContaining({
      id: 'assistant-error-notice-500',
      content: 'Friendly: boom',
      timestamp: 500,
      modelId: 'openai/gpt-5.4',
      displayStyle: 'notice',
      noticeTone: 'error',
    }));
    expect(outcome.shouldPersistInterruptedState).toBe(false);
    expect(outcome.shouldSyncFromServer).toBe(false);
    nowSpy.mockRestore();
  });

  it('marks interrupted partial content for local persistence without building an error notice', () => {
    const preparedSend = createPreparedSend();
    const runtime = createRuntime();
    const streamController: SendPipelineStreamController = {
      startStream: jest.fn(),
      handleChunk: jest.fn(),
      cancelStream: jest.fn(),
      getContentBlocks: jest.fn().mockReturnValue([
        { type: 'text', content: 'Partial' },
      ]),
    };
    const routedStream = createRoutedStream({
      streamInterrupted: true,
    });
    const outcome = buildLocalStreamOutcome({
      preparedSend,
      runtime,
      streamController,
      routedStream,
    });

    expect(outcome.hasStreamContentBlocks).toBe(true);
    expect(outcome.streamedTextContent).toBe('Partial');
    expect(outcome.shouldPersistInterruptedState).toBe(true);
    expect(outcome.streamErrorNoticeMessage).toBeNull();
    expect(outcome.shouldSyncFromServer).toBe(false);
  });
});
