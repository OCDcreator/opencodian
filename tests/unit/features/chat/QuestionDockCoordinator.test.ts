import type { QuestionDisplayMode, QuestionRequest } from '../../../../src/core/types';
import { setLocale } from '../../../../src/i18n';
import type { QuestionDockRefreshFacade } from '../../../../src/features/chat/services/QuestionDockRefreshFacade';
import {
  QuestionDockRenderStateFacade,
  type QuestionDockRenderStateFacadeHost,
} from '../../../../src/features/chat/services/QuestionDockRenderStateFacade';
import {
  QuestionDockWritebackFacade,
} from '../../../../src/features/chat/services/QuestionDockWritebackFacade';
import {
  QuestionDockQueueRuntimeFacade,
} from '../../../../src/features/chat/services/QuestionDockQueueRuntimeFacade';
import {
  QuestionDockCoordinator,
  type QuestionDockCoordinatorHost,
} from '../../../../src/features/chat/services/QuestionDockCoordinator';
import { QuestionPendingRefreshRuntimeFacade } from '../../../../src/features/chat/services/QuestionPendingRefreshRuntimeFacade';
import type { QuestionPostResolutionRuntimeFacade } from '../../../../src/features/chat/services/QuestionPostResolutionRuntimeFacade';
import { QuestionResolutionWritebackFacade } from '../../../../src/features/chat/services/QuestionResolutionWritebackFacade';
import type { TabId } from '../../../../src/features/chat/tabs';
import type {
  QuestionDockCallbacks,
  QuestionDockRenderState,
} from '../../../../src/features/chat/ui/QuestionDock';

interface TestRuntimeState {
  isStreaming: boolean;
  pendingQuestionRequests: QuestionRequest[];
  resolvedQuestionRequestIds: Set<string>;
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
  questionRequestWaiters: Map<string, { promise: Promise<void>; resolve: () => void }>;
}

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

function createRuntimeState(
  overrides?: Partial<TestRuntimeState>,
): TestRuntimeState {
  return {
    isStreaming: false,
    pendingQuestionRequests: [],
    resolvedQuestionRequestIds: new Set(),
    questionDraftAnswers: new Map(),
    questionActiveGroupKeys: new Map(),
    questionActiveIndexes: new Map(),
    questionRequestWaiters: new Map(),
    ...overrides,
  };
}

