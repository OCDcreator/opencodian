import type { QuestionRequest } from '../../../../src/core/types';
import {
  QuestionDockQueueRuntimeFacade,
  type QuestionDockQueueRuntimeFacadeHost,
  type QuestionDockQueueRuntimeState,
} from '../../../../src/features/chat/services/QuestionDockQueueRuntimeFacade';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createQuestionRequest(
  id: string,
  overrides?: Partial<QuestionRequest>,
): QuestionRequest {
  return {
    id,
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
  overrides?: Partial<QuestionDockQueueRuntimeState>,
): QuestionDockQueueRuntimeState {
  return {
    pendingQuestionRequests: [],
    questionDraftAnswers: new Map(),
    questionActiveGroupKeys: new Map(),
    questionActiveIndexes: new Map(),
    questionRequestWaiters: new Map(),
    ...overrides,
  };
}

function createFacade(runtime: QuestionDockQueueRuntimeState | null) {
  const host: Mocked<QuestionDockQueueRuntimeFacadeHost> = {
    getTabRuntimeState: jest.fn().mockImplementation(() => runtime),
    ensureTabRuntimeState: jest.fn().mockImplementation(() => runtime),
  };

  return {
    host,
    facade: new QuestionDockQueueRuntimeFacade(host),
  };
}

describe('QuestionDockQueueRuntimeFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates and reuses a waiter per request', () => {
    const runtime = createRuntimeState();
    const { facade } = createFacade(runtime);

    const first = facade.getOrCreateQuestionWaiter('request-1', 'tab-1');
    const second = facade.getOrCreateQuestionWaiter('request-1', 'tab-1');

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(runtime.questionRequestWaiters.size).toBe(1);
  });

  it('enqueues a pending request and initializes draft/group runtime state', () => {
    const request = createQuestionRequest('request-1', {
      questions: [
        {
          header: 'Deploy',
          question: 'Deploy to test vault?',
          options: [{ label: 'Yes', description: '' }],
          custom: false,
        },
        {
          header: 'Mode',
          question: 'Which mode?',
          options: [{ label: 'Managed', description: '' }],
          custom: true,
        },
      ],
    });
    const runtime = createRuntimeState();
    const { facade } = createFacade(runtime);

    facade.enqueuePendingQuestionRequest(request, 'tab-1', 'single');
    facade.enqueuePendingQuestionRequest(request, 'tab-1', 'single');

    expect(runtime.pendingQuestionRequests).toEqual([request]);
    expect(runtime.questionDraftAnswers.get('request-1')).toEqual([[], []]);
    expect(runtime.questionActiveGroupKeys.has('request-1')).toBe(true);
    expect(runtime.questionActiveIndexes.has('request-1')).toBe(true);
  });

  it('removes a pending request and resolves its waiter', async () => {
    const request = createQuestionRequest('request-1');
    let waiterResolved = false;
    const runtime = createRuntimeState({
      pendingQuestionRequests: [request],
      questionDraftAnswers: new Map([['request-1', [['TypeScript']]]]),
      questionActiveGroupKeys: new Map([['request-1', 'group-1']]),
      questionActiveIndexes: new Map([['request-1', 0]]),
      questionRequestWaiters: new Map([
        [
          'request-1',
          {
            promise: Promise.resolve(),
            resolve: () => {
              waiterResolved = true;
            },
          },
        ],
      ]),
    });
    const { facade } = createFacade(runtime);

    const remaining = facade.removePendingQuestionRequest('request-1', 'tab-1');

    expect(remaining).toEqual([]);
    expect(runtime.pendingQuestionRequests).toEqual([]);
    expect(runtime.questionDraftAnswers.has('request-1')).toBe(false);
    expect(runtime.questionActiveGroupKeys.has('request-1')).toBe(false);
    expect(runtime.questionActiveIndexes.has('request-1')).toBe(false);
    expect(runtime.questionRequestWaiters.has('request-1')).toBe(false);
    expect(waiterResolved).toBe(true);
  });
});
