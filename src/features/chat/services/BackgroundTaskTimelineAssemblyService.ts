import type { ChatMessage } from '../../../core/types';
import { t } from '../../../i18n';
import type { TabId } from '../tabs';
import type {
  BackgroundTaskCompletionEvent,
  BackgroundTaskCompletionInfo,
} from './BackgroundTaskNoticeStateService';
import {
  type BackgroundTaskLaunchInfo,
  BackgroundTaskTimelineLaunchService,
} from './BackgroundTaskTimelineLaunchService';

export type { BackgroundTaskLaunchInfo } from './BackgroundTaskTimelineLaunchService';

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

export interface BackgroundTaskTimelineAssemblyHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskTimelineRuntime | null;
  getMessageAnchorKey(message: ChatMessage): string;
}

type ChatContentBlock = NonNullable<ChatMessage['contentBlocks']>[number];
type BackgroundTaskToolUseBlock = ChatContentBlock & {
  type: 'tool_use';
  toolId: string; toolInput?: Record<string, unknown>;
  toolMetadata?: Record<string, unknown>;
  toolResult?: string;
  toolStatus?: string;
};

interface BackgroundTaskSegmentCollectionState {
  segments: BackgroundTaskSegment[];
  segmentByAnchorKey: Map<string, BackgroundTaskSegment>;
  latestTaskAnchorMessage: ChatMessage | null;
}

interface BackgroundTaskSegmentPendingState {
  pending: BackgroundTaskLaunchInfo[];
  waitingForFollowUp: boolean;
}

export class BackgroundTaskTimelineAssemblyService {
  constructor(private readonly host: BackgroundTaskTimelineAssemblyHost) {}

  upsertLaunch(
    toolCall: {
      id: string;
      input: Record<string, unknown>;
      toolMetadata?: Record<string, unknown>;
      result?: string;
    },
    target: Map<string, BackgroundTaskLaunchInfo>,
  ): void {
    BackgroundTaskTimelineLaunchService.upsertLaunch(toolCall, target);
  }

  getCompletedTaskFromToolCall(toolCall: {
    id: string;
    input: Record<string, unknown>;
    toolMetadata?: Record<string, unknown>;
    result?: string;
  }): BackgroundTaskCompletionInfo | null {
    return BackgroundTaskTimelineLaunchService.getCompletedTaskFromToolCall(toolCall);
  }

  collectSegments(messages: ChatMessage[], tabId: TabId | null): BackgroundTaskSegment[] {
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
        BackgroundTaskTimelineLaunchService.addCompletedTasksFromMessage(message, completed);
        if (message.omo.reminderType === 'all-background-tasks-complete') {
          sawAllTasksComplete = true;
        }
      }

