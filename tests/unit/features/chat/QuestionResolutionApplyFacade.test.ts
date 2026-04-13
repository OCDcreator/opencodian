import type { QuestionRequest } from '../../../../src/core/types';
import { QuestionResolutionApplyFacade } from '../../../../src/features/chat/services/QuestionResolutionApplyFacade';
import {
  createQuestionRejectExecutionAction,
  createQuestionReplyExecutionAction,
  type QuestionResolutionExecutionFacade,
} from '../../../../src/features/chat/services/QuestionResolutionExecutionFacade';
import type { QuestionResolutionWritebackFacade } from '../../../../src/features/chat/services/QuestionResolutionWritebackFacade';
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

function createFacade() {
  const resolutionExecution: Mocked<Pick<QuestionResolutionExecutionFacade, 'execute'>> = {
    execute: jest.fn(),
  };
  const resolutionWriteback: Mocked<Pick<QuestionResolutionWritebackFacade, 'applyResolution'>> = {
    applyResolution: jest.fn().mockResolvedValue(undefined),
  };

  return {
    resolutionExecution,
    resolutionWriteback,
    facade: new QuestionResolutionApplyFacade(
      resolutionExecution,
      resolutionWriteback,
    ),
  };
}

describe('QuestionResolutionApplyFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executes the shared action and forwards the resolved writeback payload', async () => {
    const request = createQuestionRequest();
    const action = createQuestionReplyExecutionAction(request, [['TypeScript']]);
    const afterStateApplied = jest.fn();
    const tabId: TabId = 'tab-active';
    const { facade, resolutionExecution, resolutionWriteback } = createFacade();
    resolutionExecution.execute.mockResolvedValueOnce(action.resolution);

    await expect(facade.applyAction(action, tabId, { afterStateApplied })).resolves.toBe(true);

    expect(resolutionExecution.execute).toHaveBeenCalledWith(action);
    expect(resolutionWriteback.applyResolution).toHaveBeenCalledWith(
      action.resolution,
      tabId,
      { afterStateApplied },
    );
  });

  it('skips writeback when execution returns null', async () => {
    const request = createQuestionRequest();
    const action = createQuestionRejectExecutionAction(request);
    const { facade, resolutionExecution, resolutionWriteback } = createFacade();
    resolutionExecution.execute.mockResolvedValueOnce(null);

    await expect(facade.applyAction(action, 'tab-active')).resolves.toBe(false);

    expect(resolutionWriteback.applyResolution).not.toHaveBeenCalled();
  });
});
