import type { Conversation } from '../../../../src/core/types';
import {
  type QuestionTodoBackgroundTaskActivationServices,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter';
import * as QuestionTodoBackgroundTaskActivationHostAdapterModule from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter';
import {
  type QuestionTodoBackgroundTaskRefreshServices,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter';
import * as QuestionTodoBackgroundTaskRefreshHostAdapterModule from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter';
import {
  assembleQuestionTodoBackgroundTaskRuntimeHost,
  createQuestionTodoBackgroundTaskRuntimeServiceBundle,
  createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam,
  type QuestionTodoBackgroundTaskRuntimeSeam,
  type QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import {
  type VisibleConversationPostSyncStateServices,
} from '../../../../src/features/chat/services/VisibleConversationPostSyncStateHostAdapter';
import * as VisibleConversationPostSyncStateHostAdapterModule from '../../../../src/features/chat/services/VisibleConversationPostSyncStateHostAdapter';

function createSeam(): QuestionTodoBackgroundTaskRuntimeSeam {
  const backgroundTaskHost = {
    resetBackgroundTaskIndicator: jest.fn(),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    armBackgroundTaskIndicatorForUserMessage: jest.fn(),
    logOmoBackgroundTaskDiagnostics: jest.fn(),
  };

  return {
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    getCurrentConversation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    getConversationSyncRuntime: jest.fn(() => ({
      setTabConversationSyncFingerprint: jest.fn(),
    })),
    getTabRuntimeState: jest.fn(),
    getSessionIdForTab: jest.fn().mockReturnValue('session-active'),
    renderSessionTodoDock: jest.fn(),
    getQuestionDockCoordinator: jest.fn(),
    getSessionTodoCoordinator: jest.fn(),
    getQuestionDockSlotCoordinator: jest.fn(),
    getBackgroundTaskHost: jest.fn(() => backgroundTaskHost),
    getBackgroundTaskIndicatorCoordinator: jest.fn(),
    getBackgroundTaskLiveSignalCoordinator: jest.fn(),
    getTabRuntimeStateBridge: jest.fn(),
  };
}

function createHost(): QuestionTodoBackgroundTaskRuntimeServiceBundleHost {
  return {
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    getCurrentConversation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    getConversationSyncRuntime: jest.fn(() => ({
      setTabConversationSyncFingerprint: jest.fn(),
    })),
    getTabRuntimeState: jest.fn(),
    getSessionIdForTab: jest.fn().mockReturnValue('session-active'),
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
      questionTodoBackgroundTaskRefreshServices.questionTodoStatusRefreshCoordinator,
    );
    expect(bundle).toMatchObject({
      visibleConversationPostSyncCoordinator:
        questionTodoBackgroundTaskRefreshServices.visibleConversationPostSyncCoordinator,
      backgroundConversationPostSyncHandoffCoordinator:
        questionTodoBackgroundTaskRefreshServices.backgroundConversationPostSyncHandoffCoordinator,
      questionTodoActivationRefreshCoordinator:
        questionTodoBackgroundTaskActivationServices.questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator:
        questionTodoBackgroundTaskActivationServices.backgroundTaskActivationIndicatorCoordinator,
      backgroundTaskStreamTriggerViewHost: expect.any(Object),
    });
    expect(bundle.backgroundTaskStreamTriggerViewHost.getActiveTabId()).toBe('tab-active');
    expect(bundle.backgroundTaskStreamTriggerViewHost.getSessionIdForTab('tab-active'))
      .toBe('session-active');
  });
});

