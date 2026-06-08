import {
  createAsyncStream,
  createFinalizationPort,
  createHost,
  createPreparationPort,
  createPreparedSend,
  createStreamController,
  createTabRuntime,
  createUserMessage,
  type MockedSlashCommandPort,
  SendPipelineRuntime,
} from './SendPipelineRuntime.testSupport';

describe('SendPipelineRuntime structured output trigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('detects /json prefix and strips it before slash command and preparation', async () => {
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(createPreparedSend());
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController);
    const slashCommandPort: MockedSlashCommandPort = {
      tryRunSlashCommand: jest.fn().mockResolvedValue(false),
    };
    const runtime = new SendPipelineRuntime(
      host,
      preparationPort,
      finalizationPort,
      slashCommandPort,
    );

    await runtime.sendMessage('/json tell me a joke');

    expect(slashCommandPort.tryRunSlashCommand).toHaveBeenCalledWith('tell me a joke');
    expect(preparationPort.prepareMessageSend).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'tell me a joke',
        outputFormat: expect.objectContaining({
          type: 'json_schema',
          schema: expect.objectContaining({
            type: 'object',
            properties: expect.objectContaining({
              response: expect.anything(),
            }),
          }),
        }),
      }),
    );
  });

  it('does not detect /json without trailing space', async () => {
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(createPreparedSend());
    const finalizationPort = createFinalizationPort();
    const host = createHost(runtimeState, streamController);
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('/jsontell me a joke');

    expect(preparationPort.prepareMessageSend).toHaveBeenCalledWith({ content: '/jsontell me a joke' });
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
