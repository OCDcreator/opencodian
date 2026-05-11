import type { Conversation } from '../../../../src/core/types';
import {
  createQuestionTodoBackgroundTaskActivationHosts,
  createQuestionTodoBackgroundTaskActivationServices,
  createQuestionTodoBackgroundTaskActivationViewHostAdapter,
  type QuestionTodoBackgroundTaskActivationViewHost,
  type QuestionTodoBackgroundTaskActivationViewHostAdapterHost,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter';
import type { QuestionTodoStatusRefreshCoordinator } from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';

type QuestionTodoActivationRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterActivation'
>;

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(id = 'conversation-active'): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `session-${id}`,
    messages: [],
  };
}

function createViewHost(
  currentConversation: Conversation | null = createConversation('conversation-active'),
): Mocked<QuestionTodoBackgroundTaskActivationViewHost> {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    renderQuestionDock: jest.fn(),
    updateSessionTodoDockForTab: jest.fn(),
    renderSessionTodoDock: jest.fn(),
    resetBackgroundTaskIndicator: jest.fn(),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
}

function createViewHostAdapterHost(
  currentConversation: Conversation | null = createConversation('conversation-active'),
): Mocked<QuestionTodoBackgroundTaskActivationViewHostAdapterHost> {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    renderSessionTodoDock: jest.fn(),
    resetBackgroundTaskIndicator: jest.fn(),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
}

function createRefreshCoordinator(): Mocked<QuestionTodoActivationRefreshPort> {
  return {
    refreshAfterActivation: jest.fn().mockResolvedValue(undefined),
  };
}

describe('QuestionTodoBackgroundTaskActivationHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adapts late-bound question/todo activation ports into one shared view host', async () => {
    const currentConversation = createConversation('conversation-active');
    const viewHost = createViewHostAdapterHost(currentConversation);

    const lateBoundPorts: {
      questionDockSlotCoordinator?: {
        render: jest.Mock<void, []>;
      };
      sessionTodoCoordinator?: {
        updateForTab: jest.Mock<void, [string]>;
      };
    } = {};

    const adaptedViewHost = createQuestionTodoBackgroundTaskActivationViewHostAdapter({
      viewHost,
      getQuestionDockSlotCoordinator: () => lateBoundPorts.questionDockSlotCoordinator!,
      getSessionTodoCoordinator: () => lateBoundPorts.sessionTodoCoordinator!,
    });

    lateBoundPorts.questionDockSlotCoordinator = {
      render: jest.fn(),
    };
    lateBoundPorts.sessionTodoCoordinator = {
      updateForTab: jest.fn(),
    };

    const nextConversation = createConversation('conversation-next');

    expect(adaptedViewHost.getCurrentConversation()).toBe(currentConversation);
    adaptedViewHost.renderQuestionDock();
    adaptedViewHost.updateSessionTodoDockForTab('tab-1');
    adaptedViewHost.renderSessionTodoDock('tab-1');
    adaptedViewHost.resetBackgroundTaskIndicator();
    adaptedViewHost.syncBackgroundTaskStateFromConversation(nextConversation, 'tab-1');
    await adaptedViewHost.renderBackgroundTaskIndicatorIfNeeded('tab-1');

    expect(lateBoundPorts.questionDockSlotCoordinator.render).toHaveBeenCalledTimes(1);
    expect(lateBoundPorts.sessionTodoCoordinator.updateForTab).toHaveBeenCalledWith('tab-1');
    expect(viewHost.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(viewHost.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(viewHost.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      nextConversation,
      'tab-1',
    );
    expect(viewHost.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
  });

  it('derives the two activation host shapes from one shared view host', async () => {
    const currentConversation = createConversation('conversation-active');
    const viewHost = createViewHost(currentConversation);
    const nextConversation = createConversation('conversation-next');
    const hosts = createQuestionTodoBackgroundTaskActivationHosts(viewHost);

    hosts.questionTodoActivationRefreshCoordinatorHost.renderQuestionDock();
    hosts.questionTodoActivationRefreshCoordinatorHost.updateSessionTodoDockForTab('tab-1');
    hosts.questionTodoActivationRefreshCoordinatorHost.renderSessionTodoDock('tab-1');
    hosts.backgroundTaskActivationIndicator.prepareOpenConversation(nextConversation);
    hosts.backgroundTaskActivationIndicator.syncOpenConversationState(
      nextConversation,
      'tab-1',
    );
    hosts.backgroundTaskActivationIndicator.renderOpenConversationIndicator('tab-1');

    expect(viewHost.renderQuestionDock).toHaveBeenCalledTimes(1);
    expect(viewHost.updateSessionTodoDockForTab).toHaveBeenCalledWith('tab-1');
    expect(viewHost.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(viewHost.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(viewHost.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      nextConversation,
      'tab-1',
    );
    expect(viewHost.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
  });

  it('keeps the activation indicator when preparing the current conversation', () => {
    const currentConversation = createConversation('conversation-active');
    const viewHost = createViewHost(currentConversation);
    const hosts = createQuestionTodoBackgroundTaskActivationHosts(viewHost);

    hosts.backgroundTaskActivationIndicator.prepareOpenConversation(currentConversation);

    expect(viewHost.resetBackgroundTaskIndicator).not.toHaveBeenCalled();
  });

  it('wires activation coordinators through the shared activation bundle', async () => {
    const currentConversation = createConversation('conversation-active');
    const nextConversation = createConversation('conversation-next');
    const viewHost = createViewHost(currentConversation);
    const refreshCoordinator = createRefreshCoordinator();

    const services = createQuestionTodoBackgroundTaskActivationServices(
      viewHost,
      refreshCoordinator,
    );

    services.questionTodoActivationRefreshCoordinator.applyActivationPreflight('tab-1');
    services.questionTodoActivationRefreshCoordinator.applyConversationActivation(
      'tab-1',
      'session-1',
    );
    services.backgroundTaskActivationIndicatorCoordinator.prepareOpenConversation(
      nextConversation,
    );
    services.backgroundTaskActivationIndicatorCoordinator.syncOpenConversationState(
      nextConversation,
      'tab-1',
    );
    await services.backgroundTaskActivationIndicatorCoordinator.renderLoadedConversationIndicator(
      'tab-1',
    );

    expect(viewHost.renderQuestionDock).toHaveBeenCalledTimes(2);
    expect(viewHost.updateSessionTodoDockForTab).toHaveBeenCalledWith('tab-1');
    expect(viewHost.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.refreshAfterActivation).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(viewHost.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(viewHost.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      nextConversation,
      'tab-1',
    );
    expect(viewHost.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
  });
});
