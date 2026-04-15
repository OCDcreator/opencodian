import {
  type BackgroundTaskCompletionNoticeRuntime,
  type BackgroundTaskCompletionNoticeSegment,
  BackgroundTaskCompletionNoticeService,
} from '../../../../src/features/chat/services/BackgroundTaskCompletionNoticeService';
import { t } from '../../../../src/i18n';

function createService(options?: {
  conversationMessages?: Array<Record<string, unknown>>;
  isStreaming?: boolean;
}): {
  service: BackgroundTaskCompletionNoticeService;
  runtime: BackgroundTaskCompletionNoticeRuntime;
  conversation: {
    id: string;
    openCodeSessionId: string;
    messages: Array<Record<string, unknown>>;
  };
  appendPersistentAssistantNoticeMessage: jest.Mock;
} {
  const runtime: BackgroundTaskCompletionNoticeRuntime = {
    isStreaming: options?.isStreaming ?? false,
  };
  const conversation = {
    id: 'conversation-1',
    openCodeSessionId: 'session-1',
    messages: options?.conversationMessages ?? [],
  };
  const appendPersistentAssistantNoticeMessage = jest.fn().mockResolvedValue(undefined);

  const host = {
    getTabRuntimeState: jest.fn().mockReturnValue(runtime),
    appendPersistentAssistantNoticeMessage,
  };

  return {
    service: new BackgroundTaskCompletionNoticeService(host),
    runtime,
    conversation,
    appendPersistentAssistantNoticeMessage,
  };
}

describe('BackgroundTaskCompletionNoticeService queue and flush', () => {
  it('persists sorted completion notices per anchor after flushing', async () => {
    const { service, conversation, appendPersistentAssistantNoticeMessage } = createService();
    const segments: BackgroundTaskCompletionNoticeSegment[] = [
      {
        anchorKey: 'msg-user-1',
        completionEvents: [
          {
            reminderMessageId: 'msg-reminder-2',
            reminderType: 'background-task-completed',
            timestamp: 20,
            tasks: [{ taskId: 'bg_2', description: 'Draft summary' }],
          },
          {
            reminderMessageId: 'msg-reminder-1',
            reminderType: 'all-background-tasks-complete',
            timestamp: 10,
            tasks: [{ taskId: 'bg_1', description: 'Search docs' }],
          },
        ],
      },
    ];

    service.queueNotices(segments, 'tab-1', conversation as never);
    await service.flushQueuedNotices('tab-1', conversation as never);

    expect(appendPersistentAssistantNoticeMessage).toHaveBeenCalledWith({
      title: t('chat.omo.system.allCompleted'),
      content: [
        t('chat.omo.system.allCompletedSummary'),
        '',
        `**${t('chat.backgroundTask.taskListLabel')}**`,
        '- `bg_1`: Search docs',
        '- `bg_2`: Draft summary',
      ].join('\n'),
      tone: 'info',
      conversation,
      tabId: 'tab-1',
      timestamp: 20,
      noticeMeta: {
        kind: 'background-task-completion',
        conversationId: 'conversation-1',
        anchorKey: 'msg-user-1',
        sourceReminderIds: ['msg-reminder-1', 'msg-reminder-2'],
        allComplete: true,
        taskIds: ['bg_1', 'bg_2'],
      },
    });
  });

  it('keeps queued notices inside the service until streaming finishes', async () => {
    const { service, runtime, conversation, appendPersistentAssistantNoticeMessage } = createService({
      isStreaming: true,
    });

    service.queueNotices([
      {
        anchorKey: 'msg-user-1',
        completionEvents: [
          {
            reminderMessageId: 'msg-reminder-1',
            reminderType: 'background-task-completed',
            timestamp: 10,
            tasks: [{ taskId: 'bg_1', description: 'Search docs' }],
          },
        ],
      },
    ], 'tab-1', conversation as never);

    await service.flushQueuedNotices('tab-1', conversation as never);
    expect(appendPersistentAssistantNoticeMessage).not.toHaveBeenCalled();

    runtime.isStreaming = false;
    await service.flushQueuedNotices('tab-1', conversation as never);

    expect(appendPersistentAssistantNoticeMessage).toHaveBeenCalledTimes(1);
  });

  it('merges repeated queue passes for the same anchor before flush', async () => {
    const { service, conversation, appendPersistentAssistantNoticeMessage } = createService();

    service.queueNotices([
      {
        anchorKey: 'msg-user-1',
        completionEvents: [
          {
            reminderMessageId: 'msg-reminder-2',
            reminderType: 'background-task-completed',
            timestamp: 30,
            tasks: [{ taskId: 'bg_2', description: 'Draft summary' }],
          },
        ],
      },
    ], 'tab-1', conversation as never);
    service.queueNotices([
      {
        anchorKey: 'msg-user-1',
        completionEvents: [
          {
            reminderMessageId: 'msg-reminder-1',
            reminderType: 'background-task-completed',
            timestamp: 10,
            tasks: [{ taskId: 'bg_1', description: 'Search docs' }],
          },
        ],
      },
    ], 'tab-1', conversation as never);

    await service.flushQueuedNotices('tab-1', conversation as never);

    expect(appendPersistentAssistantNoticeMessage).toHaveBeenCalledWith({
      title: t('chat.omo.system.backgroundCompleted'),
      content: [
        t('chat.omo.system.backgroundCompletedSummary'),
        '',
        `**${t('chat.backgroundTask.taskListLabel')}**`,
        '- `bg_1`: Search docs',
        '- `bg_2`: Draft summary',
      ].join('\n'),
      tone: 'info',
      conversation,
      tabId: 'tab-1',
      timestamp: 30,
      noticeMeta: {
        kind: 'background-task-completion',
        conversationId: 'conversation-1',
        anchorKey: 'msg-user-1',
        sourceReminderIds: ['msg-reminder-1', 'msg-reminder-2'],
        allComplete: false,
        taskIds: ['bg_1', 'bg_2'],
      },
    });
  });
});

