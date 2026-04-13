import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import {
  VisibleConversationPostSyncStateCoordinator,
  type ConversationRevertStateSnapshot,
  type VisibleConversationPostSyncStateCoordinatorHost,
} from './VisibleConversationPostSyncStateCoordinator';

export interface VisibleConversationPostSyncStateViewHost {
  getCurrentConversation(): Conversation | null;
  setCurrentConversationRevertState(revertState: ConversationRevertStateSnapshot | null): void;
  setTabConversationSyncFingerprint(tabId: TabId, fingerprint: string): void;
}

export interface VisibleConversationPostSyncStateHosts {
  visibleConversationPostSyncStateCoordinatorHost: VisibleConversationPostSyncStateCoordinatorHost;
}

export interface VisibleConversationPostSyncStateServices {
  visibleConversationPostSyncStateCoordinator: VisibleConversationPostSyncStateCoordinator;
}

export function createVisibleConversationPostSyncStateHosts(
  viewHost: VisibleConversationPostSyncStateViewHost,
): VisibleConversationPostSyncStateHosts {
  return {
    visibleConversationPostSyncStateCoordinatorHost: {
      getCurrentConversationId: () => viewHost.getCurrentConversation()?.id ?? null,
      setCurrentConversationRevertState: (
        revertState: ConversationRevertStateSnapshot | null,
      ) => {
        viewHost.setCurrentConversationRevertState(revertState);
      },
      setTabConversationSyncFingerprint: (tabId: TabId, fingerprint: string) => {
        viewHost.setTabConversationSyncFingerprint(tabId, fingerprint);
      },
    },
  };
}

export function createVisibleConversationPostSyncStateServices(
  viewHost: VisibleConversationPostSyncStateViewHost,
): VisibleConversationPostSyncStateServices {
  const hosts = createVisibleConversationPostSyncStateHosts(viewHost);

  return {
    visibleConversationPostSyncStateCoordinator: new VisibleConversationPostSyncStateCoordinator(
      hosts.visibleConversationPostSyncStateCoordinatorHost,
    ),
  };
}
