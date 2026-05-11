import type { ChatMessage, Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';

const logger = createLogger('BackgroundTaskNoticeStateService');

interface BackgroundTaskNoticeMessageOptions {
  title: string;
  content: string;
  tone: ChatMessage['noticeTone'];
  conversation?: Conversation | null;
  tabId?: TabId | null;
  timestamp?: number;
  noticeMeta?: ChatMessage['noticeMeta'];
}

export interface BackgroundTaskNoticeLaunchInfo {
  launchId: string;
  taskId: string | null;
  description: string;
}

export interface BackgroundTaskCompletionInfo {
  taskId: string;
  description: string;
}

export interface BackgroundTaskCompletionEvent {
  reminderMessageId: string;
  reminderType: 'background-task-completed' | 'all-background-tasks-complete';
  tasks: BackgroundTaskCompletionInfo[];
  timestamp: number;
}

export interface BackgroundTaskCompletionNoticeSegment {
  anchorKey: string;
  completionEvents: BackgroundTaskCompletionEvent[];
}

export interface QueuedBackgroundTaskCompletionNotice {
  anchorKey: string;
  allComplete: boolean;
  sourceReminderIds: Set<string>;
  tasks: Map<string, BackgroundTaskCompletionInfo>;
  latestTimestamp: number;
}

export interface BackgroundTaskNoticeStateRuntime {
  isStreaming: boolean;
  backgroundTaskStaleNoticeFingerprint: string | null;
  backgroundTaskSuppressedFingerprint: string | null;
}

export interface BackgroundTaskNoticeStateServiceHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskNoticeStateRuntime | null;
  getActiveTabId(): TabId | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getCurrentConversation(): Conversation | null;
  hasMatchingPersistentAssistantNoticeMessage(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation?: Conversation | null,
  ): boolean;
  appendPersistentAssistantNoticeMessage(options: BackgroundTaskNoticeMessageOptions): Promise<void>;
}

export class BackgroundTaskNoticeStateService {
  private readonly queuedNoticesByRuntime = new WeakMap<
    BackgroundTaskNoticeStateRuntime,
    Map<string, QueuedBackgroundTaskCompletionNotice>
  >();

  constructor(private readonly host: BackgroundTaskNoticeStateServiceHost) {}

  buildStoppedNoticeContent(pending: readonly BackgroundTaskNoticeLaunchInfo[]): string {
    const sortedPending = [...pending].sort((left, right) => {
      const leftId = this.getLaunchDisplayId(left);
      const rightId = this.getLaunchDisplayId(right);
      return leftId.localeCompare(rightId) || left.description.localeCompare(right.description);
    });

    return [
      t('chat.backgroundTask.staleBody'),
      '',
      `**${t('chat.backgroundTask.taskListLabel')}**`,
      ...sortedPending.map((task) =>
        `- ${t('chat.backgroundTask.taskStatusStopped')} · \`${this.getLaunchDisplayId(task)}\`: ${task.description}`,
      ),
    ].join('\n');
  }

  isPendingLaunchSetSuppressed(
    pending: readonly BackgroundTaskNoticeLaunchInfo[],
    tabId: TabId | null = this.host.getActiveTabId(),
    conversation: Conversation | null = this.host.getCurrentConversation(),
  ): boolean {
    if (pending.length === 0) {
      return false;
    }

    const fingerprint = this.buildStoppedNoticeContent(pending);
    const runtime = this.host.getTabRuntimeState(tabId);
    if (runtime?.backgroundTaskSuppressedFingerprint === fingerprint) {
      return true;
    }

    if (!this.hasPersistedStoppedNotice(fingerprint, conversation)) {
      return false;
    }

    if (runtime) {
      runtime.backgroundTaskStaleNoticeFingerprint = fingerprint;
      runtime.backgroundTaskSuppressedFingerprint = fingerprint;
    }

    return true;
  }

