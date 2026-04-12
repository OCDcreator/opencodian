import type { Conversation } from '../../../../src/core/types';
import {
  BackgroundTaskIndicatorCoordinator,
  type BackgroundTaskIndicatorCoordinatorHost,
} from '../../../../src/features/chat/runtime/BackgroundTaskIndicatorCoordinator';

function createConversation(): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: 'Search docs',
        timestamp: 1,
      },
    ],
  };
}

describe('BackgroundTaskIndicatorCoordinator', () => {
  function createCoordinator(options: {
    runtime?: object | null;
    conversation?: Conversation | null;
  } = {}) {
    const runtime = options.runtime === undefined ? {} : options.runtime;
    const conversation = options.conversation === undefined ? createConversation() : options.conversation;
    const inlinePanelRenderer = {
      render: jest.fn().mockResolvedValue(undefined),
    };
    const segments = [
      {
        anchorKey: 'user-1',
        completionEvents: [],
      },
    ];
    const timelineService = {
      collectSegments: jest.fn().mockReturnValue(segments),
    };
    const completionNoticeService = {
      queueNotices: jest.fn(),
      flushQueuedNotices: jest.fn().mockResolvedValue(undefined),
    };
    const host: jest.Mocked<BackgroundTaskIndicatorCoordinatorHost> = {
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      getTabRuntimeState: jest.fn().mockReturnValue(runtime),
      reconcileBackgroundTaskStateFromLiveSignals: jest.fn(),
      syncTabStreamLikeState: jest.fn(),
    };
    const coordinator = new BackgroundTaskIndicatorCoordinator(
      inlinePanelRenderer,
      timelineService,
      completionNoticeService,
      host,
    );

    return {
      coordinator,
      conversation,
      host,
      inlinePanelRenderer,
      timelineService,
      completionNoticeService,
      segments,
    };
  }

  it('renders inline panels, queues notices, flushes notices, and syncs stream-like state', async () => {
    const {
      coordinator,
      conversation,
      host,
      inlinePanelRenderer,
      timelineService,
      completionNoticeService,
      segments,
    } = createCoordinator();

    await coordinator.renderIfNeeded('tab-1');

    expect(host.reconcileBackgroundTaskStateFromLiveSignals).toHaveBeenCalledWith('tab-1');
    expect(inlinePanelRenderer.render).toHaveBeenCalledWith(conversation, 'tab-1');
    expect(timelineService.collectSegments).toHaveBeenCalledWith(conversation?.messages, 'tab-1');
    expect(completionNoticeService.queueNotices).toHaveBeenCalledWith(segments, 'tab-1', conversation);
    expect(completionNoticeService.flushQueuedNotices).toHaveBeenCalledWith('tab-1', conversation);
    expect(host.syncTabStreamLikeState).toHaveBeenCalledWith('tab-1');
    expect(
      inlinePanelRenderer.render.mock.invocationCallOrder[0],
    ).toBeLessThan(completionNoticeService.queueNotices.mock.invocationCallOrder[0]);
    expect(
      completionNoticeService.queueNotices.mock.invocationCallOrder[0],
    ).toBeLessThan(completionNoticeService.flushQueuedNotices.mock.invocationCallOrder[0]);
  });

  it('skips rendering and notice work when the tab runtime is missing', async () => {
    const {
      coordinator,
      host,
      inlinePanelRenderer,
      timelineService,
      completionNoticeService,
    } = createCoordinator({ runtime: null });

    await coordinator.renderIfNeeded('tab-missing');

    expect(host.reconcileBackgroundTaskStateFromLiveSignals).not.toHaveBeenCalled();
    expect(inlinePanelRenderer.render).not.toHaveBeenCalled();
    expect(timelineService.collectSegments).not.toHaveBeenCalled();
    expect(completionNoticeService.queueNotices).not.toHaveBeenCalled();
    expect(completionNoticeService.flushQueuedNotices).not.toHaveBeenCalled();
    expect(host.syncTabStreamLikeState).not.toHaveBeenCalled();
  });

  it('skips completion notice refresh when no conversation is available', async () => {
    const {
      coordinator,
      timelineService,
      completionNoticeService,
    } = createCoordinator({ conversation: null });

    await coordinator.queueAndFlushCompletionNotices('tab-1');

    expect(timelineService.collectSegments).not.toHaveBeenCalled();
    expect(completionNoticeService.queueNotices).not.toHaveBeenCalled();
    expect(completionNoticeService.flushQueuedNotices).not.toHaveBeenCalled();
  });
});
