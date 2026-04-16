import type { TabConversationSyncContext } from './ConversationSyncOrchestrationService.testSupport';
import {
  createConversation,
  createManualScheduler,
  createRuntimeState,
  createService,
  createTab,
} from './ConversationSyncOrchestrationService.testSupport';

describe('ConversationSyncOrchestrationService background sync loop', () => {
  it('polls only eligible non-active background-task tabs', async () => {
    const callbackContexts: TabConversationSyncContext[] = [];
    const { service, host } = createService({
      currentConversation: createConversation('conversation-active'),
      tabs: [
        createTab({
          id: 'tab-active',
          conversationId: 'conversation-active',
          hasBackgroundTask: true,
        }),
        createTab({
          id: 'tab-no-task',
          conversationId: 'conversation-no-task',
        }),
        createTab({
          id: 'tab-busy',
          conversationId: 'conversation-busy',
          hasBackgroundTask: true,
        }),
        createTab({
          id: 'tab-eligible',
          conversationId: 'conversation-eligible',
          hasBackgroundTask: true,
        }),
      ],
      conversations: {
        'conversation-eligible': createConversation('conversation-eligible'),
      },
      runtimes: {
        'tab-active': createRuntimeState(),
        'tab-no-task': createRuntimeState(),
        'tab-busy': createRuntimeState({ isStreaming: true }),
        'tab-eligible': createRuntimeState(),
      },
    });

    await service.syncBackgroundTaskTabs(async (context) => {
      callbackContexts.push(context);
    });

    expect(host.getConversationById).toHaveBeenCalledTimes(1);
    expect(host.getConversationById).toHaveBeenCalledWith('conversation-eligible');
    expect(callbackContexts).toEqual([
      expect.objectContaining({
        tabId: 'tab-eligible',
        previousFingerprint: 'previous-fingerprint',
      }),
    ]);
  });

  it('starts and stops the background sync loop around eligible work', async () => {
    const manualScheduler = createManualScheduler();
    const { service } = createService({
      currentConversation: null,
      tabs: [
        createTab({
          id: 'tab-background',
          conversationId: 'conversation-background',
          hasBackgroundTask: true,
        }),
      ],
      scheduler: manualScheduler.scheduler,
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncBackgroundTaskTabs = jest.fn().mockResolvedValue(undefined);

    service.startConversationSyncLoop({
      syncVisibleConversation,
      syncBackgroundTaskTabs,
    });
    expect(manualScheduler.getIntervalCount()).toBe(1);
    manualScheduler.runIntervals();

    expect(syncVisibleConversation).toHaveBeenCalledTimes(1);
    expect(syncBackgroundTaskTabs).toHaveBeenCalledTimes(1);

    service.stopConversationSyncLoop();
    expect(manualScheduler.getIntervalCount()).toBe(0);
    manualScheduler.runIntervals();

    expect(syncVisibleConversation).toHaveBeenCalledTimes(1);
    expect(syncBackgroundTaskTabs).toHaveBeenCalledTimes(1);
  });

  it('skips starting the background sync loop when no sync targets exist', async () => {
    const manualScheduler = createManualScheduler();
    const { service } = createService({
      currentConversation: null,
      tabs: [
        createTab({
          id: 'tab-idle',
          conversationId: null,
          hasBackgroundTask: false,
        }),
      ],
      scheduler: manualScheduler.scheduler,
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncBackgroundTaskTabs = jest.fn().mockResolvedValue(undefined);

    service.startConversationSyncLoop({
      syncVisibleConversation,
      syncBackgroundTaskTabs,
    });

    expect(manualScheduler.getIntervalCount()).toBe(0);
    expect(syncVisibleConversation).not.toHaveBeenCalled();
    expect(syncBackgroundTaskTabs).not.toHaveBeenCalled();
  });
});
