import type {
  BackgroundTaskLiveSignalCoordinatorHost,
} from './BackgroundTaskLiveSignalCoordinator';

type BackgroundTaskLiveSignalRuntimePort = Pick<
  BackgroundTaskLiveSignalCoordinatorHost,
  'getTabRuntimeState'
>;

type BackgroundTaskLiveSignalSessionStatePort = Pick<
  BackgroundTaskLiveSignalCoordinatorHost,
  'getSessionIdForTab' | 'getTabSessionStatus'
>;

type BackgroundTaskLiveSignalViewWritebackPort = Pick<
  BackgroundTaskLiveSignalCoordinatorHost,
  'syncTabStreamLikeState' | 'resetBackgroundTaskIndicator'
>;

export interface BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost {
  getBackgroundTaskRuntime(): BackgroundTaskLiveSignalRuntimePort;
  getSessionState(): BackgroundTaskLiveSignalSessionStatePort;
  getViewWriteback(): BackgroundTaskLiveSignalViewWritebackPort;
}

export function createBackgroundTaskLiveSignalCoordinatorHost(
  host: BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost,
): BackgroundTaskLiveSignalCoordinatorHost {
  return {
    getTabRuntimeState: (tabId) => host.getBackgroundTaskRuntime().getTabRuntimeState(tabId),
    getSessionIdForTab: (tabId) => host.getSessionState().getSessionIdForTab(tabId),
    getTabSessionStatus: (tabId, sessionId) =>
      host.getSessionState().getTabSessionStatus(tabId, sessionId),
    syncTabStreamLikeState: (tabId) => {
      host.getViewWriteback().syncTabStreamLikeState(tabId);
    },
    resetBackgroundTaskIndicator: (tabId) => {
      host.getViewWriteback().resetBackgroundTaskIndicator(tabId);
    },
  };
}
