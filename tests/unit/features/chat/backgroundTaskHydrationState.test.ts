import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

function createView(): OpenCodianView {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      effortLevel: 'medium',
      thinkingBudget: 0,
      locale: 'en',
      enableAutoScroll: true,
    },
    openCodeService: {},
    storage: {},
  } as never);
}

describe('OpenCodianView background task hydration state', () => {
  it('does not downgrade background tasks to stale before authoritative sync is ready', () => {
    const view = createView() as unknown as {
      backgroundTaskLiveSignalCoordinator: {
        reconcileStateFromLiveSignals: (tabId: string) => void;
      };
      getTabRuntimeState: () => Record<string, unknown>;
      sessionTodoCoordinator: {
        reconcileStaleSessionTodoState: (tabId: string) => void;
      };
      backgroundTaskNoticeStateService: {
        handleStoppedPendingLaunches: (tabId: string, pending: unknown[]) => Promise<void>;
      };
      syncTabStreamLikeState: () => void;
      resetBackgroundTaskIndicator: () => void;
    };

    const runtime = {
      isStreaming: false,
      isHydratingConversation: false,
      backgroundTaskStartedAt: Date.now() - 30_000,
      backgroundTaskAwaitingAuthoritativeSync: true,
      backgroundTaskLaunches: new Map([['call-1', { launchId: 'call-1', taskId: 'bg_1', description: 'Search docs' }]]),
      backgroundTaskCompletedTasks: new Map(),
      backgroundTaskWaitingForFollowUp: true,
    };

    jest.spyOn(view, 'getTabRuntimeState').mockReturnValue(runtime);
    const reconcileSpy = jest.spyOn(
      view.sessionTodoCoordinator,
      'reconcileStaleSessionTodoState',
    ).mockImplementation(() => {});
    const syncSpy = jest.spyOn(view, 'syncTabStreamLikeState').mockImplementation(() => {});
    const staleSpy = jest.spyOn(
      view.backgroundTaskNoticeStateService,
      'handleStoppedPendingLaunches',
    ).mockResolvedValue(undefined);
    const resetSpy = jest.spyOn(view, 'resetBackgroundTaskIndicator').mockImplementation(() => {});

    view.backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals('tab-1');

    expect(reconcileSpy).toHaveBeenCalledWith('tab-1');
    expect(syncSpy).toHaveBeenCalledWith('tab-1');
    expect(staleSpy).not.toHaveBeenCalled();
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('defers layout-driven auto-scroll while the conversation is hydrating', () => {
    const view = createView() as unknown as {
      handleMessagesPaneLayoutChange: (tabId: string) => void;
      getTabPaneState: () => Record<string, unknown> | null;
      syncPaneScrollMetrics: () => boolean;
      scheduleSettledScrollToBottomIfNeeded: () => void;
    };

    const messagesEl = document.createElement('div');
    const runtime = {
      isHydratingConversation: true,
      pendingLayoutMutations: 0,
    };

    jest.spyOn(view, 'getTabPaneState').mockReturnValue({
      tabId: 'tab-1',
      messagesEl,
      runtime,
    });
    const syncSpy = jest.spyOn(view, 'syncPaneScrollMetrics').mockReturnValue(false);
    const scheduleSpy = jest.spyOn(view, 'scheduleSettledScrollToBottomIfNeeded').mockImplementation(() => {});

    view.handleMessagesPaneLayoutChange('tab-1');

    expect(syncSpy).toHaveBeenCalledWith('tab-1', messagesEl);
    expect(runtime.pendingLayoutMutations).toBe(1);
    expect(scheduleSpy).not.toHaveBeenCalled();
  });
});
