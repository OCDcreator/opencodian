import type { StreamingInlineCardRenderer } from '../runtime/StreamingInlineCardRenderer';
import type { QuestionDockSlotCoordinator } from './QuestionDockSlotCoordinator';
import {
  createQuestionPostResolutionRuntimeHostAdapter,
  createQuestionRuntimeServices,
  type QuestionRuntimeConversationSyncPort,
  type QuestionRuntimeServices,
  type QuestionRuntimeStatusRefreshPort,
  type QuestionRuntimeViewHost,
} from './QuestionRuntimeHostAdapter';
import {
  createQuestionRuntimeViewHostAdapter,
  type QuestionRuntimeQuestionApiPort,
  type QuestionRuntimeSettingsPort,
  type QuestionRuntimeTabAttentionPort,
  type QuestionRuntimeViewHostAdapterHost,
} from './QuestionRuntimeViewHostAdapter';

type QuestionDockSlotCoordinatorPort = Pick<
  QuestionDockSlotCoordinator,
  'getQuestionDock' | 'shouldUseAboveInputQuestionDock'
>;

export interface QuestionRuntimeViewHostFactoryHost extends QuestionRuntimeViewHostAdapterHost {
  settings: QuestionRuntimeSettingsPort;
  getQuestionDockSlotCoordinator(): QuestionDockSlotCoordinatorPort;
  getQuestionApi(): QuestionRuntimeQuestionApiPort;
  getTabAttention(): QuestionRuntimeTabAttentionPort;
}

export interface QuestionRuntimeBundlePorts {
  conversationSync: QuestionRuntimeConversationSyncPort;
  statusRefresh: QuestionRuntimeStatusRefreshPort;
  streamingInlineCardRenderer: StreamingInlineCardRenderer;
}

export function createQuestionRuntimeViewHost(
  host: QuestionRuntimeViewHostFactoryHost,
): QuestionRuntimeViewHost {
  return createQuestionRuntimeViewHostAdapter({
    viewHost: {
      getActiveTabId: () => host.getActiveTabId(),
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      ensureTabRuntimeState: (tabId) => host.ensureTabRuntimeState(tabId),
      getCurrentConversationSessionId: () => host.getCurrentConversationSessionId(),
      getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
      keepQuestionCardPinnedToBottom: (tabId) => {
        host.keepQuestionCardPinnedToBottom(tabId);
      },
    },
    settings: host.settings,
    questionDockSlotCoordinator: {
      getQuestionDock: () => host.getQuestionDockSlotCoordinator().getQuestionDock(),
      shouldUseAboveInputQuestionDock: () =>
        host.getQuestionDockSlotCoordinator().shouldUseAboveInputQuestionDock(),
    },
    questionApi: {
      getPendingQuestions: () => host.getQuestionApi().getPendingQuestions(),
      replyToQuestion: (requestId, answers) =>
        host.getQuestionApi().replyToQuestion(requestId, answers),
      rejectQuestion: (requestId) => host.getQuestionApi().rejectQuestion(requestId),
    },
    tabAttention: {
      setNeedsAttention: (tabId, needsAttention) => {
        host.getTabAttention().setNeedsAttention(tabId, needsAttention);
      },
    },
  });
}

export function createQuestionRuntimeBundle(
  host: QuestionRuntimeViewHostFactoryHost,
  ports: QuestionRuntimeBundlePorts,
): QuestionRuntimeServices {
  const viewHost = createQuestionRuntimeViewHost(host);
  const postResolutionHost = createQuestionPostResolutionRuntimeHostAdapter({
    viewHost: {
      getActiveTabId: () => host.getActiveTabId(),
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
    },
    conversationSync: ports.conversationSync,
    statusRefresh: ports.statusRefresh,
  });
  return createQuestionRuntimeServices(
    viewHost,
    postResolutionHost,
    ports.streamingInlineCardRenderer,
  );
}
