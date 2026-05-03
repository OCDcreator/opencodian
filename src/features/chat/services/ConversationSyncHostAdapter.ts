import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import {
  type ConversationLoadRuntimeBridgeHost,
} from '../runtime/ConversationLoadRuntimeBridge';
import {
  createConversationSyncLoadRuntimeHosts,
} from '../runtime/ConversationSyncLoadRuntimeHostAdapter';
import type { TabData, TabId } from '../tabs';
import {
  type ConversationSyncBackgroundPostSyncHandoffPort,
  ConversationSyncBackgroundPostSyncRouter,
  type ConversationSyncBackgroundPostSyncRouterHost,
} from './ConversationSyncBackgroundPostSyncRouter';
import {
  ConversationSyncBridge,
  type ConversationSyncBridgeHost,
  type ConversationSyncBridgePortBuilderHost,
  type ConversationSyncBridgePorts,
  type ConversationSyncBridgeSyncResult,
  createConversationSyncBridgePorts,
} from './ConversationSyncBridge';
import {
  type ConversationSyncOrchestrationHost,
  ConversationSyncOrchestrationService,
  type ConversationSyncSignalRuntime,
} from './ConversationSyncOrchestrationService';
import {
  ConversationSyncRuntimeCoordinator,
  type ConversationSyncRuntimeCoordinatorHost,
} from './ConversationSyncRuntimeCoordinator';
import {
  ConversationSyncVisiblePostSyncRouter,
  type ConversationSyncVisiblePostSyncRouterHost,
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
  syncConversationMessagesFromCanonicalState(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<ConversationSyncBridgeSyncResult | null>;
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
  visiblePostSyncRouterHost: ConversationSyncVisiblePostSyncRouterHost;
  backgroundPostSyncRouterHost: ConversationSyncBackgroundPostSyncRouterHost;
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
      syncConversationMessagesFromServer: (
        conversation: Conversation,
        tabId: TabId | null,
        reason: string,
        options?: { suppressVerboseLogs?: boolean },
      ) => viewHost.syncConversationMessagesFromServer(conversation, tabId, reason, options),
      syncConversationMessagesFromCanonicalState: (
        conversation: Conversation,
        tabId: TabId | null,
        reason: string,
        options?: { suppressVerboseLogs?: boolean },
      ) => viewHost.syncConversationMessagesFromCanonicalState(conversation, tabId, reason, options),
    },
    visiblePostSyncRouterHost: {
      applySyncedConversationUpdate: (
        previousMessages: ChatMessage[],
        nextMessages: ChatMessage[],
      ) => viewHost.applySyncedConversationUpdate(previousMessages, nextMessages),
      renderBackgroundTaskIndicatorIfNeeded: (tabId?: TabId | null) =>
        viewHost.renderBackgroundTaskIndicatorIfNeeded(tabId),
    },
    backgroundPostSyncRouterHost: {
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
    },
  };
}

export function createConversationSyncServices(
  viewHost: ConversationSyncViewHost,
  visiblePostSyncCoordinator: VisibleConversationPostSyncPort,
  backgroundPostSyncHandoffCoordinator: ConversationSyncBackgroundPostSyncHandoffPort,
): ConversationSyncServices {
  const hosts = createConversationSyncHosts(viewHost);
  const runtimeCoordinator = new ConversationSyncRuntimeCoordinator(hosts.runtimeCoordinatorHost);
  const orchestrationService = new ConversationSyncOrchestrationService(
    hosts.orchestrationHost,
    runtimeCoordinator,
  );
  const visiblePostSyncRouter = new ConversationSyncVisiblePostSyncRouter(
    hosts.visiblePostSyncRouterHost,
    visiblePostSyncCoordinator,
  );
  const backgroundPostSyncRouter = new ConversationSyncBackgroundPostSyncRouter(
    hosts.backgroundPostSyncRouterHost,
    backgroundPostSyncHandoffCoordinator,
  );
  const bridge = new ConversationSyncBridge({
    host: hosts.bridgeHost,
    runtimeCoordinator,
    orchestrationService,
    visiblePostSyncRouter,
    backgroundPostSyncRouter,
  });
  return {
    runtimeCoordinator,
    orchestrationService,
    bridge,
  };
}

