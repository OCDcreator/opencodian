import type { ChatMessage, Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';

const logger = createLogger('BackgroundTaskCompletionNoticeService');

interface BackgroundTaskCompletionNoticeMessageOptions {
  title: string;
  content: string;
  tone: ChatMessage['noticeTone'];
  conversation?: Conversation | null;
  tabId?: TabId | null;
  timestamp?: number;
  noticeMeta?: ChatMessage['noticeMeta'];
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

export interface BackgroundTaskCompletionNoticeRuntime {
  isStreaming: boolean;
}

export interface BackgroundTaskCompletionNoticeServiceHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskCompletionNoticeRuntime | null;
  appendPersistentAssistantNoticeMessage(
    options: BackgroundTaskCompletionNoticeMessageOptions,
  ): Promise<void>;
}

export class BackgroundTaskCompletionNoticeService {
  private readonly queuedNoticesByRuntime = new WeakMap<
    BackgroundTaskCompletionNoticeRuntime,
    Map<string, QueuedBackgroundTaskCompletionNotice>
  >();

  constructor(private readonly host: BackgroundTaskCompletionNoticeServiceHost) {}

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

  private getQueuedNotices(
    runtime: BackgroundTaskCompletionNoticeRuntime,
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
}
