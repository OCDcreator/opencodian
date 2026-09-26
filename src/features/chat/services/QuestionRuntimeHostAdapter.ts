import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../core/types';
import {
  QuestionInlineCardRenderer,
  QuestionInlineCardRendererHost,
  QuestionInlineCardRuntimeState,
} from '../runtime/QuestionInlineCardRenderer';
import {
  QuestionResolutionCoordinator,
  QuestionResolutionCoordinatorHost,
  QuestionResolutionCoordinatorRuntimeState,
} from '../runtime/QuestionResolutionCoordinator';
import type { StreamingInlineCardRenderer } from '../runtime/StreamingInlineCardRenderer';
import type { TabId } from '../tabs';
import type { QuestionDock } from '../ui/QuestionDock';
import {
  QuestionDockCoordinator,
  type QuestionDockCoordinatorHost,
  type QuestionDockRuntimeState,
} from './QuestionDockCoordinator';
import {
  QuestionDockRenderStateFacade,
  type QuestionDockRenderStateFacadeHost,
} from './QuestionDockRenderStateFacade';
import {
  QuestionDockResolutionActionFacade,
  type QuestionDockResolutionActionFacadeHost,
} from './QuestionDockResolutionActionFacade';
import {
  QuestionInlineResolutionActionFacade,
  type QuestionInlineResolutionActionFacadeHost,
} from './QuestionInlineResolutionActionFacade';
import {
  QuestionPostResolutionRuntimeFacade,
  type QuestionPostResolutionRuntimeFacadeHost,
  type QuestionPostResolutionRuntimeState,
} from './QuestionPostResolutionRuntimeFacade';
import {
  QuestionResolutionExecutionFacade,
  type QuestionResolutionExecutionFacadeHost,
  type QuestionResolutionRequestRoute,
} from './QuestionResolutionExecutionFacade';
import {
  QuestionResolutionFlowCoordinator,
  type QuestionResolutionFlowCoordinatorHost,
} from './QuestionResolutionFlowCoordinator';

type QuestionDockPort = Pick<QuestionDock, 'render'>;

export interface QuestionRuntimeState
  extends QuestionDockRuntimeState,
    QuestionInlineCardRuntimeState,
    QuestionResolutionCoordinatorRuntimeState,
    QuestionPostResolutionRuntimeState {}

export interface QuestionRuntimeViewHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  getQuestionDock(): QuestionDockPort | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
  shouldRenderQuestionResolutionCards(): boolean;
  keepQuestionCardPinnedToBottom(tabId: TabId | null): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  isPendingQuestionReadAuthoritative?(tabId?: TabId | null): boolean;
  getPendingQuestions(tabId?: TabId | null): Promise<QuestionRequest[]>;
  replyToQuestion(
    requestId: string,
    answers: string[][],
    context?: QuestionResolutionRequestRoute,
  ): Promise<void>;
  rejectQuestion(requestId: string, context?: QuestionResolutionRequestRoute): Promise<void>;
}

export interface QuestionPostResolutionRuntimeViewHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionPostResolutionRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
}

export interface QuestionRuntimeConversationSyncPort {
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
}

export interface QuestionRuntimeStatusRefreshPort {
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<unknown>;
}

export interface QuestionPostResolutionRuntimeHostAdapterDependencies {
  viewHost: QuestionPostResolutionRuntimeViewHost;
  conversationSync: QuestionRuntimeConversationSyncPort;
  statusRefresh: QuestionRuntimeStatusRefreshPort;
}

export interface QuestionRuntimeHosts {
  inlineCardRendererHost: QuestionInlineCardRendererHost;
  inlineResolutionActionHost: QuestionInlineResolutionActionFacadeHost;
  resolutionCoordinatorHost: QuestionResolutionCoordinatorHost;
  dockCoordinatorHost: QuestionDockCoordinatorHost;
  dockRenderStateHost: QuestionDockRenderStateFacadeHost;
  dockResolutionActionHost: QuestionDockResolutionActionFacadeHost;
  resolutionExecutionHost: QuestionResolutionExecutionFacadeHost;
  postResolutionRuntimeHost: QuestionPostResolutionRuntimeFacadeHost;
}

export interface QuestionRuntimeServices {
  inlineCardRenderer: QuestionInlineCardRenderer;
  resolutionCoordinator: QuestionResolutionCoordinator;
  dockCoordinator: QuestionDockCoordinator;
  resolutionFlowCoordinator: QuestionResolutionFlowCoordinator;
}

export function createQuestionPostResolutionRuntimeHostAdapter(
  dependencies: QuestionPostResolutionRuntimeHostAdapterDependencies,
): QuestionPostResolutionRuntimeFacadeHost {
  return {
    getActiveTabId: () => dependencies.viewHost.getActiveTabId(),
    getTabRuntimeState: (tabId) => dependencies.viewHost.getTabRuntimeState(tabId),
    getSessionIdForTab: (tabId) => dependencies.viewHost.getSessionIdForTab(tabId),
    refreshTabSessionStatus: (tabId, sessionId, options) =>
      dependencies.statusRefresh.refreshTabSessionStatus(tabId, sessionId, options),
    startConversationSyncLoop: () => {
      dependencies.conversationSync.startConversationSyncLoop();
    },
    syncVisibleConversationInBackground: () =>
      dependencies.conversationSync.syncVisibleConversationInBackground(),
  };
}

