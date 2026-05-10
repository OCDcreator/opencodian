import type { ChatMessage, Conversation } from '../../../../src/core/types';
import { persistLocalStreamOutcome } from '../../../../src/features/chat/runtime/LocalStreamMessagePersistence';
import type {
  LocalStreamOutcome,
  LocalStreamPersistenceHost,
  SendPipelineTabRuntime,
} from '../../../../src/features/chat/runtime/SendPipelineTypes';
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

function createPreparedSend(conversation = createConversation()): PreparedMessageSend {
  return {
    conversation,
    tabId: 'tab-1',
    messageID: 'message-1',
    requestParts: [],
    optimisticUserParts: [],
    draftContextItems: [],
    contextItems: [],
    modelOptions: {},
    activeModelId: 'openai/gpt-5.4',
    userMessage: {
      id: 'user-1',
      role: 'user',
      content: 'Hello',
      timestamp: 1,
    },
  } as PreparedMessageSend;
}

function createRuntime(overrides: Partial<SendPipelineTabRuntime> = {}): SendPipelineTabRuntime {
  return {
    isStreaming: false,
    streamingMessageEl: document.createElement('div'),
    streamingContentEl: document.createElement('div'),
    pendingEditedFiles: new Set(),
    pendingQuestionResolution: null,
    isConversationSyncInFlight: false,
    ...overrides,
  };
}

function createHost(): jest.Mocked<LocalStreamPersistenceHost> {
  return {
    saveConversation: jest.fn().mockResolvedValue(undefined),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) => (
      message ? { id: message.id, role: message.role } : null
    )),
    stringifyLogPayload: jest.fn().mockImplementation((payload: unknown) => JSON.stringify(payload)),
    getLogPreview: jest.fn().mockImplementation((text: string) => text),
  };
}

function createOutcome(overrides: Partial<LocalStreamOutcome> = {}): LocalStreamOutcome {
  return {
    finalizedTimestamp: 42,
    finalizedModelId: 'openai/gpt-5.4',
    finalizedAssistantMessageId: 'assistant-1',
    finalizedStreamingMessageEl: document.createElement('div'),
    streamContentBlocks: [{ type: 'text', content: 'Canonical soon' }],
    streamedTextContent: 'Canonical soon',
    hasStreamContentBlocks: true,
    shouldPersistInterruptedState: false,
    streamErrorNoticeMessage: null,
    interruptedNoticeMessage: null,
    shouldSyncFromServer: true,
    ...overrides,
  };
}

describe('persistLocalStreamOutcome canonical cache boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defers normal completed assistant cache writes to canonical finalization', async () => {
    const conversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        content: 'Hello',
        timestamp: 1,
      },
    ]);
    const host = createHost();
    const logStage = jest.fn();

    await persistLocalStreamOutcome({
      host,
      preparedSend: createPreparedSend(conversation),
      runtime: createRuntime(),
      outcome: createOutcome(),
      logAssistantFinalizationStage: logStage,
    });

    expect(conversation.messages).toHaveLength(1);
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('local-assistant-cache-deferred', {
      finalizedAssistantMessageId: 'assistant-1',
      reason: 'canonical-sync-pending',
    });
  });

  it('persists interrupted partial assistant content as client-only recovery', async () => {
    const conversation = createConversation();
    const host = createHost();

    await persistLocalStreamOutcome({
      host,
      preparedSend: createPreparedSend(conversation),
      runtime: createRuntime(),
      outcome: createOutcome({
        shouldSyncFromServer: false,
        shouldPersistInterruptedState: true,
        streamedTextContent: 'Partial',
        streamContentBlocks: [{ type: 'text', content: 'Partial' }],
      }),
      logAssistantFinalizationStage: jest.fn(),
    });

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Partial',
      streamState: 'interrupted',
      sourceMessageId: 'assistant-1',
    });
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('persists question resolution decoration so authoritative merge can preserve it', async () => {
    const conversation = createConversation();
    const host = createHost();

    await persistLocalStreamOutcome({
      host,
      preparedSend: createPreparedSend(conversation),
      runtime: createRuntime({
        pendingQuestionResolution: {
          request: {
            id: 'question-1',
            sessionId: 'session-1',
            questions: [],
          },
          status: 'answered',
          answers: [['Yes']],
        },
      }),
      outcome: createOutcome(),
      logAssistantFinalizationStage: jest.fn(),
    });

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]?.questionResolution).toMatchObject({
      status: 'answered',
    });
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
  });
});
