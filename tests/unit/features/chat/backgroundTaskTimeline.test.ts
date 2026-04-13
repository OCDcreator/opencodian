import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import type { ChatMessage } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { BackgroundTaskIndicatorCoordinator } from '../../../../src/features/chat/runtime/BackgroundTaskIndicatorCoordinator';
import { BackgroundTaskCompletionNoticeService } from '../../../../src/features/chat/services/BackgroundTaskCompletionNoticeService';
import { BackgroundTaskTimelineService } from '../../../../src/features/chat/services/BackgroundTaskTimelineService';

function createView(): OpenCodianView {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      effortLevel: 'medium',
      thinkingBudget: 0,
      locale: 'en',
    },
    openCodeService: {},
    storage: {},
    saveConversation: jest.fn().mockResolvedValue(undefined),
  } as never);
}

function createReminderMessage(
  id: string,
  taskId = 'bg_1',
  reminderType: 'background-task-completed' | 'all-background-tasks-complete' = 'background-task-completed',
): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: reminderType === 'all-background-tasks-complete' ? 'all complete' : 'single complete',
    timestamp: Date.now(),
    sourceMessageId: id,
    displayStyle: 'notice',
    noticeTone: 'info',
    omo: {
      kind: 'system-reminder',
      reminderType,
      reminderText: reminderType === 'all-background-tasks-complete' ? 'all complete' : 'single complete',
      rawText: reminderType === 'all-background-tasks-complete' ? 'all complete' : 'single complete',
      headline: reminderType === 'all-background-tasks-complete' ? 'all complete' : 'single complete',
      isInternalInitiator: false,
      tasks: [{ id: taskId, description: 'Search docs' }],
    },
  };
}

describe('OpenCodianView background task timeline', () => {
  it('hides raw background completion reminder messages from the rendered timeline', () => {
    const view = createView() as unknown as {
      shouldRenderConversationMessage: (message: ChatMessage) => boolean;
    };

    expect(view.shouldRenderConversationMessage(createReminderMessage('msg-reminder'))).toBe(false);
    expect(view.shouldRenderConversationMessage({
      id: 'assistant-notice-local',
      role: 'assistant',
      content: 'friendly completion',
      timestamp: Date.now(),
      displayStyle: 'notice',
      noticeTitle: 'Background task completed',
      noticeTone: 'info',
      noticeMeta: {
        kind: 'background-task-completion',
        anchorKey: 'user-1',
        sourceReminderIds: ['msg-reminder'],
        taskIds: ['bg_1'],
      },
    })).toBe(true);
  });

  it('matches delayed completion reminders back to the originating background-task turn', () => {
    const view = createView() as unknown as {
      collectBackgroundTaskSegments: (messages: ChatMessage[], tabId?: string) => Array<{
        anchorKey: string;
        completionEvents: Array<{ reminderMessageId: string }>;
      }>;
      getTabRuntimeState: () => null;
    };

    jest.spyOn(view, 'getTabRuntimeState').mockReturnValue(null);

    const messages: ChatMessage[] = [
      {
        id: 'user-local-1',
        role: 'user',
        content: 'find docs',
        timestamp: 1,
        sourceMessageId: 'msg-user-1',
        omo: {
          kind: 'user-injection',
          modeTag: 'search-mode',
          injectedPrompt: 'search',
          originalText: 'find docs',
          rawText: 'raw',
          headline: 'search',
        },
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        timestamp: 2,
        sourceMessageId: 'msg-assistant-1',
        contentBlocks: [{
          type: 'tool_use',
          toolId: 'call-1',
          toolName: 'task',
          toolInput: { description: 'Search docs', taskId: 'bg_1' },
          toolResult: 'started bg_1',
          toolStatus: 'completed',
        }],
      },
      {
        id: 'user-local-2',
        role: 'user',
        content: 'meanwhile continue',
        timestamp: 3,
        sourceMessageId: 'msg-user-2',
      },
      createReminderMessage('msg-reminder-1'),
    ];

    const segments = view.collectBackgroundTaskSegments(messages, 'tab-1');

    expect(segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        anchorKey: 'msg-user-1',
        completionEvents: [expect.objectContaining({ reminderMessageId: 'msg-reminder-1' })],
      }),
    ]));
  });

  it('queues completion notices during streaming and dedupes against persisted local notices', async () => {
    const runtime = {
      isStreaming: true,
      isHydratingConversation: false,
      backgroundTaskStartedAt: null,
      backgroundTaskActiveAnchorKey: null,
      backgroundTaskModeTag: null,
      backgroundTaskLaunches: new Map(),
      backgroundTaskCompletedTasks: new Map(),
      backgroundTaskWaitingForFollowUp: false,
      backgroundTaskStaleNoticeFingerprint: null,
      backgroundTaskSuppressedFingerprint: null,
    };
    const conversation = {
      id: 'conversation-1',
      title: 'Conversation',
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'session-1',
      messages: [
        {
          id: 'user-local-1',
          role: 'user' as const,
          content: 'find docs',
          timestamp: 1,
          sourceMessageId: 'msg-user-1',
          omo: {
            kind: 'user-injection' as const,
            modeTag: 'search-mode',
            injectedPrompt: 'search',
            originalText: 'find docs',
            rawText: 'raw',
            headline: 'search',
          },
        },
        createReminderMessage('msg-reminder-1'),
      ],
    };
    const timelineService = new BackgroundTaskTimelineService({
      getTabRuntimeState: jest.fn().mockReturnValue(runtime),
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getMessageAnchorKey: (message) => message.sourceMessageId ?? message.id,
      armAuthoritativeSyncGate: jest.fn(),
      clearAuthoritativeSyncGate: jest.fn(),
      syncTabStreamLikeState: jest.fn(),
      isSuppressedBackgroundTaskSegment: jest.fn().mockReturnValue(false),
    });
    const appendSpy = jest.fn().mockResolvedValue(undefined);
    const completionNoticeService = new BackgroundTaskCompletionNoticeService({
      getTabRuntimeState: jest.fn().mockReturnValue(runtime),
      appendPersistentAssistantNoticeMessage: appendSpy,
    });
    const coordinator = new BackgroundTaskIndicatorCoordinator(
      { render: jest.fn().mockResolvedValue(undefined) },
      timelineService,
      completionNoticeService,
      {
        reconcileStateFromLiveSignals: jest.fn(),
      },
      {
        syncStreamLikeState: jest.fn(),
      },
      {
        getActiveTabId: jest.fn().mockReturnValue('tab-1'),
        getCurrentConversation: jest.fn().mockReturnValue(conversation),
        hasTabRuntime: jest.fn().mockReturnValue(true),
      },
    );

    await coordinator.queueAndFlushCompletionNotices('tab-1', conversation as never);

    expect(appendSpy).not.toHaveBeenCalled();

    runtime.isStreaming = false;
    conversation.messages.push({
      id: 'assistant-notice-local',
      role: 'assistant',
      content: 'friendly completion',
      timestamp: Date.now(),
      displayStyle: 'notice',
      noticeTitle: 'Background task completed',
      noticeTone: 'info',
      noticeMeta: {
        kind: 'background-task-completion',
        anchorKey: 'msg-user-1',
        sourceReminderIds: ['msg-reminder-1'],
        taskIds: ['bg_1'],
      },
    });

    await coordinator.queueAndFlushCompletionNotices('tab-1', conversation as never);
    expect(appendSpy).not.toHaveBeenCalled();
  });
});
