import type { QuestionDisplayMode, QuestionRequest } from '../../../../src/core/types';
import { setLocale } from '../../../../src/i18n';
import {
  QuestionDockQueueRuntimeFacade,
} from '../../../../src/features/chat/services/QuestionDockQueueRuntimeFacade';
import {
  QuestionDockCoordinator,
  type QuestionDockCoordinatorHost,
} from '../../../../src/features/chat/services/QuestionDockCoordinator';
import { QuestionPendingRefreshRuntimeFacade } from '../../../../src/features/chat/services/QuestionPendingRefreshRuntimeFacade';
import { QuestionPendingRefreshWritebackFacade } from '../../../../src/features/chat/services/QuestionPendingRefreshWritebackFacade';
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
  sessionIdsByTab?: Record<string, string | null>;
}) {
  const activeTabId = options?.activeTabId ?? 'tab-active';
  const runtimeByTab = new Map<TabId, TestRuntimeState>([
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

  const host: Mocked<QuestionDockCoordinatorHost> = {
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    getCurrentConversationSessionId: jest.fn().mockReturnValue(
      options?.currentConversationSessionId ?? sessionIdsByTab.get(activeTabId ?? '') ?? null,
    ),
    getSessionIdForTab: jest.fn((tabId) => (tabId ? sessionIdsByTab.get(tabId) ?? null : null)),
    getQuestionDock: jest.fn().mockReturnValue(questionDock),
    getQuestionDisplayMode: jest.fn().mockReturnValue(options?.questionDisplayMode ?? 'all'),
    shouldUseAboveInputQuestionDock: jest.fn().mockReturnValue(options?.shouldUseAboveInputQuestionDock ?? true),
    setTabNeedsAttention: jest.fn(),
    getPendingQuestions: jest.fn().mockResolvedValue([] as QuestionRequest[]),
    replyToQuestion: jest.fn().mockResolvedValue(undefined),
    rejectQuestion: jest.fn().mockResolvedValue(undefined),
  };
  const postResolutionRuntime: jest.Mocked<Pick<
    QuestionPostResolutionRuntimeFacade,
    'followUpAfterResolution'
  >> = {
    followUpAfterResolution: jest.fn().mockResolvedValue(undefined),
  };
  const pendingRefreshRuntime = new QuestionPendingRefreshRuntimeFacade({
    getTabRuntimeState: (tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null),
  });
  const renderQuestionDock = jest.fn();
  const pendingRefreshWriteback = new QuestionPendingRefreshWritebackFacade({
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
    dockQueueRuntime,
    pendingRefreshRuntime,
    pendingRefreshWriteback,
    renderQuestionDock,
    postResolutionRuntime,
    resolutionWriteback,
    applyResolvedQuestionState,
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

describe('QuestionDockCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLocale('en');
  });

  it('waits for above-input dock submission and runs the active-tab follow-up flow', async () => {
    const request = createQuestionRequest();
    const {
      host,
      dockQueueRuntime,
      pendingRefreshRuntime,
      pendingRefreshWriteback,
      postResolutionRuntime,
      resolutionWriteback,
      applyResolvedQuestionState,
      runtimeByTab,
      getLatestCallbacks,
      getLatestRenderState,
    } = createHost();
    const coordinator = new QuestionDockCoordinator(
      host,
      dockQueueRuntime,
      pendingRefreshRuntime,
      pendingRefreshWriteback,
      resolutionWriteback,
    );

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

  it('preserves waiter-owned background requests across refresh and marks the tab as needing attention', async () => {
    const waitingRequest = createQuestionRequest({
      id: 'request-background',
      sessionId: 'session-background',
    });
    const {
      host,
      dockQueueRuntime,
      pendingRefreshRuntime,
      pendingRefreshWriteback,
      resolutionWriteback,
      runtimeByTab,
    } = createHost({
      activeTabId: 'tab-active',
      sessionIdsByTab: {
        'tab-active': 'session-active',
        'tab-background': 'session-background',
      },
    });
    const backgroundRuntime = createRuntimeState({
      pendingQuestionRequests: [waitingRequest],
    });
    let resolve = () => {};
    const promise = new Promise<void>((resolver) => {
      resolve = resolver;
    });
    backgroundRuntime.questionRequestWaiters.set(waitingRequest.id, { promise, resolve });
    runtimeByTab.set('tab-background', backgroundRuntime);
    host.getPendingQuestions.mockResolvedValueOnce([]);
    const coordinator = new QuestionDockCoordinator(
      host,
      dockQueueRuntime,
      pendingRefreshRuntime,
      pendingRefreshWriteback,
      resolutionWriteback,
    );

    const refreshed = await coordinator.refreshPendingQuestionsForTab('tab-background', 'session-background');

    expect(refreshed).toEqual([waitingRequest]);
    expect(backgroundRuntime.pendingQuestionRequests).toEqual([waitingRequest]);
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-background', true);
  });

  it('renders an empty dock state when the above-input dock is disabled', () => {
    const request = createQuestionRequest();
    const {
      runtimeByTab,
      getLatestRenderState,
      host,
      dockQueueRuntime,
      pendingRefreshRuntime,
      pendingRefreshWriteback,
      resolutionWriteback,
    } = createHost({
      shouldUseAboveInputQuestionDock: false,
    });
    runtimeByTab.get('tab-active')!.pendingQuestionRequests = [request];
    const coordinator = new QuestionDockCoordinator(
      host,
      dockQueueRuntime,
      pendingRefreshRuntime,
      pendingRefreshWriteback,
      resolutionWriteback,
    );

    coordinator.render();

    expect(getLatestRenderState()).toEqual({
      request: null,
      answers: [],
      displayMode: 'all',
    });
  });
});
