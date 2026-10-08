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

describe('SendPipelineRuntime cancelled-turn ownership', () => {
  it('keeps a replacement turn streaming when a cancelled predecessor delivers its late final', async () => {
    const state = createTabRuntime();
    const oldController = createStreamController();
    const newController = createStreamController();
    const oldPrepared = createPreparedSend();
    oldPrepared.conversation.backend = 'zcode';
    const nextUser = createUserMessage({ id: 'user-next', content: 'Next', timestamp: 2 });
    const nextPrepared = createPreparedSend({
      conversation: oldPrepared.conversation, userMessage: nextUser, messageID: 'message-next',
    });
    const preparation = createPreparationPort(oldPrepared);
    preparation.prepareMessageSend.mockResolvedValueOnce(oldPrepared).mockResolvedValueOnce(nextPrepared);
    preparation.enterStreamingState.mockImplementation(() => { state.isStreaming = true; });
    const finalization = createFinalizationPort();
    let releaseOld!: () => void;
    let releaseNext!: () => void;
    let oldReady!: () => void;
    let nextReady!: () => void;
    const oldHeld = new Promise<void>((resolve) => { releaseOld = resolve; });
    const nextHeld = new Promise<void>((resolve) => { releaseNext = resolve; });
    const oldStarted = new Promise<void>((resolve) => { oldReady = resolve; });
    const nextStarted = new Promise<void>((resolve) => { nextReady = resolve; });
    async function* oldStream() {
      yield { type: 'text', content: 'Old answer' } as const;
      yield { type: 'message_metadata', messageId: 'native-old', timestamp: 10 } as const;
      oldReady();
      await oldHeld;
      yield { type: 'text', content: 'MUST_NOT_REAPPEAR' } as const;
      yield { type: 'message_stop' } as const;
    }
    async function* nextStream() {
      yield { type: 'text', content: 'Next answer' } as const;
      nextReady();
      await nextHeld;
      yield { type: 'message_metadata', messageId: 'native-next', timestamp: 20 } as const;
      yield { type: 'message_stop' } as const;
    }
    const host = createHost(state, oldController);
    host.sendStreamMessage.mockReturnValueOnce(oldStream()).mockReturnValueOnce(nextStream());
    host.getOrCreateTabStreamController.mockReturnValueOnce(oldController).mockReturnValueOnce(newController);
    const shells: HTMLElement[] = [];
    host.createAssistantMessageElement.mockImplementation(() => {
      const messageEl = document.body.createDiv();
      const contentEl = messageEl.createDiv();
      state.streamingMessageEl = messageEl;
      state.streamingContentEl = contentEl;
      shells.push(messageEl);
      return { messageEl, contentEl };
    });
    const pipeline = new SendPipelineRuntime(host, preparation, finalization);
    const first = pipeline.sendMessage('Old');
    await oldStarted;
    state.isStreaming = false;
    oldController.cancelStream();
    oldPrepared.conversation.messages.push(nextUser);
    const second = pipeline.sendMessage('Next');
    await nextStarted;
    releaseOld();
    await first;

    expect(state.isStreaming).toBe(true);
    expect(state.streamingMessageEl).toBe(shells[1]);
    expect(newController.handleChunk).not.toHaveBeenCalledWith({ type: 'done' });
    expect(oldController.handleChunk).not.toHaveBeenCalledWith({ type: 'text', content: 'MUST_NOT_REAPPEAR' });
    expect(shells[0]?.dataset.messageId).toBe('native-old');
    expect(shells[1]?.dataset.messageId).toBeUndefined();
    expect(oldPrepared.conversation.messages).toContainEqual(expect.objectContaining({
      content: 'Old answer', sourceMessageId: 'native-old', streamState: 'interrupted',
    }));
    expect(finalization.finalizeAfterStream).not.toHaveBeenCalled();
    expect(preparation.consumeQueuedFollowUpSend).not.toHaveBeenCalled();

    releaseNext();
    await second;
    expect(state.isStreaming).toBe(false);
    expect(finalization.finalizeAfterStream).toHaveBeenCalledTimes(1);
    expect(oldPrepared.conversation.messages.filter((message) => message.role === 'assistant').map((message) => message.content))
      .toEqual(['Old answer', 'Next answer']);
  });

});

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

    expect(preparationPort.prepareMessageSend).toHaveBeenCalledWith({ content: 'Hello', targetTabId: 'tab-1' });
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

  it('captures the bound note once with ordinary file context paths', async () => {
    const preparedSend = createPreparedSend({
      conversation: { ...createPreparedSend().conversation, linkedNotePath: 'drafts/plan.md' },
      contextItems: [{ id: 'draft', kind: 'file', path: 'drafts/plan.md', label: 'plan', mime: 'text/markdown' }],
    });
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const host = createHost(runtimeState, streamController, [], {
      onTurnSnapshotBegin: jest.fn(),
      sendStreamMessage: jest.fn().mockReturnValue(createAsyncStream([{ type: 'message_start' }, { type: 'message_stop' }])),
    });
    const runtime = new SendPipelineRuntime(host, createPreparationPort(preparedSend), createFinalizationPort());

    await runtime.sendMessage('Use the draft');

    expect(host.onTurnSnapshotBegin).toHaveBeenCalledWith(expect.objectContaining({
      contextPaths: ['drafts/plan.md'],
    }));
  });
});


describe('SendPipelineRuntime preparation identity', () => {
  it('captures the initiating tab before the slash-command await', async () => {
    const controller = createStreamController();
    const host = createHost(createTabRuntime(), controller);
    const preparation = createPreparationPort(null);
    const slash = { tryRunSlashCommand: jest.fn(async () => { host.getActiveTabId.mockReturnValue('tab-2'); return false; }) };
    await new SendPipelineRuntime(host, preparation, createFinalizationPort(), slash).sendMessage('tab-1 draft');
    expect(preparation.prepareMessageSend).toHaveBeenCalledWith(expect.objectContaining({ targetTabId: 'tab-1', content: 'tab-1 draft' }));
  });
});
