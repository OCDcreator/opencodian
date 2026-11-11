import { type ChatMessage, type Conversation,getConversationBackendSessionId } from '../../../../core/types';
import { t } from '../../../../i18n';
import { createLogger } from '../../../../shared';
import type { TabId } from '../../tabs';

const logger = createLogger('BackgroundTaskNoticeStateService');

interface BackgroundTaskNoticeMessageOptions {
  title: string;
  content: string;
  tone: ChatMessage['noticeTone'];
  conversation?: Conversation | null;
  tabId?: TabId | null;
  timestamp?: number;
  noticeMeta?: ChatMessage['noticeMeta'];
  isCurrent?: () => boolean;
}

export interface BackgroundTaskNoticeLaunchInfo {
  launchId: string;
  taskId: string | null;
  description: string;
}

export interface BackgroundTaskCompletionInfo {
  taskId: string;
  description: string;
  nativeStatus?: 'completed' | 'failed' | 'killed';
}

export interface BackgroundTaskCompletionEvent {
  reminderMessageId: string;
  reminderType: 'background-task-completed' | 'all-background-tasks-complete';
  tasks: BackgroundTaskCompletionInfo[];
  timestamp: number;
  nativeJob?: boolean;
  /** Local observer lease only; never persisted or sent to a model. */
  isCurrent?: () => boolean;
}

export interface BackgroundTaskCompletionNoticeSegment {
  anchorKey: string;
  completionEvents: BackgroundTaskCompletionEvent[];
}

