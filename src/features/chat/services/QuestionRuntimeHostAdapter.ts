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
  QuestionDockQueueRuntimeFacade,
  type QuestionDockQueueRuntimeFacadeHost,
  type QuestionDockQueueRuntimeState,
} from './QuestionDockQueueRuntimeFacade';
import {
  QuestionDockCoordinator,
  type QuestionDockCoordinatorHost,
  type QuestionDockCoordinatorRuntimeState,
} from './QuestionDockCoordinator';
import { QuestionDockWritebackFacade } from './QuestionDockWritebackFacade';
import {
  QuestionPendingRefreshRuntimeFacade,
  type QuestionPendingRefreshRuntimeFacadeHost,
  type QuestionPendingRefreshRuntimeState,
} from './QuestionPendingRefreshRuntimeFacade';
import {
  QuestionPostResolutionRuntimeFacade,
  type QuestionPostResolutionRuntimeFacadeHost,
} from './QuestionPostResolutionRuntimeFacade';
import {
  QuestionResolutionFlowCoordinator,
  type QuestionResolutionFlowCoordinatorHost,
} from './QuestionResolutionFlowCoordinator';
import { QuestionResolutionWritebackFacade } from './QuestionResolutionWritebackFacade';

type QuestionDockPort = Pick<QuestionDock, 'render'>;

export interface QuestionRuntimeState
  extends QuestionDockCoordinatorRuntimeState,
    QuestionDockQueueRuntimeState,
    QuestionPendingRefreshRuntimeState,
    QuestionInlineCardRuntimeState,
    QuestionResolutionCoordinatorRuntimeState {}

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
  getPendingQuestions(): Promise<QuestionRequest[]>;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<unknown>;
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
}

export interface QuestionRuntimeHosts {
  inlineCardRendererHost: QuestionInlineCardRendererHost;
  resolutionCoordinatorHost: QuestionResolutionCoordinatorHost;
  dockCoordinatorHost: QuestionDockCoordinatorHost;
  dockQueueRuntimeHost: QuestionDockQueueRuntimeFacadeHost;
  pendingRefreshRuntimeHost: QuestionPendingRefreshRuntimeFacadeHost;
  postResolutionRuntimeHost: QuestionPostResolutionRuntimeFacadeHost;
}

export interface QuestionRuntimeServices {
  inlineCardRenderer: QuestionInlineCardRenderer;
  resolutionCoordinator: QuestionResolutionCoordinator;
  dockCoordinator: QuestionDockCoordinator;
  resolutionFlowCoordinator: QuestionResolutionFlowCoordinator;
}

export function createQuestionRuntimeHosts(
  viewHost: QuestionRuntimeViewHost,
): QuestionRuntimeHosts {
  return {
    inlineCardRendererHost: {
      getActiveTabId: () => viewHost.getActiveTabId(),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      keepQuestionCardPinnedToBottom: (tabId: TabId | null) => {
        viewHost.keepQuestionCardPinnedToBottom(tabId);
      },
    },
    resolutionCoordinatorHost: {
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      shouldRenderQuestionResolutionCards: () => viewHost.shouldRenderQuestionResolutionCards(),
      keepQuestionCardPinnedToBottom: (tabId: TabId | null) => {
        viewHost.keepQuestionCardPinnedToBottom(tabId);
      },
    },
    dockCoordinatorHost: {
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      getActiveTabId: () => viewHost.getActiveTabId(),
      getCurrentConversationSessionId: () => viewHost.getCurrentConversationSessionId(),
      getSessionIdForTab: (tabId: TabId | null) => viewHost.getSessionIdForTab(tabId),
      getQuestionDock: () => viewHost.getQuestionDock(),
      getQuestionDisplayMode: () => viewHost.getQuestionDisplayMode(),
      shouldUseAboveInputQuestionDock: () => viewHost.shouldUseAboveInputQuestionDock(),
      setTabNeedsAttention: (tabId: TabId | null, needsAttention: boolean) => {
        viewHost.setTabNeedsAttention(tabId, needsAttention);
      },
      getPendingQuestions: () => viewHost.getPendingQuestions(),
      replyToQuestion: (requestId: string, answers: string[][]) =>
        viewHost.replyToQuestion(requestId, answers),
      rejectQuestion: (requestId: string) => viewHost.rejectQuestion(requestId),
    },
    dockQueueRuntimeHost: {
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      ensureTabRuntimeState: (tabId: TabId | null) => viewHost.ensureTabRuntimeState(tabId),
    },
    pendingRefreshRuntimeHost: {
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
    },
    postResolutionRuntimeHost: {
      getActiveTabId: () => viewHost.getActiveTabId(),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      getSessionIdForTab: (tabId: TabId | null) => viewHost.getSessionIdForTab(tabId),
      refreshTabSessionStatus: (
        tabId: TabId | null,
        sessionId: string | undefined,
        options: { suppressErrors?: boolean },
      ) => viewHost.refreshTabSessionStatus(tabId, sessionId, options),
      startConversationSyncLoop: () => {
        viewHost.startConversationSyncLoop();
      },
      syncVisibleConversationInBackground: () => viewHost.syncVisibleConversationInBackground(),
    },
  };
}

