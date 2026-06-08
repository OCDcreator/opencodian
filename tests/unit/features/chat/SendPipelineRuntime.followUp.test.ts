import {
  createAsyncStream,
  createConversation,
  createFinalizationPort,
  createHost,
  createPreparationPort,
  createPreparedSend,
  createStreamController,
  createTabRuntime,
  createUserMessage,
  SendPipelineRuntime,
} from './SendPipelineRuntime.testSupport';

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
