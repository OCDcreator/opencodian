import type { QuestionDisplayMode, QuestionRequest } from '../../../../src/core/types';
import {
  QuestionDockRenderStateFacade,
  type QuestionDockRenderStateFacadeHost,
  type QuestionDockRenderStateRuntimeState,
} from '../../../../src/features/chat/services/QuestionDockRenderStateFacade';
import type { TabId } from '../../../../src/features/chat/tabs';

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
  overrides?: Partial<QuestionDockRenderStateRuntimeState>,
): QuestionDockRenderStateRuntimeState {
  return {
    pendingQuestionRequests: [],
    questionDraftAnswers: new Map(),
    questionActiveGroupKeys: new Map(),
    questionActiveIndexes: new Map(),
    ...overrides,
  };
}

function createHost(options?: {
  activeTabId?: TabId | null;
  currentConversationSessionId?: string | null;
  displayMode?: QuestionDisplayMode;
  shouldUseAboveInputQuestionDock?: boolean;
  runtimeByTab?: Map<TabId, QuestionDockRenderStateRuntimeState>;
}) {
  const activeTabId = options?.activeTabId ?? 'tab-active';
  const runtimeByTab = options?.runtimeByTab ?? new Map<TabId, QuestionDockRenderStateRuntimeState>([
    ['tab-active', createRuntimeState()],
  ]);

  const host: Mocked<QuestionDockRenderStateFacadeHost> = {
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    getCurrentConversationSessionId: jest.fn().mockReturnValue(
      options?.currentConversationSessionId ?? 'session-1',
    ),
    getQuestionDisplayMode: jest.fn().mockReturnValue(options?.displayMode ?? 'all'),
    shouldUseAboveInputQuestionDock: jest
      .fn()
      .mockReturnValue(options?.shouldUseAboveInputQuestionDock ?? true),
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
  };

  return {
    host,
    runtimeByTab,
    facade: new QuestionDockRenderStateFacade(host),
  };
}

describe('QuestionDockRenderStateFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects the active request when the dock is enabled and the session matches', () => {
    const request = createQuestionRequest();
    const { facade, runtimeByTab } = createHost();
    const runtime = runtimeByTab.get('tab-active')!;
    runtime.pendingQuestionRequests = [request];

    expect(facade.resolveRenderState()).toEqual({
      kind: 'active',
      tabId: 'tab-active',
      runtime,
      request,
      displayMode: 'all',
    });
  });

  it('returns an empty render state when the above-input dock is disabled', () => {
    const request = createQuestionRequest();
    const { facade, runtimeByTab } = createHost({
      shouldUseAboveInputQuestionDock: false,
    });
    runtimeByTab.get('tab-active')!.pendingQuestionRequests = [request];

    expect(facade.resolveRenderState()).toEqual({
      kind: 'empty',
      displayMode: 'all',
    });
  });

  it('returns an empty render state when the active request belongs to another session', () => {
    const request = createQuestionRequest({ sessionId: 'session-other' });
    const { facade, runtimeByTab } = createHost();
    runtimeByTab.get('tab-active')!.pendingQuestionRequests = [request];

    expect(facade.resolveRenderState()).toEqual({
      kind: 'empty',
      displayMode: 'all',
    });
  });

  it('skips rendering when active runtime disappears after request selection', () => {
    const request = createQuestionRequest();
    const runtime = createRuntimeState({
      pendingQuestionRequests: [request],
    });
    const host: Mocked<QuestionDockRenderStateFacadeHost> = {
      getActiveTabId: jest.fn().mockReturnValue('tab-active'),
      getCurrentConversationSessionId: jest.fn().mockReturnValue('session-1'),
      getQuestionDisplayMode: jest.fn().mockReturnValue('all'),
      shouldUseAboveInputQuestionDock: jest.fn().mockReturnValue(true),
      getTabRuntimeState: jest
        .fn()
        .mockReturnValueOnce(runtime)
        .mockReturnValueOnce(null),
    };
    const facade = new QuestionDockRenderStateFacade(host);

    expect(facade.resolveRenderState()).toEqual({
      kind: 'skip',
    });
  });
});
