import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type {
  QuestionTodoBackgroundTaskActivationViewHostAdapterHost,
} from './QuestionTodoBackgroundTaskActivationHostAdapter';
import type {
  QuestionTodoBackgroundTaskRefreshViewHostAdapterHost,
} from './QuestionTodoBackgroundTaskRefreshHostAdapter';
import type { QuestionTodoStatusRefreshRuntime } from './QuestionTodoStatusRefreshCoordinator';
import type { ConversationRevertStateSnapshot } from './VisibleConversationPostSyncStateCoordinator';

export interface QuestionTodoBackgroundTaskViewHostFactoryHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  syncBackgroundTaskStateFromConversation(
    conversation: Conversation,
    tabId?: TabId | null,
  ): void;
  setCurrentConversationRevertState(
    revertState: ConversationRevertStateSnapshot | null,
  ): void;
  setTabConversationSyncFingerprint(tabId: TabId, fingerprint: string): void;
  renderSessionTodoDock(tabId: TabId | null): void;
  resetBackgroundTaskIndicator(): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
}

export interface QuestionTodoBackgroundTaskViewHosts {
  refreshViewHostAdapterHost: QuestionTodoBackgroundTaskRefreshViewHostAdapterHost;
  activationViewHostAdapterHost: QuestionTodoBackgroundTaskActivationViewHostAdapterHost;
}

export function createQuestionTodoBackgroundTaskViewHosts(
  host: QuestionTodoBackgroundTaskViewHostFactoryHost,
): QuestionTodoBackgroundTaskViewHosts {
  return {
    refreshViewHostAdapterHost: {
      getCurrentConversation: () => host.getCurrentConversation(),
      getTabRuntimeState: (tabId: TabId | null) => host.getTabRuntimeState(tabId),
      syncBackgroundTaskStateFromConversation: (
        conversation: Conversation,
        tabId?: TabId | null,
      ) => host.syncBackgroundTaskStateFromConversation(conversation, tabId),
      setCurrentConversationRevertState: (
        revertState: ConversationRevertStateSnapshot | null,
      ) => {
        host.setCurrentConversationRevertState(revertState);
      },
      setTabConversationSyncFingerprint: (tabId: TabId, fingerprint: string) => {
        host.setTabConversationSyncFingerprint(tabId, fingerprint);
      },
    },
    activationViewHostAdapterHost: {
      getCurrentConversation: () => host.getCurrentConversation(),
      renderSessionTodoDock: (tabId: TabId | null) => {
        host.renderSessionTodoDock(tabId);
      },
      resetBackgroundTaskIndicator: () => {
        host.resetBackgroundTaskIndicator();
      },
      syncBackgroundTaskStateFromConversation: (
        conversation: Conversation,
        tabId: TabId | null,
      ) => {
        host.syncBackgroundTaskStateFromConversation(conversation, tabId);
      },
      renderBackgroundTaskIndicatorIfNeeded: (tabId: TabId | null) =>
        host.renderBackgroundTaskIndicatorIfNeeded(tabId),
    },
  };
}
