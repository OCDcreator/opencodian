import {
  createAsyncStream,
  createFinalizationPort,
  createHost,
  createPreparationPort,
  createPreparedSend,
  createStreamController,
  createTabRuntime,
  SendPipelineRuntime,
} from './SendPipelineRuntime.testSupport';

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
