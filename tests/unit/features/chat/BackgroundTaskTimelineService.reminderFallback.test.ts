import type { ChatMessage } from '../../../../src/core/types';
import {
  type BackgroundTaskTimelineRuntime,
  BackgroundTaskTimelineService,
  type BackgroundTaskTimelineServiceHost,
} from '../../../../src/features/chat/services/BackgroundTaskTimelineService';

type MockedBackgroundTaskTimelineHost = {
  [Key in keyof BackgroundTaskTimelineServiceHost]:
    BackgroundTaskTimelineServiceHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : BackgroundTaskTimelineServiceHost[Key];
};

function createRuntime(
  overrides: Partial<BackgroundTaskTimelineRuntime> = {},
): BackgroundTaskTimelineRuntime {
  return {
    isStreaming: false,
    isHydratingConversation: false,
    backgroundTaskStartedAt: null,
    backgroundTaskActiveAnchorKey: null,
    backgroundTaskModeTag: null,
    backgroundTaskLaunches: new Map(),
    backgroundTaskCompletedTasks: new Map(),
    backgroundTaskWaitingForFollowUp: false,
    backgroundTaskStaleNoticeFingerprint: null,
    backgroundTaskSuppressedFingerprint: null,
    ...overrides,
  };
}

function createHost(
  runtime: BackgroundTaskTimelineRuntime | null = createRuntime(),
): MockedBackgroundTaskTimelineHost {
  return {
    getTabRuntimeState: jest.fn().mockReturnValue(runtime),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    getMessageAnchorKey: jest.fn((message: ChatMessage) => message.sourceMessageId ?? message.id),
    clearInlinePanel: jest.fn(),
    armAuthoritativeSyncGate: jest.fn(),
    clearAuthoritativeSyncGate: jest.fn(),
    syncTabStreamLikeState: jest.fn(),
    isSuppressedBackgroundTaskSegment: jest.fn().mockReturnValue(false),
  };
}

describe('BackgroundTaskTimelineService reminder fallback', () => {
  it('attaches unmatched completion reminders to the latest tracked task anchor', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);
    const messages: ChatMessage[] = [
      {
        id: 'user-search',
        role: 'user',
        content: 'search docs',
        timestamp: 1,
        sourceMessageId: 'msg-user-search',
        omo: {
          kind: 'user-injection',
          modeTag: 'search-mode',
          injectedPrompt: 'search docs',
          originalText: 'search docs',
          rawText: 'search docs',
          headline: 'search docs',
        },
      },
      {
        id: 'user-plain',
        role: 'user',
        content: 'plain follow-up',
        timestamp: 2,
        sourceMessageId: 'msg-user-plain',
      },
      {
        id: 'assistant-reminder-1',
        role: 'assistant',
        content: 'bg_missing complete',
        timestamp: 3,
        sourceMessageId: 'msg-reminder-1',
        displayStyle: 'notice',
        noticeTone: 'info',
        omo: {
          kind: 'system-reminder',
          reminderType: 'background-task-completed',
          reminderText: 'bg_missing complete',
          rawText: 'bg_missing complete',
          headline: 'bg_missing complete',
          isInternalInitiator: false,
          tasks: [{ id: 'bg_missing', description: 'Search docs' }],
        },
      },
    ];

    const segments = service.collectSegments(messages, 'tab-1');
    const reminderSegment = segments.find((segment) => segment.anchorKey === 'msg-user-plain');

    expect(reminderSegment).toEqual(expect.objectContaining({
      anchorKey: 'msg-user-plain',
      modeTag: null,
      completionEvents: [expect.objectContaining({ reminderMessageId: 'msg-reminder-1' })],
    }));
  });

  it('creates a latest-anchor reminder segment when no activity segment exists', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);
    const messages: ChatMessage[] = [
      {
        id: 'user-plain',
        role: 'user',
        content: 'plain follow-up',
        timestamp: 1,
        sourceMessageId: 'msg-user-plain',
      },
      {
        id: 'assistant-reminder-1',
        role: 'assistant',
        content: 'bg_missing complete',
        timestamp: 2,
        sourceMessageId: 'msg-reminder-1',
        displayStyle: 'notice',
        noticeTone: 'info',
        omo: {
          kind: 'system-reminder',
          reminderType: 'background-task-completed',
          reminderText: 'bg_missing complete',
          rawText: 'bg_missing complete',
          headline: 'bg_missing complete',
          isInternalInitiator: false,
          tasks: [{ id: 'bg_missing', description: 'Search docs' }],
        },
      },
    ];

    expect(service.collectSegments(messages, 'tab-1')).toEqual([
      expect.objectContaining({
        anchorKey: 'msg-user-plain',
        modeTag: null,
        completionEvents: [expect.objectContaining({ reminderMessageId: 'msg-reminder-1' })],
      }),
    ]);
  });

  it('prefers the latest activity segment over the latest tracked task anchor', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);
    const messages: ChatMessage[] = [
      {
        id: 'user-task',
        role: 'user',
        content: 'delegate this',
        timestamp: 1,
        sourceMessageId: 'msg-user-task',
      },
      {
        id: 'assistant-task',
        role: 'assistant',
        content: '',
        timestamp: 2,
        contentBlocks: [{
          type: 'tool_use',
          toolId: 'call-1',
          toolName: 'task',
          toolInput: { description: 'Search docs' },
          toolStatus: 'running',
        }],
      },
      {
        id: 'user-plain',
        role: 'user',
        content: 'plain follow-up',
        timestamp: 3,
        sourceMessageId: 'msg-user-plain',
      },
      {
        id: 'assistant-reminder-1',
        role: 'assistant',
        content: 'bg_missing complete',
        timestamp: 4,
        sourceMessageId: 'msg-reminder-1',
        displayStyle: 'notice',
        noticeTone: 'info',
        omo: {
          kind: 'system-reminder',
          reminderType: 'background-task-completed',
          reminderText: 'bg_missing complete',
          rawText: 'bg_missing complete',
          headline: 'bg_missing complete',
          isInternalInitiator: false,
          tasks: [{ id: 'bg_missing', description: 'Search docs' }],
        },
      },
    ];

    const segments = service.collectSegments(messages, 'tab-1');

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(expect.objectContaining({
      anchorKey: 'msg-user-task',
      completionEvents: [expect.objectContaining({ reminderMessageId: 'msg-reminder-1' })],
    }));
  });
});
