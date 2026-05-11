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

function createNativeTaskMessages(status: 'completed' | 'error'): ChatMessage[] {
  return [
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
        toolInput: { description: 'Audit routes' },
        toolMetadata: { sessionId: 'child-session-1' },
        toolResult: status === 'error' ? 'failed' : 'done',
        toolStatus: status,
      }],
    },
  ];
}

describe('BackgroundTaskTimelineService native OpenCode task lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('collects native OpenCode task blocks after a normal user anchor using metadata sessionId', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);

    const segments = service.collectSegments(createNativeTaskMessages('completed'), 'tab-1');

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(expect.objectContaining({
      anchorKey: 'msg-user-1',
      modeTag: null,
      launches: [expect.objectContaining({
        launchId: 'call-1',
        taskId: 'child-session-1',
        description: 'Audit routes',
      })],
      completed: [expect.objectContaining({
        taskId: 'child-session-1',
        description: 'Audit routes',
      })],
      pending: [],
      waitingForFollowUp: false,
    }));
  });

  it('adds native completion for errored OpenCode task blocks with metadata sessionId', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);

    const [segment] = service.collectSegments(createNativeTaskMessages('error'), 'tab-1');

    expect(segment).toEqual(expect.objectContaining({
      completed: [expect.objectContaining({
        taskId: 'child-session-1',
        description: 'Audit routes',
      })],
      pending: [],
      waitingForFollowUp: false,
    }));
  });

  it('prefers native tool metadata sessionId over historical bg task ids for launches', () => {
    const runtime = createRuntime();
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);

    service.upsertLaunch({
      id: 'call-1',
      input: { description: 'Audit routes', taskId: 'bg_input' },
      toolMetadata: { sessionId: ' child-session-1 ' },
      result: 'started bg_result',
    }, runtime.backgroundTaskLaunches);

    expect(runtime.backgroundTaskLaunches.get('call-1')).toEqual({
      launchId: 'call-1',
      taskId: 'child-session-1',
      description: 'Audit routes',
    });
  });

  it('keeps historical bg input and result ids for launches without native metadata', () => {
    const runtime = createRuntime();
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);

    service.upsertLaunch({
      id: 'call-input',
      input: { description: 'Search docs', taskId: 'bg_input' },
      result: 'started without result id',
    }, runtime.backgroundTaskLaunches);
    service.upsertLaunch({
      id: 'call-result',
      input: { description: 'Draft summary' },
      result: 'started bg_result',
    }, runtime.backgroundTaskLaunches);

    expect(runtime.backgroundTaskLaunches.get('call-input')).toEqual(expect.objectContaining({
      taskId: 'bg_input',
      description: 'Search docs',
    }));
    expect(runtime.backgroundTaskLaunches.get('call-result')).toEqual(expect.objectContaining({
      taskId: 'bg_result',
      description: 'Draft summary',
    }));
  });

  it('records native completions only when tool metadata contains a sessionId', () => {
    const runtime = createRuntime();
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);

    service.upsertCompletionFromToolCall({
      id: 'call-bg',
      input: { description: 'Legacy search', taskId: 'bg_legacy' },
      result: 'completed bg_legacy',
    }, runtime.backgroundTaskCompletedTasks);
    service.upsertCompletionFromToolCall({
      id: 'call-native',
      input: { description: 'Native audit', taskId: 'bg_ignored' },
      toolMetadata: { sessionId: ' child-session-1 ' },
      result: 'completed bg_ignored',
    }, runtime.backgroundTaskCompletedTasks);

    expect(runtime.backgroundTaskCompletedTasks.has('bg_legacy')).toBe(false);
    expect(runtime.backgroundTaskCompletedTasks.get('child-session-1')).toEqual({
      taskId: 'child-session-1',
      description: 'Native audit',
    });
  });
});
