import type { QuestionRequest, QuestionResolution } from '../../../../src/core/types';
import {
  QuestionResolutionWritebackFacade,
  type QuestionResolutionWritebackFacadeHost,
} from '../../../../src/features/chat/services/QuestionResolutionWritebackFacade';
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
        options: [{ label: 'TypeScript', description: '' }],
        custom: true,
      },
    ],
    ...overrides,
  };
}

function createResolution(request = createQuestionRequest()): QuestionResolution {
  return {
    request,
    status: 'answered',
    answers: [['TypeScript']],
  };
}

function createFacade() {
  const calls: string[] = [];
  const host: Mocked<QuestionResolutionWritebackFacadeHost> = {
    markQuestionRequestResolved: jest.fn(() => {
      calls.push('mark');
    }),
    applyResolvedQuestionState: jest.fn(() => {
      calls.push('apply');
    }),
    followUpAfterResolution: jest.fn(async () => {
      calls.push('follow-up');
    }),
  };

  return {
    calls,
    host,
    facade: new QuestionResolutionWritebackFacade(host),
  };
}

describe('QuestionResolutionWritebackFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks resolved state, applies resolution, runs the optional writeback, then follows up', async () => {
    const request = createQuestionRequest();
    const resolution = createResolution(request);
    const tabId: TabId = 'tab-active';
    const { calls, host, facade } = createFacade();

    await facade.applyResolution(resolution, tabId, {
      afterStateApplied: async () => {
        calls.push('after-state');
      },
    });

    expect(host.markQuestionRequestResolved).toHaveBeenCalledWith(request.id, tabId);
    expect(host.applyResolvedQuestionState).toHaveBeenCalledWith(resolution, tabId);
    expect(host.followUpAfterResolution).toHaveBeenCalledWith(tabId);
    expect(calls).toEqual(['mark', 'apply', 'after-state', 'follow-up']);
  });
});