      for (const block of message.contentBlocks ?? []) {
        if (block.type !== 'tool_use' || block.toolName !== 'task' || !block.toolId) {
          continue;
        }

        const taskBlock = block as BackgroundTaskToolUseBlock;
        const toolCall = {
          id: taskBlock.toolId,
          input: taskBlock.toolInput ?? {},
          toolMetadata: taskBlock.toolMetadata,
          result: taskBlock.toolResult,
        };

        this.upsertLaunch(toolCall, launches);

        if (taskBlock.toolStatus === 'completed' || taskBlock.toolStatus === 'error') {
          const completion = BackgroundTaskTimelineLaunchService.getCompletedTaskFromToolCall(toolCall);
          if (completion) {
            completed.set(completion.taskId, completion);
          }
        }
      }
    }

    if (launches.size === 0 && completed.size === 0 && !sawAllTasksComplete) {
      return null;
    }

    return {
      anchorKey: this.host.getMessageAnchorKey(anchorMessage),
      completed: Array.from(completed.values()),
      pending: BackgroundTaskTimelineLaunchService.filterPendingLaunches(
        Array.from(launches.values()),
        Array.from(completed.values()),
      ),
      sawAllTasksComplete,
    };
  }

  getPendingLaunches(tabId: TabId | null): BackgroundTaskLaunchInfo[] {
    const runtime = this.host.getTabRuntimeState(tabId);
    return BackgroundTaskTimelineLaunchService.filterPendingLaunches(
      Array.from(runtime?.backgroundTaskLaunches.values() ?? []),
      Array.from(runtime?.backgroundTaskCompletedTasks.values() ?? []),
    );
  }

  private createSegmentCollectionState(): BackgroundTaskSegmentCollectionState {
    return {
      segments: [],
      segmentByAnchorKey: new Map(),
      latestTaskAnchorMessage: null,
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

    this.collectOmoCompletionReminderSegments(state, message);
  }

  private captureUserSegmentAnchor(
    state: BackgroundTaskSegmentCollectionState,
    message: ChatMessage,
  ): void {
    state.latestTaskAnchorMessage = message;
    if (this.isOmoModeAnchorMessage(message)) {
      this.getOrCreateSegment(state, message);
    }
  }

  private isOmoModeAnchorMessage(message: ChatMessage): boolean {
    return message.role === 'user'
      && message.omo?.kind === 'user-injection'
      && typeof message.omo.modeTag === 'string'
      && message.omo.modeTag.length > 0;
  }

  private collectTaskLaunchBlock(
    state: BackgroundTaskSegmentCollectionState,
    block: ChatContentBlock,
  ): void {
    if (block.type !== 'tool_use' || block.toolName !== 'task' || !block.toolId) {
      return;
    }

    if (!state.latestTaskAnchorMessage) {
      return;
    }

    const segment = this.getOrCreateSegment(state, state.latestTaskAnchorMessage);
    if (!segment) {
      return;
    }

    const taskBlock = block as BackgroundTaskToolUseBlock;
    this.upsertSegmentLaunch(segment, {
      id: taskBlock.toolId,
      input: taskBlock.toolInput ?? {},
      toolMetadata: taskBlock.toolMetadata,
      result: taskBlock.toolResult,
    });
    this.addNativeTaskCompletionToSegment(segment, taskBlock);
  }

  private collectOmoCompletionReminderSegments(
    state: BackgroundTaskSegmentCollectionState,
    message: ChatMessage,
  ): void {
    if (message.omo?.kind !== 'system-reminder') {
      return;
    }

    if (!this.isOmoBackgroundTaskCompletionReminder(message)) {
      return;
    }

    const reminderMeta = message.omo;
    for (const segment of this.resolveReminderSegments(state, message, reminderMeta.tasks ?? [])) {
      this.applyReminderToSegment(segment, message);
    }
  }

  private resolveReminderSegments(
    state: BackgroundTaskSegmentCollectionState,
    message: ChatMessage,
    tasks: NonNullable<NonNullable<ChatMessage['omo']> extends infer TOmo
      ? TOmo extends { kind: 'system-reminder'; tasks?: infer TTasks }
        ? TTasks
        : never
      : never>,
  ): BackgroundTaskSegment[] {
    const matched = new Set<BackgroundTaskSegment>();
    for (const task of tasks) {
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
      ?? this.getOrCreateSegment(state, state.latestTaskAnchorMessage);
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
    const pending = BackgroundTaskTimelineLaunchService.filterPendingLaunches(
      segment.launches,
      segment.completed,
    );
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
      toolMetadata?: Record<string, unknown>;
      result?: string;
    },
  ): void {
    const launches = new Map(segment.launches.map((launch) => [launch.launchId, launch] as const));
    this.upsertLaunch(toolCall, launches);
    segment.launches = Array.from(launches.values());
  }

  private addNativeTaskCompletionToSegment(
    segment: BackgroundTaskSegment,
    block: BackgroundTaskToolUseBlock,
  ): void {
    if (block.toolStatus !== 'completed' && block.toolStatus !== 'error') {
      return;
    }

    const completion = BackgroundTaskTimelineLaunchService.getCompletedTaskFromToolCall({
      id: block.toolId,
      input: block.toolInput ?? {},
      toolMetadata: block.toolMetadata,
      result: block.toolResult,
    });
    if (completion) {
      this.addCompletionToSegment(segment, completion);
    }
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

  private findBackgroundTaskAnchorIndex(messages: ChatMessage[]): number {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        return index;
      }
    }

    return -1;
  }

  private isOmoBackgroundTaskCompletionReminder(message: ChatMessage): boolean {
    return message.omo?.kind === 'system-reminder'
      && (
        message.omo.reminderType === 'background-task-completed'
        || message.omo.reminderType === 'all-background-tasks-complete'
      );
  }
}
