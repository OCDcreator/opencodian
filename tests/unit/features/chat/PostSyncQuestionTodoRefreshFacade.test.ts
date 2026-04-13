import type { Conversation } from '../../../../src/core/types';
import {
  type BackgroundTaskPostSyncRefreshPort,
  PostSyncQuestionTodoRefreshFacade,
} from '../../../../src/features/chat/services/PostSyncQuestionTodoRefreshFacade';
import type {
  BackgroundTabConversationRefreshPlanOptions,
  PostSyncQuestionTodoRefreshPlanBuilder,
  SignalSyncedBackgroundConversationRefreshPlanOptions,
  VisibleConversationRefreshPlanOptions,
} from '../../../../src/features/chat/services/PostSyncQuestionTodoRefreshPlanBuilder';
import type {
  PostSyncQuestionTodoStatusRefreshOptions,
  QuestionTodoStatusRefreshCoordinator,
} from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterPostSync'
>;

function createConversation(): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [],
  };
}

type PostSyncQuestionTodoRefreshPlanPort = Pick<
  PostSyncQuestionTodoRefreshPlanBuilder,
  | 'createBackgroundTabConversationPlan'
  | 'createSignalSyncedBackgroundConversationPlan'
  | 'createVisibleConversationPlan'
>;

function createPlanBuilder(): jest.Mocked<PostSyncQuestionTodoRefreshPlanPort> {
  return {
    createVisibleConversationPlan: jest.fn(
      (options: VisibleConversationRefreshPlanOptions) => ({
        tabId: options.tabId,
        questionSessionId: options.questionSessionId,
        todoStatusSessionId: 'visible-todo-session',
      }),
    ),
    createSignalSyncedBackgroundConversationPlan: jest.fn(
      (options: SignalSyncedBackgroundConversationRefreshPlanOptions) => ({
        tabId: options.tabId,
        questionSessionId: options.conversation.openCodeSessionId,
        todoStatusSessionId: options.conversation.openCodeSessionId,
        forceTodoStatusRefresh: options.tabHasBackgroundTask,
      }),
    ),
    createBackgroundTabConversationPlan: jest.fn(
      (options: BackgroundTabConversationRefreshPlanOptions) => ({
        tabId: options.tabId,
        questionSessionId: options.conversation.openCodeSessionId,
        todoStatusSessionId: options.conversation.openCodeSessionId,
        forceTodoStatusRefresh: true,
      }),
    ),
  };
}

function createRefreshCoordinator(callOrder?: string[]): jest.Mocked<QuestionTodoStatusRefreshPort> {
  return {
    refreshAfterPostSync: jest.fn(async (options: PostSyncQuestionTodoStatusRefreshOptions) => {
      callOrder?.push('refresh');
      await options.afterPendingQuestionRefresh?.();
    }),
  };
}

function createWritebackPort(
  callOrder?: string[],
): jest.Mocked<BackgroundTaskPostSyncRefreshPort> {
  return {
    syncBackgroundTaskStateFromConversation: jest.fn(() => {
      callOrder?.push('rebuild');
    }),
    flushBackgroundTaskPostSyncWriteback: jest.fn(async () => {
      callOrder?.push('writeback');
    }),
  };
}

describe('PostSyncQuestionTodoRefreshFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes visible conversations against the current live session id', async () => {
    const planBuilder = createPlanBuilder();
    const refreshCoordinator = createRefreshCoordinator();
    const writebackPort = createWritebackPort();
    const facade = new PostSyncQuestionTodoRefreshFacade(
      planBuilder,
      refreshCoordinator,
      writebackPort,
    );

    await facade.refreshVisibleConversation({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
    });

    expect(planBuilder.createVisibleConversationPlan).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
    });
    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
      todoStatusSessionId: 'visible-todo-session',
    });
  });

  it('reuses the post-sync refresh order for signal-synced background conversations before completion updates', async () => {
    const callOrder: string[] = [];
    const conversation = createConversation();
    const planBuilder = createPlanBuilder();
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const writebackPort = createWritebackPort(callOrder);
    const facade = new PostSyncQuestionTodoRefreshFacade(
      planBuilder,
      refreshCoordinator,
      writebackPort,
    );

    await facade.refreshSignalSyncedBackgroundConversation({
      tabId: 'tab-bg',
      conversation,
      tabHasBackgroundTask: false,
    });

    expect(planBuilder.createSignalSyncedBackgroundConversationPlan).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
      tabHasBackgroundTask: false,
    });
    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      forceTodoStatusRefresh: false,
      afterPendingQuestionRefresh: expect.any(Function),
    });
    expect(writebackPort.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      conversation,
      'tab-bg',
    );
    expect(writebackPort.flushBackgroundTaskPostSyncWriteback).toHaveBeenCalledWith(
      'tab-bg',
      conversation,
    );
    expect(callOrder).toEqual(['refresh', 'rebuild', 'writeback']);
  });

  it('delegates background-tab forcing to the refresh-plan builder', async () => {
    const conversation = createConversation();
    const planBuilder = createPlanBuilder();
    const refreshCoordinator = createRefreshCoordinator();
    const writebackPort = createWritebackPort();
    const facade = new PostSyncQuestionTodoRefreshFacade(
      planBuilder,
      refreshCoordinator,
      writebackPort,
    );

    await facade.refreshBackgroundTabConversation({
      tabId: 'tab-bg',
      conversation,
    });

    expect(planBuilder.createBackgroundTabConversationPlan).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
    });
    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      forceTodoStatusRefresh: true,
      afterPendingQuestionRefresh: expect.any(Function),
    });
  });
});
