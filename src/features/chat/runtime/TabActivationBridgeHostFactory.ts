import type { TabId } from '../tabs';
import type { TabConversationActivationBridgeHost } from './TabConversationActivationBridge';
import type { TabViewActivationBridgeHost } from './TabViewActivationBridge';

export interface TabActivationBridgeHostFactoryHost {
  getActiveTabId(): TabId | null;
  setActiveMessagesPane(tabId: TabId): void;
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  updateSendButtonState(): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  scheduleSettledScrollToBottom(tabId: TabId | null): void;
}

export interface TabActivationBridgeHosts {
  tabViewActivationBridgeHost: TabViewActivationBridgeHost;
  tabConversationActivationBridgeHost: TabConversationActivationBridgeHost;
}

export function createTabActivationBridgeHosts(
  host: TabActivationBridgeHostFactoryHost,
): TabActivationBridgeHosts {
  return {
    tabViewActivationBridgeHost: {
      setActiveMessagesPane: (tabId: TabId) => {
        host.setActiveMessagesPane(tabId);
      },
      scheduleComposerLayoutSync: () => {
        host.scheduleComposerLayoutSync();
      },
      updateModelSelectorDisplay: () => {
        host.updateModelSelectorDisplay();
      },
      updateSendButtonState: () => {
        host.updateSendButtonState();
      },
    },
    tabConversationActivationBridgeHost: {
      getActiveTabId: () => host.getActiveTabId(),
      clearMessagesContainer: () => {
        host.clearMessagesContainer();
      },
      resetTurnState: () => {
        host.resetTurnState();
      },
      updateModelSelectorDisplay: () => {
        host.updateModelSelectorDisplay();
      },
      scheduleSettledScrollToBottom: (tabId: TabId | null) => {
        host.scheduleSettledScrollToBottom(tabId);
      },
    },
  };
}
