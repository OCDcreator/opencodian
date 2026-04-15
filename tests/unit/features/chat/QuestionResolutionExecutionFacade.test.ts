import * as obsidian from 'obsidian';

import type { QuestionRequest } from '../../../../src/core/types';
import {
  createQuestionRejectExecutionAction,
  createQuestionReplyExecutionAction,
  type QuestionResolutionApplyContext,
  QuestionResolutionExecutionFacade,
  type QuestionResolutionExecutionFacadeHost,
  type QuestionResolutionExecutionLifecyclePort,
} from '../../../../src/features/chat/services/QuestionResolutionExecutionFacade';
import { setLocale } from '../../../../src/i18n';

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
  const lifecycle: jest.Mocked<QuestionResolutionExecutionLifecyclePort> = {
    markResolvedQuestionRequest: jest.fn(),
    applyResolvedQuestionState: jest.fn(),
    followUpAfterResolution: jest.fn().mockResolvedValue(undefined),
  };

  return {
    host,
    lifecycle,
    facade: new QuestionResolutionExecutionFacade(host, lifecycle),
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

  it('applies resolved runtime state and follow-up through the shared execution seam', async () => {
    const request = createQuestionRequest();
    const {
      facade,
      host,
      lifecycle,
    } = createFacade();
    const action = createQuestionReplyExecutionAction(request, [['TypeScript']]);
    const afterStateApplied = jest.fn();
    const context: QuestionResolutionApplyContext = {
      tabId: 'tab-active',
      afterStateApplied,
    };

    await expect(facade.executeAndApply(action, context)).resolves.toBe(true);

    expect(host.replyToQuestion).toHaveBeenCalledWith(request.id, [['TypeScript']]);
    expect(lifecycle.markResolvedQuestionRequest).toHaveBeenCalledWith(
      request.id,
      'tab-active',
    );
    expect(lifecycle.applyResolvedQuestionState).toHaveBeenCalledWith(
      {
        request,
        status: 'answered',
        answers: [['TypeScript']],
      },
      'tab-active',
    );
    expect(afterStateApplied).toHaveBeenCalledTimes(1);
    expect(lifecycle.followUpAfterResolution).toHaveBeenCalledWith('tab-active');
  });

  it('skips state apply and follow-up when shared execution fails', async () => {
    const request = createQuestionRequest();
    const {
      facade,
      host,
      lifecycle,
    } = createFacade();
    const afterStateApplied = jest.fn();
    host.replyToQuestion.mockRejectedValueOnce(new Error('boom'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);

    await expect(
      facade.executeAndApply(createQuestionReplyExecutionAction(request, [['TypeScript']]), {
        tabId: 'tab-active',
        afterStateApplied,
      }),
    ).resolves.toBe(false);

    expect(lifecycle.markResolvedQuestionRequest).not.toHaveBeenCalled();
    expect(lifecycle.applyResolvedQuestionState).not.toHaveBeenCalled();
    expect(afterStateApplied).not.toHaveBeenCalled();
    expect(lifecycle.followUpAfterResolution).not.toHaveBeenCalled();
    noticeSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