export function createQuestionRuntimeHosts(
  viewHost: QuestionRuntimeViewHost,
  postResolutionRuntimeHost: QuestionPostResolutionRuntimeFacadeHost,
): QuestionRuntimeHosts {
  return {
    inlineCardRendererHost: {
      getActiveTabId: () => viewHost.getActiveTabId(),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      keepQuestionCardPinnedToBottom: (tabId: TabId | null) => {
        viewHost.keepQuestionCardPinnedToBottom(tabId);
      },
      isRequestPending: async (request, tabId) => {
        if (!viewHost.isPendingQuestionReadAuthoritative?.(tabId)) return true;
        if (viewHost.getSessionIdForTab(tabId) !== request.sessionId) return false;
        const pending = await viewHost.getPendingQuestions(tabId);
        return pending.some((entry) => entry.id === request.id && entry.sessionId === request.sessionId);
      },
    },
    inlineResolutionActionHost: {
      getActiveTabId: () => viewHost.getActiveTabId(),
      getQuestionDisplayMode: () => viewHost.getQuestionDisplayMode(),
    },
    resolutionCoordinatorHost: {
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      shouldRenderQuestionResolutionCards: () => viewHost.shouldRenderQuestionResolutionCards(),
      keepQuestionCardPinnedToBottom: (tabId: TabId | null) => {
        viewHost.keepQuestionCardPinnedToBottom(tabId);
      },
    },
    dockCoordinatorHost: {
      getActiveTabId: () => viewHost.getActiveTabId(),
      getQuestionDock: () => viewHost.getQuestionDock(),
      getQuestionDisplayMode: () => viewHost.getQuestionDisplayMode(),
      shouldUseAboveInputQuestionDock: () => viewHost.shouldUseAboveInputQuestionDock(),
      getCurrentConversationSessionId: () => viewHost.getCurrentConversationSessionId(),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      ensureTabRuntimeState: (tabId: TabId | null) => viewHost.ensureTabRuntimeState(tabId),
      getSessionIdForTab: (tabId: TabId | null) => viewHost.getSessionIdForTab(tabId),
      isPendingQuestionReadAuthoritative: (tabId) =>
        viewHost.isPendingQuestionReadAuthoritative?.(tabId) ?? false,
      getPendingQuestions: (tabId) => viewHost.getPendingQuestions(tabId),
      setTabNeedsAttention: (tabId, needsAttention) => {
        viewHost.setTabNeedsAttention(tabId, needsAttention);
      },
    },
    dockRenderStateHost: {
      getActiveTabId: () => viewHost.getActiveTabId(),
      getCurrentConversationSessionId: () => viewHost.getCurrentConversationSessionId(),
      getQuestionDisplayMode: () => viewHost.getQuestionDisplayMode(),
      shouldUseAboveInputQuestionDock: () => viewHost.shouldUseAboveInputQuestionDock(),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
    },
    dockResolutionActionHost: {
      getActiveTabId: () => viewHost.getActiveTabId(),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
    },
    resolutionExecutionHost: {
      replyToQuestion: (requestId, answers, context) =>
        viewHost.replyToQuestion(requestId, answers, context),
      rejectQuestion: (requestId, context) => viewHost.rejectQuestion(requestId, context),
    },
    postResolutionRuntimeHost,
  };
}

export function createQuestionRuntimeServices(
  viewHost: QuestionRuntimeViewHost,
  postResolutionRuntimeHost: QuestionPostResolutionRuntimeFacadeHost,
  streamingInlineCardRenderer: StreamingInlineCardRenderer,
): QuestionRuntimeServices {
  const hosts = createQuestionRuntimeHosts(viewHost, postResolutionRuntimeHost);

  const inlineCardRenderer = new QuestionInlineCardRenderer(
    streamingInlineCardRenderer,
    hosts.inlineCardRendererHost,
  );
  const inlineResolutionActionFacade = new QuestionInlineResolutionActionFacade(
    hosts.inlineResolutionActionHost,
    inlineCardRenderer,
  );
  const resolutionCoordinator = new QuestionResolutionCoordinator(
    inlineCardRenderer,
    hosts.resolutionCoordinatorHost,
  );
  const dockRenderStateFacade = new QuestionDockRenderStateFacade(
    hosts.dockRenderStateHost,
  );
  const dockResolutionActionFacade = new QuestionDockResolutionActionFacade(
    hosts.dockResolutionActionHost,
    dockRenderStateFacade,
  );
  const postResolutionRuntimeFacade = new QuestionPostResolutionRuntimeFacade(
    hosts.postResolutionRuntimeHost,
  );
  const resolutionExecutionFacade = new QuestionResolutionExecutionFacade(
    hosts.resolutionExecutionHost,
    {
      markResolvedQuestionRequest: (requestId, tabId) => {
        viewHost.getTabRuntimeState(tabId)?.resolvedQuestionRequestIds.add(requestId);
      },
      applyResolvedQuestionState: (resolution, tabId) => {
        resolutionCoordinator.applyResolvedQuestionState(resolution, tabId);
      },
      followUpAfterResolution: (tabId) =>
        postResolutionRuntimeFacade.followUpAfterResolution(tabId),
    },
  );
  const dockCoordinator = new QuestionDockCoordinator(
    hosts.dockCoordinatorHost,
    dockRenderStateFacade,
    dockResolutionActionFacade,
    resolutionExecutionFacade,
  );
  const resolutionFlowCoordinatorHost: QuestionResolutionFlowCoordinatorHost = {
    getActiveTabId: () => viewHost.getActiveTabId(),
  };
  const resolutionFlowCoordinator = new QuestionResolutionFlowCoordinator(
    resolutionFlowCoordinatorHost,
    {
      dockCoordinator,
      inlineResolutionAction: inlineResolutionActionFacade,
      resolutionExecution: resolutionExecutionFacade,
    },
  );

  return {
    inlineCardRenderer,
    resolutionCoordinator,
    dockCoordinator,
    resolutionFlowCoordinator,
  };
}