function createHost(options?: {
  activeTabId?: TabId | null;
  currentConversationSessionId?: string | null;
  questionDisplayMode?: QuestionDisplayMode;
  shouldUseAboveInputQuestionDock?: boolean;
}) {
  const activeTabId = options?.activeTabId ?? 'tab-active';
  const runtimeByTab = new Map<TabId, TestRuntimeState>([
    ['tab-active', createRuntimeState()],
  ]);
  let latestRenderState: QuestionDockRenderState | null = null;
  let latestCallbacks: QuestionDockCallbacks | null = null;
  let renderQuestionDockImpl: (() => void) | null = null;

  const questionDock = {
    render: jest.fn((state: QuestionDockRenderState, callbacks: QuestionDockCallbacks) => {
      latestRenderState = state;
      latestCallbacks = callbacks;
    }),
  };

  const host: Mocked<
    QuestionDockCoordinatorHost
    & Pick<QuestionDockRenderStateFacadeHost, 'getCurrentConversationSessionId'>
  > = {
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    getCurrentConversationSessionId: jest.fn().mockReturnValue(
      options?.currentConversationSessionId ?? 'session-1',
    ),
    getQuestionDock: jest.fn().mockReturnValue(questionDock),
    getQuestionDisplayMode: jest.fn().mockReturnValue(options?.questionDisplayMode ?? 'all'),
    shouldUseAboveInputQuestionDock: jest
      .fn()
      .mockReturnValue(options?.shouldUseAboveInputQuestionDock ?? true),
    setTabNeedsAttention: jest.fn(),
    replyToQuestion: jest.fn().mockResolvedValue(undefined),
    rejectQuestion: jest.fn().mockResolvedValue(undefined),
  };
  const dockRefresh: Mocked<Pick<
    QuestionDockRefreshFacade,
    'clearPendingQuestionsForTab' | 'refreshPendingQuestionsForTab'
  >> = {
    clearPendingQuestionsForTab: jest.fn(),
    refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([] as QuestionRequest[]),
  };
  const dockRenderState = new QuestionDockRenderStateFacade(host);
  const postResolutionRuntime: jest.Mocked<Pick<
    QuestionPostResolutionRuntimeFacade,
    'followUpAfterResolution'
  >> = {
    followUpAfterResolution: jest.fn().mockResolvedValue(undefined),
  };
  const pendingRefreshRuntime = new QuestionPendingRefreshRuntimeFacade({
    getTabRuntimeState: (tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null),
  });
  const renderQuestionDock = jest.fn(() => {
    renderQuestionDockImpl?.();
  });
  const dockWriteback = new QuestionDockWritebackFacade({
    getActiveTabId: () => host.getActiveTabId(),
    setTabNeedsAttention: (tabId, needsAttention) => {
      host.setTabNeedsAttention(tabId, needsAttention);
    },
    renderQuestionDock,
  });
  const dockQueueRuntime = new QuestionDockQueueRuntimeFacade({
    getTabRuntimeState: (tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null),
    ensureTabRuntimeState: (tabId) => {
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
    },
  });
  const applyResolvedQuestionState = jest.fn();
  const resolutionWriteback = new QuestionResolutionWritebackFacade({
    markQuestionRequestResolved: (requestId, tabId) => {
      pendingRefreshRuntime.markQuestionRequestResolved(requestId, tabId);
    },
    applyResolvedQuestionState: (resolution, tabId) => {
      applyResolvedQuestionState(resolution, tabId);
    },
    followUpAfterResolution: (tabId) =>
      postResolutionRuntime.followUpAfterResolution(tabId),
  });

  return {
    host,
    dockRefresh,
    dockRenderState,
    dockQueueRuntime,
    pendingRefreshRuntime,
    dockWriteback,
    renderQuestionDock,
    postResolutionRuntime,
    resolutionWriteback,
    applyResolvedQuestionState,
    runtimeByTab,
    questionDock,
    setRenderQuestionDockImpl(callback: (() => void) | null): void {
      renderQuestionDockImpl = callback;
    },
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

describe('QuestionDockCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLocale('en');
  });

  it('waits for above-input dock submission and runs the active-tab follow-up flow', async () => {
    const request = createQuestionRequest();
    const {
      host,
      dockRefresh,
      dockRenderState,
      dockQueueRuntime,
      pendingRefreshRuntime,
      dockWriteback,
      postResolutionRuntime,
      resolutionWriteback,
      applyResolvedQuestionState,
      runtimeByTab,
      setRenderQuestionDockImpl,
      getLatestCallbacks,
      getLatestRenderState,
    } = createHost();
    const coordinator = new QuestionDockCoordinator(
      host,
      dockRenderState,
      dockQueueRuntime,
      dockRefresh,
      dockWriteback,
      resolutionWriteback,
    );
    setRenderQuestionDockImpl(() => {
      coordinator.render();
    });

    const resolutionPromise = coordinator.waitForDockResolutionIfEnabled(request, 'tab-active');

    expect(getLatestRenderState().request).toEqual(request);

    const callbacks = getLatestCallbacks();
    callbacks.onAnswerChange(0, [' TypeScript ']);
    callbacks.onSubmit();

    await expect(resolutionPromise).resolves.toBe(true);

    expect(host.replyToQuestion).toHaveBeenCalledWith(request.id, [['TypeScript']]);
    expect(applyResolvedQuestionState).toHaveBeenCalledWith(
      expect.objectContaining({
        request,
        status: 'answered',
        answers: [['TypeScript']],
      }),
      'tab-active',
    );
    expect(postResolutionRuntime.followUpAfterResolution).toHaveBeenCalledWith('tab-active');
    expect(runtimeByTab.get('tab-active')?.pendingQuestionRequests).toEqual([]);
    expect(runtimeByTab.get('tab-active')?.resolvedQuestionRequestIds.has(request.id)).toBe(true);
  });

  it('delegates pending refresh orchestration to the refresh facade', async () => {
    const request = createQuestionRequest({
      id: 'request-background',
      sessionId: 'session-background',
    });
    const {
      dockRefresh,
      host,
      dockRenderState,
      dockQueueRuntime,
      dockWriteback,
      resolutionWriteback,
    } = createHost();
    dockRefresh.refreshPendingQuestionsForTab.mockResolvedValueOnce([request]);
    const coordinator = new QuestionDockCoordinator(
      host,
      dockRenderState,
      dockQueueRuntime,
      dockRefresh,
      dockWriteback,
      resolutionWriteback,
    );

    await expect(
      coordinator.refreshPendingQuestionsForTab('tab-background', 'session-background'),
    ).resolves.toEqual([request]);

    expect(dockRefresh.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-background',
      'session-background',
    );
  });

  it('delegates pending-question clearing to the refresh facade using the active tab by default', () => {
    const {
      dockRefresh,
      host,
      dockRenderState,
      dockQueueRuntime,
      dockWriteback,
      resolutionWriteback,
    } = createHost();
    const coordinator = new QuestionDockCoordinator(
      host,
      dockRenderState,
      dockQueueRuntime,
      dockRefresh,
      dockWriteback,
      resolutionWriteback,
    );

    coordinator.clearPendingQuestionsForTab();

    expect(dockRefresh.clearPendingQuestionsForTab).toHaveBeenCalledWith('tab-active');
  });

  it('renders an empty dock state when the above-input dock is disabled', () => {
    const request = createQuestionRequest();
    const {
      runtimeByTab,
      getLatestRenderState,
      host,
      dockRefresh,
      dockRenderState,
      dockQueueRuntime,
      dockWriteback,
      resolutionWriteback,
      setRenderQuestionDockImpl,
    } = createHost({
      shouldUseAboveInputQuestionDock: false,
    });
    runtimeByTab.get('tab-active')!.pendingQuestionRequests = [request];
    const coordinator = new QuestionDockCoordinator(
      host,
      dockRenderState,
      dockQueueRuntime,
      dockRefresh,
      dockWriteback,
      resolutionWriteback,
    );
    setRenderQuestionDockImpl(() => {
      coordinator.render();
    });

    coordinator.render();

    expect(getLatestRenderState()).toEqual({
      request: null,
      answers: [],
      displayMode: 'all',
    });
  });
});
