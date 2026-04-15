import type { ChatMessage, Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import type { TabId } from '../tabs';
import type {
  BackgroundTaskCompletionEvent,
  BackgroundTaskCompletionInfo,
} from './BackgroundTaskCompletionNoticeService';
import type { BackgroundTaskLiveSignalLaunchInfo } from './BackgroundTaskLiveSignalCoordinator';

export type BackgroundTaskLaunchInfo = BackgroundTaskLiveSignalLaunchInfo;

export interface BackgroundTaskSegment {
  anchorKey: string;
  anchorTimestamp: number;
  modeTag: string | null;
  launches: BackgroundTaskLaunchInfo[];
  completed: BackgroundTaskCompletionInfo[];
  pending: BackgroundTaskLaunchInfo[];
  sawAllTasksComplete: boolean;
  waitingForFollowUp: boolean;
  completionEvents: BackgroundTaskCompletionEvent[];
}

export interface BackgroundTaskInlineCopy {
  title: string;
  body: string;
  detail?: string;
  tasksMarkdown?: string;
}

export interface BackgroundTaskDiagnostics {
  anchorKey: string;
  completed: BackgroundTaskCompletionInfo[];
  pending: BackgroundTaskLaunchInfo[];
  sawAllTasksComplete: boolean;
}

export interface BackgroundTaskTimelineRuntime {
  isStreaming: boolean;
  isHydratingConversation: boolean;
  backgroundTaskStartedAt: number | null;
  backgroundTaskActiveAnchorKey: string | null;
  backgroundTaskModeTag: string | null;
  backgroundTaskLaunches: Map<string, BackgroundTaskLaunchInfo>;
  backgroundTaskCompletedTasks: Map<string, BackgroundTaskCompletionInfo>;
  backgroundTaskWaitingForFollowUp: boolean;
  backgroundTaskStaleNoticeFingerprint: string | null;
  backgroundTaskSuppressedFingerprint: string | null;
}

export interface BackgroundTaskTimelineServiceHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskTimelineRuntime | null;
  getActiveTabId(): TabId | null;
  getMessageAnchorKey(message: ChatMessage): string;
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

type ChatContentBlock = NonNullable<ChatMessage['contentBlocks']>[number];

interface BackgroundTaskSegmentCollectionState {
  segments: BackgroundTaskSegment[];
  segmentByAnchorKey: Map<string, BackgroundTaskSegment>;
  latestUserMessage: ChatMessage | null;
}

interface BackgroundTaskSegmentPendingState {
  pending: BackgroundTaskLaunchInfo[];
  waitingForFollowUp: boolean;
}

export class BackgroundTaskTimelineService {
  constructor(private readonly host: BackgroundTaskTimelineServiceHost) {}

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
    const existing = target.get(toolCall.id);
    const description = this.getBackgroundTaskDescription(
      toolCall.input,
      toolCall.result ?? existing?.description,
    );
    const taskId = this.extractBackgroundTaskId(
      toolCall.input,
      toolCall.result,
      existing?.taskId,
    ) ?? null;

    target.set(toolCall.id, {
      launchId: toolCall.id,
      taskId,
      description,
    });
  }

  collectSegments(
    messages: ChatMessage[],
    tabId: TabId | null = this.host.getActiveTabId(),
  ): BackgroundTaskSegment[] {
    if (messages.length === 0) {
      return [];
    }

    const state = this.createSegmentCollectionState();

    for (const message of messages) {
      this.collectMessageSegments(state, message);
    }

    this.mergeRuntimeSegmentState(state, tabId);
    return this.finalizeCollectedSegments(state.segments);
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
    const runtime = this.host.getTabRuntimeState(tabId);
    return this.filterPendingLaunches(
      Array.from(runtime?.backgroundTaskLaunches.values() ?? []),
      Array.from(runtime?.backgroundTaskCompletedTasks.values() ?? []),
    );
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
    if (messages.length === 0) {
      return null;
    }

    const anchorIndex = this.findBackgroundTaskAnchorIndex(messages);
    if (anchorIndex < 0) {
      return null;
    }

    const anchorMessage = messages[anchorIndex];
    const launches = new Map<string, BackgroundTaskLaunchInfo>();
    const completed = new Map<string, BackgroundTaskCompletionInfo>();
    let sawAllTasksComplete = false;

    for (const message of messages.slice(anchorIndex + 1)) {
      if (message.omo?.kind === 'system-reminder') {
        this.addCompletedTasksFromMessage(message, completed);
        if (message.omo.reminderType === 'all-background-tasks-complete') {
          sawAllTasksComplete = true;
        }
      }

      for (const block of message.contentBlocks ?? []) {
        if (block.type !== 'tool_use' || block.toolName !== 'task' || !block.toolId) {
          continue;
        }

        this.upsertLaunch({
          id: block.toolId,
          input: block.toolInput ?? {},
          result: block.toolResult,
        }, launches);
      }
    }

    const isSearchModeAnchor =
      anchorMessage.omo?.kind === 'user-injection' && anchorMessage.omo.modeTag === 'search-mode';
    if (!isSearchModeAnchor && launches.size === 0 && completed.size === 0 && !sawAllTasksComplete) {
      return null;
    }

    return {
      anchorKey: this.host.getMessageAnchorKey(anchorMessage),
      completed: Array.from(completed.values()),
      pending: this.filterPendingLaunches(Array.from(launches.values()), Array.from(completed.values())),
      sawAllTasksComplete,
    };
  }

  getLaunchDisplayId(launch: BackgroundTaskLaunchInfo): string {
    if (launch.taskId) {
      return launch.taskId;
    }

    return `launch_${launch.launchId.slice(-8)}`;
  }

  private createSegmentCollectionState(): BackgroundTaskSegmentCollectionState {
    return {
      segments: [],
      segmentByAnchorKey: new Map(),
      latestUserMessage: null,
    };
  }

  private collectMessageSegments(
    state: BackgroundTaskSegmentCollectionState,
    message: ChatMessage,
  ): void {
    if (message.role === 'user') {
      this.captureUserSegmentAnchor(state, message);
      return;
    }

    for (const block of message.contentBlocks ?? []) {
      this.collectTaskLaunchBlock(state, block);
    }

    this.collectCompletionReminderSegments(state, message);
  }

  private captureUserSegmentAnchor(
    state: BackgroundTaskSegmentCollectionState,
    message: ChatMessage,
  ): void {
    state.latestUserMessage = message;
    if (this.isSearchModeAnchorMessage(message)) {
      this.getOrCreateSegment(state, message);
    }
  }

  private isSearchModeAnchorMessage(message: ChatMessage): boolean {
    return message.role === 'user'
      && message.omo?.kind === 'user-injection'
      && message.omo.modeTag === 'search-mode';
  }

  private collectTaskLaunchBlock(
    state: BackgroundTaskSegmentCollectionState,
    block: ChatContentBlock,
  ): void {
    if (block.type !== 'tool_use' || block.toolName !== 'task' || !block.toolId) {
      return;
    }

    const segment = this.getOrCreateSegment(state, state.latestUserMessage);
    if (!segment) {
      return;
    }

    this.upsertSegmentLaunch(segment, {
      id: block.toolId,
      input: block.toolInput ?? {},
      result: block.toolResult,
    });
  }

  private collectCompletionReminderSegments(
    state: BackgroundTaskSegmentCollectionState,
    message: ChatMessage,
  ): void {
    if (!this.isBackgroundTaskCompletionReminder(message)) {
      return;
    }

    if (message.omo?.kind !== 'system-reminder') {
      return;
    }

    for (const segment of this.resolveReminderSegments(state, message)) {
      this.applyReminderToSegment(segment, message);
    }
  }

  private resolveReminderSegments(
    state: BackgroundTaskSegmentCollectionState,
    message: ChatMessage,
  ): BackgroundTaskSegment[] {
    const matched = new Set<BackgroundTaskSegment>();
    for (const task of message.omo?.tasks ?? []) {
      if (!task.id) {
        continue;
      }
      const segment = this.findSegmentByTaskId(state.segments, task.id);
      if (segment) {
        matched.add(segment);
      }
    }

    if (matched.size > 0) {
      return Array.from(matched);
    }

    const fallback = this.getLatestSegmentWithActivity(state.segments)
      ?? this.getOrCreateSegment(state, state.latestUserMessage);
    return fallback ? [fallback] : [];
  }

  private applyReminderToSegment(
    segment: BackgroundTaskSegment,
    message: ChatMessage,
  ): void {
    if (message.omo?.kind !== 'system-reminder') {
      return;
    }

    const tasks = (message.omo.tasks ?? [])
      .filter((task) => task.id || task.description)
      .map((task) => ({
        taskId: task.id || task.description,
        description: task.description || t('chat.backgroundTask.noDescription'),
      }));

    for (const completion of tasks) {
      this.addCompletionToSegment(segment, completion);
    }

    segment.completionEvents.push({
      reminderMessageId: message.sourceMessageId ?? message.id,
      reminderType: message.omo.reminderType === 'all-background-tasks-complete'
        ? 'all-background-tasks-complete'
        : 'background-task-completed',
      tasks,
      timestamp: message.timestamp,
    });

    if (message.omo.reminderType === 'all-background-tasks-complete') {
      segment.sawAllTasksComplete = true;
    }
  }

  private mergeRuntimeSegmentState(
    state: BackgroundTaskSegmentCollectionState,
    tabId: TabId | null,
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime?.backgroundTaskActiveAnchorKey || !runtime.backgroundTaskStartedAt) {
      return;
    }

    const segment = this.getOrCreateRuntimeSegment(state, runtime);
    if (!segment) {
      return;
    }

    this.mergeSegmentLaunches(segment, runtime.backgroundTaskLaunches.values());
    this.mergeSegmentCompletions(segment, runtime.backgroundTaskCompletedTasks.values());
    segment.modeTag = segment.modeTag ?? runtime.backgroundTaskModeTag;
    segment.waitingForFollowUp = runtime.backgroundTaskWaitingForFollowUp;
  }

  private finalizeCollectedSegments(
    segments: BackgroundTaskSegment[],
  ): BackgroundTaskSegment[] {
    for (const segment of segments) {
      this.finalizeSegment(segment);
    }

    return segments.sort((left, right) => left.anchorTimestamp - right.anchorTimestamp);
  }

  private finalizeSegment(segment: BackgroundTaskSegment): void {
    const pendingState = this.resolvePendingState(segment);
    segment.pending = pendingState.pending;
    segment.waitingForFollowUp = pendingState.waitingForFollowUp;
  }

  private resolvePendingState(
    segment: BackgroundTaskSegment,
  ): BackgroundTaskSegmentPendingState {
    const pending = this.filterPendingLaunches(segment.launches, segment.completed);
    if (segment.sawAllTasksComplete) {
      return {
        pending: [],
        waitingForFollowUp: false,
      };
    }

    return {
      pending,
      waitingForFollowUp: segment.waitingForFollowUp || pending.length > 0,
    };
  }

  private getOrCreateSegment(
    state: BackgroundTaskSegmentCollectionState,
    anchorMessage: ChatMessage | null,
  ): BackgroundTaskSegment | null {
    if (!anchorMessage) {
      return null;
    }

    const anchorKey = this.host.getMessageAnchorKey(anchorMessage);
    const existing = state.segmentByAnchorKey.get(anchorKey);
    if (existing) {
      return existing;
    }

    const created = this.createSegment(anchorMessage);
    state.segmentByAnchorKey.set(anchorKey, created);
    state.segments.push(created);
    return created;
  }

  private getBackgroundTaskDescription(
    input: Record<string, unknown>,
    fallbackResult?: string,
  ): string {
    const description = [
      input.description,
      input.prompt,
      input.title,
      input.summary,
      input.query,
      input.command,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (description) {
      return description.trim();
    }

    if (fallbackResult) {
      const trimmed = fallbackResult.trim();
      if (trimmed.length > 0) {
        return trimmed.split(/\r?\n/)[0].trim();
      }
    }

    return t('chat.backgroundTask.noDescription');
  }

  private extractBackgroundTaskId(...sources: unknown[]): string | null {
    const pattern = /\b(bg_[a-z0-9]+)\b/i;

    for (const source of sources) {
      if (typeof source === 'string') {
        const match = source.match(pattern);
        if (match?.[1]) {
          return match[1];
        }
        continue;
      }

      if (source && typeof source === 'object') {
        const nested = [
          (source as Record<string, unknown>).task_id,
          (source as Record<string, unknown>).taskId,
          (source as Record<string, unknown>).id,
        ];
        const directMatch = this.extractBackgroundTaskId(...nested);
        if (directMatch) {
          return directMatch;
        }

        try {
          const match = JSON.stringify(source).match(pattern);
          if (match?.[1]) {
            return match[1];
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  private addCompletedTasksFromMessage(
    message: ChatMessage,
    target: Map<string, BackgroundTaskCompletionInfo>,
  ): void {
    if (message.omo?.kind !== 'system-reminder' || !message.omo.tasks || message.omo.tasks.length === 0) {
      return;
    }

    for (const task of message.omo.tasks) {
      if (!task.id && !task.description) {
        continue;
      }

      const completionId = task.id || task.description;
      target.set(completionId, {
        taskId: task.id || completionId,
        description: task.description || t('chat.backgroundTask.noDescription'),
      });
    }
  }

  private createSegment(anchorMessage: ChatMessage): BackgroundTaskSegment {
    return this.createEmptySegment(
      this.host.getMessageAnchorKey(anchorMessage),
      anchorMessage.timestamp,
      anchorMessage.omo?.kind === 'user-injection' ? anchorMessage.omo.modeTag : null,
    );
  }

  private createEmptySegment(
    anchorKey: string,
    anchorTimestamp: number,
    modeTag: string | null,
  ): BackgroundTaskSegment {
    return {
      anchorKey,
      anchorTimestamp,
      modeTag,
      launches: [],
      completed: [],
      pending: [],
      sawAllTasksComplete: false,
      waitingForFollowUp: false,
      completionEvents: [],
    };
  }

  private getOrCreateRuntimeSegment(
    state: BackgroundTaskSegmentCollectionState,
    runtime: BackgroundTaskTimelineRuntime,
  ): BackgroundTaskSegment | null {
    if (!runtime.backgroundTaskActiveAnchorKey || !runtime.backgroundTaskStartedAt) {
      return null;
    }

    const existing = state.segmentByAnchorKey.get(runtime.backgroundTaskActiveAnchorKey);
    if (existing) {
      return existing;
    }

    const created = this.createEmptySegment(
      runtime.backgroundTaskActiveAnchorKey,
      runtime.backgroundTaskStartedAt,
      runtime.backgroundTaskModeTag,
    );
    state.segmentByAnchorKey.set(created.anchorKey, created);
    state.segments.push(created);
    return created;
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

  private addCompletionToSegment(
    segment: BackgroundTaskSegment,
    completion: BackgroundTaskCompletionInfo,
  ): void {
    if (segment.completed.some((item) =>
      item.taskId === completion.taskId && item.description === completion.description
    )) {
      return;
    }

    segment.completed.push(completion);
  }

  private upsertSegmentLaunch(
    segment: BackgroundTaskSegment,
    toolCall: {
      id: string;
      input: Record<string, unknown>;
      result?: string;
    },
  ): void {
    const launches = new Map(segment.launches.map((launch) => [launch.launchId, launch] as const));
    this.upsertLaunch(toolCall, launches);
    segment.launches = Array.from(launches.values());
  }

  private mergeSegmentLaunches(
    segment: BackgroundTaskSegment,
    launches: Iterable<BackgroundTaskLaunchInfo>,
  ): void {
    const merged = new Map(segment.launches.map((launch) => [launch.launchId, launch] as const));
    for (const launch of launches) {
      merged.set(launch.launchId, launch);
    }
    segment.launches = Array.from(merged.values());
  }

  private mergeSegmentCompletions(
    segment: BackgroundTaskSegment,
    completed: Iterable<BackgroundTaskCompletionInfo>,
  ): void {
    const merged = new Map(segment.completed.map((item) => [item.taskId, item] as const));
    for (const item of completed) {
      merged.set(item.taskId, item);
    }
    segment.completed = Array.from(merged.values());
  }

  private findSegmentByTaskId(
    segments: BackgroundTaskSegment[],
    taskId: string,
  ): BackgroundTaskSegment | null {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (segments[index].launches.some((launch) => launch.taskId === taskId)) {
        return segments[index];
      }
    }

    return null;
  }

  private getLatestSegmentWithActivity(
    segments: BackgroundTaskSegment[],
  ): BackgroundTaskSegment | null {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (this.segmentHasTaskActivity(segments[index])) {
        return segments[index];
      }
    }

    return null;
  }

  private segmentHasTaskActivity(segment: BackgroundTaskSegment): boolean {
    return segment.pending.length > 0 || segment.launches.length > 0;
  }

  private isLaunchMatchedByCompletion(
    launch: BackgroundTaskLaunchInfo,
    completion: BackgroundTaskCompletionInfo,
  ): boolean {
    if (launch.taskId && launch.taskId === completion.taskId) {
      return true;
    }

    return launch.description.trim().toLowerCase() === completion.description.trim().toLowerCase();
  }

  private filterPendingLaunches(
    launches: BackgroundTaskLaunchInfo[],
    completed: BackgroundTaskCompletionInfo[],
  ): BackgroundTaskLaunchInfo[] {
    return launches.filter((launch) =>
      !completed.some((completion) => this.isLaunchMatchedByCompletion(launch, completion)),
    );
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

  private findBackgroundTaskAnchorIndex(messages: ChatMessage[]): number {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        return index;
      }
    }

    return -1;
  }

  private isBackgroundTaskCompletionReminder(message: ChatMessage): boolean {
    return message.omo?.kind === 'system-reminder'
      && (
        message.omo.reminderType === 'background-task-completed'
        || message.omo.reminderType === 'all-background-tasks-complete'
      );
  }
}
