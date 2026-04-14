import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../../src/core/types';
import type { QuestionRuntimeState } from '../../../../src/features/chat/services/QuestionRuntimeHostAdapter';
import type {
  QuestionRuntimeQuestionApiPort,
  QuestionRuntimeSettingsPort,
  QuestionRuntimeTabAttentionPort,
} from '../../../../src/features/chat/services/QuestionRuntimeViewHostAdapter';
import {
  createQuestionRuntimeViewHost,
  type QuestionRuntimeViewHostFactoryHost,
} from '../../../../src/features/chat/services/QuestionRuntimeViewHostFactory';
import type { QuestionDockRenderState } from '../../../../src/features/chat/ui/QuestionDock';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createRuntimeState(): QuestionRuntimeState {
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
  };
}

function createQuestionRequest(): QuestionRequest {
  return {
    id: 'request-1',
    sessionId: 'session-1',
    questions: [
      {
        header: 'Deploy',
        question: 'Deploy to test vault?',
        options: [
          { label: 'Yes', description: '' },
          { label: 'No', description: '' },
        ],
        custom: false,
      },
    ],
  };
}

function createFactoryFixture(runtimeState: QuestionRuntimeState = createRuntimeState()) {
  const settings: QuestionRuntimeSettingsPort = {
    questionDisplayMode: 'single',
    showAnsweredQuestionCards: true,
  };
  const questionDock = {
    render: jest.fn<void, [QuestionDockRenderState]>(),
  };
  let questionDockSlotCoordinator = {
    getQuestionDock: jest.fn().mockReturnValue(questionDock),
    shouldUseAboveInputQuestionDock: jest.fn().mockReturnValue(false),
  };
  let questionApi: Mocked<QuestionRuntimeQuestionApiPort> = {
    getPendingQuestions: jest.fn().mockResolvedValue([createQuestionRequest()]),
    replyToQuestion: jest.fn().mockResolvedValue(undefined),
    rejectQuestion: jest.fn().mockResolvedValue(undefined),
  };
  let tabAttention: Mocked<QuestionRuntimeTabAttentionPort> = {
    setNeedsAttention: jest.fn(),
  };

  const host: Mocked<QuestionRuntimeViewHostFactoryHost> = {
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    getTabRuntimeState: jest.fn().mockReturnValue(runtimeState),
    ensureTabRuntimeState: jest.fn().mockReturnValue(runtimeState),
    getCurrentConversationSessionId: jest.fn().mockReturnValue('session-1'),
    getSessionIdForTab: jest.fn().mockReturnValue('session-1'),
    keepQuestionCardPinnedToBottom: jest.fn(),
    settings,
    getQuestionDockSlotCoordinator: jest.fn(() => questionDockSlotCoordinator),
    getQuestionApi: jest.fn(() => questionApi),
    getTabAttention: jest.fn(() => tabAttention),
  };

  return {
    host,
    settings,
    questionDock,
    setQuestionDockSlotCoordinator: (
      nextCoordinator: typeof questionDockSlotCoordinator,
    ) => {
      questionDockSlotCoordinator = nextCoordinator;
    },
    setQuestionApi: (nextApi: Mocked<QuestionRuntimeQuestionApiPort>) => {
      questionApi = nextApi;
    },
    setTabAttention: (nextAttention: Mocked<QuestionRuntimeTabAttentionPort>) => {
      tabAttention = nextAttention;
    },
  };
}

describe('QuestionRuntimeViewHostFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives the question runtime host from one late-bound host seam', async () => {
    const fixture = createFactoryFixture();
    const adapter = createQuestionRuntimeViewHost(fixture.host);
    const request = createQuestionRequest();

    expect(adapter.getActiveTabId()).toBe('tab-active');
    expect(adapter.getQuestionDock()).toBe(fixture.questionDock);
    expect(adapter.getQuestionDisplayMode()).toBe('single');
    expect(adapter.shouldUseAboveInputQuestionDock()).toBe(false);
    expect(adapter.shouldRenderQuestionResolutionCards()).toBe(true);

    await expect(adapter.getPendingQuestions()).resolves.toHaveLength(1);
    await adapter.replyToQuestion(request.id, [['Yes']]);
    await adapter.rejectQuestion(request.id);
    adapter.setTabNeedsAttention('tab-background', true);

    expect(fixture.host.getQuestionDockSlotCoordinator).toHaveBeenCalled();
    expect(fixture.host.getQuestionApi).toHaveBeenCalled();
    expect(fixture.host.getTabAttention).toHaveBeenCalled();

    const nextQuestionDock = {
      render: jest.fn<void, [QuestionDockRenderState]>(),
    };
    const nextQuestionApi: Mocked<QuestionRuntimeQuestionApiPort> = {
      getPendingQuestions: jest.fn().mockResolvedValue([request, createQuestionRequest()]),
      replyToQuestion: jest.fn().mockResolvedValue(undefined),
      rejectQuestion: jest.fn().mockResolvedValue(undefined),
    };
    const nextTabAttention: Mocked<QuestionRuntimeTabAttentionPort> = {
      setNeedsAttention: jest.fn(),
    };

    fixture.settings.questionDisplayMode = 'all' as QuestionDisplayMode;
    fixture.settings.showAnsweredQuestionCards = false;
    fixture.setQuestionDockSlotCoordinator({
      getQuestionDock: jest.fn().mockReturnValue(nextQuestionDock),
      shouldUseAboveInputQuestionDock: jest.fn().mockReturnValue(true),
    });
    fixture.setQuestionApi(nextQuestionApi);
    fixture.setTabAttention(nextTabAttention);

    expect(adapter.getQuestionDock()).toBe(nextQuestionDock);
    expect(adapter.getQuestionDisplayMode()).toBe('all');
    expect(adapter.shouldUseAboveInputQuestionDock()).toBe(true);
    expect(adapter.shouldRenderQuestionResolutionCards()).toBe(false);
    await expect(adapter.getPendingQuestions()).resolves.toHaveLength(2);
    adapter.setTabNeedsAttention('tab-next', false);

    expect(nextQuestionApi.getPendingQuestions).toHaveBeenCalledTimes(1);
    expect(nextTabAttention.setNeedsAttention).toHaveBeenCalledWith('tab-next', false);
  });
});
