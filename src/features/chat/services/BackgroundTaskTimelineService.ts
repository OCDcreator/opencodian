import type { ChatMessage, Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import type { TabId } from '../tabs';
import {
  type BackgroundTaskDiagnostics,
  type BackgroundTaskLaunchInfo,
  type BackgroundTaskSegment,
  type BackgroundTaskTimelineAssemblyHost,
  BackgroundTaskTimelineAssemblyService,
  type BackgroundTaskTimelineRuntime,
} from './BackgroundTaskTimelineAssemblyService';

export interface BackgroundTaskInlineCopy {
  title: string;
  body: string;
  detail?: string;
  tasksMarkdown?: string;
}

export type {
  BackgroundTaskDiagnostics,
  BackgroundTaskLaunchInfo,
  BackgroundTaskSegment,
  BackgroundTaskTimelineRuntime,
} from './BackgroundTaskTimelineAssemblyService';

export interface BackgroundTaskTimelineServiceHost extends BackgroundTaskTimelineAssemblyHost {
  getActiveTabId(): TabId | null;
  clearInlinePanel(tabId: TabId | null): void;
  armAuthoritativeSyncGate(tabId: TabId | null): void;
  clearAuthoritativeSyncGate(tabId: TabId | null): void;
  syncTabStreamLikeState(tabId: TabId | null): void;
  isSuppressedBackgroundTaskSegment(
    segment: BackgroundTaskSegment,
    tabId: TabId | null,
    conversation: Conversation | null,
  ): boolean;
}

export class BackgroundTaskTimelineService {
  private readonly assemblyService: BackgroundTaskTimelineAssemblyService;

  constructor(private readonly host: BackgroundTaskTimelineServiceHost) {
    this.assemblyService = new BackgroundTaskTimelineAssemblyService(host);
  }

  resetIndicatorState(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.resetRuntimeState(tabId, { clearInlinePanel: true });
    if (!runtime) {
      return;
    }

    this.host.syncTabStreamLikeState(tabId);
  }

  armIndicatorForUserMessage(
    message: ChatMessage,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    if (message.omo?.kind !== 'user-injection' || message.omo.modeTag !== 'search-mode') {
      return;
    }

    runtime.backgroundTaskStartedAt = message.timestamp;
    runtime.backgroundTaskActiveAnchorKey = this.host.getMessageAnchorKey(message);
    runtime.backgroundTaskModeTag = message.omo.modeTag;
    runtime.backgroundTaskWaitingForFollowUp = false;
    this.host.armAuthoritativeSyncGate(tabId);
    runtime.backgroundTaskStaleNoticeFingerprint = null;
    runtime.backgroundTaskSuppressedFingerprint = null;
  }

  upsertLaunch(
    toolCall: {
      id: string;
      input: Record<string, unknown>;
      result?: string;
    },
    target: Map<string, BackgroundTaskLaunchInfo> =
      this.host.getTabRuntimeState(this.host.getActiveTabId())?.backgroundTaskLaunches ?? new Map(),
  ): void {
    this.assemblyService.upsertLaunch(toolCall, target);
  }

  collectSegments(
    messages: ChatMessage[],
    tabId: TabId | null = this.host.getActiveTabId(),
  ): BackgroundTaskSegment[] {
    return this.assemblyService.collectSegments(messages, tabId);
  }

  collectInlineSegments(
    conversation: Conversation | null = null,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): BackgroundTaskSegment[] {
    return this.collectSegments(conversation?.messages ?? [], tabId).filter((segment) =>
      this.shouldRenderInlineSegment(segment)
      && !this.host.isSuppressedBackgroundTaskSegment(segment, tabId, conversation),
    );
  }

  syncStateFromConversation(
    conversation: Conversation | null = null,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.resetRuntimeState(tabId, { clearInlinePanel: false });
    if (!runtime) {
      return;
    }

    if (!conversation || conversation.messages.length === 0) {
      this.host.syncTabStreamLikeState(tabId);
      return;
    }

    const latestActiveSegment = [...this.collectSegments(conversation.messages, tabId)]
      .reverse()
      .find((segment) =>
        !this.host.isSuppressedBackgroundTaskSegment(segment, tabId, conversation)
        && !segment.sawAllTasksComplete
        && (segment.pending.length > 0 || (segment.modeTag === 'search-mode' && segment.launches.length === 0))
      ) ?? null;

    if (!latestActiveSegment) {
      this.host.syncTabStreamLikeState(tabId);
      return;
    }

    runtime.backgroundTaskStartedAt = latestActiveSegment.anchorTimestamp;
    runtime.backgroundTaskActiveAnchorKey = latestActiveSegment.anchorKey;
    runtime.backgroundTaskModeTag = latestActiveSegment.modeTag;
    runtime.backgroundTaskWaitingForFollowUp = latestActiveSegment.waitingForFollowUp && !runtime.isStreaming;
    if (runtime.isHydratingConversation) {
      this.host.armAuthoritativeSyncGate(tabId);
    }
    for (const launch of latestActiveSegment.launches) {
      runtime.backgroundTaskLaunches.set(launch.launchId, launch);
    }
    for (const completion of latestActiveSegment.completed) {
      runtime.backgroundTaskCompletedTasks.set(completion.taskId, completion);
    }
    this.host.syncTabStreamLikeState(tabId);
  }

  getPendingLaunches(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): BackgroundTaskLaunchInfo[] {
    return this.assemblyService.getPendingLaunches(tabId);
  }

  shouldRenderInlineSegment(segment: BackgroundTaskSegment): boolean {
    if (segment.sawAllTasksComplete) {
      return false;
    }

    if (segment.pending.length > 0) {
      return true;
    }

    return segment.modeTag === 'search-mode' && segment.launches.length === 0;
  }

  getInlineCopy(segment: BackgroundTaskSegment): BackgroundTaskInlineCopy {
    const total = segment.launches.length;
    const completed = Math.min(total, segment.completed.length);
    const tasksMarkdown = this.buildTasksMarkdown(segment);

    if (total === 0) {
      return {
        title: t('chat.backgroundTask.preparingTitle'),
        body: t('chat.backgroundTask.preparingBody'),
        tasksMarkdown,
      };
    }

    if (segment.waitingForFollowUp) {
      return {
        title: t('chat.backgroundTask.waitingTitle'),
        body: t('chat.backgroundTask.waitingBody', {
          total: String(total),
          completed: String(completed),
        }),
        detail: t('chat.backgroundTask.progressDetail', {
          total: String(total),
          completed: String(completed),
        }),
        tasksMarkdown,
      };
    }

    return {
      title: t('chat.backgroundTask.runningTitle'),
      body: t('chat.backgroundTask.runningBody', {
        total: String(total),
        completed: String(completed),
      }),
      detail: t('chat.backgroundTask.progressDetail', {
        total: String(total),
        completed: String(completed),
      }),
      tasksMarkdown,
    };
  }

  collectDiagnostics(messages: ChatMessage[]): BackgroundTaskDiagnostics | null {
    return this.assemblyService.collectDiagnostics(messages);
  }

  getLaunchDisplayId(launch: BackgroundTaskLaunchInfo): string {
    if (launch.taskId) {
      return launch.taskId;
    }

    return `launch_${launch.launchId.slice(-8)}`;
  }

  private resetRuntimeState(
    tabId: TabId | null,
    options: { clearInlinePanel: boolean },
  ): BackgroundTaskTimelineRuntime | null {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return null;
    }

    if (options.clearInlinePanel) {
      this.host.clearInlinePanel(tabId);
    }

    runtime.backgroundTaskStartedAt = null;
    runtime.backgroundTaskActiveAnchorKey = null;
    runtime.backgroundTaskModeTag = null;
    runtime.backgroundTaskWaitingForFollowUp = false;
    runtime.backgroundTaskLaunches.clear();
    runtime.backgroundTaskCompletedTasks.clear();
    this.host.clearAuthoritativeSyncGate(tabId);
    runtime.backgroundTaskStaleNoticeFingerprint = null;
    return runtime;
  }

  private buildTasksMarkdown(segment: BackgroundTaskSegment): string | undefined {
    const lines: string[] = [];

    if (segment.completed.length === 0 && segment.pending.length === 0) {
      return undefined;
    }

    lines.push(`**${t('chat.backgroundTask.taskListLabel')}**`);

    for (const task of segment.completed) {
      lines.push(`- ${t('chat.backgroundTask.taskStatusCompleted')} · \`${task.taskId}\`: ${task.description}`);
    }

    for (const task of segment.pending) {
      lines.push(
        `- ${t('chat.backgroundTask.taskStatusRunning')} · \`${this.getLaunchDisplayId(task)}\`: ${task.description}`,
      );
    }

    return lines.join('\n');
  }
}
