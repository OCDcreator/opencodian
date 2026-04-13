import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import {
  BackgroundTaskActivationIndicatorCoordinator,
  type BackgroundTaskActivationIndicatorCoordinatorHost,
} from './BackgroundTaskActivationIndicatorCoordinator';
import type { QuestionDockSlotCoordinator } from './QuestionDockSlotCoordinator';
import type { QuestionTodoActivationRefreshBridge } from './QuestionTodoActivationRefreshBridge';
import {
  QuestionTodoActivationRefreshCoordinator,
  type QuestionTodoActivationRefreshCoordinatorHost,
} from './QuestionTodoActivationRefreshCoordinator';
import type { SessionTodoCoordinator } from './SessionTodoCoordinator';

type QuestionDockRenderPort = Pick<QuestionDockSlotCoordinator, 'render'>;
type SessionTodoDockPort = Pick<SessionTodoCoordinator, 'updateForTab'>;
type QuestionTodoActivationRefreshPort = Pick<
  QuestionTodoActivationRefreshBridge,
  'refreshAfterActivation'
>;

export interface QuestionTodoBackgroundTaskActivationViewHostAdapterHost {
  getCurrentConversation(): Conversation | null;
  renderSessionTodoDock(tabId: TabId | null): void;
  resetBackgroundTaskIndicator(): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId: TabId | null): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
}

export interface QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies {
  viewHost: QuestionTodoBackgroundTaskActivationViewHostAdapterHost;
  getQuestionDockSlotCoordinator(): QuestionDockRenderPort;
  getSessionTodoCoordinator(): SessionTodoDockPort;
}

export interface QuestionTodoBackgroundTaskActivationViewHost {
  getCurrentConversation(): Conversation | null;
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
  renderSessionTodoDock(tabId: TabId | null): void;
  resetBackgroundTaskIndicator(): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId: TabId | null): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
}

export function createQuestionTodoBackgroundTaskActivationViewHostAdapter(
  dependencies: QuestionTodoBackgroundTaskActivationViewHostAdapterDependencies,
): QuestionTodoBackgroundTaskActivationViewHost {
  return {
    getCurrentConversation: () => dependencies.viewHost.getCurrentConversation(),
    renderQuestionDock: () => {
      dependencies.getQuestionDockSlotCoordinator().render();
    },
    updateSessionTodoDockForTab: (tabId: TabId) => {
      dependencies.getSessionTodoCoordinator().updateForTab(tabId);
    },
    renderSessionTodoDock: (tabId: TabId | null) => {
      dependencies.viewHost.renderSessionTodoDock(tabId);
    },
    resetBackgroundTaskIndicator: () => {
      dependencies.viewHost.resetBackgroundTaskIndicator();
    },
    syncBackgroundTaskStateFromConversation: (conversation: Conversation, tabId: TabId | null) => {
      dependencies.viewHost.syncBackgroundTaskStateFromConversation(conversation, tabId);
    },
    renderBackgroundTaskIndicatorIfNeeded: (tabId: TabId | null) =>
      dependencies.viewHost.renderBackgroundTaskIndicatorIfNeeded(tabId),
  };
}

export interface QuestionTodoBackgroundTaskActivationHosts {
  questionTodoActivationRefreshCoordinatorHost: QuestionTodoActivationRefreshCoordinatorHost;
  backgroundTaskActivationIndicatorCoordinatorHost: BackgroundTaskActivationIndicatorCoordinatorHost;
}

export interface QuestionTodoBackgroundTaskActivationServices {
  questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshCoordinator;
  backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorCoordinator;
}

export function createQuestionTodoBackgroundTaskActivationHosts(
  viewHost: QuestionTodoBackgroundTaskActivationViewHost,
): QuestionTodoBackgroundTaskActivationHosts {
  return {
    questionTodoActivationRefreshCoordinatorHost: {
      renderQuestionDock: () => {
        viewHost.renderQuestionDock();
      },
      updateSessionTodoDockForTab: (tabId: TabId) => {
        viewHost.updateSessionTodoDockForTab(tabId);
      },
      renderSessionTodoDock: (tabId: TabId | null) => {
        viewHost.renderSessionTodoDock(tabId);
      },
    },
    backgroundTaskActivationIndicatorCoordinatorHost: {
      getCurrentConversationId: () => viewHost.getCurrentConversation()?.id ?? null,
      resetBackgroundTaskIndicator: () => {
        viewHost.resetBackgroundTaskIndicator();
      },
      syncBackgroundTaskStateFromConversation: (
        conversation: Conversation,
        tabId: TabId | null,
      ) => {
        viewHost.syncBackgroundTaskStateFromConversation(conversation, tabId);
      },
      renderBackgroundTaskIndicatorIfNeeded: (tabId: TabId | null) =>
        viewHost.renderBackgroundTaskIndicatorIfNeeded(tabId),
    },
  };
}

export function createQuestionTodoBackgroundTaskActivationServices(
  viewHost: QuestionTodoBackgroundTaskActivationViewHost,
  questionTodoActivationRefreshBridge: QuestionTodoActivationRefreshPort,
): QuestionTodoBackgroundTaskActivationServices {
  const hosts = createQuestionTodoBackgroundTaskActivationHosts(viewHost);
  const questionTodoActivationRefreshCoordinator = new QuestionTodoActivationRefreshCoordinator(
    hosts.questionTodoActivationRefreshCoordinatorHost,
    questionTodoActivationRefreshBridge,
  );
  const backgroundTaskActivationIndicatorCoordinator =
    new BackgroundTaskActivationIndicatorCoordinator(
      hosts.backgroundTaskActivationIndicatorCoordinatorHost,
    );

  return {
    questionTodoActivationRefreshCoordinator,
    backgroundTaskActivationIndicatorCoordinator,
  };
}
