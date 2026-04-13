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
  QuestionInlineResolutionActionFacade,
  type QuestionInlineResolutionActionFacadeHost,
} from './QuestionInlineResolutionActionFacade';
import {
  QuestionDockRefreshFacade,
  type QuestionDockRefreshFacadeHost,
} from './QuestionDockRefreshFacade';
import {
  QuestionDockResolutionActionFacade,
  type QuestionDockResolutionActionFacadeHost,
} from './QuestionDockResolutionActionFacade';
import {
  QuestionDockRenderStateFacade,
  type QuestionDockRenderStateRuntimeState,
  type QuestionDockRenderStateFacadeHost,
} from './QuestionDockRenderStateFacade';
import {
  QuestionDockQueueRuntimeFacade,
  type QuestionDockQueueRuntimeFacadeHost,
  type QuestionDockQueueRuntimeState,
} from './QuestionDockQueueRuntimeFacade';
import {
  QuestionDockCoordinator,
  type QuestionDockCoordinatorHost,
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
  type QuestionPostResolutionRuntimeState,
} from './QuestionPostResolutionRuntimeFacade';
import {
  QuestionResolutionApplyFacade,
} from './QuestionResolutionApplyFacade';
import {
  QuestionResolutionFlowCoordinator,
  type QuestionResolutionFlowCoordinatorHost,
} from './QuestionResolutionFlowCoordinator';
import {
  QuestionResolutionExecutionFacade,
  type QuestionResolutionExecutionFacadeHost,
} from './QuestionResolutionExecutionFacade';
import { QuestionResolutionWritebackFacade } from './QuestionResolutionWritebackFacade';

type QuestionDockPort = Pick<QuestionDock, 'render'>;

export interface QuestionRuntimeState
  extends QuestionDockRenderStateRuntimeState,
    QuestionDockQueueRuntimeState,
    QuestionPendingRefreshRuntimeState,
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
  inlineResolutionActionHost: QuestionInlineResolutionActionFacadeHost;
  resolutionCoordinatorHost: QuestionResolutionCoordinatorHost;
  dockCoordinatorHost: QuestionDockCoordinatorHost;
  dockRefreshHost: QuestionDockRefreshFacadeHost;
  dockRenderStateHost: QuestionDockRenderStateFacadeHost;
  dockResolutionActionHost: QuestionDockResolutionActionFacadeHost;
  resolutionExecutionHost: QuestionResolutionExecutionFacadeHost;
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
    },
    dockRefreshHost: {
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      getSessionIdForTab: (tabId: TabId | null) => viewHost.getSessionIdForTab(tabId),
      getPendingQuestions: () => viewHost.getPendingQuestions(),
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
  const inlineResolutionActionFacade = new QuestionInlineResolutionActionFacade(
    hosts.inlineResolutionActionHost,
    inlineCardRenderer,
  );
  resolutionCoordinator = new QuestionResolutionCoordinator(
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
  const resolutionExecutionFacade = new QuestionResolutionExecutionFacade(
    hosts.resolutionExecutionHost,
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
  const dockRefreshFacade = new QuestionDockRefreshFacade(
    hosts.dockRefreshHost,
    pendingRefreshRuntimeFacade,
    dockWritebackFacade,
  );
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
  const resolutionApplyFacade = new QuestionResolutionApplyFacade(
    resolutionExecutionFacade,
    resolutionWritebackFacade,
  );
  dockCoordinator = new QuestionDockCoordinator(
    hosts.dockCoordinatorHost,
    dockRenderStateFacade,
    dockResolutionActionFacade,
    resolutionApplyFacade,
    dockQueueRuntimeFacade,
    dockRefreshFacade,
    dockWritebackFacade,
  );
  const resolutionFlowCoordinatorHost: QuestionResolutionFlowCoordinatorHost = {
    getActiveTabId: () => viewHost.getActiveTabId(),
    getQuestionDisplayMode: () => viewHost.getQuestionDisplayMode(),
  };
  const resolutionFlowCoordinator = new QuestionResolutionFlowCoordinator(
    resolutionFlowCoordinatorHost,
    {
      dockCoordinator,
      inlineResolutionAction: inlineResolutionActionFacade,
      resolutionApply: resolutionApplyFacade,
    },
  );

  return {
    inlineCardRenderer,
    resolutionCoordinator,
    dockCoordinator,
    resolutionFlowCoordinator,
  };
}
