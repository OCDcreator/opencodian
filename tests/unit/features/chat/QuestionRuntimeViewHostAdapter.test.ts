import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../../src/core/types';
import type { QuestionRuntimeState } from '../../../../src/features/chat/services/QuestionRuntimeHostAdapter';
import {
  createQuestionRuntimeViewHostAdapter,
  type QuestionRuntimeViewHostAdapterHost,
  type QuestionRuntimeQuestionApiPort,
  type QuestionRuntimeSettingsPort,
  type QuestionRuntimeTabAttentionPort,
} from '../../../../src/features/chat/services/QuestionRuntimeViewHostAdapter';
import type { TabId } from '../../../../src/features/chat/tabs';
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

function createViewHost(runtimeState: QuestionRuntimeState): Mocked<QuestionRuntimeViewHostAdapterHost> {
  return {
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    getTabRuntimeState: jest.fn().mockReturnValue(runtimeState),
    ensureTabRuntimeState: jest.fn().mockReturnValue(runtimeState),
    getCurrentConversationSessionId: jest.fn().mockReturnValue('session-1'),
    getSessionIdForTab: jest.fn().mockReturnValue('session-1'),
    keepQuestionCardPinnedToBottom: jest.fn(),
  };
}

describe('QuestionRuntimeViewHostAdapter', () => {
  it('exposes stable runtime ports without re-expanding question wiring in the view host', async () => {
    const runtimeState = createRuntimeState();
    const viewHost = createViewHost(runtimeState);
    const settings: QuestionRuntimeSettingsPort = {
      questionDisplayMode: 'single',
      showAnsweredQuestionCards: true,
    };
    const questionDock = {
      render: jest.fn<void, [QuestionDockRenderState]>(),
    };
    const questionDockSlotCoordinator = {
      getQuestionDock: jest.fn().mockReturnValue(questionDock),
      shouldUseAboveInputQuestionDock: jest.fn().mockReturnValue(true),
    };
    const request = createQuestionRequest();
    const questionApi: Mocked<QuestionRuntimeQuestionApiPort> = {
      getPendingQuestions: jest.fn().mockResolvedValue([request]),
      replyToQuestion: jest.fn().mockResolvedValue(undefined),
      rejectQuestion: jest.fn().mockResolvedValue(undefined),
    };
    const tabAttention: Mocked<QuestionRuntimeTabAttentionPort> = {
      setNeedsAttention: jest.fn(),
    };

    const adapter = createQuestionRuntimeViewHostAdapter({
      viewHost,
      settings,
      questionDockSlotCoordinator,
      questionApi,
      tabAttention,
    });

    expect(adapter.getActiveTabId()).toBe('tab-active');
    expect(adapter.getTabRuntimeState('tab-active')).toBe(runtimeState);
    expect(adapter.ensureTabRuntimeState('tab-active')).toBe(runtimeState);
    expect(adapter.getCurrentConversationSessionId()).toBe('session-1');
    expect(adapter.getSessionIdForTab('tab-active')).toBe('session-1');
    expect(adapter.getQuestionDock()).toBe(questionDock);
    expect(adapter.getQuestionDisplayMode()).toBe('single');
    expect(adapter.shouldUseAboveInputQuestionDock()).toBe(true);
    expect(adapter.shouldRenderQuestionResolutionCards()).toBe(true);

    adapter.keepQuestionCardPinnedToBottom('tab-active');
    adapter.setTabNeedsAttention('tab-background', true);
    await expect(adapter.getPendingQuestions()).resolves.toEqual([request]);
    await adapter.replyToQuestion(request.id, [['Yes']]);
    await adapter.rejectQuestion(request.id);

    expect(viewHost.keepQuestionCardPinnedToBottom).toHaveBeenCalledWith('tab-active');
    expect(tabAttention.setNeedsAttention).toHaveBeenCalledWith('tab-background', true);
    expect(questionApi.replyToQuestion).toHaveBeenCalledWith(request.id, [['Yes']]);
    expect(questionApi.rejectQuestion).toHaveBeenCalledWith(request.id);
  });

  it('reads mutable settings and dock gates at call time', () => {
    const runtimeState = createRuntimeState();
    const settings: QuestionRuntimeSettingsPort = {
      questionDisplayMode: 'all',
      showAnsweredQuestionCards: false,
    };
    let shouldUseAboveInputQuestionDock = false;
    const adapter = createQuestionRuntimeViewHostAdapter({
      viewHost: createViewHost(runtimeState),
      settings,
      questionDockSlotCoordinator: {
        getQuestionDock: jest.fn().mockReturnValue(null),
        shouldUseAboveInputQuestionDock: jest.fn(() => shouldUseAboveInputQuestionDock),
      },
      questionApi: {
        getPendingQuestions: jest.fn().mockResolvedValue([]),
        replyToQuestion: jest.fn().mockResolvedValue(undefined),
        rejectQuestion: jest.fn().mockResolvedValue(undefined),
      },
      tabAttention: {
        setNeedsAttention: jest.fn(),
      },
    });

    expect(adapter.getQuestionDisplayMode()).toBe('all');
    expect(adapter.shouldUseAboveInputQuestionDock()).toBe(false);
    expect(adapter.shouldRenderQuestionResolutionCards()).toBe(false);

    settings.questionDisplayMode = 'single' as QuestionDisplayMode;
    settings.showAnsweredQuestionCards = true;
    shouldUseAboveInputQuestionDock = true;

    expect(adapter.getQuestionDisplayMode()).toBe('single');
    expect(adapter.shouldUseAboveInputQuestionDock()).toBe(true);
    expect(adapter.shouldRenderQuestionResolutionCards()).toBe(true);
  });
});