describe('BackgroundTaskCompletionNoticeService deduplication', () => {
  it('skips reminder events already represented by persisted notices', async () => {
    const { service, conversation, appendPersistentAssistantNoticeMessage } = createService({
      conversationMessages: [
        {
          id: 'assistant-notice-1',
          role: 'assistant',
          content: 'friendly completion',
          timestamp: Date.now(),
          displayStyle: 'notice',
          noticeTitle: t('chat.omo.system.backgroundCompleted'),
          noticeTone: 'info',
          noticeMeta: {
            kind: 'background-task-completion',
            anchorKey: 'msg-user-1',
            sourceReminderIds: ['msg-reminder-1'],
            taskIds: ['bg_1'],
          },
        },
      ],
    });

    service.queueNotices([
      {
        anchorKey: 'msg-user-1',
        completionEvents: [
          {
            reminderMessageId: 'msg-reminder-1',
            reminderType: 'background-task-completed',
            timestamp: 10,
            tasks: [{ taskId: 'bg_1', description: 'Search docs' }],
          },
        ],
      },
    ], 'tab-1', conversation as never);

    await service.flushQueuedNotices('tab-1', conversation as never);
    expect(appendPersistentAssistantNoticeMessage).not.toHaveBeenCalled();
  });

  it('dedupes completion notices by sorted task fingerprint metadata', async () => {
    const { service, conversation, appendPersistentAssistantNoticeMessage } = createService({
      conversationMessages: [
        {
          id: 'assistant-notice-1',
          role: 'assistant',
          content: 'friendly completion',
          timestamp: Date.now(),
          displayStyle: 'notice',
          noticeTitle: t('chat.omo.system.allCompleted'),
          noticeTone: 'info',
          noticeMeta: {
            kind: 'background-task-completion',
            anchorKey: 'msg-user-1',
            sourceReminderIds: ['msg-reminder-older'],
            allComplete: true,
            taskIds: ['bg_2', 'bg_1'],
          },
        },
      ],
    });

    service.queueNotices([
      {
        anchorKey: 'msg-user-1',
        completionEvents: [
          {
            reminderMessageId: 'msg-reminder-new',
            reminderType: 'all-background-tasks-complete',
            timestamp: 20,
            tasks: [
              { taskId: 'bg_1', description: 'Search docs' },
              { taskId: 'bg_2', description: 'Draft summary' },
              { taskId: 'bg_1', description: 'Search docs' },
            ],
          },
        ],
      },
    ], 'tab-1', conversation as never);

    await service.flushQueuedNotices('tab-1', conversation as never);
    expect(appendPersistentAssistantNoticeMessage).not.toHaveBeenCalled();
  });
});
