import type {
  QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
} from './QuestionTodoBackgroundTaskRuntimeViewHostFactory';
import type { TabConversationSyncFingerprintRuntimePort } from './TabConversationSyncFingerprintPortProvider';

type QuestionTodoBackgroundTaskConversationStatePort = ReturnType<
  QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost['getConversationState']
>;
type QuestionTodoBackgroundTaskRefreshRuntimePort = ReturnType<
  QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost['getQuestionTodoRefreshRuntime']
>;
type QuestionTodoBackgroundTaskActivationWritebackPort = ReturnType<
  QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost['getQuestionTodoActivationWriteback']
>;
type QuestionTodoBackgroundTaskBackgroundRuntimePort = ReturnType<
  QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost['getBackgroundTaskRuntime']
>;
type QuestionTodoBackgroundTaskConversationSyncRuntimePort = Pick<
  TabConversationSyncFingerprintRuntimePort,
  'setTabConversationSyncFingerprint'
>;

export interface QuestionTodoBackgroundTaskRuntimeHostProviderHost {
  getCurrentConversation:
    QuestionTodoBackgroundTaskConversationStatePort['getCurrentConversation'];
  setCurrentConversationRevertState:
    QuestionTodoBackgroundTaskConversationStatePort['setCurrentConversationRevertState'];
  getConversationSyncRuntime(): QuestionTodoBackgroundTaskConversationSyncRuntimePort;
  getTabRuntimeState:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getTabRuntimeState'];
  renderSessionTodoDock:
    QuestionTodoBackgroundTaskRefreshRuntimePort['renderSessionTodoDock'];
  getQuestionDockCoordinator:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getQuestionDockCoordinator'];
  getSessionTodoStateService:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getSessionTodoStateService'];
  getSessionTodoStatusRefreshService:
    QuestionTodoBackgroundTaskRefreshRuntimePort['getSessionTodoStatusRefreshService'];
  getQuestionDockSlotCoordinator:
    QuestionTodoBackgroundTaskActivationWritebackPort['getQuestionDockSlotCoordinator'];
  getSessionTodoDockCoordinator:
    QuestionTodoBackgroundTaskActivationWritebackPort['getSessionTodoDockCoordinator'];
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

export function createQuestionTodoBackgroundTaskRuntimeViewHostFactoryHost(
  host: QuestionTodoBackgroundTaskRuntimeHostProviderHost,
): QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost {
  return {
    getConversationState: () => ({
      getCurrentConversation: () => host.getCurrentConversation(),
      setCurrentConversationRevertState: (revertState) => {
        host.setCurrentConversationRevertState(revertState);
      },
      setTabConversationSyncFingerprint: (tabId, fingerprint) => {
        host.getConversationSyncRuntime().setTabConversationSyncFingerprint(tabId, fingerprint);
      },
    }),
    getQuestionTodoRefreshRuntime: () => ({
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      renderSessionTodoDock: (tabId) => {
        host.renderSessionTodoDock(tabId);
      },
      getQuestionDockCoordinator: () => host.getQuestionDockCoordinator(),
      getSessionTodoStateService: () => host.getSessionTodoStateService(),
      getSessionTodoStatusRefreshService: () =>
        host.getSessionTodoStatusRefreshService(),
    }),
    getQuestionTodoActivationWriteback: () => ({
      getQuestionDockSlotCoordinator: () => host.getQuestionDockSlotCoordinator(),
      getSessionTodoDockCoordinator: () => host.getSessionTodoDockCoordinator(),
    }),
    getBackgroundTaskRuntime: () => ({
      resetBackgroundTaskIndicator: () => {
        host.resetBackgroundTaskIndicator();
      },
      syncBackgroundTaskStateFromConversation: (conversation, tabId) => {
        host.syncBackgroundTaskStateFromConversation(conversation, tabId);
      },
      renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
        host.renderBackgroundTaskIndicatorIfNeeded(tabId),
      getBackgroundTaskIndicatorCoordinator: () =>
        host.getBackgroundTaskIndicatorCoordinator(),
      getBackgroundTaskLiveSignalCoordinator: () =>
        host.getBackgroundTaskLiveSignalCoordinator(),
      getTabRuntimeStateBridge: () => host.getTabRuntimeStateBridge(),
    }),
  };
}
