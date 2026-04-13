import type { QuestionDisplayMode, QuestionRequest } from '../../../../src/core/types';
import { setLocale } from '../../../../src/i18n';
import { QuestionDockResolutionActionFacade } from '../../../../src/features/chat/services/QuestionDockResolutionActionFacade';
import {
  QuestionDockCoordinator,
  type QuestionDockCoordinatorHost,
  type QuestionDockRuntimeState,
} from '../../../../src/features/chat/services/QuestionDockCoordinator';
import {
  QuestionDockRenderStateFacade,
  type QuestionDockRenderStateFacadeHost,
} from '../../../../src/features/chat/services/QuestionDockRenderStateFacade';
import type { QuestionPostResolutionRuntimeFacade } from '../../../../src/features/chat/services/QuestionPostResolutionRuntimeFacade';
import {
  QuestionResolutionExecutionFacade,
  type QuestionResolutionExecutionFacadeHost,
} from '../../../../src/features/chat/services/QuestionResolutionExecutionFacade';
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

function createRuntimeState(
  overrides?: Partial<QuestionDockRuntimeState>,
): QuestionDockRuntimeState {
  return {
    pendingQuestionRequests: [],
    resolvedQuestionRequestIds: new Set(),
    questionDraftAnswers: new Map(),
    questionActiveGroupKeys: new Map(),
    questionActiveIndexes: new Map(),
    questionRequestWaiters: new Map(),
    ...overrides,
  };
}

