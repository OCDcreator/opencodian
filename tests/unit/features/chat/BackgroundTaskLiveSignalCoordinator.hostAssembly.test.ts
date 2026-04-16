import type { SessionActivityStatus } from '../../../../src/core/opencode';
import {
  type BackgroundTaskLiveSignalCoordinatorHostBuilderHost,
  type BackgroundTaskLiveSignalRuntime,
  createBackgroundTaskLiveSignalCoordinatorHost,
} from '../../../../src/features/chat/services/BackgroundTaskLiveSignalCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createRuntime(overrides?: Partial<BackgroundTaskLiveSignalRuntime>):
BackgroundTaskLiveSignalRuntime {
  return {
    isStreaming: false,
    isHydratingConversation: false,
    backgroundTaskStartedAt: 1,
    backgroundTaskModeTag: null,
    backgroundTaskLaunches: new Map(),
    backgroundTaskWaitingForFollowUp: false,
    backgroundTaskAwaitingAuthoritativeSync: false,
    backgroundTaskLastAuthoritativeSyncAt: null,
    ...overrides,
  };
}

function createFixture() {
  let runtime = createRuntime();
  let sessionId: string | null = 'session-active';
  let status: SessionActivityStatus | null = { type: 'busy' };
  const initialWriteback = {
    syncTabStreamLikeState: jest.fn<void, [string | null]>(),
    resetBackgroundTaskIndicator: jest.fn<void, [string | null]>(),
  };
  let writeback = initialWriteback;

  const host: Mocked<BackgroundTaskLiveSignalCoordinatorHostBuilderHost> = {
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtime : null)),
    getSessionIdForTab: jest.fn(() => sessionId),
    getTabSessionStatus: jest.fn(() => status),
    syncTabStreamLikeState: jest.fn((tabId) => {
      writeback.syncTabStreamLikeState(tabId);
    }),
    resetBackgroundTaskIndicator: jest.fn((tabId) => {
      writeback.resetBackgroundTaskIndicator(tabId);
    }),
  };

  return {
    host,
    initialWriteback,
    setRuntime: (next: BackgroundTaskLiveSignalRuntime) => {
      runtime = next;
    },
    setSessionId: (next: string | null) => {
      sessionId = next ?? null;
    },
    setStatus: (next: SessionActivityStatus | null) => {
      status = next;
    },
    setWriteback: (next: typeof initialWriteback) => {
      writeback = next;
    },
  };
}

describe('BackgroundTaskLiveSignalCoordinator host assembly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups the thin live-signal reconcile seam into the existing coordinator host ports', () => {
    const fixture = createFixture();
    const coordinatorHost = createBackgroundTaskLiveSignalCoordinatorHost(fixture.host);

    expect(coordinatorHost.getTabRuntimeState('tab-active')).toMatchObject({
      backgroundTaskStartedAt: 1,
    });
    expect(coordinatorHost.getSessionIdForTab('tab-active')).toBe('session-active');
    expect(coordinatorHost.getTabSessionStatus('tab-active', 'session-active')).toEqual({
      type: 'busy',
    });

    coordinatorHost.syncTabStreamLikeState('tab-active');
    coordinatorHost.resetBackgroundTaskIndicator('tab-hidden');

    expect(fixture.host.getTabRuntimeState).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.getSessionIdForTab).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.getTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-active',
    );
    expect(fixture.host.syncTabStreamLikeState).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.resetBackgroundTaskIndicator).toHaveBeenCalledWith('tab-hidden');
    expect(fixture.initialWriteback.syncTabStreamLikeState).toHaveBeenCalledWith('tab-active');
    expect(fixture.initialWriteback.resetBackgroundTaskIndicator).toHaveBeenCalledWith('tab-hidden');
  });

  it('keeps the grouped ports late-bound to the latest live-signal collaborators', () => {
    const fixture = createFixture();
    const coordinatorHost = createBackgroundTaskLiveSignalCoordinatorHost(fixture.host);
    const nextWriteback = {
      syncTabStreamLikeState: jest.fn<void, [string | null]>(),
      resetBackgroundTaskIndicator: jest.fn<void, [string | null]>(),
    };

    fixture.setRuntime(createRuntime({
      isStreaming: true,
      backgroundTaskStartedAt: 2,
      backgroundTaskModeTag: 'search-mode',
    }));
    fixture.setSessionId('session-next');
    fixture.setStatus({ type: 'idle' });
    fixture.setWriteback(nextWriteback);

    expect(coordinatorHost.getTabRuntimeState('tab-next')).toMatchObject({
      isStreaming: true,
      backgroundTaskModeTag: 'search-mode',
    });
    expect(coordinatorHost.getSessionIdForTab('tab-next')).toBe('session-next');
    expect(coordinatorHost.getTabSessionStatus('tab-next', 'session-next')).toEqual({
      type: 'idle',
    });

    coordinatorHost.syncTabStreamLikeState('tab-next');
    coordinatorHost.resetBackgroundTaskIndicator('tab-next');

    expect(fixture.host.getTabRuntimeState).toHaveBeenCalledWith('tab-next');
    expect(fixture.host.getSessionIdForTab).toHaveBeenCalledWith('tab-next');
    expect(fixture.host.getTabSessionStatus).toHaveBeenCalledWith('tab-next', 'session-next');
    expect(nextWriteback.syncTabStreamLikeState).toHaveBeenCalledWith('tab-next');
    expect(nextWriteback.resetBackgroundTaskIndicator).toHaveBeenCalledWith('tab-next');
  });
});
