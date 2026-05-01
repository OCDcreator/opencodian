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