function createCoordinator(options?: {
  activeTabId?: TabId | null;
  currentConversationSessionId?: string | null;
  questionDisplayMode?: QuestionDisplayMode;
  shouldUseAboveInputQuestionDock?: boolean;
  pendingQuestions?: QuestionRequest[];
  sessionIdsByTab?: Record<string, string | null>;
}) {
  const activeTabId = options?.activeTabId ?? 'tab-active';
  const runtimeByTab = new Map<TabId, QuestionDockRuntimeState>([
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

  const host: Mocked<
    QuestionDockCoordinatorHost
    & QuestionDockRenderStateFacadeHost
    & QuestionResolutionExecutionFacadeHost
  > = {
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    getQuestionDock: jest.fn().mockReturnValue(questionDock),
    getQuestionDisplayMode: jest.fn().mockReturnValue(options?.questionDisplayMode ?? 'all'),
    shouldUseAboveInputQuestionDock: jest
      .fn()
      .mockReturnValue(options?.shouldUseAboveInputQuestionDock ?? true),
    getCurrentConversationSessionId: jest.fn().mockReturnValue(
      options?.currentConversationSessionId ?? sessionIdsByTab.get(activeTabId ?? '') ?? null,
    ),
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
    getSessionIdForTab: jest.fn((tabId) => (tabId ? sessionIdsByTab.get(tabId) ?? null : null)),
    getPendingQuestions: jest
      .fn()
      .mockResolvedValue(options?.pendingQuestions ?? ([] as QuestionRequest[])),
    setTabNeedsAttention: jest.fn(),
    replyToQuestion: jest.fn().mockResolvedValue(undefined),
    rejectQuestion: jest.fn().mockResolvedValue(undefined),
  };
  const dockRenderState = new QuestionDockRenderStateFacade(host);
  const dockResolutionAction = new QuestionDockResolutionActionFacade(
    {
      getActiveTabId: () => host.getActiveTabId(),
      getTabRuntimeState: (tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null),
    },
    dockRenderState,
  );
  const resolutionExecution = new QuestionResolutionExecutionFacade(host);
  const applyResolvedQuestionState = jest.fn();
  const postResolutionRuntime: jest.Mocked<Pick<
    QuestionPostResolutionRuntimeFacade,
    'followUpAfterResolution'
  >> = {
    followUpAfterResolution: jest.fn().mockResolvedValue(undefined),
  };
  const coordinator = new QuestionDockCoordinator(
    host,
    dockRenderState,
    dockResolutionAction,
    resolutionExecution,
    {
      applyResolvedQuestionState,
    },
    postResolutionRuntime,
  );

  return {
    coordinator,
    host,
    runtimeByTab,
    applyResolvedQuestionState,
    postResolutionRuntime,
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
      coordinator,
      host,
      runtimeByTab,
      applyResolvedQuestionState,
      postResolutionRuntime,
      getLatestRenderState,
      getLatestCallbacks,
    } = createCoordinator();

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

  it('hydrates pending requests and background attention through one lifecycle path', async () => {
    const freshRequest = createQuestionRequest({
      id: 'request-fresh',
      sessionId: 'session-background',
    });
    const waiterOwnedRequest = createQuestionRequest({
      id: 'request-waiting',
      sessionId: 'session-background',
    });
    const resolvedServerRequest = createQuestionRequest({
      id: 'request-resolved',
      sessionId: 'session-background',
    });
    const otherSessionRequest = createQuestionRequest({
      id: 'request-other-session',
      sessionId: 'session-other',
    });
    const {
      coordinator,
      host,
      runtimeByTab,
    } = createCoordinator({
      pendingQuestions: [freshRequest, resolvedServerRequest, otherSessionRequest],
      sessionIdsByTab: {
        'tab-background': 'session-background',
      },
    });
    const backgroundRuntime = runtimeByTab.get('tab-background');
    if (!backgroundRuntime) {
      throw new Error('Expected background runtime');
    }

    backgroundRuntime.pendingQuestionRequests = [waiterOwnedRequest];
    backgroundRuntime.resolvedQuestionRequestIds.add(resolvedServerRequest.id);
    backgroundRuntime.resolvedQuestionRequestIds.add('request-gone');
    backgroundRuntime.questionDraftAnswers.set('request-stale', [['stale']]);
    backgroundRuntime.questionActiveGroupKeys.set('request-stale', 'group-stale');
    backgroundRuntime.questionActiveIndexes.set('request-stale', 0);
    backgroundRuntime.questionRequestWaiters.set(waiterOwnedRequest.id, {
      promise: Promise.resolve(),
      resolve: jest.fn(),
    });

    await expect(
      coordinator.refreshPendingQuestionsForTab('tab-background', 'session-background'),
    ).resolves.toEqual([freshRequest, waiterOwnedRequest]);

    expect(host.getPendingQuestions).toHaveBeenCalledTimes(1);
    expect(backgroundRuntime.pendingQuestionRequests).toEqual([
      freshRequest,
      waiterOwnedRequest,
    ]);
    expect(backgroundRuntime.questionDraftAnswers.get(freshRequest.id)).toEqual([[]]);
    expect(backgroundRuntime.questionDraftAnswers.has('request-stale')).toBe(false);
    expect(backgroundRuntime.questionActiveGroupKeys.has('request-stale')).toBe(false);
    expect(backgroundRuntime.questionActiveIndexes.has('request-stale')).toBe(false);
    expect(backgroundRuntime.resolvedQuestionRequestIds.has('request-gone')).toBe(false);
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-background', true);
  });

  it('clears stale background-tab question state when no session remains', async () => {
    const staleRequest = createQuestionRequest({
      id: 'request-stale',
      sessionId: 'session-stale',
    });
    const {
      coordinator,
      host,
      runtimeByTab,
    } = createCoordinator({
      sessionIdsByTab: {
        'tab-background': null,
      },
    });
    const backgroundRuntime = runtimeByTab.get('tab-background');
    if (!backgroundRuntime) {
      throw new Error('Expected background runtime');
    }

    backgroundRuntime.pendingQuestionRequests = [staleRequest];
    backgroundRuntime.resolvedQuestionRequestIds.add(staleRequest.id);
    backgroundRuntime.questionDraftAnswers.set(staleRequest.id, [['draft']]);
    backgroundRuntime.questionActiveGroupKeys.set(staleRequest.id, 'Programming');
    backgroundRuntime.questionActiveIndexes.set(staleRequest.id, 0);
    backgroundRuntime.questionRequestWaiters.set(staleRequest.id, {
      promise: Promise.resolve(),
      resolve: jest.fn(),
    });

    await expect(coordinator.refreshPendingQuestionsForTab('tab-background')).resolves.toEqual([]);

    expect(host.getPendingQuestions).not.toHaveBeenCalled();
    expect(backgroundRuntime.pendingQuestionRequests).toEqual([]);
    expect(backgroundRuntime.resolvedQuestionRequestIds.size).toBe(0);
    expect(backgroundRuntime.questionDraftAnswers.size).toBe(0);
    expect(backgroundRuntime.questionActiveGroupKeys.size).toBe(0);
    expect(backgroundRuntime.questionActiveIndexes.size).toBe(0);
    expect(backgroundRuntime.questionRequestWaiters.size).toBe(0);
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-background', false);
  });

  it('clears the active-tab lifecycle state and rerenders an empty dock', () => {
    const request = createQuestionRequest();
    const {
      coordinator,
      host,
      runtimeByTab,
      getLatestRenderState,
    } = createCoordinator();
    const activeRuntime = runtimeByTab.get('tab-active');
    if (!activeRuntime) {
      throw new Error('Expected active runtime');
    }

    activeRuntime.pendingQuestionRequests = [request];
    activeRuntime.questionDraftAnswers.set(request.id, [['TypeScript']]);
    activeRuntime.questionActiveGroupKeys.set(request.id, 'Programming');
    activeRuntime.questionActiveIndexes.set(request.id, 0);

    coordinator.clearPendingQuestionsForTab();

    expect(activeRuntime.pendingQuestionRequests).toEqual([]);
    expect(activeRuntime.questionDraftAnswers.size).toBe(0);
    expect(activeRuntime.questionActiveGroupKeys.size).toBe(0);
    expect(activeRuntime.questionActiveIndexes.size).toBe(0);
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-active', false);
    expect(getLatestRenderState()).toEqual({
      request: null,
      answers: [],
      displayMode: 'all',
    });
  });
});
