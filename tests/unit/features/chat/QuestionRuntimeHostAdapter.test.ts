import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../../src/core/types';
import { setLocale } from '../../../../src/i18n';
import { StreamingInlineCardRenderer } from '../../../../src/features/chat/runtime/StreamingInlineCardRenderer';
import type { QuestionDockRefreshFacadeHost } from '../../../../src/features/chat/services/QuestionDockRefreshFacade';
import type { QuestionDockRenderStateFacadeHost } from '../../../../src/features/chat/services/QuestionDockRenderStateFacade';
import { QuestionDockQueueRuntimeFacade } from '../../../../src/features/chat/services/QuestionDockQueueRuntimeFacade';
import { QuestionPendingRefreshRuntimeFacade } from '../../../../src/features/chat/services/QuestionPendingRefreshRuntimeFacade';
import { QuestionPostResolutionRuntimeFacade } from '../../../../src/features/chat/services/QuestionPostResolutionRuntimeFacade';
import {
  createQuestionRuntimeHosts,
  createQuestionRuntimeServices,
  type QuestionRuntimeState,
  type QuestionRuntimeViewHost,
} from '../../../../src/features/chat/services/QuestionRuntimeHostAdapter';
import type { TabId } from '../../../../src/features/chat/tabs';
import type {
  QuestionDockCallbacks,
  QuestionDockRenderState,
} from '../../../../src/features/chat/ui/QuestionDock';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createQuestionRequest(overrides?: Partial<QuestionRequest>): QuestionRequest {
  return {
    id: 'request-1',
    sessionId: 'session-1',
    questions: [
      {
        header: 'Programming',
        question: 'Which language are you using?',
        options: [
          { label: 'TypeScript', description: '' },
          { label: 'Python', description: '' },
        ],
        custom: true,
      },
    ],
    ...overrides,
  };
}

function createRuntimeState(overrides?: Partial<QuestionRuntimeState>): QuestionRuntimeState {
  return {
    isStreaming: false,
    questionInlineCardEl: null,
    pendingQuestionResolution: null,
    pendingQuestionRequests: [],
    resolvedQuestionRequestIds: new Set(),
    questionDraftAnswers: new Map(),
    questionActiveGroupKeys: new Map(),
    questionActiveIndexes: new Map(),
    questionRequestWaiters: new Map(),
    ...overrides,
  };
}

function createViewHost(options?: {
  activeTabId?: TabId | null;
  currentConversationSessionId?: string | null;
  questionDisplayMode?: QuestionDisplayMode;
  shouldUseAboveInputQuestionDock?: boolean;
  shouldRenderQuestionResolutionCards?: boolean;
  sessionIdsByTab?: Record<string, string | null>;
}) {
  const activeTabId = options?.activeTabId ?? 'tab-active';
  const runtimeByTab = new Map<TabId, QuestionRuntimeState>([
    ['tab-active', createRuntimeState()],
  ]);
  const sessionIdsByTab = new Map<TabId, string | null>([
    ['tab-active', options?.sessionIdsByTab?.['tab-active'] ?? 'session-1'],
  ]);
  let latestRenderState: QuestionDockRenderState | null = null;
  let latestCallbacks: QuestionDockCallbacks | null = null;

  for (const [tabId, sessionId] of Object.entries(options?.sessionIdsByTab ?? {})) {
    sessionIdsByTab.set(tabId, sessionId);
    if (!runtimeByTab.has(tabId)) {
      runtimeByTab.set(tabId, createRuntimeState());
    }
  }

  const questionDock = {
    render: jest.fn((state: QuestionDockRenderState, callbacks: QuestionDockCallbacks) => {
      latestRenderState = state;
      latestCallbacks = callbacks;
    }),
  };

  const viewHost: Mocked<QuestionRuntimeViewHost> = {
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
    ensureTabRuntimeState: jest.fn((tabId) => {
      if (!tabId) {
        return null;
      }
      const existing = runtimeByTab.get(tabId);
      if (existing) {
        return existing;
      }
      const created = createRuntimeState();
      runtimeByTab.set(tabId, created);
      return created;
    }),
    getCurrentConversationSessionId: jest.fn().mockReturnValue(
      options?.currentConversationSessionId ?? sessionIdsByTab.get(activeTabId ?? '') ?? null,
    ),
    getSessionIdForTab: jest.fn((tabId) => (tabId ? sessionIdsByTab.get(tabId) ?? null : null)),
    getQuestionDock: jest.fn().mockReturnValue(questionDock),
    getQuestionDisplayMode: jest.fn().mockReturnValue(options?.questionDisplayMode ?? 'all'),
    shouldUseAboveInputQuestionDock: jest
      .fn()
      .mockReturnValue(options?.shouldUseAboveInputQuestionDock ?? true),
    shouldRenderQuestionResolutionCards: jest
      .fn()
      .mockReturnValue(options?.shouldRenderQuestionResolutionCards ?? false),
    keepQuestionCardPinnedToBottom: jest.fn(),
    setTabNeedsAttention: jest.fn(),
    getPendingQuestions: jest.fn().mockResolvedValue([] as QuestionRequest[]),
    replyToQuestion: jest.fn().mockResolvedValue(undefined),
    rejectQuestion: jest.fn().mockResolvedValue(undefined),
    refreshTabSessionStatus: jest.fn().mockResolvedValue(null),
    startConversationSyncLoop: jest.fn(),
    syncVisibleConversationInBackground: jest.fn().mockResolvedValue(undefined),
  };

  return {
    viewHost,
    runtimeByTab,
    questionDock,
    getLatestRenderState(): QuestionDockRenderState {
      if (!latestRenderState) {
        throw new Error('Question dock was not rendered');
      }
      return latestRenderState;
    },
    getLatestCallbacks(): QuestionDockCallbacks {
      if (!latestCallbacks) {
        throw new Error('Question dock callbacks were not captured');
      }
      return latestCallbacks;
    },
  };
}