describe('assembleQuestionTodoBackgroundTaskRuntimeHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates background task reset through the seam getBackgroundTaskHost', () => {
    const seam = createSeam();
    const host = assembleQuestionTodoBackgroundTaskRuntimeHost(seam);

    host.resetBackgroundTaskIndicator('tab-active');

    expect(seam.getBackgroundTaskHost).toHaveBeenCalledTimes(1);
    expect(seam.getBackgroundTaskHost().resetBackgroundTaskIndicator)
      .toHaveBeenCalledWith('tab-active');
  });

  it('delegates sync background task state through the seam getBackgroundTaskHost', () => {
    const seam = createSeam();
    const host = assembleQuestionTodoBackgroundTaskRuntimeHost(seam);
    const conversation: Record<string, unknown> = { id: 'conv-1' };

    host.syncBackgroundTaskStateFromConversation(conversation as Conversation, 'tab-active');

    expect(seam.getBackgroundTaskHost).toHaveBeenCalledTimes(1);
    expect(seam.getBackgroundTaskHost().syncBackgroundTaskStateFromConversation)
      .toHaveBeenCalledWith(conversation, 'tab-active');
  });

  it('delegates render background task indicator through the seam getBackgroundTaskHost', async () => {
    const seam = createSeam();
    const host = assembleQuestionTodoBackgroundTaskRuntimeHost(seam);

    await host.renderBackgroundTaskIndicatorIfNeeded('tab-active');

    expect(seam.getBackgroundTaskHost).toHaveBeenCalledTimes(1);
    expect(seam.getBackgroundTaskHost().renderBackgroundTaskIndicatorIfNeeded)
      .toHaveBeenCalledWith('tab-active');
  });

  it('passes through all non-background-task seam properties directly', () => {
    const seam = createSeam();
    const host = assembleQuestionTodoBackgroundTaskRuntimeHost(seam);

    expect(host.getActiveTabId()).toBe('tab-active');
    expect(host.getSessionIdForTab('tab-active')).toBe('session-active');
    host.setCurrentConversationRevertState({ messageID: 'msg-1' });
    host.renderSessionTodoDock('tab-active');

    expect(seam.getActiveTabId).toHaveBeenCalled();
    expect(seam.getSessionIdForTab).toHaveBeenCalledWith('tab-active');
    expect(seam.setCurrentConversationRevertState).toHaveBeenCalledWith({ messageID: 'msg-1' });
    expect(seam.renderSessionTodoDock).toHaveBeenCalledWith('tab-active');
  });

  it('resolves late-bound background task host on each invocation', () => {
    const seam = createSeam();
    const firstHost = seam.getBackgroundTaskHost();
    const secondHost = {
      resetBackgroundTaskIndicator: jest.fn(),
      syncBackgroundTaskStateFromConversation: jest.fn(),
      renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
      armBackgroundTaskIndicatorForUserMessage: jest.fn(),
      logOmoBackgroundTaskDiagnostics: jest.fn(),
    };
    let callCount = 0;
    (seam.getBackgroundTaskHost as jest.Mock).mockImplementation(() => {
      callCount++;
      return callCount === 1 ? firstHost : secondHost;
    });

    const host = assembleQuestionTodoBackgroundTaskRuntimeHost(seam);

    host.resetBackgroundTaskIndicator('tab-1');
    host.resetBackgroundTaskIndicator('tab-2');

    expect(firstHost.resetBackgroundTaskIndicator).toHaveBeenCalledWith('tab-1');
    expect(secondHost.resetBackgroundTaskIndicator).toHaveBeenCalledWith('tab-2');
  });

  it('produces a host compatible with createQuestionTodoBackgroundTaskRuntimeServiceBundle', () => {
    const seam = createSeam();
    const visibleConversationPostSyncStateServices =
      createVisibleConversationPostSyncStateServices();
    const questionTodoBackgroundTaskRefreshServices =
      createQuestionTodoBackgroundTaskRefreshServices();
    const questionTodoBackgroundTaskActivationServices =
      createQuestionTodoBackgroundTaskActivationServices();
    jest.spyOn(
      VisibleConversationPostSyncStateHostAdapterModule,
      'createVisibleConversationPostSyncStateServices',
    ).mockReturnValue(visibleConversationPostSyncStateServices);
    jest.spyOn(
      QuestionTodoBackgroundTaskRefreshHostAdapterModule,
      'createQuestionTodoBackgroundTaskRefreshServices',
    ).mockReturnValue(questionTodoBackgroundTaskRefreshServices);
    jest.spyOn(
      QuestionTodoBackgroundTaskActivationHostAdapterModule,
      'createQuestionTodoBackgroundTaskActivationServices',
    ).mockReturnValue(questionTodoBackgroundTaskActivationServices);

    const host = assembleQuestionTodoBackgroundTaskRuntimeHost(seam);
    const bundle = createQuestionTodoBackgroundTaskRuntimeServiceBundle(host);

    expect(bundle.backgroundTaskStreamTriggerViewHost.getActiveTabId()).toBe('tab-active');
    expect(bundle.backgroundTaskStreamTriggerViewHost.getSessionIdForTab('tab-active'))
      .toBe('session-active');
  });
});

