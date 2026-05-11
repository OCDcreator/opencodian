import type { ToolCallInfo } from '../../../../src/core/types';
import {
  BackgroundTaskStreamTriggerCoordinator,
  type BackgroundTaskStreamTriggerCoordinatorHost,
  type BackgroundTaskStreamTriggerRuntime,
} from '../../../../src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator';

function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'call-1',
    name: 'task',
    input: {
      description: 'Search docs',
      taskId: 'bg_1',
    },
    status: 'running',
    ...overrides,
  };
}

function createRuntime(modeTag: string | null = null): BackgroundTaskStreamTriggerRuntime {
  return {
    backgroundTaskStartedAt: null,
    backgroundTaskModeTag: modeTag,
    backgroundTaskLaunches: new Map(),
    backgroundTaskCompletedTasks: new Map(),
    backgroundTaskWaitingForFollowUp: false,
    backgroundTaskStaleNoticeFingerprint: 'stale',
  };
}

function createCoordinator(options: {
  runtime?: BackgroundTaskStreamTriggerRuntime | null;
  sessionId?: string | null;
  hasIndicator?: boolean;
  modeTag?: string | null;
} = {}) {
  const runtime = options.runtime === undefined
    ? createRuntime(options.modeTag)
    : options.runtime;
  const indicatorCoordinator = {
    renderIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
  const liveSignalCoordinator = {
    armAuthoritativeSyncGate: jest.fn(),
    hasIndicator: jest.fn().mockReturnValue(options.hasIndicator ?? true),
  };
  const timelineService = {
    upsertLaunch: jest.fn((
      toolCall: {
        id: string;
        input: Record<string, unknown>;
        toolMetadata?: Record<string, unknown>;
      },
      target: Map<string, unknown>,
    ) => {
      target.set(toolCall.id, {
        launchId: toolCall.id,
        taskId: typeof toolCall.input.taskId === 'string' ? toolCall.input.taskId : null,
        description: typeof toolCall.input.description === 'string' ? toolCall.input.description : '',
      });
    }),
    upsertCompletionFromToolCall: jest.fn((
      toolCall: { id: string; input: Record<string, unknown>; toolMetadata?: Record<string, unknown> },
      target: Map<string, unknown>,
    ) => {
      const taskId = typeof toolCall.toolMetadata?.sessionId === 'string'
        ? toolCall.toolMetadata.sessionId
        : toolCall.id;
      target.set(taskId, {
        taskId,
        description: typeof toolCall.input.description === 'string' ? toolCall.input.description : '',
      });
    }),
  };
  const host: jest.Mocked<BackgroundTaskStreamTriggerCoordinatorHost> = {
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    getTabRuntimeState: jest.fn().mockReturnValue(runtime),
    applyStreamingTodoSnapshotFromTool: jest.fn(),
    getSessionIdForTab: jest.fn().mockReturnValue(options.sessionId ?? 'session-1'),
    refreshTabSessionTodos: jest.fn().mockResolvedValue(undefined),
    resetBackgroundTaskIndicator: jest.fn(),
  };
  const coordinator = new BackgroundTaskStreamTriggerCoordinator(
    indicatorCoordinator,
    timelineService,
    liveSignalCoordinator,
    host,
  );

  return {
    coordinator,
    runtime,
    host,
    indicatorCoordinator,
    liveSignalCoordinator,
    timelineService,
  };
}

describe('BackgroundTaskStreamTriggerCoordinator stream tool events', () => {
  it('records background-task launches on tool start and rerenders the indicator', async () => {
    const {
      coordinator,
      runtime,
      host,
      indicatorCoordinator,
      liveSignalCoordinator,
      timelineService,
    } = createCoordinator({ modeTag: 'search-mode' });

    await coordinator.handleToolCallStart(createToolCall({
      toolMetadata: { sessionId: 'child-session-1' },
    }), 'tab-1');

    expect(host.applyStreamingTodoSnapshotFromTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'call-1' }),
      'tab-1',
    );
    expect(runtime?.backgroundTaskStartedAt).not.toBeNull();
    expect(liveSignalCoordinator.armAuthoritativeSyncGate).toHaveBeenCalledWith('tab-1');
    expect(runtime?.backgroundTaskStaleNoticeFingerprint).toBeNull();
    expect(timelineService.upsertLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call-1',
        input: expect.objectContaining({ taskId: 'bg_1' }),
        toolMetadata: { sessionId: 'child-session-1' },
      }),
      runtime?.backgroundTaskLaunches,
    );
    expect(runtime?.backgroundTaskWaitingForFollowUp).toBe(false);
    expect(indicatorCoordinator.renderIfNeeded).toHaveBeenCalledWith('tab-1');
  });

  it('tracks plain OpenCode task tools even when search mode is inactive', async () => {
    const {
      coordinator,
      runtime,
      indicatorCoordinator,
      liveSignalCoordinator,
      timelineService,
    } = createCoordinator({ modeTag: null });

    await coordinator.handleToolCallStart(createToolCall(), 'tab-1');

    expect(runtime?.backgroundTaskStartedAt).not.toBeNull();
    expect(runtime?.backgroundTaskLaunches.size).toBe(1);
    expect(runtime?.backgroundTaskWaitingForFollowUp).toBe(false);
    expect(runtime?.backgroundTaskStaleNoticeFingerprint).toBeNull();
    expect(timelineService.upsertLaunch).toHaveBeenCalled();
    expect(liveSignalCoordinator.armAuthoritativeSyncGate).toHaveBeenCalledWith('tab-1');
    expect(indicatorCoordinator.renderIfNeeded).toHaveBeenCalledWith('tab-1');
  });

  it('refreshes session todos on todo tool completion without touching background-task state', async () => {
    const {
      coordinator,
      runtime,
      host,
      indicatorCoordinator,
      liveSignalCoordinator,
      timelineService,
    } = createCoordinator();

    await coordinator.handleToolCallEnd(createToolCall({
      name: 'todowrite',
      input: { todos: [{ content: 'todo' }] },
    }), 'tab-1');

    expect(host.applyStreamingTodoSnapshotFromTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'todowrite' }),
      'tab-1',
    );
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );
    expect(timelineService.upsertLaunch).not.toHaveBeenCalled();
    expect(liveSignalCoordinator.armAuthoritativeSyncGate).not.toHaveBeenCalled();
    expect(runtime?.backgroundTaskStaleNoticeFingerprint).toBe('stale');
    expect(indicatorCoordinator.renderIfNeeded).not.toHaveBeenCalled();
  });

  it('updates background-task launches on tool end and rerenders the indicator', async () => {
    const {
      coordinator,
      runtime,
      host,
      indicatorCoordinator,
      liveSignalCoordinator,
      timelineService,
    } = createCoordinator({ modeTag: 'search-mode' });

    await coordinator.handleToolCallEnd(createToolCall({
      result: 'completed bg_1',
      status: 'completed',
    }), 'tab-1');

    expect(timelineService.upsertLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call-1',
        toolMetadata: undefined,
        result: 'completed bg_1',
      }),
      runtime?.backgroundTaskLaunches,
    );
    expect(liveSignalCoordinator.armAuthoritativeSyncGate).toHaveBeenCalledWith('tab-1');
    expect(runtime?.backgroundTaskStaleNoticeFingerprint).toBeNull();
    expect(indicatorCoordinator.renderIfNeeded).toHaveBeenCalledWith('tab-1');
    expect(host.refreshTabSessionTodos).not.toHaveBeenCalled();
  });

  it('records native SDK task completion metadata on tool end', async () => {
    const {
      coordinator,
      runtime,
      timelineService,
    } = createCoordinator();

    await coordinator.handleToolCallEnd(createToolCall({
      toolMetadata: { sessionId: 'child-session-1' },
      result: 'finished',
      status: 'completed',
    }), 'tab-1');

    expect(timelineService.upsertCompletionFromToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call-1',
        toolMetadata: { sessionId: 'child-session-1' },
        result: 'finished',
      }),
      runtime?.backgroundTaskCompletedTasks,
    );
    expect(runtime?.backgroundTaskCompletedTasks.get('child-session-1')).toEqual({
      taskId: 'child-session-1',
      description: 'Search docs',
    });
  });

  it('records native SDK task error metadata on tool end', async () => {
    const {
      coordinator,
      runtime,
      timelineService,
    } = createCoordinator();

    await coordinator.handleToolCallEnd(createToolCall({
      toolMetadata: { sessionId: 'child-session-err' },
      result: 'failed',
      status: 'error',
    }), 'tab-1');

    expect(timelineService.upsertCompletionFromToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call-1',
        toolMetadata: { sessionId: 'child-session-err' },
        result: 'failed',
      }),
      runtime?.backgroundTaskCompletedTasks,
    );
    expect(runtime?.backgroundTaskCompletedTasks.get('child-session-err')).toEqual({
      taskId: 'child-session-err',
      description: 'Search docs',
    });
  });
});

