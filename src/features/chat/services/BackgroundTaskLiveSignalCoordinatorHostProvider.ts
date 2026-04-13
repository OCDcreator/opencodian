import type {
  BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost,
} from './BackgroundTaskLiveSignalCoordinatorViewHostFactory';

type BackgroundTaskLiveSignalRuntimePort = ReturnType<
  BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost['getBackgroundTaskRuntime']
>;
type BackgroundTaskLiveSignalSessionStatePort = ReturnType<
  BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost['getSessionState']
>;
type BackgroundTaskLiveSignalViewWritebackPort = ReturnType<
  BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost['getViewWriteback']
>;

export interface BackgroundTaskLiveSignalCoordinatorHostProviderHost {
  getTabRuntimeState: BackgroundTaskLiveSignalRuntimePort['getTabRuntimeState'];
  getSessionIdForTab: BackgroundTaskLiveSignalSessionStatePort['getSessionIdForTab'];
  getTabSessionStatus: BackgroundTaskLiveSignalSessionStatePort['getTabSessionStatus'];
  syncTabStreamLikeState: BackgroundTaskLiveSignalViewWritebackPort['syncTabStreamLikeState'];
  resetBackgroundTaskIndicator:
    BackgroundTaskLiveSignalViewWritebackPort['resetBackgroundTaskIndicator'];
}

export function createBackgroundTaskLiveSignalCoordinatorViewHostFactoryHost(
  host: BackgroundTaskLiveSignalCoordinatorHostProviderHost,
): BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost {
  return {
    getBackgroundTaskRuntime: () => ({
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
    }),
    getSessionState: () => ({
      getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
      getTabSessionStatus: (tabId, sessionId) => host.getTabSessionStatus(tabId, sessionId),
    }),
    getViewWriteback: () => ({
      syncTabStreamLikeState: (tabId) => {
        host.syncTabStreamLikeState(tabId);
      },
      resetBackgroundTaskIndicator: (tabId) => {
        host.resetBackgroundTaskIndicator(tabId);
      },
    }),
  };
}
