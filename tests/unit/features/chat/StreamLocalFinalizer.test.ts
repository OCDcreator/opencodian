jest.mock('../../../../src/features/chat/runtime/buildLocalStreamOutcome', () => ({
  buildLocalStreamOutcome: jest.fn(),
}));

jest.mock('../../../../src/features/chat/runtime/StreamShellFinalizer', () => ({
  finalizeStreamingShell: jest.fn(),
}));

jest.mock('../../../../src/features/chat/runtime/LocalStreamMessagePersistence', () => ({
  persistLocalStreamOutcome: jest.fn(),
}));

import { buildLocalStreamOutcome } from '../../../../src/features/chat/runtime/buildLocalStreamOutcome';
import { persistLocalStreamOutcome } from '../../../../src/features/chat/runtime/LocalStreamMessagePersistence';
import { StreamLocalFinalizer } from '../../../../src/features/chat/runtime/StreamLocalFinalizer';
import { finalizeStreamingShell } from '../../../../src/features/chat/runtime/StreamShellFinalizer';

describe('StreamLocalFinalizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finalizes background-task indicators after the primary stream shell finishes', async () => {
    (buildLocalStreamOutcome as jest.Mock).mockReturnValue({
      finalizedTimestamp: 123,
      finalizedModelId: 'openai/gpt-5',
      finalizedAssistantMessageId: 'assistant-1',
      finalizedStreamingMessageEl: null,
      streamContentBlocks: [],
      streamedTextContent: 'done',
      hasStreamContentBlocks: true,
      shouldPersistInterruptedState: false,
      streamErrorNoticeMessage: null,
      interruptedNoticeMessage: null,
      shouldSyncFromServer: false,
    });
    (finalizeStreamingShell as jest.Mock).mockResolvedValue('timestamp-appended');
    (persistLocalStreamOutcome as jest.Mock).mockResolvedValue(undefined);

    const host = {
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      scheduleSettledScrollToBottomIfNeeded: jest.fn(),
      finalizeBackgroundTaskIndicatorAfterPrimaryStream: jest.fn().mockResolvedValue(undefined),
      removeEmptyAssistantShells: jest.fn(),
      syncTabStreamLikeState: jest.fn(),
      transitionTabSessionLifecycle: jest.fn().mockReturnValue(true),
      refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
      completeTabContextUsageStream: jest.fn(),
      summarizeContentBlocksForDebug: jest.fn().mockReturnValue({ blockCount: 0 }),
      addTimestampWithCopyButton: jest.fn(),
      renderAssistantPlaceholderAsNotice: jest.fn().mockResolvedValue(undefined),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      summarizeChatMessageForDebug: jest.fn().mockReturnValue(null),
      stringifyLogPayload: jest.fn().mockReturnValue('{}'),
      getLogPreview: jest.fn((text: string) => text),
    };
    const runtime = {
      isStreaming: true,
      streamingMessageEl: document.createElement('div'),
      streamingContentEl: document.createElement('div'),
      pendingEditedFiles: new Set<string>(),
      pendingQuestionResolution: null,
      isConversationSyncInFlight: false,
      sessionStatusSessionId: 'session-1',
      sessionStatus: {
        type: 'retry' as const,
        attempt: 1,
        message: ' Insufficient balance. ',
        next: 123,
      },
    };
    const routedStream = {
      resetStreamingState: jest.fn(),
      cleanupPendingIndicator: jest.fn(),
      logAssistantFinalizationStage: jest.fn(),
    };

    const finalizer = new StreamLocalFinalizer({
      host: host as never,
      preparedSend: {
        tabId: 'tab-1',
        conversation: { openCodeSessionId: 'session-1' },
      } as never,
      runtime,
      streamController: null,
      routedStream: routedStream as never,
    });

    await finalizer.finalize();

    expect(buildLocalStreamOutcome).toHaveBeenCalledWith(expect.objectContaining({
      sessionRetryMessage: 'Insufficient balance.',
    }));
    expect(finalizeStreamingShell).toHaveBeenCalled();
    expect(host.finalizeBackgroundTaskIndicatorAfterPrimaryStream).toHaveBeenCalledWith('tab-1');
    expect(host.transitionTabSessionLifecycle).toHaveBeenCalledWith(
      'tab-1',
      'finalizing',
      'stream-local-finalizer',
    );
    expect(
      (finalizeStreamingShell as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(host.finalizeBackgroundTaskIndicatorAfterPrimaryStream.mock.invocationCallOrder[0]);
    expect(host.syncTabStreamLikeState).toHaveBeenCalledWith('tab-1');
  });
});