describe('createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('assembles the host from the seam and produces the same bundle as the two-step flow', () => {
    const seam = createSeam();
    const visibleConversationPostSyncStateServices =
      createVisibleConversationPostSyncStateServices();
    const questionTodoBackgroundTaskRefreshServices =
      createQuestionTodoBackgroundTaskRefreshServices();
    const questionTodoBackgroundTaskActivationServices =
      createQuestionTodoBackgroundTaskActivationServices();
    jest.spyOn(
      VisibleConversationPostSyncStateHostAdapterModule,
      'createVisibleConversationPostSyncStateServices',
    ).mockReturnValue(visibleConversationPostSyncStateServices);
    jest.spyOn(
      QuestionTodoBackgroundTaskRefreshHostAdapterModule,
      'createQuestionTodoBackgroundTaskRefreshServices',
    ).mockReturnValue(questionTodoBackgroundTaskRefreshServices);
    jest.spyOn(
      QuestionTodoBackgroundTaskActivationHostAdapterModule,
      'createQuestionTodoBackgroundTaskActivationServices',
    ).mockReturnValue(questionTodoBackgroundTaskActivationServices);

    const bundle = createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam(seam);

    expect(bundle).toMatchObject({
      visibleConversationPostSyncCoordinator:
        questionTodoBackgroundTaskRefreshServices.visibleConversationPostSyncCoordinator,
      backgroundConversationPostSyncHandoffCoordinator:
        questionTodoBackgroundTaskRefreshServices.backgroundConversationPostSyncHandoffCoordinator,
      questionTodoActivationRefreshCoordinator:
        questionTodoBackgroundTaskActivationServices.questionTodoActivationRefreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator:
        questionTodoBackgroundTaskActivationServices.backgroundTaskActivationIndicatorCoordinator,
      backgroundTaskStreamTriggerViewHost: expect.any(Object),
    });
    expect(bundle.backgroundTaskStreamTriggerViewHost.getActiveTabId()).toBe('tab-active');
    expect(bundle.backgroundTaskStreamTriggerViewHost.getSessionIdForTab('tab-active'))
      .toBe('session-active');
  });

  it('delegates background task callbacks through the seam on each invocation', () => {
    const seam = createSeam();
    const visibleConversationPostSyncStateServices =
      createVisibleConversationPostSyncStateServices();
    const questionTodoBackgroundTaskRefreshServices =
      createQuestionTodoBackgroundTaskRefreshServices();
    const questionTodoBackgroundTaskActivationServices =
      createQuestionTodoBackgroundTaskActivationServices();
    jest.spyOn(
      VisibleConversationPostSyncStateHostAdapterModule,
      'createVisibleConversationPostSyncStateServices',
    ).mockReturnValue(visibleConversationPostSyncStateServices);
    jest.spyOn(
      QuestionTodoBackgroundTaskRefreshHostAdapterModule,
      'createQuestionTodoBackgroundTaskRefreshServices',
    ).mockReturnValue(questionTodoBackgroundTaskRefreshServices);
    jest.spyOn(
      QuestionTodoBackgroundTaskActivationHostAdapterModule,
      'createQuestionTodoBackgroundTaskActivationServices',
    ).mockReturnValue(questionTodoBackgroundTaskActivationServices);

    const bundle = createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam(seam);

    bundle.backgroundTaskStreamTriggerViewHost.resetBackgroundTaskIndicator('tab-1');
    expect(seam.getBackgroundTaskHost).toHaveBeenCalled();
    expect(seam.getBackgroundTaskHost().resetBackgroundTaskIndicator)
      .toHaveBeenCalledWith('tab-1');
  });
});
