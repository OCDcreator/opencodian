import {
  createConversation,
  createManualScheduler,
  createRuntimeState,
  createService,
  createTab,
} from './ConversationSyncOrchestrationService.testSupport';

describe('ConversationSyncOrchestrationService signal sync routing', () => {
  it('dispatches active signal sync through the visible conversation callback', async () => {
    const { service, runtime } = createService({
      activeTabId: 'tab-1',
      currentConversation: createConversation('conversation-1'),
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncTabConversation = jest.fn().mockResolvedValue(undefined);

    await service.syncConversationFromSignal('tab-1', 'message.updated', {
      syncVisibleConversation,
      syncTabConversation,
    });

    expect(syncVisibleConversation).toHaveBeenCalledTimes(1);
    expect(syncTabConversation).not.toHaveBeenCalled();
    expect(runtime.runTabConversationSync).not.toHaveBeenCalled();
  });

  it('loads inactive tab conversations before dispatching signal sync work', async () => {
    const conversation = createConversation('conversation-2');
    const { service, host, runtime } = createService({
      activeTabId: 'tab-active',
      tabs: [
        createTab({
          id: 'tab-2',
          conversationId: 'conversation-2',
          hasBackgroundTask: true,
        }),
      ],
      conversations: {
        'conversation-2': conversation,
      },
      runtimes: {
        'tab-2': createRuntimeState(),
      },
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncTabConversation = jest.fn().mockResolvedValue(undefined);

    await service.syncConversationFromSignal('tab-2', 'session.diff', {
      syncVisibleConversation,
      syncTabConversation,
    });

    expect(host.getConversationById).toHaveBeenCalledWith('conversation-2');
    expect(runtime.runTabConversationSync).toHaveBeenCalledTimes(1);
    expect(syncVisibleConversation).not.toHaveBeenCalled();
    expect(syncTabConversation).toHaveBeenCalledWith({
      tabId: 'tab-2',
      conversation,
      previousFingerprint: 'previous-fingerprint',
      reason: 'session.diff',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: true,
    });
  });

  it('debounces and merges signal sync reasons before dispatching hidden-tab work', async () => {
    const conversation = createConversation('conversation-2');
    const manualScheduler = createManualScheduler();
    const { service, runtime } = createService({
      activeTabId: 'tab-active',
      tabs: [
        createTab({
          id: 'tab-2',
          conversationId: 'conversation-2',
          hasBackgroundTask: true,
        }),
      ],
      conversations: {
        'conversation-2': conversation,
      },
      runtimes: {
        'tab-2': createRuntimeState(),
      },
      scheduler: manualScheduler.scheduler,
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncTabConversation = jest.fn().mockResolvedValue(undefined);

    service.scheduleConversationSyncFromSignal('tab-2', 'session.diff', {
      syncVisibleConversation,
      syncTabConversation,
    });
    service.scheduleConversationSyncFromSignal('tab-2', 'message.updated', {
      syncVisibleConversation,
      syncTabConversation,
    });

    expect(manualScheduler.getTimeoutCount()).toBe(1);
    await manualScheduler.runNextTimeout();

    expect(syncVisibleConversation).not.toHaveBeenCalled();
    expect(runtime.runTabConversationSync).toHaveBeenCalledTimes(1);
    expect(syncTabConversation).toHaveBeenCalledWith({
      tabId: 'tab-2',
      conversation,
      previousFingerprint: 'previous-fingerprint',
      reason: 'message.updated+session.diff',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: true,
    });
  });

  it('cancels scheduled signal sync work when the tab is cleared', async () => {
    const manualScheduler = createManualScheduler();
    const { service, runtime } = createService({
      activeTabId: 'tab-active',
      tabs: [
        createTab({
          id: 'tab-2',
          conversationId: 'conversation-2',
        }),
      ],
      conversations: {
        'conversation-2': createConversation('conversation-2'),
      },
      runtimes: {
        'tab-2': createRuntimeState(),
      },
      scheduler: manualScheduler.scheduler,
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncTabConversation = jest.fn().mockResolvedValue(undefined);

    service.scheduleConversationSyncFromSignal('tab-2', 'session.diff', {
      syncVisibleConversation,
      syncTabConversation,
    });
    service.clearScheduledSignalConversationSync('tab-2');

    expect(manualScheduler.getTimeoutCount()).toBe(0);

    expect(runtime.runTabConversationSync).not.toHaveBeenCalled();
    expect(syncVisibleConversation).not.toHaveBeenCalled();
    expect(syncTabConversation).not.toHaveBeenCalled();
  });
});
