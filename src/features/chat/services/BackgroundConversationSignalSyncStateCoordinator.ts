import type { TabId } from '../tabs';

export interface BackgroundConversationSignalSyncStateCoordinatorHost {
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
}

export interface SignalConversationSyncStateOptions {
  tabId: TabId;
  reason: string;
}

export class BackgroundConversationSignalSyncStateCoordinator {
  constructor(
    private readonly host: BackgroundConversationSignalSyncStateCoordinatorHost,
  ) {}

  commitSignalSyncState(options: SignalConversationSyncStateOptions): void {
    this.host.markBackgroundTaskAuthoritativeSync(
      options.tabId,
      `sync-event:${options.reason}`,
    );
  }
}
