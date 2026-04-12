import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type { BackgroundTaskInlinePanelRenderer } from './BackgroundTaskInlinePanelRenderer';
import type { BackgroundTaskCompletionNoticeService } from '../services/BackgroundTaskCompletionNoticeService';
import type { BackgroundTaskTimelineService } from '../services/BackgroundTaskTimelineService';

type BackgroundTaskIndicatorInlinePanelPort = Pick<BackgroundTaskInlinePanelRenderer, 'render'>;
type BackgroundTaskIndicatorTimelinePort = Pick<BackgroundTaskTimelineService, 'collectSegments'>;
type BackgroundTaskIndicatorCompletionNoticePort = Pick<
  BackgroundTaskCompletionNoticeService,
  'queueNotices' | 'flushQueuedNotices'
>;

export interface BackgroundTaskIndicatorCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): object | null;
  reconcileBackgroundTaskStateFromLiveSignals(tabId: TabId | null): void;
  syncTabStreamLikeState(tabId: TabId | null): void;
}

export class BackgroundTaskIndicatorCoordinator {
  constructor(
    private readonly inlinePanelRenderer: BackgroundTaskIndicatorInlinePanelPort,
    private readonly timelineService: BackgroundTaskIndicatorTimelinePort,
    private readonly completionNoticeService: BackgroundTaskIndicatorCompletionNoticePort,
    private readonly host: BackgroundTaskIndicatorCoordinatorHost,
  ) {}

  async renderIfNeeded(
    tabId: TabId | null = this.host.getActiveTabId(),
    conversation: Conversation | null = this.host.getCurrentConversation(),
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    this.host.reconcileBackgroundTaskStateFromLiveSignals(tabId);
    await this.inlinePanelRenderer.render(conversation, tabId);
    await this.queueAndFlushCompletionNotices(tabId, conversation);
    this.host.syncTabStreamLikeState(tabId);
  }

  async queueAndFlushCompletionNotices(
    tabId: TabId | null = this.host.getActiveTabId(),
    conversation: Conversation | null = this.host.getCurrentConversation(),
  ): Promise<void> {
    if (!conversation) {
      return;
    }

    this.completionNoticeService.queueNotices(
      this.timelineService.collectSegments(conversation.messages, tabId),
      tabId,
      conversation,
    );
    await this.completionNoticeService.flushQueuedNotices(tabId, conversation);
  }
}
