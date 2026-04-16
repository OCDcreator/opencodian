import type { Conversation } from '../../../core/types';
import type { BackgroundTaskIndicatorCoordinator } from '../runtime/BackgroundTaskIndicatorCoordinator';
import type { TabRuntimeStateBridge } from '../runtime/TabRuntimeStateBridge';
import type { TabId } from '../tabs';
import {
  BackgroundConversationAttentionCoordinator,
  type BackgroundConversationAttentionCoordinatorHost,
} from './BackgroundConversationAttentionCoordinator';
import {
  BackgroundConversationPostSyncHandoffCoordinator,
} from './BackgroundConversationPostSyncHandoffCoordinator';
import {
  BackgroundConversationPostSyncRefreshExecutor,
  type BackgroundTaskPostSyncRefreshPort,
} from './BackgroundConversationPostSyncRefreshExecutor';
import {
  BackgroundConversationSignalSyncStateCoordinator,
  type BackgroundConversationSignalSyncStateCoordinatorHost,
} from './BackgroundConversationSignalSyncStateCoordinator';
import type { BackgroundTaskLiveSignalCoordinator } from './BackgroundTaskLiveSignalCoordinator';
import type { PostSyncQuestionTodoRefreshPlanBuilder } from './PostSyncQuestionTodoRefreshPlanBuilder';
import type { QuestionTodoStatusRefreshCoordinator } from './QuestionTodoStatusRefreshCoordinator';

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
    BackgroundConversationAttentionCoordinatorHost,
    BackgroundConversationSignalSyncStateCoordinatorHost {}

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
    ) =>
      dependencies
        .getBackgroundTaskIndicatorCoordinator()
        .flushCompletionNoticesAndSyncStreamLikeState(tabId, conversation),
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
  const backgroundConversationAttentionCoordinator =
    new BackgroundConversationAttentionCoordinator(viewHost);
  const backgroundConversationSignalSyncStateCoordinator =
    new BackgroundConversationSignalSyncStateCoordinator(viewHost);

  return {
    backgroundConversationPostSyncHandoffCoordinator:
      new BackgroundConversationPostSyncHandoffCoordinator(
        backgroundConversationPostSyncRefreshExecutor,
        backgroundConversationSignalSyncStateCoordinator,
        backgroundConversationAttentionCoordinator,
      ),
  };
}
