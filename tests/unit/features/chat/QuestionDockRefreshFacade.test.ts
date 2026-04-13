import type { QuestionRequest } from '../../../../src/core/types';
import {
  QuestionDockRefreshFacade,
  type QuestionDockRefreshFacadeHost,
} from '../../../../src/features/chat/services/QuestionDockRefreshFacade';
import { QuestionDockWritebackFacade } from '../../../../src/features/chat/services/QuestionDockWritebackFacade';
import { QuestionPendingRefreshRuntimeFacade } from '../../../../src/features/chat/services/QuestionPendingRefreshRuntimeFacade';
import type { TabId } from '../../../../src/features/chat/tabs';

interface TestRuntimeState {
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

function createRuntimeState(overrides?: Partial<TestRuntimeState>): TestRuntimeState {
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

function createHost(options?: {
  activeTabId?: TabId | null;
  sessionIdsByTab?: Record<string, string | null>;
}) {
  const activeTabId = options?.activeTabId ?? 'tab-active';
  const runtimeByTab = new Map<TabId, TestRuntimeState>([
    ['tab-active', createRuntimeState()],
  ]);
  const sessionIdsByTab = new Map<TabId, string | null>([
    ['tab-active', options?.sessionIdsByTab?.['tab-active'] ?? 'session-1'],
  ]);

  for (const [tabId, sessionId] of Object.entries(options?.sessionIdsByTab ?? {})) {
    sessionIdsByTab.set(tabId, sessionId);
    if (!runtimeByTab.has(tabId)) {
      runtimeByTab.set(tabId, createRuntimeState());
    }
  }

  const host: Mocked<QuestionDockRefreshFacadeHost> = {
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
    getSessionIdForTab: jest.fn((tabId) => (tabId ? sessionIdsByTab.get(tabId) ?? null : null)),
    getPendingQuestions: jest.fn().mockResolvedValue([] as QuestionRequest[]),
  };
  const pendingRefreshRuntime = new QuestionPendingRefreshRuntimeFacade({
    getTabRuntimeState: (tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null),
  });
  const setTabNeedsAttention = jest.fn();
  const renderQuestionDock = jest.fn();
  const dockWriteback = new QuestionDockWritebackFacade({
    getActiveTabId: () => activeTabId,
    setTabNeedsAttention,
    renderQuestionDock,
  });
  const dockRefresh = new QuestionDockRefreshFacade(
    host,
    pendingRefreshRuntime,
    dockWriteback,
  );

  return {
    host,
    runtimeByTab,
    pendingRefreshRuntime,
    dockWriteback,
    dockRefresh,
    setTabNeedsAttention,
    renderQuestionDock,
  };
}

describe('QuestionDockRefreshFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves waiter-owned background requests across refresh and marks the tab as needing attention', async () => {
    const waitingRequest = createQuestionRequest({
      id: 'request-background',
      sessionId: 'session-background',
    });
    const {
      dockRefresh,
      host,
      renderQuestionDock,
      runtimeByTab,
      setTabNeedsAttention,
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

    const refreshed = await dockRefresh.refreshPendingQuestionsForTab('tab-background');

    expect(refreshed).toEqual([waitingRequest]);
    expect(backgroundRuntime.pendingQuestionRequests).toEqual([waitingRequest]);
    expect(setTabNeedsAttention).toHaveBeenCalledWith('tab-background', true);
    expect(renderQuestionDock).not.toHaveBeenCalled();
  });

  it('clears active-tab pending state and rerenders when no session is available', async () => {
    const request = createQuestionRequest();
    const {
      dockRefresh,
      renderQuestionDock,
      runtimeByTab,
      setTabNeedsAttention,
    } = createHost();
    const runtime = runtimeByTab.get('tab-active')!;
    runtime.pendingQuestionRequests = [request];
    runtime.resolvedQuestionRequestIds.add(request.id);
    runtime.questionDraftAnswers.set(request.id, [['draft']]);
    runtime.questionActiveGroupKeys.set(request.id, 'Programming');
    runtime.questionActiveIndexes.set(request.id, 0);
    runtime.questionRequestWaiters.set(request.id, {
      promise: Promise.resolve(),
      resolve: () => undefined,
    });

    await expect(dockRefresh.refreshPendingQuestionsForTab('tab-active', null)).resolves.toEqual([]);

    expect(runtime.pendingQuestionRequests).toEqual([]);
    expect(runtime.resolvedQuestionRequestIds.size).toBe(0);
    expect(runtime.questionDraftAnswers.size).toBe(0);
    expect(runtime.questionActiveGroupKeys.size).toBe(0);
    expect(runtime.questionActiveIndexes.size).toBe(0);
    expect(runtime.questionRequestWaiters.size).toBe(0);
    expect(setTabNeedsAttention).toHaveBeenCalledWith('tab-active', false);
    expect(renderQuestionDock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the current runtime requests when refresh fails', async () => {
    const request = createQuestionRequest();
    const { dockRefresh, host, renderQuestionDock, runtimeByTab, setTabNeedsAttention } = createHost();
    runtimeByTab.get('tab-active')!.pendingQuestionRequests = [request];
    host.getPendingQuestions.mockRejectedValueOnce(new Error('refresh failed'));

    await expect(dockRefresh.refreshPendingQuestionsForTab('tab-active')).resolves.toEqual([request]);

    expect(setTabNeedsAttention).not.toHaveBeenCalled();
    expect(renderQuestionDock).not.toHaveBeenCalled();
  });
});
