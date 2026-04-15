import {
  type BackgroundConversationPostSyncHandoffViewHost,
  type BackgroundConversationPostSyncHandoffViewHostAdapterDependencies,
  type BackgroundConversationPostSyncHandoffViewHostAdapterHost,
  createBackgroundConversationPostSyncHandoffViewHostAdapter,
} from './BackgroundConversationPostSyncHandoffHostAdapter';
import {
  createQuestionTodoBackgroundTaskActivationServices,
  createQuestionTodoBackgroundTaskActivationViewHostAdapter,
  type QuestionTodoBackgroundTaskActivationServices,
  type QuestionTodoBackgroundTaskActivationViewHost,
  type QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies,
  type QuestionTodoBackgroundTaskActivationViewHostAdapterHost,
} from './QuestionTodoBackgroundTaskActivationHostAdapter';
import {
  createQuestionTodoBackgroundTaskRefreshServices,
  createQuestionTodoBackgroundTaskRefreshViewHostAdapter,
  type QuestionTodoBackgroundTaskRefreshServices,
  type QuestionTodoBackgroundTaskRefreshViewHost,
  type QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies,
  type QuestionTodoBackgroundTaskRefreshViewHostAdapterHost,
} from './QuestionTodoBackgroundTaskRefreshHostAdapter';
import type { TabConversationSyncFingerprintRuntimePort } from './TabConversationSyncFingerprintPortProvider';
import {
  createVisibleConversationPostSyncStateServices,
  type VisibleConversationPostSyncStateViewHost,
} from './VisibleConversationPostSyncStateHostAdapter';
import type {
  BackgroundTaskStreamTriggerCoordinatorHost,
  BackgroundTaskStreamTriggerRuntime,
} from '../runtime/BackgroundTaskStreamTriggerCoordinator';
import type { SessionTodoCoordinator } from './SessionTodoCoordinator';

export interface QuestionTodoBackgroundTaskRuntimeServiceBundle
  extends Pick<
      QuestionTodoBackgroundTaskRefreshServices,
      | 'visibleConversationPostSyncCoordinator'
      | 'backgroundConversationPostSyncHandoffCoordinator'
    >,
    Pick<
      QuestionTodoBackgroundTaskActivationServices,
      | 'questionTodoActivationRefreshCoordinator'
      | 'backgroundTaskActivationIndicatorCoordinator'
    > {
  backgroundTaskStreamTriggerViewHost: BackgroundTaskStreamTriggerCoordinatorHost;
}

type QuestionTodoBackgroundTaskConversationSyncRuntimePort = Pick<
  TabConversationSyncFingerprintRuntimePort,
  'setTabConversationSyncFingerprint'
>;
type QuestionTodoBackgroundTaskSessionTodoPort = ReturnType<
  QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies['getSessionTodoCoordinator']
> & ReturnType<
  QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies['getSessionTodoCoordinator']
> & Pick<
  SessionTodoCoordinator,
  'applyStreamingTodoSnapshotFromTool'
>;
type QuestionTodoBackgroundTaskRefreshRuntimePort =
  Pick<QuestionTodoBackgroundTaskRefreshViewHostAdapterHost, 'getTabRuntimeState'>
  & Pick<QuestionTodoBackgroundTaskActivationViewHostAdapterHost, 'renderSessionTodoDock'>
  & {
    getQuestionDockCoordinator(): ReturnType<
      QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies['getQuestionDockCoordinator']
    >;
    getSessionTodoCoordinator(): QuestionTodoBackgroundTaskSessionTodoPort;
  };
type QuestionTodoBackgroundTaskActivationWritebackPort = {
  getQuestionDockSlotCoordinator(): ReturnType<
    QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies['getQuestionDockSlotCoordinator']
  >;
  getSessionTodoCoordinator(): QuestionTodoBackgroundTaskSessionTodoPort;
};
type QuestionTodoBackgroundTaskBackgroundRuntimePort = Pick<
  QuestionTodoBackgroundTaskActivationViewHostAdapterHost,
  | 'resetBackgroundTaskIndicator'
  | 'syncBackgroundTaskStateFromConversation'
  | 'renderBackgroundTaskIndicatorIfNeeded'
