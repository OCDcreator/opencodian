import {
  createQuestionTodoBackgroundTaskActivationViewHostAdapter,
  createQuestionTodoBackgroundTaskActivationServices,
  type QuestionTodoBackgroundTaskActivationViewHost,
  type QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies,
  type QuestionTodoBackgroundTaskActivationViewHostAdapterHost,
  type QuestionTodoBackgroundTaskActivationServices,
} from './QuestionTodoBackgroundTaskActivationHostAdapter';
import {
  createQuestionTodoBackgroundTaskRefreshViewHostAdapter,
  createQuestionTodoBackgroundTaskRefreshServices,
  type QuestionTodoBackgroundTaskRefreshViewHost,
  type QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies,
  type QuestionTodoBackgroundTaskRefreshViewHostAdapterHost,
  type QuestionTodoBackgroundTaskRefreshServices,
} from './QuestionTodoBackgroundTaskRefreshHostAdapter';
import {
  createBackgroundConversationPostSyncHandoffViewHostAdapter,
  type BackgroundConversationPostSyncHandoffViewHost,
  type BackgroundConversationPostSyncHandoffViewHostAdapterDependencies,
  type BackgroundConversationPostSyncHandoffViewHostAdapterHost,
} from './BackgroundConversationPostSyncHandoffHostAdapter';
import type { TabConversationSyncFingerprintRuntimePort } from './TabConversationSyncFingerprintPortProvider';
import {
  createVisibleConversationPostSyncStateServices,
  type VisibleConversationPostSyncStateViewHost,
} from './VisibleConversationPostSyncStateHostAdapter';

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
    > {}

type QuestionTodoBackgroundTaskConversationSyncRuntimePort = Pick<
  TabConversationSyncFingerprintRuntimePort,
  'setTabConversationSyncFingerprint'
>;
type QuestionTodoBackgroundTaskSessionTodoPort = ReturnType<
  QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies['getSessionTodoCoordinator']
> & ReturnType<
  QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies['getSessionTodoCoordinator']
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
  getCurrentConversation: VisibleConversationPostSyncStateViewHost['getCurrentConversation'];
  setCurrentConversationRevertState:
    VisibleConversationPostSyncStateViewHost['setCurrentConversationRevertState'];
  getConversationSyncRuntime(): QuestionTodoBackgroundTaskConversationSyncRuntimePort;
  getTabRuntimeState:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getTabRuntimeState'];
  renderSessionTodoDock:
    QuestionTodoBackgroundTaskRefreshRuntimePort['renderSessionTodoDock'];
  getQuestionDockCoordinator:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getQuestionDockCoordinator'];
  getSessionTodoCoordinator:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getSessionTodoCoordinator'];
  getQuestionDockSlotCoordinator:
    QuestionTodoBackgroundTaskActivationWritebackPort['getQuestionDockSlotCoordinator'];
  resetBackgroundTaskIndicator:
    QuestionTodoBackgroundTaskBackgroundRuntimePort['resetBackgroundTaskIndicator'];
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
      host.resetBackgroundTaskIndicator();
    },
    syncBackgroundTaskStateFromConversation: (conversation, tabId) => {
      host.syncBackgroundTaskStateFromConversation(conversation, tabId);
    },
    renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
      host.renderBackgroundTaskIndicatorIfNeeded(tabId),
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
  };
}
