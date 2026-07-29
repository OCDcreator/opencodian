import { shouldRefreshOpenCodeDiagnosticsHeader } from '../../../../src/features/chat/runtime/SendPipelineRuntime';
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

  it('refreshes diagnostics chrome only for the active target tab', () => {
    expect(shouldRefreshOpenCodeDiagnosticsHeader('tab-target', 'tab-target')).toBe(true);
    expect(shouldRefreshOpenCodeDiagnosticsHeader('tab-other', 'tab-target')).toBe(false);
    expect(shouldRefreshOpenCodeDiagnosticsHeader('tab-target', null)).toBe(false);
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

  it('claims a deep-capture token only for the exact OpenCode tab and forwards it internally', async () => {
    const preparedSend = createPreparedSend();
    const token = {
      runId: 'run-a',
      tabId: preparedSend.tabId as string,
      armedAt: 1,
      expiresAt: 2,
    };
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(preparedSend);
    const finalizationPort = createFinalizationPort();
    const refreshOpenCodeDiagnosticsState = jest.fn();
    const host = createHost(runtimeState, streamController, [], {
      claimOpenCodeDiagnosticRunToken: jest.fn().mockReturnValue(token),
      refreshOpenCodeDiagnosticsState,
      sendStreamMessage: jest.fn().mockImplementation(() => {
        expect(refreshOpenCodeDiagnosticsState).toHaveBeenCalledTimes(1);
        expect(refreshOpenCodeDiagnosticsState).toHaveBeenLastCalledWith(preparedSend.tabId);
        return createAsyncStream([
          { type: 'message_start' },
          { type: 'message_stop' },
        ]);
      }),
    });
    const runtime = new SendPipelineRuntime(host, preparationPort, finalizationPort);

    await runtime.sendMessage('Hello');

    expect(host.claimOpenCodeDiagnosticRunToken).toHaveBeenCalledWith(preparedSend.tabId, 'session-1');
    expect(host.sendStreamMessage).toHaveBeenCalledWith(
      preparedSend.conversation,
      'Hello',
      expect.objectContaining({ diagnosticRunToken: token }),
    );
    expect(refreshOpenCodeDiagnosticsState.mock.calls).toEqual([
      [preparedSend.tabId],
      [preparedSend.tabId],
    ]);
    expect(refreshOpenCodeDiagnosticsState).not.toHaveBeenCalledWith('tab-other');
  });

  it('persists a notice when the stream ends with only an error', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(500);
    const preparedSend = createPreparedSend();
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const preparationPort = createPreparationPort(preparedSend);
    const finalizationPort = createFinalizationPort();
    const refreshOpenCodeDiagnosticsState = jest.fn();
    const host = createHost(runtimeState, streamController, [], {
      claimOpenCodeDiagnosticRunToken: jest.fn().mockReturnValue({
        runId: 'run-error',
        tabId: preparedSend.tabId as string,
        armedAt: 1,
        expiresAt: 2,
      }),
      refreshOpenCodeDiagnosticsState,
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
    expect(refreshOpenCodeDiagnosticsState.mock.calls).toEqual([
      [preparedSend.tabId],
      [preparedSend.tabId],
    ]);
  });

  it('refreshes the target diagnostics header after stream cancellation', async () => {
    const preparedSend = createPreparedSend();
    const runtimeState = createTabRuntime();
    const streamController = createStreamController();
    const refreshOpenCodeDiagnosticsState = jest.fn();
    const host = createHost(runtimeState, streamController, [], {
      claimOpenCodeDiagnosticRunToken: jest.fn().mockReturnValue({
        runId: 'run-cancel',
        tabId: preparedSend.tabId as string,
        armedAt: 1,
        expiresAt: 2,
      }),
      refreshOpenCodeDiagnosticsState,
      sendStreamMessage: jest.fn().mockImplementation(async function* () {
        runtimeState.isStreaming = false;
        yield { type: 'message_start' } as const;
      }),
    });
    const runtime = new SendPipelineRuntime(
      host,
      createPreparationPort(preparedSend),
      createFinalizationPort(),
    );

    await runtime.sendMessage('Hello');

    expect(refreshOpenCodeDiagnosticsState.mock.calls).toEqual([
      [preparedSend.tabId],
      [preparedSend.tabId],
    ]);
    expect(refreshOpenCodeDiagnosticsState).not.toHaveBeenCalledWith('tab-other');
  });
});
