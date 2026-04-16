import type { TabId } from '../tabs';

export interface ConversationRevertStateSnapshot {
  messageID: string;
  partID?: string;
}

export interface VisibleConversationPostSyncResult {
  changed: boolean;
  fingerprint: string;
  revertState: ConversationRevertStateSnapshot | null;
}

export interface VisibleConversationPostSyncOutcome {
  shouldApplySyncedConversationUpdate: boolean;
  shouldRenderBackgroundTaskIndicator: boolean;
}

export interface VisibleConversationPostSyncStateCoordinatorHost {
  getCurrentConversationId(): string | null;
  setCurrentConversationRevertState(revertState: ConversationRevertStateSnapshot | null): void;
  setTabConversationSyncFingerprint(tabId: TabId, fingerprint: string): void;
}

export interface VisibleConversationPostSyncStateCommitOptions {
  tabId: TabId;
  expectedConversationId: string;
  syncResult: VisibleConversationPostSyncResult;
}

export class VisibleConversationPostSyncStateCoordinator {
  constructor(private readonly host: VisibleConversationPostSyncStateCoordinatorHost) {}

  commitPostSyncState(
    options: VisibleConversationPostSyncStateCommitOptions,
  ): VisibleConversationPostSyncOutcome {
    const currentConversationMatchesExpected =
      this.host.getCurrentConversationId() === options.expectedConversationId;

    if (currentConversationMatchesExpected) {
      this.host.setCurrentConversationRevertState(options.syncResult.revertState);
      if (options.syncResult.changed) {
        this.host.setTabConversationSyncFingerprint(options.tabId, options.syncResult.fingerprint);
      }
    }

    return {
      shouldApplySyncedConversationUpdate:
        currentConversationMatchesExpected && options.syncResult.changed,
      shouldRenderBackgroundTaskIndicator:
        !currentConversationMatchesExpected || !options.syncResult.changed,
    };
  }
}
