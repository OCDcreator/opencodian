import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import {
  type ConversationLoadRuntimeBridgeHost,
} from '../runtime/ConversationLoadRuntimeBridge';
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
  createConversationSyncLoadRuntimeViewHosts,
} from './ConversationSyncLoadRuntimeViewHostFactory';
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
import type { WritableTabSessionPhase } from './TabSessionPhase';
import type { VisibleConversationPostSyncCoordinator } from './VisibleConversationPostSyncCoordinator';

export interface ConversationSyncViewHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  getAllTabs(): readonly TabData[];
  getTab(tabId: TabId): TabData | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncSignalRuntime | null;
  getConversationById(id: string): Promise<Conversation | null>;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  canSyncConversationWithServer(): Promise<boolean>;
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

interface ConversationSyncLifecycleHost extends ConversationSyncViewHost {
  transitionTabSessionLifecycle(tabId: TabId | null, phase: WritableTabSessionPhase, reason: string): boolean;
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
  viewHost: ConversationSyncLifecycleHost,
): ConversationSyncHosts {
  return {
    runtimeCoordinatorHost: {
      getActiveTabId: () => viewHost.getActiveTabId(),
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      getConversationSyncFingerprint: (messages: ChatMessage[]) =>
        viewHost.getConversationSyncFingerprint(messages),
      transitionTabSessionLifecycle: (tabId, phase, reason) =>
        viewHost.transitionTabSessionLifecycle(tabId, phase, reason),
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
      canSyncConversationWithServer: () => viewHost.canSyncConversationWithServer(),
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
  viewHost: ConversationSyncLifecycleHost,
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
  transitionTabSessionLifecycle(tabId: TabId | null, phase: WritableTabSessionPhase, reason: string): boolean;
}

export interface ConversationSyncRuntimeAssemblyDeps {
  viewHost: ConversationSyncRuntimeAssemblyViewHost;
  visiblePostSyncCoordinator: VisibleConversationPostSyncPort;
  backgroundPostSyncHandoffCoordinator: ConversationSyncBackgroundPostSyncHandoffPort;
}

export function assembleConversationSyncRuntime(
  deps: ConversationSyncRuntimeAssemblyDeps,
): ConversationSyncRuntimeAssembly {
  const syncLoadHosts = createConversationSyncLoadRuntimeViewHosts(deps.viewHost);

  const services = createConversationSyncServices(
    {
      ...syncLoadHosts.conversationSyncViewHost,
      transitionTabSessionLifecycle: (tabId, phase, reason) =>
        deps.viewHost.transitionTabSessionLifecycle(tabId, phase, reason),
    },
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
