import {
  type QuestionTodoBackgroundTaskActivationServices,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter';
import * as QuestionTodoBackgroundTaskActivationHostAdapterModule from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter';
import {
  type QuestionTodoBackgroundTaskRefreshServices,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter';
import * as QuestionTodoBackgroundTaskRefreshHostAdapterModule from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter';
import {
  createQuestionTodoBackgroundTaskRuntimeServiceBundle,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import type {
  QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
  QuestionTodoBackgroundTaskRuntimeViewHosts,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory';
import * as QuestionTodoBackgroundTaskRuntimeViewHostFactoryModule from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory';
import {
  type VisibleConversationPostSyncStateServices,
} from '../../../../src/features/chat/services/VisibleConversationPostSyncStateHostAdapter';
import * as VisibleConversationPostSyncStateHostAdapterModule from '../../../../src/features/chat/services/VisibleConversationPostSyncStateHostAdapter';

function createHost(): QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost {
  return {
    getConversationState: jest.fn(),
    getQuestionTodoRefreshRuntime: jest.fn(),
    getQuestionTodoActivationWriteback: jest.fn(),
    getBackgroundTaskRuntime: jest.fn(),
  };
}

function createRuntimeViewHosts(): QuestionTodoBackgroundTaskRuntimeViewHosts {
  return {
    visibleConversationPostSyncStateViewHost: {} as QuestionTodoBackgroundTaskRuntimeViewHosts['visibleConversationPostSyncStateViewHost'],
    questionTodoBackgroundTaskRefreshViewHost: {} as QuestionTodoBackgroundTaskRuntimeViewHosts['questionTodoBackgroundTaskRefreshViewHost'],
    backgroundConversationPostSyncHandoffViewHost: {} as QuestionTodoBackgroundTaskRuntimeViewHosts['backgroundConversationPostSyncHandoffViewHost'],
    questionTodoBackgroundTaskActivationViewHost: {} as QuestionTodoBackgroundTaskRuntimeViewHosts['questionTodoBackgroundTaskActivationViewHost'],
  };
}

function createVisibleConversationPostSyncStateServices():
  VisibleConversationPostSyncStateServices {
  return {
    visibleConversationPostSyncStateCoordinator: {} as VisibleConversationPostSyncStateServices['visibleConversationPostSyncStateCoordinator'],
  };
}

function createQuestionTodoBackgroundTaskRefreshServices():
  QuestionTodoBackgroundTaskRefreshServices {
  return {
    questionTodoActivationRefreshBridge: {} as QuestionTodoBackgroundTaskRefreshServices['questionTodoActivationRefreshBridge'],
    questionTodoStatusRefreshCoordinator: {} as QuestionTodoBackgroundTaskRefreshServices['questionTodoStatusRefreshCoordinator'],
    postSyncQuestionTodoRefreshFacade: {} as QuestionTodoBackgroundTaskRefreshServices['postSyncQuestionTodoRefreshFacade'],
    visibleConversationPostSyncCoordinator: {} as QuestionTodoBackgroundTaskRefreshServices['visibleConversationPostSyncCoordinator'],
    backgroundConversationPostSyncHandoffCoordinator: {} as QuestionTodoBackgroundTaskRefreshServices['backgroundConversationPostSyncHandoffCoordinator'],
  };
}

function createQuestionTodoBackgroundTaskActivationServices():
  QuestionTodoBackgroundTaskActivationServices {
  return {
    questionTodoActivationRefreshCoordinator: {} as QuestionTodoBackgroundTaskActivationServices['questionTodoActivationRefreshCoordinator'],
    backgroundTaskActivationIndicatorCoordinator: {} as QuestionTodoBackgroundTaskActivationServices['backgroundTaskActivationIndicatorCoordinator'],
  };
}

describe('QuestionTodoBackgroundTaskRuntimeServiceBundle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('assembles the runtime view-host and service layers behind one P2 seam', () => {
    const host = createHost();
    const runtimeViewHosts = createRuntimeViewHosts();
    const visibleConversationPostSyncStateServices =
      createVisibleConversationPostSyncStateServices();
    const questionTodoBackgroundTaskRefreshServices =
      createQuestionTodoBackgroundTaskRefreshServices();
    const questionTodoBackgroundTaskActivationServices =
      createQuestionTodoBackgroundTaskActivationServices();

    const createRuntimeViewHostsSpy = jest
      .spyOn(
        QuestionTodoBackgroundTaskRuntimeViewHostFactoryModule,
        'createQuestionTodoBackgroundTaskRuntimeViewHosts',
      )
      .mockReturnValue(runtimeViewHosts);
    const createVisibleConversationPostSyncStateServicesSpy = jest
      .spyOn(
        VisibleConversationPostSyncStateHostAdapterModule,
        'createVisibleConversationPostSyncStateServices',
      )
      .mockReturnValue(visibleConversationPostSyncStateServices);
    const createQuestionTodoBackgroundTaskRefreshServicesSpy = jest
      .spyOn(
        QuestionTodoBackgroundTaskRefreshHostAdapterModule,
        'createQuestionTodoBackgroundTaskRefreshServices',
      )
      .mockReturnValue(questionTodoBackgroundTaskRefreshServices);
    const createQuestionTodoBackgroundTaskActivationServicesSpy = jest
      .spyOn(
        QuestionTodoBackgroundTaskActivationHostAdapterModule,
        'createQuestionTodoBackgroundTaskActivationServices',
      )
      .mockReturnValue(questionTodoBackgroundTaskActivationServices);

    const bundle = createQuestionTodoBackgroundTaskRuntimeServiceBundle(host);

    expect(createRuntimeViewHostsSpy).toHaveBeenCalledWith(host);
    expect(createVisibleConversationPostSyncStateServicesSpy).toHaveBeenCalledWith(
      runtimeViewHosts.visibleConversationPostSyncStateViewHost,
    );
    expect(createQuestionTodoBackgroundTaskRefreshServicesSpy).toHaveBeenCalledWith(
      runtimeViewHosts.questionTodoBackgroundTaskRefreshViewHost,
      runtimeViewHosts.backgroundConversationPostSyncHandoffViewHost,
      visibleConversationPostSyncStateServices.visibleConversationPostSyncStateCoordinator,
    );
    expect(createQuestionTodoBackgroundTaskActivationServicesSpy).toHaveBeenCalledWith(
      runtimeViewHosts.questionTodoBackgroundTaskActivationViewHost,
      questionTodoBackgroundTaskRefreshServices.questionTodoActivationRefreshBridge,
    );
    expect(bundle).toEqual({
      visibleConversationPostSyncCoordinator:
        questionTodoBackgroundTaskRefreshServices.visibleConversationPostSyncCoordinator,
      backgroundConversationPostSyncHandoffCoordinator:
        questionTodoBackgroundTaskRefreshServices.backgroundConversationPostSyncHandoffCoordinator,
      questionTodoActivationRefreshCoordinator:
        questionTodoBackgroundTaskActivationServices.questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator:
        questionTodoBackgroundTaskActivationServices.backgroundTaskActivationIndicatorCoordinator,
    });
  });
});
