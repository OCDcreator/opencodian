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
});