  async handleStoppedPendingLaunches(
    tabId: TabId | null,
    pending: readonly BackgroundTaskNoticeLaunchInfo[],
  ): Promise<void> {
    if (pending.length === 0) {
      return;
    }

    const runtime = this.host.getTabRuntimeState(tabId);
    const fingerprint = this.buildStoppedNoticeContent(pending);
    if (runtime) {
      runtime.backgroundTaskSuppressedFingerprint = fingerprint;
    }

    await this.appendStoppedNoticeIfPossible(tabId, fingerprint);
  }

  queueNotices(
    segments: readonly BackgroundTaskCompletionNoticeSegment[],
    tabId: TabId | null,
    conversation: Conversation | null,
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !conversation) {
      return;
    }

    const queuedNotices = this.getQueuedNotices(runtime);
    const persisted = this.getPersistedBackgroundTaskCompletionNoticeFingerprints(conversation);

    for (const segment of segments) {
      for (const event of segment.completionEvents) {
        const reminderFingerprint = `source:${event.reminderMessageId}`;
        if (persisted.has(reminderFingerprint)) {
          continue;
        }

        let queued = queuedNotices.get(segment.anchorKey);
        if (!queued) {
          queued = {
            anchorKey: segment.anchorKey,
            allComplete: false,
            sourceReminderIds: new Set(),
            tasks: new Map(),
            latestTimestamp: event.timestamp,
          };
          queuedNotices.set(segment.anchorKey, queued);
        }

        queued.latestTimestamp = Math.max(queued.latestTimestamp, event.timestamp);
        queued.sourceReminderIds.add(event.reminderMessageId);
        queued.allComplete = queued.allComplete || event.reminderType === 'all-background-tasks-complete';
        for (const task of event.tasks) {
          queued.tasks.set(task.taskId, task);
        }
      }
    }
  }

  async flushQueuedNotices(
    tabId: TabId | null,
    conversation: Conversation | null,
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !conversation || runtime.isStreaming) {
      return;
    }

    const queuedNotices = this.getQueuedNotices(runtime);
    const persisted = this.getPersistedBackgroundTaskCompletionNoticeFingerprints(conversation);

    for (const [anchorKey, queued] of [...queuedNotices.entries()]) {
      const taskIds = [...queued.tasks.keys()].sort();
      const fingerprint = this.getBackgroundTaskCompletionNoticeFingerprint({
        anchorKey,
        allComplete: queued.allComplete,
        taskIds,
      });
      if (persisted.has(fingerprint)) {
        queuedNotices.delete(anchorKey);
        continue;
      }

      await this.host.appendPersistentAssistantNoticeMessage({
        title: queued.allComplete
          ? t('chat.omo.system.allCompleted')
          : t('chat.omo.system.backgroundCompleted'),
        content: this.buildBackgroundTaskCompletionNoticeContent(queued),
        tone: 'info',
        conversation,
        tabId,
        timestamp: queued.latestTimestamp,
        noticeMeta: {
          kind: 'background-task-completion',
          conversationId: conversation.id,
          anchorKey,
          sourceReminderIds: [...queued.sourceReminderIds].sort(),
          allComplete: queued.allComplete,
          taskIds,
        },
      });
      logger.debug('Background task completion notice persisted', {
        tabId,
        anchorKey,
        allComplete: queued.allComplete,
        taskCount: taskIds.length,
        reminderCount: queued.sourceReminderIds.size,
      });
      queuedNotices.delete(anchorKey);
    }
  }

  private async appendStoppedNoticeIfPossible(
    tabId: TabId | null,
    fingerprint: string,
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    const conversation = this.host.getCurrentConversation();
    if (!runtime || !tabId || tabId !== this.host.getActiveTabId() || !conversation) {
      return;
    }

    const sessionId = this.host.getSessionIdForTab(tabId);
    if (!sessionId || sessionId !== conversation.openCodeSessionId) {
      return;
    }

    if (runtime.backgroundTaskStaleNoticeFingerprint === fingerprint) {
      runtime.backgroundTaskSuppressedFingerprint = fingerprint;
      return;
    }

    if (this.hasPersistedStoppedNotice(fingerprint, conversation)) {
      runtime.backgroundTaskStaleNoticeFingerprint = fingerprint;
      runtime.backgroundTaskSuppressedFingerprint = fingerprint;
      return;
    }

    runtime.backgroundTaskStaleNoticeFingerprint = fingerprint;
    runtime.backgroundTaskSuppressedFingerprint = fingerprint;
    try {
      await this.host.appendPersistentAssistantNoticeMessage({
        title: t('chat.backgroundTask.staleTitle'),
        content: fingerprint,
        tone: 'warning',
      });
    } catch (error) {
      if (runtime.backgroundTaskStaleNoticeFingerprint === fingerprint) {
        runtime.backgroundTaskStaleNoticeFingerprint = null;
      }
      if (runtime.backgroundTaskSuppressedFingerprint === fingerprint) {
        runtime.backgroundTaskSuppressedFingerprint = null;
      }
      logger.warn('Failed to append stale background task notice', error);
    }
  }

  private hasPersistedStoppedNotice(
    fingerprint: string,
    conversation: Conversation | null,
  ): boolean {
    return this.host.hasMatchingPersistentAssistantNoticeMessage(
      t('chat.backgroundTask.staleTitle'),
      fingerprint,
      'warning',
      conversation,
    );
  }

  private getQueuedNotices(
    runtime: BackgroundTaskNoticeStateRuntime,
  ): Map<string, QueuedBackgroundTaskCompletionNotice> {
    const existing = this.queuedNoticesByRuntime.get(runtime);
    if (existing) {
      return existing;
    }

    const created = new Map<string, QueuedBackgroundTaskCompletionNotice>();
    this.queuedNoticesByRuntime.set(runtime, created);
    return created;
  }

  private getPersistedBackgroundTaskCompletionNoticeFingerprints(
    conversation: Conversation | null,
  ): Set<string> {
    const fingerprints = new Set<string>();
    for (const message of conversation?.messages ?? []) {
      const meta = message.noticeMeta;
      if (meta?.kind !== 'background-task-completion') {
        continue;
      }
      fingerprints.add(this.getBackgroundTaskCompletionNoticeFingerprint({
        anchorKey: meta.anchorKey ?? 'unknown',
        allComplete: Boolean(meta.allComplete),
        taskIds: meta.taskIds ?? [],
      }));
      for (const reminderId of meta.sourceReminderIds ?? []) {
        fingerprints.add(`source:${reminderId}`);
      }
    }

    return fingerprints;
  }

  private getBackgroundTaskCompletionNoticeFingerprint(input: {
    anchorKey: string;
    allComplete: boolean;
    taskIds: string[];
  }): string {
    const taskIds = [...new Set(input.taskIds)].sort();
    return JSON.stringify({
      anchorKey: input.anchorKey,
      allComplete: input.allComplete,
      taskIds,
    });
  }

  private buildBackgroundTaskCompletionNoticeContent(
    queued: QueuedBackgroundTaskCompletionNotice,
  ): string {
    const tasks = [...queued.tasks.values()].sort((left, right) =>
      left.taskId.localeCompare(right.taskId) || left.description.localeCompare(right.description),
    );
    const lines = queued.allComplete
      ? [t('chat.omo.system.allCompletedSummary')]
      : [t('chat.omo.system.backgroundCompletedSummary')];

    if (tasks.length > 0) {
      lines.push('', `**${t('chat.backgroundTask.taskListLabel')}**`);
      for (const task of tasks) {
        lines.push(`- \`${task.taskId}\`: ${task.description}`);
      }
    }

    return lines.join('\n');
  }

  private getLaunchDisplayId(launch: BackgroundTaskNoticeLaunchInfo): string {
    if (launch.taskId) {
      return launch.taskId;
    }

    return `launch_${launch.launchId.slice(-8)}`;
  }
}
