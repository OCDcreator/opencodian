import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type { BackgroundConversationAttentionCoordinator } from './BackgroundConversationAttentionCoordinator';
import type { BackgroundConversationPostSyncRefreshExecutor } from './BackgroundConversationPostSyncRefreshExecutor';
import type { BackgroundConversationSignalSyncStateCoordinator } from './BackgroundConversationSignalSyncStateCoordinator';

type BackgroundConversationPostSyncRefreshPort = Pick<
  BackgroundConversationPostSyncRefreshExecutor,
  | 'refreshBackgroundTabConversation'
  | 'refreshSignalSyncedBackgroundConversation'
>;
type BackgroundConversationAttentionPort = Pick<
  BackgroundConversationAttentionCoordinator,
  | 'commitBackgroundTabSyncAttention'
  | 'commitSignalSyncAttention'
>;
type BackgroundConversationSignalSyncStatePort = Pick<
  BackgroundConversationSignalSyncStateCoordinator,
  'commitSignalSyncState'
>;

export interface BackgroundTaskPostSyncResult {
  changed: boolean;
  fingerprint: string;
}

interface BackgroundTaskPostSyncBaseOptions {
  tabId: TabId;
  conversation: Conversation;
  previousFingerprint: string;
  syncResult: BackgroundTaskPostSyncResult;
}

export interface SignalBackgroundTaskPostSyncOptions extends BackgroundTaskPostSyncBaseOptions {
  reason: string;
  activeTabId: TabId | null;
  tabHasBackgroundTask: boolean;
}

export type BackgroundTabPostSyncOptions = BackgroundTaskPostSyncBaseOptions;

export class BackgroundConversationPostSyncHandoffCoordinator {
  constructor(
    private readonly backgroundConversationPostSyncRefresh:
      BackgroundConversationPostSyncRefreshPort,
    private readonly backgroundConversationSignalSyncState:
      BackgroundConversationSignalSyncStatePort,
    private readonly backgroundConversationAttention: BackgroundConversationAttentionPort,
  ) {}

  async handleSignalSyncComplete(options: SignalBackgroundTaskPostSyncOptions): Promise<void> {
    this.backgroundConversationSignalSyncState.commitSignalSyncState({
      tabId: options.tabId,
      reason: options.reason,
    });
    await this.backgroundConversationPostSyncRefresh.refreshSignalSyncedBackgroundConversation({
      tabId: options.tabId,
      conversation: options.conversation,
      tabHasBackgroundTask: options.tabHasBackgroundTask,
    });
    this.backgroundConversationAttention.commitSignalSyncAttention({
      tabId: options.tabId,
      activeTabId: options.activeTabId,
      previousFingerprint: options.previousFingerprint,
      syncResult: options.syncResult,
    });
  }

  async handleBackgroundTabSyncComplete(
    options: BackgroundTabPostSyncOptions,
  ): Promise<void> {
    await this.backgroundConversationPostSyncRefresh.refreshBackgroundTabConversation({
      tabId: options.tabId,
      conversation: options.conversation,
    });
    this.backgroundConversationAttention.commitBackgroundTabSyncAttention({
      tabId: options.tabId,
      previousFingerprint: options.previousFingerprint,
      syncResult: options.syncResult,
    });
  }
}