export function createQuestionRuntimeServices(
  viewHost: QuestionRuntimeViewHost,
  streamingInlineCardRenderer: StreamingInlineCardRenderer,
): QuestionRuntimeServices {
  let resolutionCoordinator!: QuestionResolutionCoordinator;
  let dockCoordinator!: QuestionDockCoordinator;

  const hosts = createQuestionRuntimeHosts(viewHost);

  const inlineCardRenderer = new QuestionInlineCardRenderer(
    streamingInlineCardRenderer,
    hosts.inlineCardRendererHost,
  );
  resolutionCoordinator = new QuestionResolutionCoordinator(
    inlineCardRenderer,
    hosts.resolutionCoordinatorHost,
  );
  const dockQueueRuntimeFacade = new QuestionDockQueueRuntimeFacade(
    hosts.dockQueueRuntimeHost,
  );
  const pendingRefreshRuntimeFacade = new QuestionPendingRefreshRuntimeFacade(
    hosts.pendingRefreshRuntimeHost,
  );
  const postResolutionRuntimeFacade = new QuestionPostResolutionRuntimeFacade(
    hosts.postResolutionRuntimeHost,
  );
  const dockWritebackFacade = new QuestionDockWritebackFacade({
    getActiveTabId: () => viewHost.getActiveTabId(),
    setTabNeedsAttention: (tabId, needsAttention) => {
      viewHost.setTabNeedsAttention(tabId, needsAttention);
    },
    renderQuestionDock: () => {
      dockCoordinator.render();
    },
  });
  const resolutionWritebackFacade = new QuestionResolutionWritebackFacade({
    markQuestionRequestResolved: (requestId, tabId) => {
      pendingRefreshRuntimeFacade.markQuestionRequestResolved(requestId, tabId);
    },
    applyResolvedQuestionState: (resolution, tabId) => {
      resolutionCoordinator.applyResolvedQuestionState(resolution, tabId);
    },
    followUpAfterResolution: (tabId) =>
      postResolutionRuntimeFacade.followUpAfterResolution(tabId),
  });
  dockCoordinator = new QuestionDockCoordinator(
    hosts.dockCoordinatorHost,
    dockQueueRuntimeFacade,
    pendingRefreshRuntimeFacade,
    dockWritebackFacade,
    resolutionWritebackFacade,
  );
  const resolutionFlowCoordinatorHost: QuestionResolutionFlowCoordinatorHost = {
    getActiveTabId: () => viewHost.getActiveTabId(),
    getQuestionDisplayMode: () => viewHost.getQuestionDisplayMode(),
    replyToQuestion: (requestId, answers) => viewHost.replyToQuestion(requestId, answers),
    rejectQuestion: (requestId) => viewHost.rejectQuestion(requestId),
  };
  const resolutionFlowCoordinator = new QuestionResolutionFlowCoordinator(
    resolutionFlowCoordinatorHost,
    {
      dockCoordinator,
      inlineCardRenderer,
      resolutionWriteback: resolutionWritebackFacade,
    },
  );

  return {
    inlineCardRenderer,
    resolutionCoordinator,
    dockCoordinator,
    resolutionFlowCoordinator,
  };
}
