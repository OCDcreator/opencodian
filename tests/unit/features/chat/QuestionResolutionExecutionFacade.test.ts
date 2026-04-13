import * as obsidian from 'obsidian';

import type { QuestionRequest } from '../../../../src/core/types';
import { setLocale } from '../../../../src/i18n';
import {
  createQuestionRejectExecutionAction,
  createQuestionReplyExecutionAction,
  QuestionResolutionExecutionFacade,
  type QuestionResolutionExecutionFacadeHost,
} from '../../../../src/features/chat/services/QuestionResolutionExecutionFacade';

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

function createFacade() {
  const host: jest.Mocked<QuestionResolutionExecutionFacadeHost> = {
    replyToQuestion: jest.fn().mockResolvedValue(undefined),
    rejectQuestion: jest.fn().mockResolvedValue(undefined),
  };

  return {
    host,
    facade: new QuestionResolutionExecutionFacade(host),
  };
}

describe('QuestionResolutionExecutionFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLocale('en');
  });

  it('executes reply actions and returns the answered resolution', async () => {
    const request = createQuestionRequest();
    const { facade, host } = createFacade();
    const action = createQuestionReplyExecutionAction(request, [['TypeScript']]);

    await expect(facade.execute(action)).resolves.toEqual({
      request,
      status: 'answered',
      answers: [['TypeScript']],
    });

    expect(host.replyToQuestion).toHaveBeenCalledWith(request.id, [['TypeScript']]);
    expect(host.rejectQuestion).not.toHaveBeenCalled();
  });

  it('executes reject actions and returns the rejected resolution', async () => {
    const request = createQuestionRequest();
    const { facade, host } = createFacade();
    const action = createQuestionRejectExecutionAction(request);

    await expect(facade.execute(action)).resolves.toEqual({
      request,
      status: 'rejected',
    });

    expect(host.rejectQuestion).toHaveBeenCalledWith(request.id);
    expect(host.replyToQuestion).not.toHaveBeenCalled();
  });

  it('shows the existing error notice and returns null when execution fails', async () => {
    const request = createQuestionRequest();
    const { facade, host } = createFacade();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    host.replyToQuestion.mockRejectedValueOnce(new Error('boom'));

    await expect(
      facade.execute(createQuestionReplyExecutionAction(request, [['TypeScript']])),
    ).resolves.toBeNull();

    expect(noticeSpy).toHaveBeenCalledWith('Failed to send the question response.');
    expect(errorSpy).toHaveBeenCalled();
    noticeSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
