import type { Conversation } from '../../../../core/types';
import type { TabRuntimeStateBridge } from '../../runtime/activation/TabRuntimeStateBridge';
import type { BackgroundTaskIndicatorCoordinator } from '../../runtime/background/BackgroundTaskIndicatorCoordinator';
import type { TabId } from '../../tabs';
import type { BackgroundTaskLiveSignalCoordinator } from '../background/BackgroundTaskLiveSignalCoordinator';
import type { PostSyncQuestionTodoRefreshPlanBuilder } from '../questions/PostSyncQuestionTodoRefreshPlanBuilder';
import type { QuestionTodoStatusRefreshCoordinator } from '../questions/QuestionTodoStatusRefreshCoordinator';
import {
  BackgroundConversationPostSyncHandoffCoordinator,
  type BackgroundConversationPostSyncHandoffCoordinatorHost,
} from './BackgroundConversationPostSyncHandoffCoordinator';
import {
  BackgroundConversationPostSyncRefreshExecutor,
  type BackgroundTaskPostSyncRefreshPort,
} from './BackgroundConversationPostSyncRefreshExecutor';

type BackgroundTaskIndicatorPort = Pick<
  BackgroundTaskIndicatorCoordinator,
  'flushCompletionNoticesAndSyncStreamLikeState'
>;
type BackgroundTaskLiveSignalPort = Pick<
  BackgroundTaskLiveSignalCoordinator,
  'markAuthoritativeSync'
>;
type TabRuntimeStateBridgePort = Pick<
  TabRuntimeStateBridge,
  'setNeedsAttention'
>;
type BackgroundConversationRefreshPlanPort = Pick<
  PostSyncQuestionTodoRefreshPlanBuilder,
  | 'createBackgroundTabConversationPlan'
  | 'createSignalSyncedBackgroundConversationPlan'
>;
type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterPostSync'
>;

export interface BackgroundConversationPostSyncHandoffViewHostAdapterHost {
  syncBackgroundTaskStateFromConversation(
    conversation: Conversation,
    tabId?: TabId | null,
  ): void;
}

export interface BackgroundConversationPostSyncHandoffViewHostAdapterDependencies {
  viewHost: BackgroundConversationPostSyncHandoffViewHostAdapterHost;
  getBackgroundTaskIndicatorCoordinator(): BackgroundTaskIndicatorPort;
  getBackgroundTaskLiveSignalCoordinator(): BackgroundTaskLiveSignalPort;
  getTabRuntimeStateBridge(): TabRuntimeStateBridgePort;
}

export interface BackgroundConversationPostSyncHandoffViewHost
  extends BackgroundTaskPostSyncRefreshPort,
    BackgroundConversationPostSyncHandoffCoordinatorHost {}

export interface BackgroundConversationPostSyncHandoffServices {
  backgroundConversationPostSyncHandoffCoordinator:
    BackgroundConversationPostSyncHandoffCoordinator;
}

export function createBackgroundConversationPostSyncHandoffViewHostAdapter(
  dependencies: BackgroundConversationPostSyncHandoffViewHostAdapterDependencies,
): BackgroundConversationPostSyncHandoffViewHost {
  return {
    syncBackgroundTaskStateFromConversation: (
      conversation: Conversation,
      tabId?: TabId | null,
    ) => dependencies.viewHost.syncBackgroundTaskStateFromConversation(conversation, tabId),
    flushBackgroundTaskPostSyncWriteback: (
      tabId: TabId | null,
      conversation: Conversation | null,
      options?: { isCurrent?: () => boolean },
    ) => {
      const coordinator = dependencies.getBackgroundTaskIndicatorCoordinator();
      if (options) {
        return coordinator.flushCompletionNoticesAndSyncStreamLikeState(tabId, conversation, options);
      }
      return coordinator.flushCompletionNoticesAndSyncStreamLikeState(tabId, conversation);
    },
    markBackgroundTaskAuthoritativeSync: (tabId: TabId | null, reason: string) => {
      dependencies
        .getBackgroundTaskLiveSignalCoordinator()
        .markAuthoritativeSync(tabId, reason);
    },
    setTabNeedsAttention: (tabId: TabId | null, needsAttention: boolean) => {
      dependencies.getTabRuntimeStateBridge().setNeedsAttention(tabId, needsAttention);
    },
  };
}

export function createBackgroundConversationPostSyncHandoffServices(
  viewHost: BackgroundConversationPostSyncHandoffViewHost,
  postSyncQuestionTodoRefreshPlanBuilder: BackgroundConversationRefreshPlanPort,
  questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshPort,
): BackgroundConversationPostSyncHandoffServices {
  const backgroundConversationPostSyncRefreshExecutor =
    new BackgroundConversationPostSyncRefreshExecutor(
      postSyncQuestionTodoRefreshPlanBuilder,
      questionTodoStatusRefreshCoordinator,
      viewHost,
    );

  return {
    backgroundConversationPostSyncHandoffCoordinator:
      new BackgroundConversationPostSyncHandoffCoordinator(
        backgroundConversationPostSyncRefreshExecutor,
        viewHost,
      ),
  };
}
