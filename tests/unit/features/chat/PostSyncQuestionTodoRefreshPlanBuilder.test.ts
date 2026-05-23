import type { Conversation } from '../../../../src/core/types';
import {
  PostSyncQuestionTodoRefreshPlanBuilder,
  type PostSyncQuestionTodoRefreshPlanBuilderHost,
} from '../../../../src/features/chat/services/PostSyncQuestionTodoRefreshPlanBuilder';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

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

function createHost(): Mocked<PostSyncQuestionTodoRefreshPlanBuilderHost> {
  return {
    getCurrentConversationSessionId: jest.fn().mockReturnValue('active-session'),
  };
}

describe('PostSyncQuestionTodoRefreshPlanBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps visible refreshes onto the current live todo/status session', () => {
    const host = createHost();
    const builder = new PostSyncQuestionTodoRefreshPlanBuilder(host);

    expect(builder.createVisibleConversationPlan({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
    })).toEqual({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
      todoStatusSessionId: 'active-session',
    });
    expect(host.getCurrentConversationSessionId).toHaveBeenCalledTimes(1);
  });

  it('reuses the background conversation session for signal-synced question/todo refreshes', () => {
    const builder = new PostSyncQuestionTodoRefreshPlanBuilder(createHost());
    const conversation = createConversation();

    expect(builder.createSignalSyncedBackgroundConversationPlan({
      tabId: 'tab-bg',
      conversation,
      tabHasBackgroundTask: false,
    })).toEqual({
      tabId: 'tab-bg',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      forceTodoStatusRefresh: false,
    });
  });

  it('forces background-tab refresh plans even when no live background task remains', () => {
    const builder = new PostSyncQuestionTodoRefreshPlanBuilder(createHost());
    const conversation = createConversation();

    expect(builder.createBackgroundTabConversationPlan({
      tabId: 'tab-bg',
      conversation,
    })).toEqual({
      tabId: 'tab-bg',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      forceTodoStatusRefresh: true,
    });
  });

  it('returns null signal-synced plan for non-OpenCode conversations', () => {
    const builder = new PostSyncQuestionTodoRefreshPlanBuilder(createHost());
    const conversation = createConversation();
    conversation.backend = 'claude-code';
    conversation.backendSessionId = 'claude-session-1';

    expect(builder.createSignalSyncedBackgroundConversationPlan({
      tabId: 'tab-bg',
      conversation,
      tabHasBackgroundTask: true,
    })).toBeNull();
  });

  it('returns null background-tab plan for non-OpenCode conversations', () => {
    const builder = new PostSyncQuestionTodoRefreshPlanBuilder(createHost());
    const conversation = createConversation();
    conversation.backend = 'claude-code';

    expect(builder.createBackgroundTabConversationPlan({
      tabId: 'tab-bg',
      conversation,
    })).toBeNull();
  });

  it('uses getConversationBackendSessionId for identity resolution', () => {
    const builder = new PostSyncQuestionTodoRefreshPlanBuilder(createHost());
    const conversation = createConversation();
    // No backendSessionId set, so getConversationBackendSessionId falls through to openCodeSessionId
    expect(builder.createBackgroundTabConversationPlan({
      tabId: 'tab-bg',
      conversation,
    })?.questionSessionId).toBe('session-1');

    // With backendSessionId, identity resolution prefers it
    conversation.backendSessionId = 'backend-session-override';
    const plan = builder.createBackgroundTabConversationPlan({
      tabId: 'tab-bg',
      conversation,
    });
    expect(plan?.questionSessionId).toBe('backend-session-override');
    expect(plan?.todoStatusSessionId).toBe('backend-session-override');
  });
});
