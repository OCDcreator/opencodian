import {
  createQuestionTodoBackgroundTaskRuntimeViewHosts,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import {
  createBackgroundTaskIndicatorCoordinator,
  createBackgroundTaskLiveSignalCoordinator,
  createConversation,
  createConversationSyncRuntime,
  createFixture,
  createQuestionDockCoordinator,
  createQuestionDockSlotCoordinator,
  createRuntime,
  createSessionTodoCoordinator,
  createTabRuntimeStateBridge,
} from './QuestionTodoBackgroundTaskRuntimeViewHosts.testSupport';

describe('QuestionTodoBackgroundTaskRuntimeViewHosts late binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps shared post-sync hosts late-bound to the latest runtime collaborators', async () => {
    const fixture = createFixture();
    const {
      visibleConversationPostSyncStateViewHost,
      questionTodoBackgroundTaskRefreshViewHost,
    } = createQuestionTodoBackgroundTaskRuntimeViewHosts(fixture.host);
    const nextConversation = createConversation('conversation-next');
    const nextRuntime = createRuntime({
      sessionTodos: [{ id: 'todo-2', content: 'Next', status: 'pending' }],
    });
    const nextConversationSyncRuntime = createConversationSyncRuntime();
    const nextQuestionDockCoordinator = createQuestionDockCoordinator();
    const nextSessionTodoCoordinator = createSessionTodoCoordinator();

    fixture.setConversation(nextConversation);
    fixture.setRuntime(nextRuntime);
    fixture.setConversationSyncRuntime(nextConversationSyncRuntime);
    fixture.setQuestionDockCoordinator(nextQuestionDockCoordinator);
    fixture.setSessionTodoCoordinator(nextSessionTodoCoordinator);

    expect(visibleConversationPostSyncStateViewHost.getCurrentConversation()).toEqual(
      nextConversation,
    );
    visibleConversationPostSyncStateViewHost.setTabConversationSyncFingerprint(
      'tab-next',
      'fingerprint-late',
    );

    expect(questionTodoBackgroundTaskRefreshViewHost.getCurrentConversation()).toEqual(
      nextConversation,
    );
    expect(questionTodoBackgroundTaskRefreshViewHost.getTabRuntimeState('tab-next')).toBe(
      nextRuntime,
    );
    expect(
      questionTodoBackgroundTaskRefreshViewHost.hasIncompleteTodos([
        { id: 'todo-2', content: 'Next', status: 'pending' },
      ]),
    ).toBe(true);
    await questionTodoBackgroundTaskRefreshViewHost.refreshPendingQuestionsForTab(
      'tab-next',
      'session-question-next',
    );
    await questionTodoBackgroundTaskRefreshViewHost.refreshTabSessionTodos(
      'tab-next',
      'session-next',
      { suppressErrors: true },
    );

    expect(nextConversationSyncRuntime.setTabConversationSyncFingerprint)
      .toHaveBeenCalledWith('tab-next', 'fingerprint-late');
    expect(nextQuestionDockCoordinator.refreshPendingQuestionsForTab)
      .toHaveBeenCalledWith('tab-next', 'session-question-next');
    expect(nextSessionTodoCoordinator.hasIncompleteTodos).toHaveBeenCalledWith([
      { id: 'todo-2', content: 'Next', status: 'pending' },
    ]);
    expect(nextSessionTodoCoordinator.refreshTabSessionTodos)
      .toHaveBeenCalledWith('tab-next', 'session-next', { suppressErrors: true });
  });

  it('keeps handoff, activation, and stream hosts late-bound to the latest runtime collaborators', async () => {
    const fixture = createFixture();
    const {
      backgroundConversationPostSyncHandoffViewHost,
      questionTodoBackgroundTaskActivationViewHost,
      backgroundTaskStreamTriggerViewHost,
    } = createQuestionTodoBackgroundTaskRuntimeViewHosts(fixture.host);
    const nextConversation = createConversation('conversation-next');
    const nextRuntime = createRuntime();
    const nextQuestionDockSlotCoordinator = createQuestionDockSlotCoordinator();
    const nextSessionTodoCoordinator = createSessionTodoCoordinator();
    const nextBackgroundTaskIndicatorCoordinator =
      createBackgroundTaskIndicatorCoordinator();
    const nextBackgroundTaskLiveSignalCoordinator =
      createBackgroundTaskLiveSignalCoordinator();
    const nextTabRuntimeStateBridge = createTabRuntimeStateBridge();

    fixture.setActiveTabId('tab-next');
    fixture.setConversation(nextConversation);
    fixture.setRuntime(nextRuntime);
    fixture.setSessionIdForTab('tab-next', 'session-next-trigger');
    fixture.setQuestionDockSlotCoordinator(nextQuestionDockSlotCoordinator);
    fixture.setSessionTodoCoordinator(nextSessionTodoCoordinator);
    fixture.setBackgroundTaskIndicatorCoordinator(nextBackgroundTaskIndicatorCoordinator);
    fixture.setBackgroundTaskLiveSignalCoordinator(nextBackgroundTaskLiveSignalCoordinator);
    fixture.setTabRuntimeStateBridge(nextTabRuntimeStateBridge);

    expect(questionTodoBackgroundTaskActivationViewHost.getCurrentConversation()).toEqual(
      nextConversation,
    );
    questionTodoBackgroundTaskActivationViewHost.renderQuestionDock();
    await backgroundConversationPostSyncHandoffViewHost.flushBackgroundTaskPostSyncWriteback(
      'tab-next',
      nextConversation,
    );
    backgroundConversationPostSyncHandoffViewHost.markBackgroundTaskAuthoritativeSync(
      'tab-next',
      'message.updated',
    );
    backgroundConversationPostSyncHandoffViewHost.setTabNeedsAttention('tab-next', true);
    expect(backgroundTaskStreamTriggerViewHost.getActiveTabId()).toBe('tab-next');
    expect(backgroundTaskStreamTriggerViewHost.getTabRuntimeState('tab-next')).toBe(nextRuntime);
    backgroundTaskStreamTriggerViewHost.applyStreamingTodoSnapshotFromTool(
      {
        id: 'tool-call-next',
        name: 'todowrite',
        status: 'running',
        input: { todos: [{ content: 'Next snapshot' }] },
      },
      'tab-next',
    );
    expect(backgroundTaskStreamTriggerViewHost.getSessionIdForTab('tab-next'))
      .toBe('session-next-trigger');
    await backgroundTaskStreamTriggerViewHost.refreshTabSessionTodos(
      'tab-next',
      'session-next',
      { suppressErrors: true },
    );

    expect(nextQuestionDockSlotCoordinator.render).toHaveBeenCalledTimes(1);
    expect(nextBackgroundTaskIndicatorCoordinator.flushCompletionNoticesAndSyncStreamLikeState)
      .toHaveBeenCalledWith('tab-next', nextConversation);
    expect(nextBackgroundTaskLiveSignalCoordinator.markAuthoritativeSync)
      .toHaveBeenCalledWith('tab-next', 'message.updated');
    expect(nextTabRuntimeStateBridge.setNeedsAttention).toHaveBeenCalledWith(
      'tab-next',
      true,
    );
    expect(nextSessionTodoCoordinator.applyStreamingTodoSnapshotFromTool)
      .toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tool-call-next', name: 'todowrite' }),
        'tab-next',
      );
    expect(nextSessionTodoCoordinator.refreshTabSessionTodos)
      .toHaveBeenCalledWith('tab-next', 'session-next', { suppressErrors: true });
  });
});
