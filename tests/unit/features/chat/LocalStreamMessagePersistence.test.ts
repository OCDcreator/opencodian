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

type LocalStreamPersistenceTestHost = LocalStreamPersistenceHost & {
  saveConversation: (conversation: Conversation) => Promise<void>;
};

function createHost(): jest.Mocked<LocalStreamPersistenceTestHost> {
  const host: jest.Mocked<LocalStreamPersistenceTestHost> = {
    saveConversation: jest.fn().mockResolvedValue(undefined),
    createConversationWriteTicket: jest.fn().mockImplementation((conversationId: string) => ({
      conversationId,
      version: 0,
    })),
    commitConversationWrite: jest.fn().mockImplementation(async (
      conversation: Conversation,
      _ticket,
      _reason,
      write,
    ) => {
      await write();
      await host.saveConversation(conversation);
      return true;
    }),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) => (
      message ? { id: message.id, role: message.role } : null
    )),
    stringifyLogPayload: jest.fn().mockImplementation((payload: unknown) => JSON.stringify(payload)),
    getLogPreview: jest.fn().mockImplementation((text: string) => text),
  };
  return host;
}

function createOutcome(overrides: Partial<LocalStreamOutcome> = {}): LocalStreamOutcome {
  return {
    finalizedTimestamp: 42,
    finalizedModelId: 'openai/gpt-5.4',
    finalizedAssistantMessageId: 'assistant-1',
    finalizedBackendSessionId: undefined,
    finalizedStreamingMessageEl: document.createElement('div'),
    streamContentBlocks: [{ type: 'text', content: 'Canonical soon' }],
    streamedTextContent: 'Canonical soon',
    hasStreamContentBlocks: true,
    shouldPersistInterruptedState: false,
    streamErrorNoticeMessage: null,
    interruptedNoticeMessage: null,
    shouldSyncFromServer: true,
    resolvedUserMessageIdentity: null,
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

  it('persists captured backend session identity even when assistant cache writes are deferred', async () => {
    const conversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        content: 'Hello',
        timestamp: 1,
      },
    ]);
    conversation.backend = 'claude-code';
    conversation.backendSessionId = 'claude-code-local';
    delete conversation.openCodeSessionId;
    const host = createHost();
    const logStage = jest.fn();

    await persistLocalStreamOutcome({
      host,
      preparedSend: createPreparedSend(conversation),
      runtime: createRuntime(),
      outcome: createOutcome({
        finalizedBackendSessionId: 'sdk-session-1',
      }),
      logAssistantFinalizationStage: logStage,
    });

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.backendSessionId).toBe('sdk-session-1');
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(logStage).toHaveBeenCalledWith('backend-session-id-finalized', {
      backendSessionId: 'sdk-session-1',
      resolvedUserMessageIdentity: null,
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

  it('skips local finalization side effects when the serialized commit is stale', async () => {
    const conversation = createConversation();
    const host = createHost();
    host.commitConversationWrite.mockResolvedValue(false);
    const logStage = jest.fn();

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
      logAssistantFinalizationStage: logStage,
    });

    expect(conversation.messages).toHaveLength(0);
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('local-stream-finalization-write-skipped', {
      conversationId: conversation.id,
      messageCount: 0,
    });
    expect(logStage).not.toHaveBeenCalledWith(
      'conversation-saved-after-local-finalization',
      expect.anything(),
    );
  });
});

