import type { ChatMessage, Conversation } from '../../../../src/core/types';
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

function createConversation(messages: ChatMessage[]): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

describe('BackgroundTaskTimelineService timeline assembly from persisted messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignores plain OpenCode task blocks when no search-mode anchor armed the background-task timeline', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);
    const messages: ChatMessage[] = [
      {
        id: 'user-local-1',
        role: 'user',
        content: 'delegate this',
        timestamp: 1,
        sourceMessageId: 'msg-user-1',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        timestamp: 2,
        contentBlocks: [{
          type: 'tool_use',
          toolId: 'call-1',
          toolName: 'task',
          toolInput: { description: 'Audit routes', taskId: 'child_1' },
          toolResult: 'started child_1',
          toolStatus: 'completed',
        }],
      },
    ];

    expect(service.collectSegments(messages, 'tab-1')).toEqual([]);
  });

  it('collects launches, completions, and pending tasks into a single segment', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);
    const messages: ChatMessage[] = [
      {
        id: 'user-local-1',
        role: 'user',
        content: 'search docs',
        timestamp: 1,
        sourceMessageId: 'msg-user-1',
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
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        timestamp: 2,
        contentBlocks: [
          {
            type: 'tool_use',
            toolId: 'call-1',
            toolName: 'task',
            toolInput: { description: 'Search docs', taskId: 'bg_1' },
            toolResult: 'started bg_1',
            toolStatus: 'completed',
          },
          {
            type: 'tool_use',
            toolId: 'call-2',
            toolName: 'task',
            toolInput: { description: 'Draft summary', taskId: 'bg_2' },
            toolResult: 'started bg_2',
            toolStatus: 'completed',
          },
        ],
      },
      {
        id: 'assistant-reminder-1',
        role: 'assistant',
        content: 'bg_1 complete',
        timestamp: 3,
        sourceMessageId: 'msg-reminder-1',
        displayStyle: 'notice',
        noticeTone: 'info',
        omo: {
          kind: 'system-reminder',
          reminderType: 'background-task-completed',
          reminderText: 'bg_1 complete',
          rawText: 'bg_1 complete',
          headline: 'bg_1 complete',
          isInternalInitiator: false,
          tasks: [{ id: 'bg_1', description: 'Search docs' }],
        },
      },
    ];

    const segments = service.collectSegments(messages, 'tab-1');

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(expect.objectContaining({
      anchorKey: 'msg-user-1',
      launches: expect.arrayContaining([
        expect.objectContaining({ launchId: 'call-1', taskId: 'bg_1' }),
        expect.objectContaining({ launchId: 'call-2', taskId: 'bg_2' }),
      ]),
      completed: [expect.objectContaining({ taskId: 'bg_1', description: 'Search docs' })],
      pending: [expect.objectContaining({ launchId: 'call-2', taskId: 'bg_2' })],
      completionEvents: [expect.objectContaining({ reminderMessageId: 'msg-reminder-1' })],
    }));
  });

  it('falls back all-complete reminders to the latest active segment and clears pending tasks', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);
    const messages: ChatMessage[] = [
      {
        id: 'user-local-1',
        role: 'user',
        content: 'search docs',
        timestamp: 1,
        sourceMessageId: 'msg-user-1',
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
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        timestamp: 2,
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
        id: 'assistant-reminder-1',
        role: 'assistant',
        content: 'all background tasks complete',
        timestamp: 3,
        sourceMessageId: 'msg-reminder-1',
        displayStyle: 'notice',
        noticeTone: 'info',
        omo: {
          kind: 'system-reminder',
          reminderType: 'all-background-tasks-complete',
          reminderText: 'all background tasks complete',
          rawText: 'all background tasks complete',
          headline: 'all background tasks complete',
          isInternalInitiator: false,
          tasks: [],
        },
      },
    ];

    const segments = service.collectSegments(messages, 'tab-1');

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(expect.objectContaining({
      anchorKey: 'msg-user-1',
      sawAllTasksComplete: true,
      pending: [],
      waitingForFollowUp: false,
      completionEvents: [expect.objectContaining({
        reminderType: 'all-background-tasks-complete',
        reminderMessageId: 'msg-reminder-1',
      })],
    }));
  });
});

