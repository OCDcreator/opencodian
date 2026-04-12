import type { Conversation } from '../../../../src/core/types';
import {
  type BackgroundTaskPostSyncWritebackPort,
  PostSyncQuestionTodoRefreshFacade,
  type PostSyncQuestionTodoRefreshFacadeHost,
} from '../../../../src/features/chat/services/PostSyncQuestionTodoRefreshFacade';
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

function createHost(callOrder?: string[]): Mocked<PostSyncQuestionTodoRefreshFacadeHost> {
  return {
    getCurrentConversationSessionId: jest.fn().mockReturnValue('active-session'),
    syncBackgroundTaskStateFromConversation: jest.fn(() => {
      callOrder?.push('rebuild');
    }),
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
): jest.Mocked<BackgroundTaskPostSyncWritebackPort> {
  return {
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
    const host = createHost();
    const refreshCoordinator = createRefreshCoordinator();
    const writebackPort = createWritebackPort();
    const facade = new PostSyncQuestionTodoRefreshFacade(
      host,
      refreshCoordinator,
      writebackPort,
    );

    await facade.refreshVisibleConversation({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
    });

    expect(host.getCurrentConversationSessionId).toHaveBeenCalledTimes(1);
    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
      todoStatusSessionId: 'active-session',
    });
  });

  it('reuses the post-sync refresh order for background conversations before completion updates', async () => {
    const callOrder: string[] = [];
    const conversation = createConversation();
    const host = createHost(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const writebackPort = createWritebackPort(callOrder);
    const facade = new PostSyncQuestionTodoRefreshFacade(
      host,
      refreshCoordinator,
      writebackPort,
    );

    await facade.refreshBackgroundConversation({
      tabId: 'tab-bg',
      conversation,
      forceTodoStatusRefresh: true,
    });

    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      forceTodoStatusRefresh: true,
      afterPendingQuestionRefresh: expect.any(Function),
    });
    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(conversation, 'tab-bg');
    expect(writebackPort.flushBackgroundTaskPostSyncWriteback).toHaveBeenCalledWith(
      'tab-bg',
      conversation,
    );
    expect(callOrder).toEqual(['refresh', 'rebuild', 'writeback']);
  });
});
