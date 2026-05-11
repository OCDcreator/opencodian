import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type { BackgroundConversationPostSyncRefreshExecutor } from './BackgroundConversationPostSyncRefreshExecutor';

type BackgroundConversationPostSyncRefreshPort = Pick<
  BackgroundConversationPostSyncRefreshExecutor,
  | 'refreshBackgroundTabConversation'
  | 'refreshSignalSyncedBackgroundConversation'
>;

export interface BackgroundConversationPostSyncHandoffCoordinatorHost {
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

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
    private readonly host: BackgroundConversationPostSyncHandoffCoordinatorHost,
  ) {}

  async handleSignalSyncComplete(options: SignalBackgroundTaskPostSyncOptions): Promise<void> {
    this.host.markBackgroundTaskAuthoritativeSync(
      options.tabId,
      `sync-event:${options.reason}`,
    );
    await this.backgroundConversationPostSyncRefresh.refreshSignalSyncedBackgroundConversation({
      tabId: options.tabId,
      conversation: options.conversation,
      tabHasBackgroundTask: options.tabHasBackgroundTask,
    });
    if (!this.didConversationChange(options.syncResult, options.previousFingerprint)) {
      return;
    }

    this.host.setTabNeedsAttention(options.tabId, options.tabId !== options.activeTabId);
  }

  async handleBackgroundTabSyncComplete(
    options: BackgroundTabPostSyncOptions,
  ): Promise<void> {
    await this.backgroundConversationPostSyncRefresh.refreshBackgroundTabConversation({
      tabId: options.tabId,
      conversation: options.conversation,
    });
    if (!this.didConversationChange(options.syncResult, options.previousFingerprint)) {
      return;
    }

    this.host.setTabNeedsAttention(options.tabId, true);
  }

  private didConversationChange(
    syncResult: BackgroundTaskPostSyncResult,
    previousFingerprint: string,
  ): boolean {
    return syncResult.changed || syncResult.fingerprint !== previousFingerprint;
  }
}