describe('BackgroundTaskTimelineService timeline assembly with runtime state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('merges active runtime launches and completions into the assembled timeline', () => {
    const runtime = createRuntime({
      backgroundTaskStartedAt: 10,
      backgroundTaskActiveAnchorKey: 'msg-user-live',
      backgroundTaskModeTag: 'search-mode',
      backgroundTaskWaitingForFollowUp: true,
      backgroundTaskLaunches: new Map([
        ['call-live', { launchId: 'call-live', taskId: 'bg_live', description: 'Live lookup' }],
      ]),
      backgroundTaskCompletedTasks: new Map([
        ['bg_done', { taskId: 'bg_done', description: 'Existing task' }],
      ]),
    });
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);

    const segments = service.collectSegments([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'working',
        timestamp: 11,
      },
    ], 'tab-1');

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(expect.objectContaining({
      anchorKey: 'msg-user-live',
      anchorTimestamp: 10,
      modeTag: 'search-mode',
      launches: [expect.objectContaining({
        launchId: 'call-live',
        taskId: 'bg_live',
        description: 'Live lookup',
      })],
      completed: [expect.objectContaining({
        taskId: 'bg_done',
        description: 'Existing task',
      })],
      pending: [expect.objectContaining({
        launchId: 'call-live',
        taskId: 'bg_live',
      })],
      waitingForFollowUp: true,
    }));
  });

  it('filters suppressed inline segments but keeps active preparing search-mode anchors', () => {
    const host = createHost(createRuntime({
      backgroundTaskStartedAt: 3,
      backgroundTaskActiveAnchorKey: 'msg-user-2',
      backgroundTaskModeTag: 'search-mode',
    }));
    host.isSuppressedBackgroundTaskSegment.mockImplementation((segment) => segment.anchorKey === 'msg-user-1');
    const service = new BackgroundTaskTimelineService(host);
    const conversation = createConversation([
      {
        id: 'user-local-1',
        role: 'user',
        content: 'search docs',
        timestamp: 1,
        sourceMessageId: 'msg-user-1',
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
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        timestamp: 2,
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
        content: 'keep going',
        timestamp: 3,
        sourceMessageId: 'msg-user-2',
        omo: {
          kind: 'user-injection',
          modeTag: 'search-mode',
          injectedPrompt: 'keep going',
          originalText: 'keep going',
          rawText: 'keep going',
          headline: 'keep going',
        },
      },
    ]);

    const segments = service.collectInlineSegments(conversation, 'tab-1');

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(expect.objectContaining({
      anchorKey: 'msg-user-2',
      launches: [],
      pending: [],
    }));
  });

  it('drops preparing search-mode anchors after runtime no longer tracks them', () => {
    const host = createHost(createRuntime());
    const service = new BackgroundTaskTimelineService(host);
    const conversation = createConversation([
      {
        id: 'user-local-1',
        role: 'user',
        content: 'search docs',
        timestamp: 1,
        sourceMessageId: 'msg-user-1',
        omo: {
          kind: 'user-injection',
          modeTag: 'search-mode',
          injectedPrompt: 'search docs',
          originalText: 'search docs',
          rawText: 'search docs',
          headline: 'search docs',
        },
      },
    ]);

    const segments = service.collectInlineSegments(conversation, 'tab-1');

    expect(segments).toEqual([]);
  });
});

