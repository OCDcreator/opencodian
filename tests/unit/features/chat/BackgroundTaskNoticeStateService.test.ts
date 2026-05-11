import {
  type BackgroundTaskNoticeStateRuntime,
  BackgroundTaskNoticeStateService,
} from '../../../../src/features/chat/services/BackgroundTaskNoticeStateService';
import { t } from '../../../../src/i18n';

describe('BackgroundTaskNoticeStateService', () => {
  const pending = [
    {
      launchId: 'launch-12345678',
      taskId: 'task-1',
      description: 'Search docs',
    },
  ];

  function createService(options?: {
    activeTabId?: string | null;
    conversationMessages?: Array<Record<string, unknown>>;
  }): {
    service: BackgroundTaskNoticeStateService;
    runtime: BackgroundTaskNoticeStateRuntime;
    appendPersistentAssistantNoticeMessage: jest.Mock;
  } {
    const runtime: BackgroundTaskNoticeStateRuntime = {
      isStreaming: false,
      backgroundTaskStaleNoticeFingerprint: null,
      backgroundTaskSuppressedFingerprint: null,
    };
    const conversation = {
      id: 'conversation-1',
      openCodeSessionId: 'session-1',
      messages: options?.conversationMessages ?? [],
    } as never;
    const appendPersistentAssistantNoticeMessage = jest.fn().mockResolvedValue(undefined);

    const host = {
      getTabRuntimeState: jest.fn().mockReturnValue(runtime),
      getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-1'),
      getSessionIdForTab: jest.fn().mockReturnValue('session-1'),
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      hasMatchingPersistentAssistantNoticeMessage: jest.fn(
        (title: string, content: string, tone: string, targetConversation = conversation) =>
          targetConversation?.messages.some((message: Record<string, unknown>) =>
            message.role === 'assistant'
            && message.displayStyle === 'notice'
            && message.noticeTitle === title
            && message.noticeTone === tone
            && message.content === content,
          ) ?? false,
      ),
      appendPersistentAssistantNoticeMessage,
    };

    return {
      service: new BackgroundTaskNoticeStateService(host),
      runtime,
      appendPersistentAssistantNoticeMessage,
    };
  }

  it('suppresses repeated append attempts for the same stale task set in one runtime', async () => {
    const { service, runtime, appendPersistentAssistantNoticeMessage } = createService();

    await service.handleStoppedPendingLaunches('tab-1', pending);
    await service.handleStoppedPendingLaunches('tab-1', pending);

    expect(appendPersistentAssistantNoticeMessage).toHaveBeenCalledTimes(1);
    expect(runtime.backgroundTaskStaleNoticeFingerprint).toBe(
      service.buildStoppedNoticeContent(pending),
    );
    expect(runtime.backgroundTaskSuppressedFingerprint).toBe(
      service.buildStoppedNoticeContent(pending),
    );
  });

  it('restores persisted suppression when the same stale notice already exists', () => {
    const seedService = createService().service;
    const content = seedService.buildStoppedNoticeContent(pending);
    const { service, runtime } = createService({
      conversationMessages: [
        {
          id: 'assistant-notice-1',
          role: 'assistant',
          content,
          timestamp: Date.now(),
          displayStyle: 'notice',
          noticeTitle: t('chat.backgroundTask.staleTitle'),
          noticeTone: 'warning',
        },
      ],
    });

    expect(service.isPendingLaunchSetSuppressed(pending, 'tab-1')).toBe(true);
    expect(runtime.backgroundTaskStaleNoticeFingerprint).toBe(content);
    expect(runtime.backgroundTaskSuppressedFingerprint).toBe(content);
  });

  it('records suppression for background tabs without appending a visible notice', async () => {
    const { service, runtime, appendPersistentAssistantNoticeMessage } = createService({
      activeTabId: 'tab-2',
    });

    await service.handleStoppedPendingLaunches('tab-1', pending);

    expect(runtime.backgroundTaskSuppressedFingerprint).toBe(
      service.buildStoppedNoticeContent(pending),
    );
    expect(runtime.backgroundTaskStaleNoticeFingerprint).toBeNull();
    expect(appendPersistentAssistantNoticeMessage).not.toHaveBeenCalled();
  });
});