> & {
  getBackgroundTaskIndicatorCoordinator(): ReturnType<
    BackgroundConversationPostSyncHandoffViewHostAdapterDependencies['getBackgroundTaskIndicatorCoordinator']
  >;
  getBackgroundTaskLiveSignalCoordinator(): ReturnType<
    BackgroundConversationPostSyncHandoffViewHostAdapterDependencies['getBackgroundTaskLiveSignalCoordinator']
  >;
  getTabRuntimeStateBridge(): ReturnType<
    BackgroundConversationPostSyncHandoffViewHostAdapterDependencies['getTabRuntimeStateBridge']
  >;
};
type SharedQuestionTodoBackgroundTaskViewHost =
  VisibleConversationPostSyncStateViewHost
  & QuestionTodoBackgroundTaskRefreshViewHostAdapterHost
  & QuestionTodoBackgroundTaskActivationViewHostAdapterHost
  & BackgroundConversationPostSyncHandoffViewHostAdapterHost;

export interface QuestionTodoBackgroundTaskRuntimeServiceBundleHost {
  getActiveTabId: BackgroundTaskStreamTriggerCoordinatorHost['getActiveTabId'];
  getCurrentConversation: VisibleConversationPostSyncStateViewHost['getCurrentConversation'];
  setCurrentConversationRevertState:
    VisibleConversationPostSyncStateViewHost['setCurrentConversationRevertState'];
  getConversationSyncRuntime(): QuestionTodoBackgroundTaskConversationSyncRuntimePort;
  getTabRuntimeState:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getTabRuntimeState'];
  getSessionIdForTab: BackgroundTaskStreamTriggerCoordinatorHost['getSessionIdForTab'];
  renderSessionTodoDock:
    QuestionTodoBackgroundTaskRefreshRuntimePort['renderSessionTodoDock'];
  getQuestionDockCoordinator:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getQuestionDockCoordinator'];
  getSessionTodoCoordinator:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getSessionTodoCoordinator'];
  getQuestionDockSlotCoordinator:
    QuestionTodoBackgroundTaskActivationWritebackPort['getQuestionDockSlotCoordinator'];
  resetBackgroundTaskIndicator: BackgroundTaskStreamTriggerCoordinatorHost['resetBackgroundTaskIndicator'];
  syncBackgroundTaskStateFromConversation:
    QuestionTodoBackgroundTaskBackgroundRuntimePort['syncBackgroundTaskStateFromConversation'];
  renderBackgroundTaskIndicatorIfNeeded:
    QuestionTodoBackgroundTaskBackgroundRuntimePort['renderBackgroundTaskIndicatorIfNeeded'];
  getBackgroundTaskIndicatorCoordinator:
    QuestionTodoBackgroundTaskBackgroundRuntimePort['getBackgroundTaskIndicatorCoordinator'];
  getBackgroundTaskLiveSignalCoordinator:
    QuestionTodoBackgroundTaskBackgroundRuntimePort['getBackgroundTaskLiveSignalCoordinator'];
  getTabRuntimeStateBridge:
    QuestionTodoBackgroundTaskBackgroundRuntimePort['getTabRuntimeStateBridge'];
}

export interface QuestionTodoBackgroundTaskRuntimeViewHosts {
  visibleConversationPostSyncStateViewHost: VisibleConversationPostSyncStateViewHost;
  questionTodoBackgroundTaskRefreshViewHost: QuestionTodoBackgroundTaskRefreshViewHost;
  backgroundConversationPostSyncHandoffViewHost:
    BackgroundConversationPostSyncHandoffViewHost;
  questionTodoBackgroundTaskActivationViewHost:
    QuestionTodoBackgroundTaskActivationViewHost;
  backgroundTaskStreamTriggerViewHost: BackgroundTaskStreamTriggerCoordinatorHost;
}

