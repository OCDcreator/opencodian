import type { BackgroundTaskActiveAnchorMetadata, ChatMessage, Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import type { BackgroundTaskCompletionInfo } from './BackgroundTaskCompletionNoticeService';
import {
  type BackgroundTaskDiagnostics,
  type BackgroundTaskLaunchInfo,
  type BackgroundTaskSegment,
  type BackgroundTaskTimelineAssemblyHost,
  BackgroundTaskTimelineAssemblyService,
  type BackgroundTaskTimelineRuntime,
} from './BackgroundTaskTimelineAssemblyService';

const logger = createLogger('BackgroundTaskTimelineService');

export interface OmoBackgroundTaskLogState {
  anchorKey: string;
  loggedPendingTaskIds: Set<string>;
  completionLogged: boolean;
}

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

  constructor(
    private readonly host: BackgroundTaskTimelineServiceHost,
    private readonly omoBackgroundTaskLogStates = new Map<string, OmoBackgroundTaskLogState>(),
  ) {
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
      toolMetadata?: Record<string, unknown>;
      result?: string;
    },
    target: Map<string, BackgroundTaskLaunchInfo> =
      this.host.getTabRuntimeState(this.host.getActiveTabId())?.backgroundTaskLaunches ?? new Map(),
  ): void {
    this.assemblyService.upsertLaunch(toolCall, target);
  }

  upsertCompletionFromToolCall(
    toolCall: {
      id: string;
      input: Record<string, unknown>;
      toolMetadata?: Record<string, unknown>;
      result?: string;
    },
    target: Map<string, BackgroundTaskCompletionInfo>,
  ): void {
    const completion = this.assemblyService.getCompletedTaskFromToolCall(toolCall);
    if (!completion) {
      return;
    }
    target.set(completion.taskId, completion);
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
      && this.shouldRenderPreparingInlineSegment(segment, tabId)
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

    if (!conversation) {
      this.host.syncTabStreamLikeState(tabId);
      return;
    }

    const segments = this.collectSegments(conversation.messages, tabId);
    const latestActiveSegment = [...segments]
      .reverse()
      .find((segment) =>
        !this.host.isSuppressedBackgroundTaskSegment(segment, tabId, conversation)
        && !segment.sawAllTasksComplete
        && segment.pending.length > 0
      ) ?? null;

    if (!latestActiveSegment) {
      if (
        runtime.isHydratingConversation
        && !this.hasMessageDerivedTerminalLifecycleState(segments, tabId, conversation)
        && this.restoreRuntimeStateFromMetadata(conversation.backgroundTaskMetadata?.activeAnchor, runtime)
      ) {
        this.host.armAuthoritativeSyncGate(tabId);
        this.host.syncTabStreamLikeState(tabId);
        return;
      }
      delete conversation.backgroundTaskMetadata;
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
    this.writeConversationMetadata(conversation, latestActiveSegment);
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

  private shouldRenderPreparingInlineSegment(
    segment: BackgroundTaskSegment,
    tabId: TabId | null,
  ): boolean {
    if (segment.modeTag !== 'search-mode' || segment.launches.length > 0) {
      return true;
    }

    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime?.backgroundTaskStartedAt || !runtime.backgroundTaskActiveAnchorKey) {
      return false;
    }

    return runtime.backgroundTaskActiveAnchorKey === segment.anchorKey;
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

  logOmoBackgroundTaskDiagnostics(
    conversation: Conversation,
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): void {
    const diagnostics = this.collectDiagnostics(nextMessages);
    if (!diagnostics) {
      this.omoBackgroundTaskLogStates.delete(conversation.id);
      return;
    }

    const previousDiagnostics = this.collectDiagnostics(previousMessages);
    const previousHasSameAnchor = previousDiagnostics?.anchorKey === diagnostics.anchorKey;
    const previousPendingTaskIds = new Set(
      previousHasSameAnchor
        ? previousDiagnostics.pending
          .map((task) => task.taskId)
          .filter((taskId): taskId is string => Boolean(taskId))
        : [],
    );
    const previousCompletionLogged = previousHasSameAnchor && (
      previousDiagnostics.sawAllTasksComplete
      || (previousDiagnostics.pending.length === 0 && previousDiagnostics.completed.length > 0)
    );

    let state = this.omoBackgroundTaskLogStates.get(conversation.id);
    if (!state || state.anchorKey !== diagnostics.anchorKey) {
      state = {
        anchorKey: diagnostics.anchorKey,
        loggedPendingTaskIds: new Set(previousPendingTaskIds),
        completionLogged: previousCompletionLogged,
      };
    } else if (previousCompletionLogged) {
      state.completionLogged = true;
    }

    for (const task of diagnostics.pending) {
      if (!task.taskId || previousPendingTaskIds.has(task.taskId) || state.loggedPendingTaskIds.has(task.taskId)) {
        continue;
      }

      logger.debug(`OMO background task running: ${task.taskId} - ${this.getLogPreview(task.description, 140)}`);
      state.loggedPendingTaskIds.add(task.taskId);
    }

    if (!state.completionLogged && (diagnostics.sawAllTasksComplete || (diagnostics.pending.length === 0 && diagnostics.completed.length > 0))) {
      logger.debug(`OMO background tasks completed: ${this.stringifyLogPayload({
        conversationId: conversation.id,
        sessionId: conversation.openCodeSessionId,
        completedTasks: diagnostics.completed.map((task) => ({
          id: task.taskId,
          description: task.description,
        })),
      })}`);
      state.completionLogged = true;
    }

    this.omoBackgroundTaskLogStates.set(conversation.id, state);
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

  private restoreRuntimeStateFromMetadata(
    metadata: BackgroundTaskActiveAnchorMetadata | undefined,
    runtime: BackgroundTaskTimelineRuntime,
  ): boolean {
    if (!this.isValidActiveAnchorMetadata(metadata)) {
      return false;
    }

    runtime.backgroundTaskStartedAt = metadata.startedAt;
    runtime.backgroundTaskActiveAnchorKey = metadata.anchorKey;
    runtime.backgroundTaskModeTag = metadata.modeTag;
    runtime.backgroundTaskWaitingForFollowUp = metadata.waitingForFollowUp && !runtime.isStreaming;
    return true;
  }

  private isValidActiveAnchorMetadata(
    metadata: BackgroundTaskActiveAnchorMetadata | undefined,
  ): metadata is BackgroundTaskActiveAnchorMetadata {
    return !!metadata
      && Number.isFinite(metadata.startedAt)
      && metadata.startedAt > 0
      && typeof metadata.anchorKey === 'string'
      && metadata.anchorKey.length > 0
      && (metadata.modeTag === null || typeof metadata.modeTag === 'string')
      && typeof metadata.waitingForFollowUp === 'boolean'
      && Number.isFinite(metadata.updatedAt);
  }

  private hasMessageDerivedTerminalLifecycleState(
    segments: BackgroundTaskSegment[],
    tabId: TabId | null,
    conversation: Conversation,
  ): boolean {
    return segments.some((segment) =>
      this.host.isSuppressedBackgroundTaskSegment(segment, tabId, conversation)
      || segment.sawAllTasksComplete
      || segment.launches.length > 0
      || segment.completed.length > 0,
    );
  }

  private writeConversationMetadata(
    conversation: Conversation,
    segment: BackgroundTaskSegment,
  ): void {
    conversation.backgroundTaskMetadata = {
      activeAnchor: {
        startedAt: segment.anchorTimestamp,
        anchorKey: segment.anchorKey,
        modeTag: segment.modeTag,
        waitingForFollowUp: segment.waitingForFollowUp,
        updatedAt: this.getSegmentUpdatedAt(conversation, segment),
      },
    };
  }

  private getSegmentUpdatedAt(
    conversation: Conversation,
    segment: BackgroundTaskSegment,
  ): number {
    const messageTimestamps = conversation.messages
      .filter((message) => message.timestamp >= segment.anchorTimestamp)
      .map((message) => message.timestamp);

    return Math.max(segment.anchorTimestamp, ...messageTimestamps);
  }

  private getLogPreview(text: string, maxLength = 180): string {
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 1)}…`;
  }

  private stringifyLogPayload(payload: unknown): string {
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
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

export interface BackgroundTaskViewHost {
  resetBackgroundTaskIndicator(tabId?: TabId | null): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId?: TabId | null): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  armBackgroundTaskIndicatorForUserMessage(message: ChatMessage, tabId: TabId | null): void;
  logOmoBackgroundTaskDiagnostics(
    conversation: Conversation,
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): void;
}

export interface BackgroundTaskViewHostDependencies {
  timelineService: BackgroundTaskTimelineService;
  indicatorRenderPort: {
    renderIfNeeded(tabId?: TabId | null): Promise<void>;
  };
}

export function createBackgroundTaskViewHost(
  dependencies: BackgroundTaskViewHostDependencies,
): BackgroundTaskViewHost {
  return {
    resetBackgroundTaskIndicator: (tabId) => {
      dependencies.timelineService.resetIndicatorState(tabId);
    },
    syncBackgroundTaskStateFromConversation: (conversation, tabId) => {
      dependencies.timelineService.syncStateFromConversation(conversation, tabId);
    },
    renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
      dependencies.indicatorRenderPort.renderIfNeeded(tabId),
    armBackgroundTaskIndicatorForUserMessage: (message, tabId) => {
      dependencies.timelineService.armIndicatorForUserMessage(message, tabId);
    },
    logOmoBackgroundTaskDiagnostics: (conversation, previousMessages, nextMessages) => {
      dependencies.timelineService.logOmoBackgroundTaskDiagnostics(
        conversation,
        previousMessages,
        nextMessages,
      );
    },
  };
}
