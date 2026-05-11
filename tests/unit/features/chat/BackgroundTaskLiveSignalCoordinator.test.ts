import type { SessionActivityStatus } from '../../../../src/core/opencode';
import {
  BackgroundTaskLiveSignalCoordinator,
  type BackgroundTaskLiveSignalLaunchInfo,
  type BackgroundTaskLiveSignalRuntime,
} from '../../../../src/features/chat/services/BackgroundTaskLiveSignalCoordinator';
import { setDebugLoggingEnabled } from '../../../../src/shared';

describe('BackgroundTaskLiveSignalCoordinator', () => {
  beforeEach(() => {
    setDebugLoggingEnabled(true);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    jest.restoreAllMocks();
  });

  function createLaunch(taskId = 'bg_1'): BackgroundTaskLiveSignalLaunchInfo {
    return {
      launchId: `launch-${taskId}`,
      taskId,
      description: 'Search docs',
    };
  }

  function createService(options?: {
    runtime?: Partial<BackgroundTaskLiveSignalRuntime>;
    status?: SessionActivityStatus | null;
    sessionId?: string | null;
    hasIncompleteTodos?: boolean;
    pendingLaunches?: BackgroundTaskLiveSignalLaunchInfo[];
  }) {
    const runtime: BackgroundTaskLiveSignalRuntime = {
      isStreaming: false,
      isHydratingConversation: false,
      backgroundTaskStartedAt: Date.now() - 30_000,
      backgroundTaskModeTag: null,
      backgroundTaskLaunches: new Map(),
      backgroundTaskWaitingForFollowUp: false,
      backgroundTaskAwaitingAuthoritativeSync: false,
      backgroundTaskLastAuthoritativeSyncAt: null,
      ...options?.runtime,
    };
    const sessionTodoStateService = {
      hasIncompleteTabSessionTodos: jest.fn().mockReturnValue(options?.hasIncompleteTodos ?? false),
      reconcileStaleSessionTodoState: jest.fn(),
    };
    const timelineService = {
      getPendingLaunches: jest.fn().mockReturnValue(options?.pendingLaunches ?? []),
    };
    const noticeStateService = {
      handleStoppedPendingLaunches: jest.fn().mockResolvedValue(undefined),
    };
    const syncTabStreamLikeState = jest.fn();
    const resetBackgroundTaskIndicator = jest.fn();

    const service = new BackgroundTaskLiveSignalCoordinator(
      sessionTodoStateService,
      timelineService,
      noticeStateService,
      {
        getTabRuntimeState: jest.fn().mockReturnValue(runtime),
        getSessionIdForTab: jest.fn().mockReturnValue(options?.sessionId ?? 'session-1'),
        getTabSessionStatus: jest.fn().mockReturnValue(options?.status ?? null),
        syncTabStreamLikeState,
        resetBackgroundTaskIndicator,
      },
    );

    return {
      service,
      runtime,
      sessionTodoStateService,
      timelineService,
      noticeStateService,
      syncTabStreamLikeState,
      resetBackgroundTaskIndicator,
    };
  }

  it('keeps the indicator alive during the post-launch grace period', () => {
    const launch = createLaunch();
    const { service } = createService({
      runtime: {
        backgroundTaskStartedAt: Date.now(),
        backgroundTaskLaunches: new Map([[launch.launchId, launch]]),
      },
      status: { type: 'idle' },
      pendingLaunches: [launch],
    });

    expect(service.hasIndicator('tab-1')).toBe(true);
  });

  it('keeps the indicator alive when pending launches still have incomplete todos', () => {
    const launch = createLaunch();
    const { service } = createService({
      runtime: {
        backgroundTaskLaunches: new Map([[launch.launchId, launch]]),
      },
      hasIncompleteTodos: true,
      pendingLaunches: [launch],
    });

    expect(service.hasIndicator('tab-1')).toBe(true);
  });

  it('clears the indicator visibility when pending launches are idle after the grace period', () => {
    const launch = createLaunch();
    const { service } = createService({
      runtime: {
        backgroundTaskLaunches: new Map([[launch.launchId, launch]]),
      },
      status: { type: 'idle' },
      pendingLaunches: [launch],
    });

    expect(service.hasIndicator('tab-1')).toBe(false);
  });

  it('does not log when authoritative sync is already clear', () => {
    const { service, runtime } = createService();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    service.markAuthoritativeSync('tab-1', 'visible-background-sync');

    expect(runtime.backgroundTaskLastAuthoritativeSyncAt).toBeNull();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs once when a pending authoritative sync becomes ready', () => {
    const { service, runtime } = createService({
      runtime: {
        backgroundTaskAwaitingAuthoritativeSync: true,
      },
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    service.markAuthoritativeSync('tab-1', 'sync-event:message.updated');

    expect(runtime.backgroundTaskAwaitingAuthoritativeSync).toBe(false);
    expect(typeof runtime.backgroundTaskLastAuthoritativeSyncAt).toBe('number');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(String(consoleSpy.mock.calls[0]?.[0] ?? '')).toContain(
      '[BackgroundTaskLiveSignalCoordinator] Background task authoritative sync ready',
    );
  });

  it('keeps the indicator alive while awaiting authoritative sync', () => {
    const launch = createLaunch();
    const {
      service,
      runtime,
      sessionTodoStateService,
      syncTabStreamLikeState,
      noticeStateService,
      resetBackgroundTaskIndicator,
    } = createService({
      runtime: {
        backgroundTaskLaunches: new Map([[launch.launchId, launch]]),
        backgroundTaskWaitingForFollowUp: true,
        backgroundTaskAwaitingAuthoritativeSync: true,
      },
    });

    service.reconcileStateFromLiveSignals('tab-1');

    expect(sessionTodoStateService.reconcileStaleSessionTodoState).toHaveBeenCalledWith('tab-1');
    expect(syncTabStreamLikeState).toHaveBeenCalledWith('tab-1');
    expect(runtime.backgroundTaskWaitingForFollowUp).toBe(true);
    expect(noticeStateService.handleStoppedPendingLaunches).not.toHaveBeenCalled();
    expect(resetBackgroundTaskIndicator).not.toHaveBeenCalled();
  });

  it('appends a stopped notice and clears stale launches once the session settles', () => {
    const launch = createLaunch();
    const {
      service,
      runtime,
      noticeStateService,
      resetBackgroundTaskIndicator,
    } = createService({
      runtime: {
        backgroundTaskLaunches: new Map([[launch.launchId, launch]]),
      },
      status: { type: 'idle' },
      pendingLaunches: [launch],
    });

    service.reconcileStateFromLiveSignals('tab-1');

    expect(runtime.backgroundTaskWaitingForFollowUp).toBe(false);
    expect(noticeStateService.handleStoppedPendingLaunches).toHaveBeenCalledWith('tab-1', [launch]);
    expect(resetBackgroundTaskIndicator).toHaveBeenCalledWith('tab-1');
  });

  it('clears empty task placeholders after the grace period regardless of mode', () => {
    const { service, noticeStateService, resetBackgroundTaskIndicator } = createService({
      runtime: {
        backgroundTaskModeTag: null,
      },
      status: { type: 'idle' },
    });

    service.reconcileStateFromLiveSignals('tab-1');

    expect(noticeStateService.handleStoppedPendingLaunches).not.toHaveBeenCalled();
    expect(resetBackgroundTaskIndicator).toHaveBeenCalledWith('tab-1');
  });

});

describe('BackgroundTaskLiveSignalCoordinator constructor', () => {
  it('accepts builder host directly and wraps it with createBackgroundTaskLiveSignalCoordinatorHost', () => {
    const runtime: BackgroundTaskLiveSignalRuntime = {
      isStreaming: false,
      isHydratingConversation: false,
      backgroundTaskStartedAt: Date.now() - 30_000,
      backgroundTaskModeTag: null,
      backgroundTaskLaunches: new Map(),
      backgroundTaskWaitingForFollowUp: false,
      backgroundTaskAwaitingAuthoritativeSync: true,
      backgroundTaskLastAuthoritativeSyncAt: null,
    };
    const sessionTodoStateService = {
      hasIncompleteTabSessionTodos: jest.fn().mockReturnValue(false),
      reconcileStaleSessionTodoState: jest.fn(),
    };
    const timelineService = {
      getPendingLaunches: jest.fn().mockReturnValue([]),
    };
    const noticeStateService = {
      handleStoppedPendingLaunches: jest.fn().mockResolvedValue(undefined),
    };
    const getTabRuntimeState = jest.fn().mockReturnValue(runtime);
    const getSessionIdForTab = jest.fn().mockReturnValue('session-1');
    const getTabSessionStatus = jest.fn().mockReturnValue(null);
    const syncTabStreamLikeState = jest.fn();
    const resetBackgroundTaskIndicator = jest.fn();

    const builderHost = {
      getTabRuntimeState,
      getSessionIdForTab,
      getTabSessionStatus,
      syncTabStreamLikeState,
      resetBackgroundTaskIndicator,
    };

    const service = new BackgroundTaskLiveSignalCoordinator(
      sessionTodoStateService,
      timelineService,
      noticeStateService,
      builderHost,
    );

    service.hasIndicator('tab-1');
    expect(getTabRuntimeState).toHaveBeenCalledWith('tab-1');

    service.reconcileStateFromLiveSignals('tab-1');
    expect(syncTabStreamLikeState).toHaveBeenCalledWith('tab-1');
  });
});