export function createQuestionTodoBackgroundTaskRuntimeViewHosts(
  host: QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
): QuestionTodoBackgroundTaskRuntimeViewHosts {
  const sharedViewHost: SharedQuestionTodoBackgroundTaskViewHost = {
    getCurrentConversation: () => host.getCurrentConversation(),
    getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
    setCurrentConversationRevertState: (revertState) => {
      host.setCurrentConversationRevertState(revertState);
    },
    setTabConversationSyncFingerprint: (tabId, fingerprint) => {
      host.getConversationSyncRuntime().setTabConversationSyncFingerprint(tabId, fingerprint);
    },
    renderSessionTodoDock: (tabId) => {
      host.renderSessionTodoDock(tabId);
    },
    resetBackgroundTaskIndicator: () => {
      host.resetBackgroundTaskIndicator(host.getActiveTabId());
    },
    syncBackgroundTaskStateFromConversation: (conversation, tabId) => {
      host.syncBackgroundTaskStateFromConversation(conversation, tabId);
    },
    renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
      host.renderBackgroundTaskIndicatorIfNeeded(tabId),
  };
  const backgroundTaskStreamTriggerViewHost: BackgroundTaskStreamTriggerCoordinatorHost = {
    getActiveTabId: () => host.getActiveTabId(),
    getTabRuntimeState: (tabId) =>
      host.getTabRuntimeState(tabId) as BackgroundTaskStreamTriggerRuntime | null,
    applyStreamingTodoSnapshotFromTool: (toolCall, tabId) => {
      host.getSessionTodoCoordinator().applyStreamingTodoSnapshotFromTool(toolCall, tabId);
    },
    getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
    refreshTabSessionTodos: (tabId, sessionId, options) =>
      host.getSessionTodoCoordinator().refreshTabSessionTodos(tabId, sessionId, options),
    resetBackgroundTaskIndicator: (tabId) => {
      host.resetBackgroundTaskIndicator(tabId);
    },
  };

  return {
    visibleConversationPostSyncStateViewHost: sharedViewHost,
    questionTodoBackgroundTaskRefreshViewHost:
      createQuestionTodoBackgroundTaskRefreshViewHostAdapter({
        viewHost: sharedViewHost,
        getQuestionDockCoordinator: () => host.getQuestionDockCoordinator(),
        getSessionTodoCoordinator: () => host.getSessionTodoCoordinator(),
      }),
    backgroundConversationPostSyncHandoffViewHost:
      createBackgroundConversationPostSyncHandoffViewHostAdapter({
        viewHost: sharedViewHost,
        getBackgroundTaskIndicatorCoordinator: () =>
          host.getBackgroundTaskIndicatorCoordinator(),
        getBackgroundTaskLiveSignalCoordinator: () =>
          host.getBackgroundTaskLiveSignalCoordinator(),
        getTabRuntimeStateBridge: () => host.getTabRuntimeStateBridge(),
      }),
    questionTodoBackgroundTaskActivationViewHost:
      createQuestionTodoBackgroundTaskActivationViewHostAdapter({
        viewHost: sharedViewHost,
        getQuestionDockSlotCoordinator: () => host.getQuestionDockSlotCoordinator(),
        getSessionTodoCoordinator: () => host.getSessionTodoCoordinator(),
      }),
    backgroundTaskStreamTriggerViewHost,
  };
}

export function createQuestionTodoBackgroundTaskRuntimeServiceBundle(
  host: QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
): QuestionTodoBackgroundTaskRuntimeServiceBundle {
  const runtimeViewHosts = createQuestionTodoBackgroundTaskRuntimeViewHosts(host);
  const {
    visibleConversationPostSyncStateCoordinator,
  } = createVisibleConversationPostSyncStateServices(
    runtimeViewHosts.visibleConversationPostSyncStateViewHost,
  );
  const {
    questionTodoActivationRefreshBridge,
    visibleConversationPostSyncCoordinator,
    backgroundConversationPostSyncHandoffCoordinator,
  } = createQuestionTodoBackgroundTaskRefreshServices(
    runtimeViewHosts.questionTodoBackgroundTaskRefreshViewHost,
    runtimeViewHosts.backgroundConversationPostSyncHandoffViewHost,
    visibleConversationPostSyncStateCoordinator,
  );
  const {
    questionTodoActivationRefreshCoordinator,
    backgroundTaskActivationIndicatorCoordinator,
  } = createQuestionTodoBackgroundTaskActivationServices(
    runtimeViewHosts.questionTodoBackgroundTaskActivationViewHost,
    questionTodoActivationRefreshBridge,
  );

  return {
    visibleConversationPostSyncCoordinator,
    backgroundConversationPostSyncHandoffCoordinator,
    questionTodoActivationRefreshCoordinator,
    backgroundTaskActivationIndicatorCoordinator,
    backgroundTaskStreamTriggerViewHost: runtimeViewHosts.backgroundTaskStreamTriggerViewHost,
  };
}