export interface QueuedBackgroundTaskCompletionNotice {
  anchorKey: string;
  conversationId?: string;
  nativeJob?: boolean;
  isCurrent?: () => boolean;
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
  private readonly flushing = new Map<string, Promise<void>>();
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
    options: { isCurrent?: () => boolean } = {},
  ): Promise<void> {
    if (pending.length === 0 || (options.isCurrent && !options.isCurrent())) {
      return;
    }

    const runtime = this.host.getTabRuntimeState(tabId);
    const fingerprint = this.buildStoppedNoticeContent(pending);
    if (runtime) {
      runtime.backgroundTaskSuppressedFingerprint = fingerprint;
    }

    await this.appendStoppedNoticeIfPossible(tabId, fingerprint, options);
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
        if (persisted.has(reminderFingerprint) || event.isCurrent && !event.isCurrent()) {
          continue;
        }

        const queueKey = `${conversation.id}\0${segment.anchorKey}`;
        let queued = queuedNotices.get(queueKey);
        if (!queued || queued.isCurrent && !queued.isCurrent()) {
          queued = {
            anchorKey: segment.anchorKey,
            conversationId: conversation.id,
            nativeJob: event.nativeJob,
            isCurrent: event.isCurrent,
            allComplete: false,
            sourceReminderIds: new Set(),
            tasks: new Map(),
            latestTimestamp: event.timestamp,
          };
          queuedNotices.set(queueKey, queued);
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
    options: { isCurrent?: () => boolean } = {},
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !conversation || runtime.isStreaming) {
      return;
    }

    const pending = this.flushing.get(conversation.id);
    if (pending) { await pending; return this.flushQueuedNotices(tabId, conversation, options); }
    const flush = Promise.resolve().then(() => this.flushReadyNotices(tabId, conversation, options));
    this.flushing.set(conversation.id, flush);
    try { await flush; }
    finally { if (this.flushing.get(conversation.id) === flush) this.flushing.delete(conversation.id); }
  }

  private async flushReadyNotices(tabId: TabId | null, conversation: Conversation, options: { isCurrent?: () => boolean }): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || runtime.isStreaming) return;
    const queuedNotices = this.getQueuedNotices(runtime);
    const persisted = this.getPersistedBackgroundTaskCompletionNoticeFingerprints(conversation);
    for (const [queueKey, live] of [...queuedNotices.entries()]) {
      if (options.isCurrent && !options.isCurrent() || runtime.isStreaming) return;
      if (live.conversationId !== conversation.id) continue;
      if (live.isCurrent && !live.isCurrent()) { queuedNotices.delete(queueKey); continue; }
      const queued = { ...live, tasks: new Map(live.tasks), sourceReminderIds: new Set(live.sourceReminderIds) };
      this.removePersistedNativeJobs(queued, live, persisted);
      const taskIds = [...queued.tasks.keys()].sort();
      const fingerprint = this.getBackgroundTaskCompletionNoticeFingerprint({ anchorKey: queued.anchorKey, allComplete: queued.allComplete, taskIds });
      if (persisted.has(fingerprint) || [...queued.sourceReminderIds].every(id => persisted.has(`source:${id}`))) {
        queuedNotices.delete(queueKey); continue;
      }
      await this.appendQueuedNotice({ queued, conversation, tabId, isCurrent: queued.nativeJob
        ? () => !runtime.isStreaming && (!options.isCurrent || options.isCurrent()) : options.isCurrent });
      if (!this.isNativeNoticeCurrent(runtime, queued, options.isCurrent)) return;
      for (const id of queued.sourceReminderIds) { live.sourceReminderIds.delete(id); persisted.add(`source:${id}`); }
      for (const id of taskIds) live.tasks.delete(id);
      persisted.add(fingerprint);
      if (!live.sourceReminderIds.size) queuedNotices.delete(queueKey);
    }
  }

  private isNativeNoticeCurrent(runtime: BackgroundTaskNoticeStateRuntime, queued: QueuedBackgroundTaskCompletionNotice, isCurrent?: () => boolean): boolean {
    return !runtime.isStreaming && (!isCurrent || isCurrent()) && (!queued.isCurrent || queued.isCurrent());
  }

  private removePersistedNativeJobs(queued: QueuedBackgroundTaskCompletionNotice, live: QueuedBackgroundTaskCompletionNotice, persisted: Set<string>): void {
    if (!queued.nativeJob) return;
    for (const id of queued.sourceReminderIds) if (persisted.has(`source:${id}`)) {
      queued.sourceReminderIds.delete(id); queued.tasks.delete(id); live.sourceReminderIds.delete(id); live.tasks.delete(id);
    }
  }

  private async appendQueuedNotice(input: {
    queued: QueuedBackgroundTaskCompletionNotice; conversation: Conversation; tabId: TabId | null; isCurrent?: () => boolean;
  }): Promise<void> {
    const { queued, conversation, tabId } = input;
    const taskIds = [...queued.tasks.keys()].sort();
    await this.host.appendPersistentAssistantNoticeMessage({
      title: queued.nativeJob ? t('chat.dsh.jobs.finishedTitle') : queued.allComplete
        ? t('chat.omo.system.allCompleted') : t('chat.omo.system.backgroundCompleted'),
      content: this.buildBackgroundTaskCompletionNoticeContent(queued), tone: 'info', conversation, tabId,
      timestamp: queued.latestTimestamp,
      noticeMeta: { kind: 'background-task-completion', conversationId: conversation.id, anchorKey: queued.anchorKey,
        sourceReminderIds: [...queued.sourceReminderIds].sort(), allComplete: queued.allComplete, taskIds },
      isCurrent: queued.isCurrent ? () => queued.isCurrent!() && (!input.isCurrent || input.isCurrent()) : input.isCurrent,
    });
    logger.debug('Background task completion notice persisted', { tabId, anchorKey: queued.anchorKey, taskCount: taskIds.length });
  }

  private async appendStoppedNoticeIfPossible(
    tabId: TabId | null,
    fingerprint: string,
    options: { isCurrent?: () => boolean } = {},
  ): Promise<void> {
    if (options.isCurrent && !options.isCurrent()) {
      return;
    }
    const runtime = this.host.getTabRuntimeState(tabId);
    const conversation = this.host.getCurrentConversation();
    if (!runtime || !tabId || tabId !== this.host.getActiveTabId() || !conversation) {
      return;
    }

    const sessionId = this.host.getSessionIdForTab(tabId);
    if (!sessionId || sessionId !== getConversationBackendSessionId(conversation)) {
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
      if (options.isCurrent && !options.isCurrent()) {
        return;
      }
      await this.host.appendPersistentAssistantNoticeMessage({
        title: t('chat.backgroundTask.staleTitle'),
        content: fingerprint,
        tone: 'warning',
        isCurrent: options.isCurrent,
      });
      if (options.isCurrent && !options.isCurrent()) {
        return;
      }
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
    const lines = queued.nativeJob ? [t('chat.dsh.jobs.finishedSummary')] : queued.allComplete
      ? [t('chat.omo.system.allCompletedSummary')]
      : [t('chat.omo.system.backgroundCompletedSummary')];

    if (tasks.length > 0) {
      lines.push('', `**${t('chat.backgroundTask.taskListLabel')}**`);
      for (const task of tasks) {
        const status = task.nativeStatus ? `${t(`chat.dsh.jobs.status.${task.nativeStatus}`)} · ` : '';
        lines.push(`- ${status}\`${task.taskId}\`: ${task.description}`);
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
