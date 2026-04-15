import {
  createQuestionTodoBackgroundTaskRuntimeViewHosts,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import {
  createConversation,
  createFixture,
} from './QuestionTodoBackgroundTaskRuntimeViewHosts.testSupport';

describe('QuestionTodoBackgroundTaskRuntimeViewHosts forwarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards visible post-sync state and refresh host calls through the shared view host', async () => {
    const fixture = createFixture();
    const {
      visibleConversationPostSyncStateViewHost,
      questionTodoBackgroundTaskRefreshViewHost,
    } = createQuestionTodoBackgroundTaskRuntimeViewHosts(fixture.host);

    expect(visibleConversationPostSyncStateViewHost.getCurrentConversation()).toEqual(
      createConversation('conversation-active'),
    );
    visibleConversationPostSyncStateViewHost.setCurrentConversationRevertState({
      messageID: 'message-1',
    });
    visibleConversationPostSyncStateViewHost.setTabConversationSyncFingerprint(
      'tab-active',
      'fingerprint-next',
    );

    expect(questionTodoBackgroundTaskRefreshViewHost.getCurrentConversation()).toEqual(
      createConversation('conversation-active'),
    );
    expect(questionTodoBackgroundTaskRefreshViewHost.getTabRuntimeState('tab-active')).toBe(
      fixture.getRuntime(),
    );
    expect(
      questionTodoBackgroundTaskRefreshViewHost.hasIncompleteTodos([
        { id: 'todo-1', content: 'Todo', status: 'pending' },
      ]),
    ).toBe(true);
    await questionTodoBackgroundTaskRefreshViewHost.refreshPendingQuestionsForTab(
      'tab-active',
      'session-question',
    );
    await questionTodoBackgroundTaskRefreshViewHost.refreshTabSessionStatus(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );
    await questionTodoBackgroundTaskRefreshViewHost.refreshTabSessionTodos(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );

    expect(fixture.host.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'message-1',
    });
    expect(fixture.getConversationSyncRuntime().setTabConversationSyncFingerprint)
      .toHaveBeenCalledWith('tab-active', 'fingerprint-next');
    expect(fixture.host.getTabRuntimeState).toHaveBeenCalledWith('tab-active');
    expect(fixture.getQuestionDockCoordinator().refreshPendingQuestionsForTab)
      .toHaveBeenCalledWith('tab-active', 'session-question');
    expect(fixture.getSessionTodoCoordinator().hasIncompleteTodos).toHaveBeenCalledWith([
      { id: 'todo-1', content: 'Todo', status: 'pending' },
    ]);
    expect(fixture.getSessionTodoCoordinator().refreshTabSessionStatus)
      .toHaveBeenCalledWith('tab-active', 'session-status', { suppressErrors: true });
    expect(fixture.getSessionTodoCoordinator().refreshTabSessionTodos)
      .toHaveBeenCalledWith('tab-active', 'session-status', { suppressErrors: true });
  });

  it('forwards background handoff calls through the current bridge collaborators', async () => {
    const fixture = createFixture();
    const {
      backgroundConversationPostSyncHandoffViewHost,
    } = createQuestionTodoBackgroundTaskRuntimeViewHosts(fixture.host);
    const conversation = createConversation('conversation-next');

    backgroundConversationPostSyncHandoffViewHost.syncBackgroundTaskStateFromConversation(
      conversation,
      'tab-active',
    );
    await backgroundConversationPostSyncHandoffViewHost.flushBackgroundTaskPostSyncWriteback(
      'tab-active',
      conversation,
    );
    backgroundConversationPostSyncHandoffViewHost.markBackgroundTaskAuthoritativeSync(
      'tab-active',
      'session.diff',
    );
    backgroundConversationPostSyncHandoffViewHost.setTabNeedsAttention('tab-active', true);

    expect(fixture.host.syncBackgroundTaskStateFromConversation)
      .toHaveBeenCalledWith(conversation, 'tab-active');
    expect(fixture.getBackgroundTaskIndicatorCoordinator().flushCompletionNoticesAndSyncStreamLikeState)
      .toHaveBeenCalledWith('tab-active', conversation);
    expect(fixture.getBackgroundTaskLiveSignalCoordinator().markAuthoritativeSync)
      .toHaveBeenCalledWith('tab-active', 'session.diff');
    expect(fixture.getTabRuntimeStateBridge().setNeedsAttention).toHaveBeenCalledWith(
      'tab-active',
      true,
    );
  });

  it('forwards activation and background-stream calls through the current host collaborators', async () => {
    const fixture = createFixture();
    const {
      questionTodoBackgroundTaskActivationViewHost,
      backgroundTaskStreamTriggerViewHost,
    } = createQuestionTodoBackgroundTaskRuntimeViewHosts(fixture.host);
    const conversation = createConversation('conversation-next');

    expect(questionTodoBackgroundTaskActivationViewHost.getCurrentConversation()).toEqual(
      createConversation('conversation-active'),
    );
    questionTodoBackgroundTaskActivationViewHost.renderQuestionDock();
    questionTodoBackgroundTaskActivationViewHost.updateSessionTodoDockForTab('tab-active');
    questionTodoBackgroundTaskActivationViewHost.renderSessionTodoDock('tab-active');
    questionTodoBackgroundTaskActivationViewHost.resetBackgroundTaskIndicator();
    questionTodoBackgroundTaskActivationViewHost.syncBackgroundTaskStateFromConversation(
      conversation,
      'tab-active',
    );
    await questionTodoBackgroundTaskActivationViewHost.renderBackgroundTaskIndicatorIfNeeded(
      'tab-active',
    );
    expect(backgroundTaskStreamTriggerViewHost.getActiveTabId()).toBe('tab-active');
    expect(backgroundTaskStreamTriggerViewHost.getTabRuntimeState('tab-active')).toBe(
      fixture.getRuntime(),
    );
    backgroundTaskStreamTriggerViewHost.applyStreamingTodoSnapshotFromTool(
      {
        id: 'tool-call-1',
        name: 'todowrite',
        status: 'running',
        input: { todos: [{ content: 'streaming todo' }] },
      },
      'tab-active',
    );
    expect(backgroundTaskStreamTriggerViewHost.getSessionIdForTab('tab-active'))
      .toBe('session-active');
    await backgroundTaskStreamTriggerViewHost.refreshTabSessionTodos(
      'tab-active',
      'session-active',
      { suppressErrors: true },
    );
    backgroundTaskStreamTriggerViewHost.resetBackgroundTaskIndicator('tab-active');

    expect(fixture.getQuestionDockSlotCoordinator().render).toHaveBeenCalledTimes(1);
    expect(fixture.getSessionTodoCoordinator().updateForTab).toHaveBeenCalledWith(
      'tab-active',
    );
    expect(fixture.getSessionTodoCoordinator().applyStreamingTodoSnapshotFromTool)
      .toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tool-call-1', name: 'todowrite' }),
        'tab-active',
      );
    expect(fixture.getSessionTodoCoordinator().refreshTabSessionTodos)
      .toHaveBeenCalledWith('tab-active', 'session-active', { suppressErrors: true });
    expect(fixture.host.renderSessionTodoDock).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.resetBackgroundTaskIndicator).toHaveBeenNthCalledWith(
      1,
      'tab-active',
    );
    expect(fixture.host.resetBackgroundTaskIndicator).toHaveBeenNthCalledWith(
      2,
      'tab-active',
    );
    expect(fixture.host.syncBackgroundTaskStateFromConversation)
      .toHaveBeenCalledWith(conversation, 'tab-active');
    expect(fixture.host.renderBackgroundTaskIndicatorIfNeeded)
      .toHaveBeenCalledWith('tab-active');
  });
});
