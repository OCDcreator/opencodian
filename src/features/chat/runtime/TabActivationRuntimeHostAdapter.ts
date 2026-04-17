import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import type { TabId } from '../tabs';
import {
  createTabActivationBridgeHosts,
  type TabActivationBridgeHostFactoryHost,
  type TabActivationBridgeHosts,
} from './TabActivationBridgeHostFactory';
import type { TabConversationStateBridgeHost } from './TabConversationStateBridge';
import type { TabRuntimeStateBridgeHost } from './TabRuntimeStateBridge';

type TabActivationRuntimeBridgeTabManager =
  NonNullable<ReturnType<TabConversationStateBridgeHost['getTabManager']>>
  & NonNullable<ReturnType<TabRuntimeStateBridgeHost['getTabManager']>>;

type ConversationRevertState =
  Parameters<TabConversationStateBridgeHost['setCurrentConversationRevertState']>[0];

type TabRuntimeState = ReturnType<TabRuntimeStateBridgeHost['getTabRuntimeState']>;

export interface TabActivationRuntimeHostAdapterHost extends TabActivationBridgeHostFactoryHost {
  getTabManager(): TabActivationRuntimeBridgeTabManager | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  setCurrentConversation(conversation: Conversation | null): void;
  setCurrentConversationRevertState(revertState: ConversationRevertState): void;
  setOpenCodeSessionId(sessionId: string): void;
  applyConversationSessionSettings(conversation: Conversation | null): void;
  clearPendingQuestionsForTab(tabId: TabId | null): void;
  resetTabSessionState(tabId: TabId | null, sessionId: string | null): void;
  clearTabSessionState(tabId: TabId | null): void;
  resetBackgroundTaskSuppressedFingerprint(tabId: TabId | null): void;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setLastConversationSyncFingerprint(fingerprint: string): void;
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
  getTabRuntimeState(tabId: TabId | null): TabRuntimeState;
  getTabMessagesContainer(tabId: TabId | null): ParentNode | null;
  hasBackgroundTaskIndicator(tabId: TabId | null): boolean;
  updateSendButtonState(): void;
}

export interface TabActivationRuntimeBridgeHosts {
  tabActivationBridgeHosts: TabActivationBridgeHosts;
  tabConversationStateBridgeHost: TabConversationStateBridgeHost;
  tabRuntimeStateBridgeHost: TabRuntimeStateBridgeHost;
}

export function createTabActivationRuntimeBridgeHosts(
  host: TabActivationRuntimeHostAdapterHost,
): TabActivationRuntimeBridgeHosts {
  return {
    tabActivationBridgeHosts: createTabActivationBridgeHosts(host),
    tabConversationStateBridgeHost: {
      getTabManager: () => host.getTabManager(),
      getSessionIdForTab: (tabId: TabId | null) => host.getSessionIdForTab(tabId),
      setCurrentConversation: (conversation: Conversation | null) => {
        host.setCurrentConversation(conversation);
      },
      setCurrentConversationRevertState: (revertState: ConversationRevertState) => {
        host.setCurrentConversationRevertState(revertState);
      },
      setOpenCodeSessionId: (sessionId: string) => {
        host.setOpenCodeSessionId(sessionId);
      },
      applyConversationSessionSettings: (conversation: Conversation | null) => {
        host.applyConversationSessionSettings(conversation);
      },
      clearPendingQuestionsForTab: (tabId: TabId | null) => {
        host.clearPendingQuestionsForTab(tabId);
      },
      resetTabSessionState: (tabId: TabId | null, sessionId: string | null) => {
        host.resetTabSessionState(tabId, sessionId);
      },
      clearTabSessionState: (tabId: TabId | null) => {
        host.clearTabSessionState(tabId);
      },
      resetBackgroundTaskSuppressedFingerprint: (tabId: TabId | null) => {
        host.resetBackgroundTaskSuppressedFingerprint(tabId);
      },
      getConversationSyncFingerprint: (messages: ChatMessage[]) =>
        host.getConversationSyncFingerprint(messages),
      setLastConversationSyncFingerprint: (fingerprint: string) => {
        host.setLastConversationSyncFingerprint(fingerprint);
      },
      startConversationSyncLoop: () => {
        host.startConversationSyncLoop();
      },
      stopConversationSyncLoop: () => {
        host.stopConversationSyncLoop();
      },
    },
    tabRuntimeStateBridgeHost: {
      getTabManager: () => host.getTabManager(),
      getActiveTabId: () => host.getActiveTabId(),
      getTabRuntimeState: (tabId: TabId | null) => host.getTabRuntimeState(tabId),
      getTabMessagesContainer: (tabId: TabId | null) => host.getTabMessagesContainer(tabId),
      hasBackgroundTaskIndicator: (tabId: TabId | null) => host.hasBackgroundTaskIndicator(tabId),
      updateSendButtonState: () => {
        host.updateSendButtonState();
      },
    },
  };
}