describe('BackgroundTaskTimelineService runtime state synchronization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears inline panel and follow-up runtime when resetting indicator state', () => {
    const runtime = createRuntime({
      backgroundTaskStartedAt: 12,
      backgroundTaskActiveAnchorKey: 'msg-user-1',
      backgroundTaskModeTag: 'search-mode',
      backgroundTaskWaitingForFollowUp: true,
      backgroundTaskStaleNoticeFingerprint: 'stale',
      backgroundTaskSuppressedFingerprint: 'keep-me',
      backgroundTaskLaunches: new Map([
        ['call-1', { launchId: 'call-1', taskId: 'bg_1', description: 'Search docs' }],
      ]),
      backgroundTaskCompletedTasks: new Map([
        ['bg_1', { taskId: 'bg_1', description: 'Search docs' }],
      ]),
    });
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);

    service.resetIndicatorState('tab-1');

    expect(host.clearInlinePanel).toHaveBeenCalledWith('tab-1');
    expect(host.clearAuthoritativeSyncGate).toHaveBeenCalledWith('tab-1');
    expect(host.syncTabStreamLikeState).toHaveBeenCalledWith('tab-1');
    expect(runtime.backgroundTaskStartedAt).toBeNull();
    expect(runtime.backgroundTaskActiveAnchorKey).toBeNull();
    expect(runtime.backgroundTaskModeTag).toBeNull();
    expect(runtime.backgroundTaskWaitingForFollowUp).toBe(false);
    expect(runtime.backgroundTaskStaleNoticeFingerprint).toBeNull();
    expect(runtime.backgroundTaskSuppressedFingerprint).toBe('keep-me');
    expect(runtime.backgroundTaskLaunches.size).toBe(0);
    expect(runtime.backgroundTaskCompletedTasks.size).toBe(0);
  });

  it('rehydrates runtime state from the latest active segment during hydration', () => {
    const runtime = createRuntime({
      isHydratingConversation: true,
      backgroundTaskStartedAt: 999,
      backgroundTaskActiveAnchorKey: 'stale-anchor',
      backgroundTaskModeTag: 'search-mode',
      backgroundTaskWaitingForFollowUp: true,
      backgroundTaskStaleNoticeFingerprint: 'stale',
    });
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);
    const conversation = createConversation([
      {
        id: 'user-local-1',
        role: 'user',
        content: 'search docs',
        timestamp: 1,
        sourceMessageId: 'msg-user-1',
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
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        timestamp: 2,
        contentBlocks: [{
          type: 'tool_use',
          toolId: 'call-1',
          toolName: 'task',
          toolInput: { description: 'Search docs', taskId: 'bg_1' },
          toolResult: 'started bg_1',
          toolStatus: 'completed',
        }],
      },
    ]);

    service.syncStateFromConversation(conversation, 'tab-1');

    expect(host.clearAuthoritativeSyncGate).toHaveBeenCalledWith('tab-1');
    expect(host.armAuthoritativeSyncGate).toHaveBeenCalledWith('tab-1');
    expect(runtime.backgroundTaskStartedAt).toBe(1);
    expect(runtime.backgroundTaskActiveAnchorKey).toBe('msg-user-1');
    expect(runtime.backgroundTaskModeTag).toBe('search-mode');
    expect(runtime.backgroundTaskWaitingForFollowUp).toBe(true);
    expect(runtime.backgroundTaskLaunches.get('call-1')).toEqual(expect.objectContaining({
      launchId: 'call-1',
      taskId: 'bg_1',
      description: 'Search docs',
    }));
    expect(runtime.backgroundTaskStaleNoticeFingerprint).toBeNull();
    expect(host.syncTabStreamLikeState).toHaveBeenCalledWith('tab-1');
  });

  it('does not rehydrate launchless search-mode anchors from persisted history', () => {
    const runtime = createRuntime({
      isHydratingConversation: true,
      backgroundTaskStartedAt: 999,
      backgroundTaskActiveAnchorKey: 'stale-anchor',
      backgroundTaskModeTag: 'search-mode',
      backgroundTaskWaitingForFollowUp: true,
    });
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);
    const conversation = createConversation([
      {
        id: 'user-local-1',
        role: 'user',
        content: 'search docs',
        timestamp: 1,
        sourceMessageId: 'msg-user-1',
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
        id: 'assistant-1',
        role: 'assistant',
        content: 'No background tasks were launched.',
        timestamp: 2,
        contentBlocks: [{
          type: 'text',
          text: 'No background tasks were launched.',
        }],
      },
    ]);

    service.syncStateFromConversation(conversation, 'tab-1');

    expect(runtime.backgroundTaskStartedAt).toBeNull();
    expect(runtime.backgroundTaskActiveAnchorKey).toBeNull();
    expect(runtime.backgroundTaskModeTag).toBeNull();
    expect(runtime.backgroundTaskWaitingForFollowUp).toBe(false);
    expect(runtime.backgroundTaskLaunches.size).toBe(0);
    expect(host.armAuthoritativeSyncGate).not.toHaveBeenCalled();
    expect(host.syncTabStreamLikeState).toHaveBeenCalledWith('tab-1');
  });

  it('arms indicator from user message with correct state and tabId', () => {
    const runtime = createRuntime();
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);
    const message: ChatMessage = {
      id: 'user-local-1',
      role: 'user',
      content: 'search docs',
      timestamp: 42,
      sourceMessageId: 'msg-user-1',
      omo: {
        kind: 'user-injection',
        modeTag: 'search-mode',
        injectedPrompt: 'search docs',
        originalText: 'search docs',
        rawText: 'search docs',
        headline: 'search docs',
      },
    };

    service.armIndicatorForUserMessage(message, 'tab-2');

    expect(runtime.backgroundTaskStartedAt).toBe(42);
    expect(runtime.backgroundTaskActiveAnchorKey).toBe('msg-user-1');
    expect(runtime.backgroundTaskModeTag).toBe('search-mode');
    expect(runtime.backgroundTaskWaitingForFollowUp).toBe(false);
    expect(host.getMessageAnchorKey).toHaveBeenCalledWith(message);
    expect(host.armAuthoritativeSyncGate).toHaveBeenCalledWith('tab-2');
    expect(runtime.backgroundTaskStaleNoticeFingerprint).toBeNull();
    expect(runtime.backgroundTaskSuppressedFingerprint).toBeNull();
  });

  it('ignores non-search-mode messages when arming indicator', () => {
    const runtime = createRuntime();
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);
    const message: ChatMessage = {
      id: 'user-local-1',
      role: 'user',
      content: 'hello',
      timestamp: 42,
      sourceMessageId: 'msg-user-1',
    };

    service.armIndicatorForUserMessage(message, 'tab-1');

    expect(runtime.backgroundTaskStartedAt).toBeNull();
    expect(host.armAuthoritativeSyncGate).not.toHaveBeenCalled();
  });

  it('clears inline panel then syncs stream state when resetting indicator', () => {
    const runtime = createRuntime({
      backgroundTaskStartedAt: 12,
      backgroundTaskActiveAnchorKey: 'anchor-1',
    });
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);

    service.resetIndicatorState('tab-3');

    expect(host.clearInlinePanel).toHaveBeenCalledWith('tab-3');
    expect(host.clearAuthoritativeSyncGate).toHaveBeenCalledWith('tab-3');
    expect(host.syncTabStreamLikeState).toHaveBeenCalledWith('tab-3');
    expect(host.clearInlinePanel.mock.invocationCallOrder[0])
      .toBeLessThan(host.syncTabStreamLikeState.mock.invocationCallOrder[0]);
  });
});
