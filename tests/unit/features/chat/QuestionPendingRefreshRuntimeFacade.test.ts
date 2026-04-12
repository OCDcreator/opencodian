import type { QuestionRequest } from '../../../../src/core/types';
import {
  QuestionPendingRefreshRuntimeFacade,
  type QuestionPendingRefreshRuntimeFacadeHost,
  type QuestionPendingRefreshRuntimeState,
} from '../../../../src/features/chat/services/QuestionPendingRefreshRuntimeFacade';

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
  overrides?: Partial<QuestionPendingRefreshRuntimeState>,
): QuestionPendingRefreshRuntimeState {
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

function createFacade(runtime: QuestionPendingRefreshRuntimeState | null) {
  const host: Mocked<QuestionPendingRefreshRuntimeFacadeHost> = {
    getTabRuntimeState: jest.fn().mockImplementation(() => runtime),
  };

  return {
    host,
    facade: new QuestionPendingRefreshRuntimeFacade(host),
  };
}

describe('QuestionPendingRefreshRuntimeFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('suppresses resolved requests, preserves waiter-owned entries, and prunes stale state on refresh', () => {
    const resolvedRequest = createQuestionRequest('request-resolved');
    const waitingRequest = createQuestionRequest('request-waiting');
    const freshRequest = createQuestionRequest('request-fresh', {
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
    const staleRequest = createQuestionRequest('request-stale');
    const runtime = createRuntimeState({
      pendingQuestionRequests: [waitingRequest, staleRequest],
      resolvedQuestionRequestIds: new Set(['request-resolved', 'request-prune']),
      questionDraftAnswers: new Map([
        ['request-waiting', [['Existing']]],
        ['request-prune', [['Remove']]],
      ]),
      questionActiveGroupKeys: new Map([
        ['request-waiting', 'group-waiting'],
        ['request-prune', 'group-prune'],
      ]),
      questionActiveIndexes: new Map([
        ['request-waiting', 0],
        ['request-prune', 1],
      ]),
      questionRequestWaiters: new Map([
        ['request-waiting', { promise: Promise.resolve(), resolve: () => {} }],
      ]),
    });
    const { facade } = createFacade(runtime);

    const refreshed = facade.applyRefreshedPendingQuestionRequests('tab-1', [
      resolvedRequest,
      freshRequest,
    ]);

    expect(refreshed).toEqual([freshRequest, waitingRequest]);
    expect(runtime.pendingQuestionRequests).toEqual([freshRequest, waitingRequest]);
    expect(runtime.resolvedQuestionRequestIds).toEqual(new Set(['request-resolved']));
    expect(runtime.questionDraftAnswers.get('request-fresh')).toEqual([[], []]);
    expect(runtime.questionDraftAnswers.get('request-waiting')).toEqual([['Existing']]);
    expect(runtime.questionDraftAnswers.has('request-prune')).toBe(false);
    expect(runtime.questionActiveGroupKeys.has('request-prune')).toBe(false);
    expect(runtime.questionActiveIndexes.has('request-prune')).toBe(false);
  });

  it('clears pending-question refresh state and exposes mark/get helpers', () => {
    const request = createQuestionRequest('request-1');
    const runtime = createRuntimeState({
      pendingQuestionRequests: [request],
      resolvedQuestionRequestIds: new Set(['resolved-1']),
      questionDraftAnswers: new Map([['request-1', [['TypeScript']]]]),
      questionActiveGroupKeys: new Map([['request-1', 'group-1']]),
      questionActiveIndexes: new Map([['request-1', 0]]),
      questionRequestWaiters: new Map([
        ['request-1', { promise: Promise.resolve(), resolve: () => {} }],
      ]),
    });
    const { facade } = createFacade(runtime);

    expect(facade.getPendingQuestionRequests('tab-1')).toEqual([request]);

    facade.markQuestionRequestResolved('request-1', 'tab-1');
    expect(runtime.resolvedQuestionRequestIds).toEqual(new Set(['resolved-1', 'request-1']));

    facade.clearPendingQuestionState('tab-1');

    expect(facade.getPendingQuestionRequests('tab-1')).toEqual([]);
    expect(runtime.pendingQuestionRequests).toEqual([]);
    expect(runtime.resolvedQuestionRequestIds.size).toBe(0);
    expect(runtime.questionDraftAnswers.size).toBe(0);
    expect(runtime.questionActiveGroupKeys.size).toBe(0);
    expect(runtime.questionActiveIndexes.size).toBe(0);
    expect([...runtime.questionRequestWaiters.keys()]).toEqual([]);
  });
});