describe('BackgroundTaskStreamTriggerCoordinator finalization', () => {
  it('resets the indicator after primary stream finalization when no launches remain', async () => {
    const {
      coordinator,
      host,
      indicatorCoordinator,
      liveSignalCoordinator,
    } = createCoordinator();

    await coordinator.finalizeAfterPrimaryStream('tab-1');

    expect(liveSignalCoordinator.hasIndicator).toHaveBeenCalledWith('tab-1');
    expect(host.resetBackgroundTaskIndicator).toHaveBeenCalledWith('tab-1');
    expect(indicatorCoordinator.renderIfNeeded).not.toHaveBeenCalled();
  });

  it('marks the indicator as waiting for follow-up when launches remain after primary stream finalization', async () => {
    const runtime = createRuntime();
    runtime.backgroundTaskLaunches.set('call-1', {
      launchId: 'call-1',
      taskId: 'bg_1',
      description: 'Search docs',
    });
    const {
      coordinator,
      host,
      indicatorCoordinator,
    } = createCoordinator({ runtime });

    await coordinator.finalizeAfterPrimaryStream('tab-1');

    expect(host.resetBackgroundTaskIndicator).not.toHaveBeenCalled();
    expect(runtime.backgroundTaskWaitingForFollowUp).toBe(true);
    expect(indicatorCoordinator.renderIfNeeded).toHaveBeenCalledWith('tab-1');
  });
});
