import type { ChatMessage, Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';

const logger = createLogger('BackgroundTaskNoticeStateService');

interface BackgroundTaskNoticeMessageOptions {
  title: string;
  content: string;
  tone: ChatMessage['noticeTone'];
}

export interface BackgroundTaskNoticeLaunchInfo {
  launchId: string;
  taskId: string | null;
  description: string;
}

export interface BackgroundTaskNoticeStateRuntime {
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

  private getLaunchDisplayId(launch: BackgroundTaskNoticeLaunchInfo): string {
    if (launch.taskId) {
      return launch.taskId;
    }

    return `launch_${launch.launchId.slice(-8)}`;
  }
}
