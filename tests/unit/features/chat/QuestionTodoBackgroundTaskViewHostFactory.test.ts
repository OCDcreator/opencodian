import type { Conversation } from '../../../../src/core/types';
import {
  createQuestionTodoBackgroundTaskViewHosts,
  type QuestionTodoBackgroundTaskViewHostFactoryHost,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskViewHostFactory';
import type { QuestionTodoStatusRefreshRuntime } from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';

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

function createRuntime(
  overrides?: Partial<QuestionTodoStatusRefreshRuntime>,
): QuestionTodoStatusRefreshRuntime {
  return {
    sessionTodos: [],
    backgroundTaskLaunches: new Map(),
    backgroundTaskWaitingForFollowUp: false,
    ...overrides,
  };
}

function createHost(
  currentConversation: Conversation | null = createConversation('conversation-active'),
  runtime: QuestionTodoStatusRefreshRuntime | null = createRuntime(),
): Mocked<QuestionTodoBackgroundTaskViewHostFactoryHost> {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getTabRuntimeState: jest.fn().mockImplementation((tabId: string | null) =>
      tabId ? runtime : null,
    ),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    setTabConversationSyncFingerprint: jest.fn(),
    renderSessionTodoDock: jest.fn(),
    resetBackgroundTaskIndicator: jest.fn(),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
}

describe('QuestionTodoBackgroundTaskViewHostFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives refresh and activation adapter hosts from one shared host', async () => {
    const currentConversation = createConversation('conversation-active');
    const runtime = createRuntime();
    const nextConversation = createConversation('conversation-next');
    const host = createHost(currentConversation, runtime);

    const { refreshViewHostAdapterHost, activationViewHostAdapterHost } =
      createQuestionTodoBackgroundTaskViewHosts(host);

    expect(refreshViewHostAdapterHost.getCurrentConversation()).toBe(currentConversation);
    expect(refreshViewHostAdapterHost.getTabRuntimeState('tab-1')).toBe(runtime);

    refreshViewHostAdapterHost.syncBackgroundTaskStateFromConversation(nextConversation, 'tab-1');
    refreshViewHostAdapterHost.setCurrentConversationRevertState({
      messageID: 'assistant-1',
    });
    refreshViewHostAdapterHost.setTabConversationSyncFingerprint('tab-1', 'fingerprint-next');

    expect(activationViewHostAdapterHost.getCurrentConversation()).toBe(currentConversation);
    activationViewHostAdapterHost.renderSessionTodoDock('tab-1');
    activationViewHostAdapterHost.resetBackgroundTaskIndicator();
    activationViewHostAdapterHost.syncBackgroundTaskStateFromConversation(
      nextConversation,
      'tab-1',
    );
    await activationViewHostAdapterHost.renderBackgroundTaskIndicatorIfNeeded('tab-1');

    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenNthCalledWith(
      1,
      nextConversation,
      'tab-1',
    );
    expect(host.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-1',
    });
    expect(host.setTabConversationSyncFingerprint).toHaveBeenCalledWith(
      'tab-1',
      'fingerprint-next',
    );
    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(host.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenNthCalledWith(
      2,
      nextConversation,
      'tab-1',
    );
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
  });
});
