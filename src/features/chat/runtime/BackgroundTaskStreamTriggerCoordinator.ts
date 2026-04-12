import type { ToolCallInfo } from '../../../core/types';
import type {
  BackgroundTaskLaunchInfo,
  BackgroundTaskTimelineService,
} from '../services/BackgroundTaskTimelineService';
import type { TabId } from '../tabs';
import type { BackgroundTaskIndicatorCoordinator } from './BackgroundTaskIndicatorCoordinator';

type BackgroundTaskIndicatorRenderPort = Pick<BackgroundTaskIndicatorCoordinator, 'renderIfNeeded'>;
type BackgroundTaskTriggerTimelinePort = Pick<BackgroundTaskTimelineService, 'upsertLaunch'>;

export interface BackgroundTaskStreamTriggerRuntime {
  backgroundTaskStartedAt: number | null;
  backgroundTaskLaunches: Map<string, BackgroundTaskLaunchInfo>;
  backgroundTaskWaitingForFollowUp: boolean;
  backgroundTaskStaleNoticeFingerprint: string | null;
}

export interface BackgroundTaskStreamTriggerCoordinatorHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskStreamTriggerRuntime | null;
  applyStreamingTodoSnapshotFromTool(toolCall: ToolCallInfo, tabId: TabId | null): void;
  getSessionIdForTab(tabId: TabId | null): string | null;
  refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string,
    options?: { suppressErrors?: boolean },
  ): Promise<unknown>;
  armAuthoritativeSyncGate(tabId: TabId | null): void;
  hasTabBackgroundTaskIndicator(tabId: TabId | null): boolean;
  resetBackgroundTaskIndicator(tabId: TabId | null): void;
}

export class BackgroundTaskStreamTriggerCoordinator {
  constructor(
    private readonly indicatorCoordinator: BackgroundTaskIndicatorRenderPort,
    private readonly timelineService: BackgroundTaskTriggerTimelinePort,
    private readonly host: BackgroundTaskStreamTriggerCoordinatorHost,
  ) {}

  async handleToolCallStart(
    toolCall: ToolCallInfo,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    this.host.applyStreamingTodoSnapshotFromTool(toolCall, tabId);

    if (!this.isBackgroundTaskTool(toolCall.name)) {
      return;
    }

    if (!runtime.backgroundTaskStartedAt) {
      runtime.backgroundTaskStartedAt = Date.now();
    }

    this.host.armAuthoritativeSyncGate(tabId);
    runtime.backgroundTaskStaleNoticeFingerprint = null;
    this.timelineService.upsertLaunch(
      {
        id: toolCall.id,
        input: toolCall.input ?? {},
      },
      runtime.backgroundTaskLaunches,
    );
    runtime.backgroundTaskWaitingForFollowUp = false;
    await this.indicatorCoordinator.renderIfNeeded(tabId);
  }

  async handleToolCallEnd(
    toolCall: ToolCallInfo,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    this.host.applyStreamingTodoSnapshotFromTool(toolCall, tabId);

    if (this.isTodoTool(toolCall.name)) {
      const sessionId = this.host.getSessionIdForTab(tabId);
      if (sessionId) {
        await this.host.refreshTabSessionTodos(tabId, sessionId, { suppressErrors: true });
      }
    }

    if (!this.isBackgroundTaskTool(toolCall.name)) {
      return;
    }

    this.timelineService.upsertLaunch(
      {
        id: toolCall.id,
        input: toolCall.input ?? {},
        result: toolCall.result,
      },
      runtime.backgroundTaskLaunches,
    );
    this.host.armAuthoritativeSyncGate(tabId);
    runtime.backgroundTaskStaleNoticeFingerprint = null;
    await this.indicatorCoordinator.renderIfNeeded(tabId);
  }

  async finalizeAfterPrimaryStream(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !this.host.hasTabBackgroundTaskIndicator(tabId)) {
      return;
    }

    if (runtime.backgroundTaskLaunches.size === 0) {
      this.host.resetBackgroundTaskIndicator(tabId);
      return;
    }

    runtime.backgroundTaskWaitingForFollowUp = true;
    await this.indicatorCoordinator.renderIfNeeded(tabId);
  }

  private isBackgroundTaskTool(toolName: string): boolean {
    return toolName === 'task';
  }

  private isTodoTool(toolName: string): boolean {
    return toolName === 'todowrite' || toolName === 'todoread';
  }
}
