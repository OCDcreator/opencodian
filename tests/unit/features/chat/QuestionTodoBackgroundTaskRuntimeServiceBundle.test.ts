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
  type QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import {
  type VisibleConversationPostSyncStateServices,
} from '../../../../src/features/chat/services/VisibleConversationPostSyncStateHostAdapter';
import * as VisibleConversationPostSyncStateHostAdapterModule from '../../../../src/features/chat/services/VisibleConversationPostSyncStateHostAdapter';

function createHost(): QuestionTodoBackgroundTaskRuntimeServiceBundleHost {
  return {
    getCurrentConversation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    getConversationSyncRuntime: jest.fn(() => ({
      setTabConversationSyncFingerprint: jest.fn(),
    })),
    getTabRuntimeState: jest.fn(),
    renderSessionTodoDock: jest.fn(),
    getQuestionDockCoordinator: jest.fn(),
    getSessionTodoCoordinator: jest.fn(),
    getQuestionDockSlotCoordinator: jest.fn(),
    resetBackgroundTaskIndicator: jest.fn(),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn(),
    getBackgroundTaskIndicatorCoordinator: jest.fn(),
    getBackgroundTaskLiveSignalCoordinator: jest.fn(),
    getTabRuntimeStateBridge: jest.fn(),
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
    const visibleConversationPostSyncStateServices =
      createVisibleConversationPostSyncStateServices();
    const questionTodoBackgroundTaskRefreshServices =
      createQuestionTodoBackgroundTaskRefreshServices();
    const questionTodoBackgroundTaskActivationServices =
      createQuestionTodoBackgroundTaskActivationServices();
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

    expect(createVisibleConversationPostSyncStateServicesSpy)
      .toHaveBeenCalledWith(expect.any(Object));
    expect(createQuestionTodoBackgroundTaskRefreshServicesSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      visibleConversationPostSyncStateServices.visibleConversationPostSyncStateCoordinator,
    );
    expect(createQuestionTodoBackgroundTaskActivationServicesSpy).toHaveBeenCalledWith(
      expect.any(Object),
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
