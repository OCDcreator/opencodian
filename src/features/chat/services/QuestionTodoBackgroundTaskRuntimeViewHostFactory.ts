import {
  createBackgroundConversationPostSyncHandoffViewHostAdapter,
  type BackgroundConversationPostSyncHandoffViewHost,
  type BackgroundConversationPostSyncHandoffViewHostAdapterDependencies,
  type BackgroundConversationPostSyncHandoffViewHostAdapterHost,
} from './BackgroundConversationPostSyncHandoffHostAdapter';
import {
  createQuestionTodoBackgroundTaskActivationViewHostAdapter,
  type QuestionTodoBackgroundTaskActivationViewHost,
  type QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies,
  type QuestionTodoBackgroundTaskActivationViewHostAdapterHost,
} from './QuestionTodoBackgroundTaskActivationHostAdapter';
import {
  createQuestionTodoBackgroundTaskRefreshViewHostAdapter,
  type QuestionTodoBackgroundTaskRefreshViewHost,
  type QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies,
  type QuestionTodoBackgroundTaskRefreshViewHostAdapterHost,
} from './QuestionTodoBackgroundTaskRefreshHostAdapter';
import type { VisibleConversationPostSyncStateViewHost } from './VisibleConversationPostSyncStateHostAdapter';

type QuestionTodoBackgroundTaskConversationStatePort = Pick<
  VisibleConversationPostSyncStateViewHost,
  | 'getCurrentConversation'
  | 'setCurrentConversationRevertState'
  | 'setTabConversationSyncFingerprint'
>;

type QuestionTodoBackgroundTaskRefreshRuntimePort =
  Pick<QuestionTodoBackgroundTaskRefreshViewHostAdapterHost, 'getTabRuntimeState'>
  & Pick<QuestionTodoBackgroundTaskActivationViewHostAdapterHost, 'renderSessionTodoDock'>
  & {
    getQuestionDockCoordinator(): ReturnType<
      QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies['getQuestionDockCoordinator']
    >;
    getSessionTodoStateService(): ReturnType<
      QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies['getSessionTodoStateService']
    >;
    getSessionTodoStatusRefreshService(): ReturnType<
      QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies['getSessionTodoStatusRefreshService']
    >;
  };

type QuestionTodoBackgroundTaskActivationWritebackPort = {
  getQuestionDockSlotCoordinator(): ReturnType<
    QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies['getQuestionDockSlotCoordinator']
  >;
  getSessionTodoDockCoordinator(): ReturnType<
    QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies['getSessionTodoDockCoordinator']
  >;
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

export interface QuestionTodoBackgroundTaskRuntimeViewHosts {
  visibleConversationPostSyncStateViewHost: VisibleConversationPostSyncStateViewHost;
  questionTodoBackgroundTaskRefreshViewHost: QuestionTodoBackgroundTaskRefreshViewHost;
  backgroundConversationPostSyncHandoffViewHost:
    BackgroundConversationPostSyncHandoffViewHost;
  questionTodoBackgroundTaskActivationViewHost:
    QuestionTodoBackgroundTaskActivationViewHost;
}

export interface QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost {
  getConversationState(): QuestionTodoBackgroundTaskConversationStatePort;
  getQuestionTodoRefreshRuntime(): QuestionTodoBackgroundTaskRefreshRuntimePort;
  getQuestionTodoActivationWriteback(): QuestionTodoBackgroundTaskActivationWritebackPort;
  getBackgroundTaskRuntime(): QuestionTodoBackgroundTaskBackgroundRuntimePort;
}

export function createQuestionTodoBackgroundTaskRuntimeViewHosts(
  host: QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
): QuestionTodoBackgroundTaskRuntimeViewHosts {
  const sharedViewHost: SharedQuestionTodoBackgroundTaskViewHost = {
    getCurrentConversation: () => host.getConversationState().getCurrentConversation(),
    getTabRuntimeState: (tabId) => host.getQuestionTodoRefreshRuntime().getTabRuntimeState(tabId),
    setCurrentConversationRevertState: (revertState) => {
      host.getConversationState().setCurrentConversationRevertState(revertState);
    },
    setTabConversationSyncFingerprint: (tabId, fingerprint) => {
      host.getConversationState().setTabConversationSyncFingerprint(tabId, fingerprint);
    },
    renderSessionTodoDock: (tabId) => {
      host.getQuestionTodoRefreshRuntime().renderSessionTodoDock(tabId);
    },
    resetBackgroundTaskIndicator: () => {
      host.getBackgroundTaskRuntime().resetBackgroundTaskIndicator();
    },
    syncBackgroundTaskStateFromConversation: (conversation, tabId) => {
      host.getBackgroundTaskRuntime().syncBackgroundTaskStateFromConversation(conversation, tabId);
    },
    renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
      host.getBackgroundTaskRuntime().renderBackgroundTaskIndicatorIfNeeded(tabId),
  };

  return {
    visibleConversationPostSyncStateViewHost: sharedViewHost,
    questionTodoBackgroundTaskRefreshViewHost:
      createQuestionTodoBackgroundTaskRefreshViewHostAdapter({
        viewHost: sharedViewHost,
        getQuestionDockCoordinator: () =>
          host.getQuestionTodoRefreshRuntime().getQuestionDockCoordinator(),
        getSessionTodoStateService: () =>
          host.getQuestionTodoRefreshRuntime().getSessionTodoStateService(),
        getSessionTodoStatusRefreshService: () =>
          host.getQuestionTodoRefreshRuntime().getSessionTodoStatusRefreshService(),
      }),
    backgroundConversationPostSyncHandoffViewHost:
      createBackgroundConversationPostSyncHandoffViewHostAdapter({
        viewHost: sharedViewHost,
        getBackgroundTaskIndicatorCoordinator: () =>
          host.getBackgroundTaskRuntime().getBackgroundTaskIndicatorCoordinator(),
        getBackgroundTaskLiveSignalCoordinator: () =>
          host.getBackgroundTaskRuntime().getBackgroundTaskLiveSignalCoordinator(),
        getTabRuntimeStateBridge: () =>
          host.getBackgroundTaskRuntime().getTabRuntimeStateBridge(),
      }),
    questionTodoBackgroundTaskActivationViewHost:
      createQuestionTodoBackgroundTaskActivationViewHostAdapter({
        viewHost: sharedViewHost,
        getQuestionDockSlotCoordinator: () =>
          host.getQuestionTodoActivationWriteback().getQuestionDockSlotCoordinator(),
        getSessionTodoDockCoordinator: () =>
          host.getQuestionTodoActivationWriteback().getSessionTodoDockCoordinator(),
      }),
  };
}
