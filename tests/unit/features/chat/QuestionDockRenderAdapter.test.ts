import type { QuestionRequest } from '../../../../src/core/types';
import {
  createEmptyQuestionDockRenderPayload,
  createQuestionDockRenderPayload,
  type QuestionDockRenderActions,
} from '../../../../src/features/chat/services/QuestionDockRenderAdapter';
import type { QuestionDockInteractionRuntimeState } from '../../../../src/features/chat/services/QuestionDockInteractionState';

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
      {
        header: 'Platform',
        question: 'Which platform are you targeting?',
        options: [
          { label: 'Desktop', description: '' },
          { label: 'Mobile', description: '' },
        ],
        custom: false,
      },
    ],
    ...overrides,
  };
}

function createRuntimeState(): QuestionDockInteractionRuntimeState {
  return {
    questionDraftAnswers: new Map(),
    questionActiveGroupKeys: new Map(),
    questionActiveIndexes: new Map(),
  };
}

function createActions(): jest.Mocked<QuestionDockRenderActions> {
  return {
    rerender: jest.fn(),
    submit: jest.fn(),
    reject: jest.fn(),
  };
}

describe('QuestionDockRenderAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds dock render state and routes callbacks through interaction state', () => {
    const runtime = createRuntimeState();
    const request = createQuestionRequest();
    const actions = createActions();

    const renderPayload = createQuestionDockRenderPayload(runtime, request, 'single', actions);

    expect(renderPayload.state).toEqual({
      request,
      answers: [[], []],
      displayMode: 'single',
      activeGroupKey: 'Programming',
      activeQuestionIndex: 0,
    });

    renderPayload.callbacks.onAnswerChange(0, [' TypeScript ', 'Python']);
    expect(runtime.questionDraftAnswers.get(request.id)).toEqual([['TypeScript'], []]);

    renderPayload.callbacks.onSelectGroup('Platform');
    expect(runtime.questionActiveGroupKeys.get(request.id)).toBe('Platform');
    expect(runtime.questionActiveIndexes.get(request.id)).toBe(1);
    expect(actions.rerender).toHaveBeenCalledTimes(1);

    renderPayload.callbacks.onSelectQuestion(0);
    expect(runtime.questionActiveGroupKeys.get(request.id)).toBe('Programming');
    expect(runtime.questionActiveIndexes.get(request.id)).toBe(0);
    expect(actions.rerender).toHaveBeenCalledTimes(2);

    renderPayload.callbacks.onSubmit();
    renderPayload.callbacks.onReject();
    renderPayload.callbacks.onClose();
    expect(actions.submit).toHaveBeenCalledTimes(1);
    expect(actions.reject).toHaveBeenCalledTimes(2);
  });

  it('creates an inert empty render payload', () => {
    const renderPayload = createEmptyQuestionDockRenderPayload('all');

    expect(renderPayload.state).toEqual({
      request: null,
      answers: [],
      displayMode: 'all',
    });

    expect(() => {
      renderPayload.callbacks.onAnswerChange(0, ['ignored']);
      renderPayload.callbacks.onSelectGroup('group');
      renderPayload.callbacks.onSelectQuestion(0);
      renderPayload.callbacks.onSubmit();
      renderPayload.callbacks.onReject();
      renderPayload.callbacks.onClose();
    }).not.toThrow();
  });
});
