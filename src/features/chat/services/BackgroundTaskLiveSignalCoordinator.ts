import type { SessionActivityStatus } from '../../../core/opencode';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import type { BackgroundTaskNoticeStateService } from './BackgroundTaskNoticeStateService';
import type { BackgroundTaskTimelineService } from './BackgroundTaskTimelineService';
import type { SessionTodoCoordinator } from './SessionTodoCoordinator';

const logger = createLogger('BackgroundTaskLiveSignalCoordinator');
const BACKGROUND_TASK_GRACE_PERIOD_MS = 15_000;

type BackgroundTaskLiveSignalTodoPort = Pick<
  SessionTodoCoordinator,
  'hasIncompleteTabSessionTodos' | 'reconcileStaleSessionTodoState'
>;
type BackgroundTaskLiveSignalTimelinePort = Pick<BackgroundTaskTimelineService, 'getPendingLaunches'>;
type BackgroundTaskLiveSignalNoticePort = Pick<
  BackgroundTaskNoticeStateService,
  'handleStoppedPendingLaunches'
>;

export interface BackgroundTaskLiveSignalLaunchInfo {
  launchId: string;
  taskId: string | null;
  description: string;
}

export interface BackgroundTaskLiveSignalRuntime {
  isStreaming: boolean;
  isHydratingConversation: boolean;
  backgroundTaskStartedAt: number | null;
  backgroundTaskModeTag: string | null;
  backgroundTaskLaunches: Map<string, BackgroundTaskLiveSignalLaunchInfo>;
  backgroundTaskWaitingForFollowUp: boolean;
  backgroundTaskAwaitingAuthoritativeSync: boolean;
  backgroundTaskLastAuthoritativeSyncAt: number | null;
}

export interface BackgroundTaskLiveSignalCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskLiveSignalRuntime | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null,
  ): SessionActivityStatus | null;
  syncTabStreamLikeState(tabId: TabId | null): void;
  resetBackgroundTaskIndicator(tabId: TabId | null): void;
}

export class BackgroundTaskLiveSignalCoordinator {
  constructor(
    private readonly sessionTodoStateService: BackgroundTaskLiveSignalTodoPort,
    private readonly timelineService: BackgroundTaskLiveSignalTimelinePort,
    private readonly noticeStateService: BackgroundTaskLiveSignalNoticePort,
    private readonly host: BackgroundTaskLiveSignalCoordinatorHost,
  ) {}

  hasIndicator(tabId: TabId | null): boolean {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime?.backgroundTaskStartedAt) {
      return false;
    }

    const status = this.host.getTabSessionStatus(tabId, this.host.getSessionIdForTab(tabId));
    const pending = this.timelineService.getPendingLaunches(tabId);
    const gracePeriodActive = this.isGracePeriodActive(tabId);

    if (pending.length > 0) {
      if (status?.type === 'idle') {
        return gracePeriodActive;
      }

      return runtime.isStreaming
        || this.isSessionLive(status)
        || this.sessionTodoStateService.hasIncompleteTabSessionTodos(tabId)
        || gracePeriodActive;
    }

    return runtime.backgroundTaskModeTag === 'search-mode' && (
      runtime.isStreaming || gracePeriodActive
    );
  }

  armAuthoritativeSyncGate(tabId: TabId | null): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.backgroundTaskAwaitingAuthoritativeSync = true;
    runtime.backgroundTaskLastAuthoritativeSyncAt = null;
  }

  clearAuthoritativeSyncGate(tabId: TabId | null): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.backgroundTaskAwaitingAuthoritativeSync = false;
    runtime.backgroundTaskLastAuthoritativeSyncAt = null;
  }

  markAuthoritativeSync(
    tabId: TabId | null,
    reason: string,
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (
      !runtime
      || runtime.isHydratingConversation
      || !runtime.backgroundTaskAwaitingAuthoritativeSync
    ) {
      return;
    }

    runtime.backgroundTaskAwaitingAuthoritativeSync = false;
    runtime.backgroundTaskLastAuthoritativeSyncAt = Date.now();
    logger.debug('Background task authoritative sync ready', {
      tabId,
      sessionId: this.host.getSessionIdForTab(tabId),
      reason,
    });
  }

  reconcileStateFromLiveSignals(tabId: TabId | null): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || runtime.isStreaming || !runtime.backgroundTaskStartedAt) {
      return;
    }

    this.sessionTodoStateService.reconcileStaleSessionTodoState(tabId);

    if (runtime.isHydratingConversation || runtime.backgroundTaskAwaitingAuthoritativeSync) {
      this.host.syncTabStreamLikeState(tabId);
      return;
    }

    const sessionId = this.host.getSessionIdForTab(tabId);
    const status = this.host.getTabSessionStatus(tabId, sessionId);
    if (status?.type === 'busy' || status?.type === 'retry') {
      runtime.backgroundTaskWaitingForFollowUp = runtime.backgroundTaskLaunches.size > 0;
      this.host.syncTabStreamLikeState(tabId);
      return;
    }

    if (status?.type !== 'idle' && this.sessionTodoStateService.hasIncompleteTabSessionTodos(tabId)) {
      runtime.backgroundTaskWaitingForFollowUp = runtime.backgroundTaskLaunches.size > 0;
      this.host.syncTabStreamLikeState(tabId);
      return;
    }

    if (this.isGracePeriodActive(tabId)) {
      this.host.syncTabStreamLikeState(tabId);
      return;
    }

    if (runtime.backgroundTaskLaunches.size === 0) {
      if (runtime.backgroundTaskModeTag === 'search-mode') {
        this.host.resetBackgroundTaskIndicator(tabId);
      }
      return;
    }

    const stalePending = this.timelineService.getPendingLaunches(tabId);
    if (stalePending.length > 0) {
      void this.noticeStateService.handleStoppedPendingLaunches(tabId, stalePending);
    }
    logger.debug('Clearing stale background task indicator after session became idle without incomplete todos', {
      tabId,
      sessionId,
      launchCount: runtime.backgroundTaskLaunches.size,
    });
    this.host.resetBackgroundTaskIndicator(tabId);
  }

  private isGracePeriodActive(tabId: TabId | null): boolean {
    const startedAt = this.host.getTabRuntimeState(tabId)?.backgroundTaskStartedAt;
    return typeof startedAt === 'number' && Date.now() - startedAt < BACKGROUND_TASK_GRACE_PERIOD_MS;
  }

  private isSessionLive(status: SessionActivityStatus | null | undefined): boolean {
    return status?.type === 'busy' || status?.type === 'retry';
  }
}
