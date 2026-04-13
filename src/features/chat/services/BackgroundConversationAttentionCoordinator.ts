import type { TabId } from '../tabs';

export interface BackgroundConversationAttentionSyncResult {
  changed: boolean;
  fingerprint: string;
}

export interface BackgroundConversationAttentionCoordinatorHost {
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export interface SignalConversationAttentionOptions {
  tabId: TabId;
  activeTabId: TabId | null;
  previousFingerprint: string;
  syncResult: BackgroundConversationAttentionSyncResult;
}

export interface BackgroundTabConversationAttentionOptions {
  tabId: TabId;
  previousFingerprint: string;
  syncResult: BackgroundConversationAttentionSyncResult;
}

export class BackgroundConversationAttentionCoordinator {
  constructor(private readonly host: BackgroundConversationAttentionCoordinatorHost) {}

  commitSignalSyncAttention(options: SignalConversationAttentionOptions): void {
    if (!this.didConversationChange(options.syncResult, options.previousFingerprint)) {
      return;
    }

    this.host.setTabNeedsAttention(options.tabId, options.tabId !== options.activeTabId);
  }

  commitBackgroundTabSyncAttention(
    options: BackgroundTabConversationAttentionOptions,
  ): void {
    if (!this.didConversationChange(options.syncResult, options.previousFingerprint)) {
      return;
    }

    this.host.setTabNeedsAttention(options.tabId, true);
  }

  private didConversationChange(
    syncResult: BackgroundConversationAttentionSyncResult,
    previousFingerprint: string,
  ): boolean {
    return syncResult.changed || syncResult.fingerprint !== previousFingerprint;
  }
}