describe('QuestionRuntimeHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLocale('en');
  });

  it('derives inline-card, resolution, and dock hosts from one view host', async () => {
    const request = createQuestionRequest();
    const { viewHost, runtimeByTab } = createViewHost({
      questionDisplayMode: 'single',
      shouldRenderQuestionResolutionCards: true,
    });

    const hosts = createQuestionRuntimeHosts(viewHost);

    expect(hosts.inlineCardRendererHost.getActiveTabId()).toBe('tab-active');
    expect(hosts.inlineCardRendererHost.getTabRuntimeState('tab-active')).toBe(
      runtimeByTab.get('tab-active'),
    );
    hosts.inlineCardRendererHost.keepQuestionCardPinnedToBottom('tab-active');

    expect(hosts.resolutionCoordinatorHost.getTabRuntimeState('tab-active')).toBe(
      runtimeByTab.get('tab-active'),
    );
    expect(hosts.resolutionCoordinatorHost.shouldRenderQuestionResolutionCards()).toBe(true);

    expect(hosts.dockCoordinatorHost.getQuestionDisplayMode()).toBe('single');
    const dockRenderStateHost: QuestionDockRenderStateFacadeHost = hosts.dockRenderStateHost;
    expect(dockRenderStateHost.getActiveTabId()).toBe('tab-active');
    expect(dockRenderStateHost.getCurrentConversationSessionId()).toBe('session-1');
    expect(dockRenderStateHost.getQuestionDisplayMode()).toBe('single');
    expect(dockRenderStateHost.shouldUseAboveInputQuestionDock()).toBe(true);
    const dockRefreshHost: QuestionDockRefreshFacadeHost = hosts.dockRefreshHost;
    expect(dockRefreshHost.getSessionIdForTab('tab-active')).toBe('session-1');
    await dockRefreshHost.getPendingQuestions();
    await hosts.dockCoordinatorHost.replyToQuestion(request.id, [['TypeScript']]);
    await hosts.dockCoordinatorHost.rejectQuestion(request.id);
    const postResolutionRuntimeFacade = new QuestionPostResolutionRuntimeFacade(
      hosts.postResolutionRuntimeHost,
    );
    const pendingRefreshRuntimeFacade = new QuestionPendingRefreshRuntimeFacade(
      hosts.pendingRefreshRuntimeHost,
    );
    const dockQueueRuntimeFacade = new QuestionDockQueueRuntimeFacade(
      hosts.dockQueueRuntimeHost,
    );
    pendingRefreshRuntimeFacade.markQuestionRequestResolved(request.id, 'tab-active');
    dockQueueRuntimeFacade.getOrCreateQuestionWaiter(request.id, 'tab-active');
    dockQueueRuntimeFacade.enqueuePendingQuestionRequest(request, 'tab-active', 'single');
    dockQueueRuntimeFacade.removePendingQuestionRequest(request.id, 'tab-active');
    await postResolutionRuntimeFacade.followUpAfterResolution('tab-active');

    expect(viewHost.keepQuestionCardPinnedToBottom).toHaveBeenCalledWith('tab-active');
    expect(viewHost.getPendingQuestions).toHaveBeenCalledTimes(1);
    expect(viewHost.replyToQuestion).toHaveBeenCalledWith(request.id, [['TypeScript']]);
    expect(viewHost.rejectQuestion).toHaveBeenCalledWith(request.id);
    expect(viewHost.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-1',
      { suppressErrors: true },
    );
    expect(runtimeByTab.get('tab-active')?.resolvedQuestionRequestIds.has(request.id)).toBe(true);
    expect(viewHost.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(viewHost.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);
  });

  it('wires dock resolution through the shared question runtime bundle', async () => {
    const request = createQuestionRequest();
    const { viewHost, runtimeByTab, getLatestCallbacks, getLatestRenderState } = createViewHost();
    const streamingInlineCardRenderer = new StreamingInlineCardRenderer({
      getActiveTabId: () => 'tab-active',
      getTabRuntimeState: () => ({ streamingMessageEl: null }),
      revealStreamingAssistantMessageElement: () => null,
    });

    const services = createQuestionRuntimeServices(viewHost, streamingInlineCardRenderer);
    const resolutionPromise = services.dockCoordinator.waitForDockResolutionIfEnabled(
      request,
      'tab-active',
    );

    expect(getLatestRenderState().request).toEqual(request);

    const callbacks = getLatestCallbacks();
    callbacks.onAnswerChange(0, [' TypeScript ']);
    callbacks.onSubmit();

    await expect(resolutionPromise).resolves.toBe(true);

    expect(viewHost.replyToQuestion).toHaveBeenCalledWith(request.id, [['TypeScript']]);
    expect(viewHost.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-1',
      { suppressErrors: true },
    );
    expect(viewHost.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(viewHost.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);
    expect(runtimeByTab.get('tab-active')?.pendingQuestionResolution).toEqual({
      request,
      status: 'answered',
      answers: [['TypeScript']],
    });
  });

  it('wires inline fallback resolution through the shared question runtime bundle', async () => {
    const request = createQuestionRequest();
    const { viewHost, runtimeByTab } = createViewHost({
      shouldUseAboveInputQuestionDock: false,
      shouldRenderQuestionResolutionCards: false,
    });
    const streamingInlineCardRenderer = new StreamingInlineCardRenderer({
      getActiveTabId: () => 'tab-active',
      getTabRuntimeState: () => ({ streamingMessageEl: null }),
      revealStreamingAssistantMessageElement: () => null,
    });
    const services = createQuestionRuntimeServices(viewHost, streamingInlineCardRenderer);
    const collectActionSpy = jest.spyOn(services.inlineCardRenderer, 'collectAction').mockResolvedValue({
      type: 'reply',
      answers: [['TypeScript']],
    });

    await services.resolutionFlowCoordinator.showQuestionDialog(request, 'tab-active');

    expect(collectActionSpy).toHaveBeenCalledWith(request, 'all', 'tab-active');
    expect(viewHost.replyToQuestion).toHaveBeenCalledWith(request.id, [['TypeScript']]);
    expect(viewHost.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-1',
      { suppressErrors: true },
    );
    expect(viewHost.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(viewHost.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);
    expect(runtimeByTab.get('tab-active')?.resolvedQuestionRequestIds.has(request.id)).toBe(true);
    expect(runtimeByTab.get('tab-active')?.pendingQuestionResolution).toEqual({
      request,
      status: 'answered',
      answers: [['TypeScript']],
    });
  });
});
