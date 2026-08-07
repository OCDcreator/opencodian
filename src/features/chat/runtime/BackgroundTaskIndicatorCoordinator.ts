import type { Conversation } from '../../../core/types';
import type { BackgroundTaskLiveSignalCoordinator } from '../services/BackgroundTaskLiveSignalCoordinator';
import type { BackgroundTaskNoticeStateService } from '../services/BackgroundTaskNoticeStateService';
import type { BackgroundTaskTimelineService } from '../services/BackgroundTaskTimelineService';
import type { TabId } from '../tabs';
import type {
  BackgroundTaskInlinePanelRenderer,
  BackgroundTaskInlinePanelRenderOptions,
} from './BackgroundTaskInlinePanelRenderer';
import type { TabRuntimeStateBridge } from './TabRuntimeStateBridge';

type BackgroundTaskIndicatorInlinePanelPort = Pick<BackgroundTaskInlinePanelRenderer, 'render'>;
type BackgroundTaskIndicatorTimelinePort = Pick<BackgroundTaskTimelineService, 'collectSegments'>;
type BackgroundTaskIndicatorLiveSignalPort = Pick<
  BackgroundTaskLiveSignalCoordinator,
  'reconcileStateFromLiveSignals'
>;
type BackgroundTaskIndicatorTabRuntimePort = Pick<TabRuntimeStateBridge, 'syncStreamLikeState'>;
type BackgroundTaskIndicatorCompletionNoticePort = Pick<
  BackgroundTaskNoticeStateService,
  'queueNotices' | 'flushQueuedNotices'
>;

export interface BackgroundTaskIndicatorCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversation(): Conversation | null;
  hasTabRuntime(tabId: TabId | null): boolean;
}

export type BackgroundTaskIndicatorRenderOptions = BackgroundTaskInlinePanelRenderOptions;

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
    options: BackgroundTaskIndicatorRenderOptions = {},
    conversation: Conversation | null = this.host.getCurrentConversation(),
  ): Promise<void> {
    if (!this.host.hasTabRuntime(tabId)
      || (options.isCurrent && !options.isCurrent())) {
      return;
    }

    if (options.isCurrent) {
      this.liveSignalCoordinator.reconcileStateFromLiveSignals(tabId, options);
    } else {
      this.liveSignalCoordinator.reconcileStateFromLiveSignals(tabId);
    }
    if (options.isCurrent) {
      await this.inlinePanelRenderer.render(conversation, tabId, options);
    } else {
      await this.inlinePanelRenderer.render(conversation, tabId);
    }
    if (options.isCurrent && !options.isCurrent()) {
      return;
    }
    if (options.isCurrent) {
      await this.flushCompletionNoticesAndSyncStreamLikeState(tabId, conversation, options);
    } else {
      await this.flushCompletionNoticesAndSyncStreamLikeState(tabId, conversation);
    }
  }

  async flushCompletionNoticesAndSyncStreamLikeState(
    tabId: TabId | null = this.host.getActiveTabId(),
    conversation: Conversation | null = this.host.getCurrentConversation(),
    options: { isCurrent?: () => boolean } = {},
  ): Promise<void> {
    if (options.isCurrent && !options.isCurrent()) {
      return;
    }
    if (options.isCurrent) {
      await this.queueAndFlushCompletionNotices(tabId, conversation, options);
    } else {
      await this.queueAndFlushCompletionNotices(tabId, conversation);
    }
    if (options.isCurrent && !options.isCurrent()) {
      return;
    }
    this.tabRuntimeStateBridge.syncStreamLikeState(tabId);
  }

  async queueAndFlushCompletionNotices(
    tabId: TabId | null = this.host.getActiveTabId(),
    conversation: Conversation | null = this.host.getCurrentConversation(),
    options: { isCurrent?: () => boolean } = {},
  ): Promise<void> {
    if (!conversation || (options.isCurrent && !options.isCurrent())) {
      return;
    }

    this.completionNoticeService.queueNotices(
      this.timelineService.collectSegments(conversation.messages, tabId),
      tabId,
      conversation,
    );
    if (options.isCurrent) {
      await this.completionNoticeService.flushQueuedNotices(tabId, conversation, options);
    } else {
      await this.completionNoticeService.flushQueuedNotices(tabId, conversation);
    }
  }
}
