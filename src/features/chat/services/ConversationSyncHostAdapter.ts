import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import type { TabData, TabId } from '../tabs';
import {
  ConversationSyncBackgroundPostSyncRouter,
  type ConversationSyncBackgroundPostSyncCoordinator,
} from './ConversationSyncBackgroundPostSyncRouter';
import {
  type ConversationSyncBridgeHost,
  type ConversationSyncBridgeSyncResult,
  ConversationSyncBridge,
} from './ConversationSyncBridge';
import {
  type ConversationSyncOrchestrationHost,
  type ConversationSyncSignalRuntime,
  ConversationSyncOrchestrationService,
} from './ConversationSyncOrchestrationService';
import {
  type ConversationSyncRuntimeCoordinatorHost,
  ConversationSyncRuntimeCoordinator,
} from './ConversationSyncRuntimeCoordinator';
import {
  ConversationSyncVisiblePostSyncRouter,
} from './ConversationSyncVisiblePostSyncRouter';
import type { VisibleConversationPostSyncCoordinator } from './VisibleConversationPostSyncCoordinator';

export interface ConversationSyncViewHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  getAllTabs(): readonly TabData[];
  getTab(tabId: TabId): TabData | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncSignalRuntime | null;
  getConversationById(id: string): Promise<Conversation | null>;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<ConversationSyncBridgeSyncResult>;
  applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
}

export interface ConversationSyncHosts {
  runtimeCoordinatorHost: ConversationSyncRuntimeCoordinatorHost;
  orchestrationHost: ConversationSyncOrchestrationHost;
  bridgeHost: ConversationSyncBridgeHost;
}

export interface ConversationSyncServices {
  runtimeCoordinator: ConversationSyncRuntimeCoordinator;
  orchestrationService: ConversationSyncOrchestrationService;
  bridge: ConversationSyncBridge;
}

type VisibleConversationPostSyncPort = Pick<
  VisibleConversationPostSyncCoordinator,
  'handleVisibleConversationSyncComplete'
>;

export function createConversationSyncHosts(
  viewHost: ConversationSyncViewHost,
): ConversationSyncHosts {
  return {
    runtimeCoordinatorHost: {
      getActiveTabId: () => viewHost.getActiveTabId(),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      getConversationSyncFingerprint: (messages: ChatMessage[]) =>
        viewHost.getConversationSyncFingerprint(messages),
    },
    orchestrationHost: {
      getCurrentConversation: () => viewHost.getCurrentConversation(),
      getActiveTabId: () => viewHost.getActiveTabId(),
      getAllTabs: () => viewHost.getAllTabs(),
      getTab: (tabId: TabId) => viewHost.getTab(tabId),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      getConversationById: (id: string) => viewHost.getConversationById(id),
    },
    bridgeHost: {
      getCurrentConversation: () => viewHost.getCurrentConversation(),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      syncConversationMessagesFromServer: (
        conversation: Conversation,
        tabId: TabId | null,
        reason: string,
        options?: { suppressVerboseLogs?: boolean },
      ) => viewHost.syncConversationMessagesFromServer(conversation, tabId, reason, options),
      applySyncedConversationUpdate: (
        previousMessages: ChatMessage[],
        nextMessages: ChatMessage[],
      ) => viewHost.applySyncedConversationUpdate(previousMessages, nextMessages),
      renderBackgroundTaskIndicatorIfNeeded: (tabId?: TabId | null) =>
        viewHost.renderBackgroundTaskIndicatorIfNeeded(tabId),
    },
  };
}

export function createConversationSyncServices(
  viewHost: ConversationSyncViewHost,
  visiblePostSyncCoordinator: VisibleConversationPostSyncPort,
  backgroundPostSyncCoordinator: ConversationSyncBackgroundPostSyncCoordinator,
): ConversationSyncServices {
  const hosts = createConversationSyncHosts(viewHost);
  const runtimeCoordinator = new ConversationSyncRuntimeCoordinator(hosts.runtimeCoordinatorHost);
  const orchestrationService = new ConversationSyncOrchestrationService(
    hosts.orchestrationHost,
    runtimeCoordinator,
  );
  const visiblePostSyncRouter = new ConversationSyncVisiblePostSyncRouter(
    hosts.bridgeHost,
    visiblePostSyncCoordinator,
  );
  const backgroundPostSyncRouter = new ConversationSyncBackgroundPostSyncRouter(
    hosts.bridgeHost,
    backgroundPostSyncCoordinator,
  );
  const bridge = new ConversationSyncBridge(
    hosts.bridgeHost,
    runtimeCoordinator,
    orchestrationService,
    visiblePostSyncRouter,
    backgroundPostSyncRouter,
  );
  return {
    runtimeCoordinator,
    orchestrationService,
    bridge,
  };
}