export interface ConversationSyncRuntimeAssembly {
  runtimeCoordinator: ConversationSyncRuntimeCoordinator;
  orchestrationService: ConversationSyncOrchestrationService;
  bridge: ConversationSyncBridge;
  bridgePorts: ConversationSyncBridgePorts;
  conversationLoadRuntimeBridgeHost: ConversationLoadRuntimeBridgeHost;
}

export interface ConversationSyncRuntimeAssemblyViewHost extends ConversationSyncViewHost {
  loadConversations(): Promise<void>;
  hasInterruptedLocalAssistantTail(messages: ChatMessage[]): boolean;
  setCurrentConversationRevertState(revertState: { messageID: string; partID?: string } | null): void;
}

export interface ConversationSyncRuntimeAssemblyDeps {
  viewHost: ConversationSyncRuntimeAssemblyViewHost;
  visiblePostSyncCoordinator: VisibleConversationPostSyncPort;
  backgroundPostSyncHandoffCoordinator: ConversationSyncBackgroundPostSyncHandoffPort;
}

export function assembleConversationSyncRuntime(
  deps: ConversationSyncRuntimeAssemblyDeps,
): ConversationSyncRuntimeAssembly {
  const syncLoadHosts = createConversationSyncLoadRuntimeHosts({
    getCurrentConversation: () => deps.viewHost.getCurrentConversation(),
    getActiveTabId: () => deps.viewHost.getActiveTabId(),
    getAllTabs: () => deps.viewHost.getAllTabs(),
    getTab: (tabId) => deps.viewHost.getTab(tabId),
    getTabRuntimeState: (tabId) => deps.viewHost.getTabRuntimeState(tabId),
    loadConversations: () => deps.viewHost.loadConversations(),
    getConversationById: (id) => deps.viewHost.getConversationById(id),
    shouldSyncConversationFromServer: (conversation, options) => {
      const shouldSyncInterrupted = !deps.viewHost.hasInterruptedLocalAssistantTail(conversation.messages)
        && conversation.messages.some((message) =>
          message.displayStyle !== 'notice'
          && !message.sourceMessageId
        );
      return Boolean(
        options.forceServerSync
        || !conversation.messages
        || conversation.messages.length === 0
        || shouldSyncInterrupted,
      );
    },
    getConversationSyncFingerprint: (messages) =>
      deps.viewHost.getConversationSyncFingerprint(messages),
    syncConversationMessagesFromServer: (conversation, tabId, reason, options) =>
      deps.viewHost.syncConversationMessagesFromServer(conversation, tabId, reason, options),
    syncConversationMessagesFromCanonicalState: (conversation, tabId, reason, options) =>
      deps.viewHost.syncConversationMessagesFromCanonicalState(conversation, tabId, reason, options),
    setCurrentConversationRevertState: (revertState) => {
      deps.viewHost.setCurrentConversationRevertState(revertState);
    },
    applySyncedConversationUpdate: (previousMessages, nextMessages) =>
      deps.viewHost.applySyncedConversationUpdate(previousMessages, nextMessages),
    renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
      deps.viewHost.renderBackgroundTaskIndicatorIfNeeded(tabId),
  });

  const services = createConversationSyncServices(
    syncLoadHosts.conversationSyncViewHost,
    deps.visiblePostSyncCoordinator,
    deps.backgroundPostSyncHandoffCoordinator,
  );

  const bridgePortHost: ConversationSyncBridgePortBuilderHost = {
    startConversationSyncLoop: () => services.bridge.startConversationSyncLoop(),
    stopConversationSyncLoop: () => services.bridge.stopConversationSyncLoop(),
    clearScheduledSignalConversationSync: (tabId) =>
      services.bridge.clearScheduledSignalConversationSync(tabId),
    scheduleConversationSyncFromSignal: (tabId, reason) =>
      services.bridge.scheduleConversationSyncFromSignal(tabId, reason),
    syncVisibleConversationInBackground: () =>
      services.bridge.syncVisibleConversationInBackground(),
  };
  const bridgePorts = createConversationSyncBridgePorts(bridgePortHost);

  return {
    runtimeCoordinator: services.runtimeCoordinator,
    orchestrationService: services.orchestrationService,
    bridge: services.bridge,
    bridgePorts,
    conversationLoadRuntimeBridgeHost: syncLoadHosts.conversationLoadRuntimeBridgeHost,
  };
}
