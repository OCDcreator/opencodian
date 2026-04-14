import type { QuestionRequest } from '../../../../src/core/types';
import type { QuestionDockRenderStateFacade } from '../../../../src/features/chat/services/QuestionDockRenderStateFacade';
import {
  QuestionDockResolutionActionFacade,
  type QuestionDockResolutionActionFacadeHost,
} from '../../../../src/features/chat/services/QuestionDockResolutionActionFacade';
import type { TabId } from '../../../../src/features/chat/tabs';

interface TestRuntimeState {
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
}

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
    questionDraftAnswers: new Map(),
    questionActiveGroupKeys: new Map(),
    questionActiveIndexes: new Map(),
    ...overrides,
  };
}

function createFacade(options?: {
  activeTabId?: TabId | null;
  activeRequest?: QuestionRequest | null;
  runtimeState?: TestRuntimeState | null;
}) {
  const activeTabId = options?.activeTabId ?? 'tab-active';
  const runtimeState = options && 'runtimeState' in options
    ? options.runtimeState
    : createRuntimeState();
  const activeRequest = options && 'activeRequest' in options
    ? options.activeRequest
    : createQuestionRequest();
  const host: jest.Mocked<QuestionDockResolutionActionFacadeHost> = {
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    getTabRuntimeState: jest.fn((tabId) => (tabId === activeTabId ? runtimeState : null)),
  };
  const dockRenderState: jest.Mocked<
    Pick<QuestionDockRenderStateFacade, 'getActivePendingQuestionRequest'>
  > = {
    getActivePendingQuestionRequest: jest
      .fn()
      .mockReturnValue(activeRequest),
  };

  return {
    host,
    dockRenderState,
    facade: new QuestionDockResolutionActionFacade(host, dockRenderState),
  };
}

describe('QuestionDockResolutionActionFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a reply action with sanitized dock answers', () => {
    const request = createQuestionRequest({
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
          header: 'Frameworks',
          question: 'Which frameworks are in use?',
          options: [
            { label: 'React', description: '' },
            { label: 'React', description: '' },
            { label: 'Jest', description: '' },
          ],
          multiple: true,
        },
      ],
    });
    const runtimeState = createRuntimeState({
      questionDraftAnswers: new Map([
        [request.id, [[' TypeScript '], [' React ', 'React', 'Jest ']]],
      ]),
    });
    const { facade } = createFacade({
      activeRequest: request,
      runtimeState,
    });

    expect(facade.resolveAction('submit', 'tab-active')).toEqual({
      type: 'reply',
      request,
      answers: [['TypeScript'], ['React', 'Jest']],
      resolution: {
        request,
        status: 'answered',
        answers: [['TypeScript'], ['React', 'Jest']],
      },
    });
  });

  it('returns an answer-required action when required answers are still incomplete', () => {
    const request = createQuestionRequest();
    const runtimeState = createRuntimeState({
      questionDraftAnswers: new Map([[request.id, [[]]]]),
    });
    const { facade } = createFacade({
      activeRequest: request,
      runtimeState,
    });

    expect(facade.resolveAction('submit', 'tab-active')).toEqual({
      type: 'answer-required',
      request,
    });
  });

  it('returns a reject action without collecting answers', () => {
    const request = createQuestionRequest();
    const { facade, host } = createFacade({
      activeRequest: request,
    });

    expect(facade.resolveAction('reject', 'tab-active')).toEqual({
      type: 'reject',
      request,
      resolution: {
        request,
        status: 'rejected',
      },
    });
    expect(host.getTabRuntimeState).not.toHaveBeenCalled();
  });

  it('skips when no active dock request is available', () => {
    const { facade } = createFacade({
      activeRequest: null,
    });

    expect(facade.resolveAction('submit', 'tab-active')).toEqual({
      type: 'skip',
    });
  });
});
