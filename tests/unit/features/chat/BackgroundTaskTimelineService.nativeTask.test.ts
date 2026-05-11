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
    updatedAt: 2,
    openCodeSessionId: 'session-1',
    messages,
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

  it('keeps structured legacy task ids for launches without native metadata', () => {
    const runtime = createRuntime();
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);

    service.upsertLaunch({
      id: 'call-input',
      input: { description: 'Search docs', taskId: 'bg_input' },
      result: 'started without result id',
    }, runtime.backgroundTaskLaunches);

    expect(runtime.backgroundTaskLaunches.get('call-input')).toEqual(expect.objectContaining({
      taskId: 'bg_input',
      description: 'Search docs',
    }));
  });

  it('does not scrape bg ids from unstructured tool results without native metadata', () => {
    const runtime = createRuntime();
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);

    service.upsertLaunch({
      id: 'call-result',
      input: { description: 'Draft summary' },
      result: 'started bg_legacy',
    }, runtime.backgroundTaskLaunches);

    expect(runtime.backgroundTaskLaunches.get('call-result')).toEqual(expect.objectContaining({
      taskId: null,
      description: 'Draft summary',
    }));
  });

  it('collects native task identity from tool metadata and ignores bg ids in result text', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'delegate',
        timestamp: 1,
        sourceMessageId: 'u1',
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        timestamp: 2,
        contentBlocks: [{
          type: 'tool_use',
          toolId: 'call-1',
          toolName: 'task',
          toolInput: { description: 'Audit routes' },
          toolMetadata: { sessionId: 'child-session-1' },
          toolResult: 'contains bg_legacy but metadata wins',
          toolStatus: 'running',
        }],
      },
    ];

    expect(service.collectSegments(messages, 'tab-1')[0].launches[0].taskId).toBe('child-session-1');
  });

  it('does not treat bg-like result text as task identity for no-metadata task blocks', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'delegate',
        timestamp: 1,
        sourceMessageId: 'u1',
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        timestamp: 2,
        contentBlocks: [{
          type: 'tool_use',
          toolId: 'call-1',
          toolName: 'task',
          toolInput: { description: 'Audit routes' },
          toolResult: 'contains bg_legacy without metadata',
          toolStatus: 'running',
        }],
      },
    ];

    expect(service.collectSegments(messages, 'tab-1')[0].launches[0].taskId).toBeNull();
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

describe('BackgroundTaskTimelineService native OpenCode task reload and diagnostics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('collects diagnostics for native task blocks after a normal user anchor', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);

    const diagnostics = service.collectDiagnostics(createNativeTaskMessages('completed'));

    expect(diagnostics).toEqual(expect.objectContaining({
      anchorKey: 'msg-user-1',
      completed: [expect.objectContaining({
        taskId: 'child-session-1',
        description: 'Audit routes',
      })],
      pending: [],
      sawAllTasksComplete: false,
    }));
  });

  it('rehydrates active native task segments after a normal user anchor', () => {
    const runtime = createRuntime({ isHydratingConversation: true });
    const host = createHost(runtime);
    const service = new BackgroundTaskTimelineService(host);
    const conversation = createConversation([
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
          toolStatus: 'running',
        }],
      },
    ]);

    service.syncStateFromConversation(conversation, 'tab-1');

    expect(runtime.backgroundTaskStartedAt).toBe(1);
    expect(runtime.backgroundTaskActiveAnchorKey).toBe('msg-user-1');
    expect(runtime.backgroundTaskModeTag).toBeNull();
    expect(runtime.backgroundTaskLaunches.get('call-1')).toEqual(expect.objectContaining({
      launchId: 'call-1',
      taskId: 'child-session-1',
      description: 'Audit routes',
    }));
    expect(runtime.backgroundTaskWaitingForFollowUp).toBe(true);
    expect(host.armAuthoritativeSyncGate).toHaveBeenCalledWith('tab-1');
    expect(conversation.backgroundTaskMetadata?.activeAnchor).toEqual(expect.objectContaining({
      anchorKey: 'msg-user-1',
      modeTag: null,
      waitingForFollowUp: true,
    }));
  });

  it('keeps completed native task state after reload from a normal user anchor', () => {
    const host = createHost(null);
    const service = new BackgroundTaskTimelineService(host);
    const conversation = createConversation(createNativeTaskMessages('completed'));

    const [segment] = service.collectSegments(conversation.messages, 'tab-1');

    expect(segment.completed).toEqual([
      expect.objectContaining({
        taskId: 'child-session-1',
        description: 'Audit routes',
      }),
    ]);
    expect(segment.pending).toEqual([]);
    expect(segment.waitingForFollowUp).toBe(false);
  });
});
