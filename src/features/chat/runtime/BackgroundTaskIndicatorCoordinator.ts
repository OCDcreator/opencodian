import type { Conversation } from '../../../core/types';
import type { BackgroundTaskCompletionNoticeService } from '../services/BackgroundTaskCompletionNoticeService';
import type { BackgroundTaskLiveSignalCoordinator } from '../services/BackgroundTaskLiveSignalCoordinator';
import type { BackgroundTaskTimelineService } from '../services/BackgroundTaskTimelineService';
import type { TabId } from '../tabs';
import type { BackgroundTaskInlinePanelRenderer } from './BackgroundTaskInlinePanelRenderer';
import type { TabRuntimeStateBridge } from './TabRuntimeStateBridge';

type BackgroundTaskIndicatorInlinePanelPort = Pick<BackgroundTaskInlinePanelRenderer, 'render'>;
type BackgroundTaskIndicatorTimelinePort = Pick<BackgroundTaskTimelineService, 'collectSegments'>;
type BackgroundTaskIndicatorLiveSignalPort = Pick<
  BackgroundTaskLiveSignalCoordinator,
  'reconcileStateFromLiveSignals'
>;
type BackgroundTaskIndicatorTabRuntimePort = Pick<TabRuntimeStateBridge, 'syncStreamLikeState'>;
type BackgroundTaskIndicatorCompletionNoticePort = Pick<
  BackgroundTaskCompletionNoticeService,
  'queueNotices' | 'flushQueuedNotices'
>;

export interface BackgroundTaskIndicatorCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversation(): Conversation | null;
  hasTabRuntime(tabId: TabId | null): boolean;
}

interface BackgroundTaskIndicatorCoordinatorDependencies {
  inlinePanelRenderer: BackgroundTaskIndicatorInlinePanelPort;
  timelineService: BackgroundTaskIndicatorTimelinePort;
  completionNoticeService: BackgroundTaskIndicatorCompletionNoticePort;
  liveSignalCoordinator: BackgroundTaskIndicatorLiveSignalPort;
  tabRuntimeStateBridge: BackgroundTaskIndicatorTabRuntimePort;
  host: BackgroundTaskIndicatorCoordinatorHost;
}

export class BackgroundTaskIndicatorCoordinator {
  private readonly inlinePanelRenderer: BackgroundTaskIndicatorInlinePanelPort;
  private readonly timelineService: BackgroundTaskIndicatorTimelinePort;
  private readonly completionNoticeService: BackgroundTaskIndicatorCompletionNoticePort;
  private readonly liveSignalCoordinator: BackgroundTaskIndicatorLiveSignalPort;
  private readonly tabRuntimeStateBridge: BackgroundTaskIndicatorTabRuntimePort;
  private readonly host: BackgroundTaskIndicatorCoordinatorHost;

  constructor({
    inlinePanelRenderer,
    timelineService,
    completionNoticeService,
    liveSignalCoordinator,
    tabRuntimeStateBridge,
    host,
  }: BackgroundTaskIndicatorCoordinatorDependencies) {
    this.inlinePanelRenderer = inlinePanelRenderer;
    this.timelineService = timelineService;
    this.completionNoticeService = completionNoticeService;
    this.liveSignalCoordinator = liveSignalCoordinator;
    this.tabRuntimeStateBridge = tabRuntimeStateBridge;
    this.host = host;
  }

  async renderIfNeeded(
    tabId: TabId | null = this.host.getActiveTabId(),
    conversation: Conversation | null = this.host.getCurrentConversation(),
  ): Promise<void> {
    if (!this.host.hasTabRuntime(tabId)) {
      return;
    }

    this.liveSignalCoordinator.reconcileStateFromLiveSignals(tabId);
    await this.inlinePanelRenderer.render(conversation, tabId);
    await this.flushCompletionNoticesAndSyncStreamLikeState(tabId, conversation);
  }

  async flushCompletionNoticesAndSyncStreamLikeState(
    tabId: TabId | null = this.host.getActiveTabId(),
    conversation: Conversation | null = this.host.getCurrentConversation(),
  ): Promise<void> {
    await this.queueAndFlushCompletionNotices(tabId, conversation);
    this.tabRuntimeStateBridge.syncStreamLikeState(tabId);
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
