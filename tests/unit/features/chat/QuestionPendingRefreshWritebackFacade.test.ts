import type { QuestionRequest } from '../../../../src/core/types';
import {
  QuestionPendingRefreshWritebackFacade,
  type QuestionPendingRefreshWritebackFacadeHost,
} from '../../../../src/features/chat/services/QuestionPendingRefreshWritebackFacade';
import type { TabId } from '../../../../src/features/chat/tabs';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createQuestionRequest(id: string): QuestionRequest {
  return {
    id,
    sessionId: 'session-1',
    questions: [
      {
        header: 'Programming',
        question: 'Which language are you using?',
        options: [{ label: 'TypeScript', description: '' }],
        custom: true,
      },
    ],
  };
}

function createFacade(activeTabId: TabId | null = 'tab-active') {
  const host: Mocked<QuestionPendingRefreshWritebackFacadeHost> = {
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    setTabNeedsAttention: jest.fn(),
    renderQuestionDock: jest.fn(),
  };

  return {
    host,
    facade: new QuestionPendingRefreshWritebackFacade(host),
  };
}

describe('QuestionPendingRefreshWritebackFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears active-tab attention and re-renders after pending questions are cleared', () => {
    const { host, facade } = createFacade('tab-active');

    facade.applyClearedPendingQuestions('tab-active');

    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-active', false);
    expect(host.renderQuestionDock).toHaveBeenCalledTimes(1);
  });

  it('clears active-tab attention and re-renders after refreshed questions are applied', () => {
    const { host, facade } = createFacade('tab-active');

    facade.applyRefreshedPendingQuestions('tab-active', [
      createQuestionRequest('request-1'),
    ]);

    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-active', false);
    expect(host.renderQuestionDock).toHaveBeenCalledTimes(1);
  });

  it('marks background tabs only when refreshed questions remain', () => {
    const { host, facade } = createFacade('tab-active');

    facade.applyRefreshedPendingQuestions('tab-background', [
      createQuestionRequest('request-background'),
    ]);
    facade.applyRefreshedPendingQuestions('tab-empty', []);

    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-background', true);
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-empty', false);
    expect(host.renderQuestionDock).not.toHaveBeenCalled();
  });

  it('does not re-render the dock when clearing a background tab', () => {
    const { host, facade } = createFacade('tab-active');

    facade.applyClearedPendingQuestions('tab-background');

    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-background', false);
    expect(host.renderQuestionDock).not.toHaveBeenCalled();
  });
});
