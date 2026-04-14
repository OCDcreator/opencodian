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
  getPendingQuestions(): Promise<QuestionRequest[]>;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
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
      getPendingQuestions: () => viewHost.getPendingQuestions(),
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
      replyToQuestion: (requestId: string, answers: string[][]) =>
        viewHost.replyToQuestion(requestId, answers),
      rejectQuestion: (requestId: string) => viewHost.rejectQuestion(requestId),
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
  const resolutionExecutionFacade = new QuestionResolutionExecutionFacade(
    hosts.resolutionExecutionHost,
  );
  const postResolutionRuntimeFacade = new QuestionPostResolutionRuntimeFacade(
    hosts.postResolutionRuntimeHost,
  );
  const dockCoordinator = new QuestionDockCoordinator(
    hosts.dockCoordinatorHost,
    dockRenderStateFacade,
    dockResolutionActionFacade,
    resolutionExecutionFacade,
    resolutionCoordinator,
    postResolutionRuntimeFacade,
  );
  const resolutionFlowCoordinatorHost: QuestionResolutionFlowCoordinatorHost = {
    getActiveTabId: () => viewHost.getActiveTabId(),
  };
  const resolutionFlowCoordinator = new QuestionResolutionFlowCoordinator(
    resolutionFlowCoordinatorHost,
    {
      dockCoordinator,
      inlineResolutionAction: inlineResolutionActionFacade,
    },
  );

  return {
    inlineCardRenderer,
    resolutionCoordinator,
    dockCoordinator,
    resolutionFlowCoordinator,
  };
}