describe('persistLocalStreamOutcome local persistence details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists structured output on the assistant message when provided', async () => {
    const conversation = createConversation();
    const host = createHost();
    const structuredPayload = { status: 'ok' };

    await persistLocalStreamOutcome({
      host,
      preparedSend: createPreparedSend(conversation),
      runtime: createRuntime(),
      outcome: createOutcome({
        shouldSyncFromServer: false,
        structuredOutput: structuredPayload,
      }),
      logAssistantFinalizationStage: jest.fn(),
    });

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]?.structured).toEqual(structuredPayload);
  });

  it('persists a new assistant message when structured output exists but visible stream blocks are empty', async () => {
    const conversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        content: 'first',
        timestamp: 1,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        timestamp: 2,
        sourceMessageId: 'assistant-source-1',
        structured: { status: 'ok', response: '{"marker":"A"}' },
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'second',
        timestamp: 3,
      },
    ] as ChatMessage[]);
    const host = createHost();

    await persistLocalStreamOutcome({
      host,
      preparedSend: createPreparedSend(conversation),
      runtime: createRuntime(),
      outcome: createOutcome({
        finalizedAssistantMessageId: 'assistant-source-2',
        streamContentBlocks: [],
        hasStreamContentBlocks: false,
        streamedTextContent: '',
        shouldSyncFromServer: false,
        structuredOutput: { status: 'ok', response: '{"marker":"B"}' },
      }),
      logAssistantFinalizationStage: jest.fn(),
    });

    expect(conversation.messages).toHaveLength(4);
    expect(conversation.messages[3]).toMatchObject({
      id: 'assistant-source-2',
      role: 'assistant',
      sourceMessageId: 'assistant-source-2',
      structured: { status: 'ok', response: '{"marker":"B"}' },
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

describe('persistLocalStreamOutcome provisional warning removal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes the provisional warning when backendSessionId upgrades from provisional to real', async () => {
    const conversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        content: 'Hello',
        timestamp: 1,
      },
      {
        id: 'assistant-notice-1',
        role: 'assistant',
        content: 'Warning text',
        timestamp: 2,
        displayStyle: 'notice',
        noticeTitle: 'Backend continuity not yet established',
        noticeTone: 'warning',
        noticeMeta: { kind: 'codex-provisional-warning' },
      },
    ]);
    conversation.backend = 'codex';
    conversation.backendSessionId = 'codex-local-abc-123';
    delete conversation.openCodeSessionId;

    const host = createHost();
    const logStage = jest.fn();

    await persistLocalStreamOutcome({
      host,
      preparedSend: createPreparedSend(conversation),
      runtime: createRuntime(),
      outcome: createOutcome({
        finalizedBackendSessionId: 'thread_real_123',
        shouldSyncFromServer: false,
      }),
      logAssistantFinalizationStage: logStage,
    });

    expect(conversation.backendSessionId).toBe('thread_real_123');
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0]?.id).toBe('user-1');
    expect(conversation.messages.some((m) => m.noticeMeta?.kind === 'codex-provisional-warning')).toBe(false);
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('keeps the provisional warning when backendSessionId stays provisional', async () => {
    const conversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        content: 'Hello',
        timestamp: 1,
      },
      {
        id: 'assistant-notice-1',
        role: 'assistant',
        content: 'Warning text',
        timestamp: 2,
        displayStyle: 'notice',
        noticeTitle: 'Backend continuity not yet established',
        noticeTone: 'warning',
        noticeMeta: { kind: 'codex-provisional-warning' },
      },
    ]);
    conversation.backend = 'codex';
    conversation.backendSessionId = 'codex-local-abc-123';
    delete conversation.openCodeSessionId;

    const host = createHost();
    const logStage = jest.fn();

    await persistLocalStreamOutcome({
      host,
      preparedSend: createPreparedSend(conversation),
      runtime: createRuntime(),
      outcome: createOutcome({
        finalizedBackendSessionId: 'codex-local-new-456',
        shouldSyncFromServer: false,
      }),
      logAssistantFinalizationStage: logStage,
    });

    expect(conversation.backendSessionId).toBe('codex-local-new-456');
    expect(conversation.messages).toHaveLength(3);
    expect(conversation.messages.some((m) => m.noticeMeta?.kind === 'codex-provisional-warning')).toBe(true);
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('does not remove unrelated notices when backendSessionId upgrades', async () => {
    const conversation = createConversation([
      {
        id: 'user-1',
        role: 'user',
        content: 'Hello',
        timestamp: 1,
      },
      {
        id: 'assistant-notice-1',
        role: 'assistant',
        content: 'Unrelated notice',
        timestamp: 2,
        displayStyle: 'notice',
        noticeTitle: 'Some other notice',
        noticeTone: 'info',
        noticeMeta: { kind: 'background-task-completion' },
      },
    ]);
    conversation.backend = 'codex';
    conversation.backendSessionId = 'codex-local-abc-123';
    delete conversation.openCodeSessionId;

    const host = createHost();
    const logStage = jest.fn();

    await persistLocalStreamOutcome({
      host,
      preparedSend: createPreparedSend(conversation),
      runtime: createRuntime(),
      outcome: createOutcome({
        finalizedBackendSessionId: 'thread_real_123',
        shouldSyncFromServer: false,
      }),
      logAssistantFinalizationStage: logStage,
    });

    expect(conversation.backendSessionId).toBe('thread_real_123');
    expect(conversation.messages).toHaveLength(3);
    expect(conversation.messages.some((m) => m.noticeMeta?.kind === 'codex-provisional-warning')).toBe(false);
    expect(conversation.messages.some((m) => m.noticeMeta?.kind === 'background-task-completion')).toBe(true);
  });
});
