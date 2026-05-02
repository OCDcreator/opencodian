import type { ChatMessage } from '../../../core/types';
import {
  createTabActivationRuntimeBridgeHosts,
  type TabActivationRuntimeBridgeHosts,
  type TabActivationRuntimeHostAdapterHost,
} from '../runtime/TabActivationRuntimeHostAdapter';
import { TabConversationActivationBridge } from '../runtime/TabConversationActivationBridge';
import { TabConversationStateBridge } from '../runtime/TabConversationStateBridge';
import { TabRuntimeStateBridge } from '../runtime/TabRuntimeStateBridge';
import { TabViewActivationBridge } from '../runtime/TabViewActivationBridge';
import { createTabActivationRuntimeViewHostFactoryHost, type TabActivationRuntimeHostProviderHost } from './TabActivationRuntimeHostProvider';

export interface TabActivationConversationSyncRuntimePort {
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setLastConversationSyncFingerprint(fingerprint: string): void;
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
}

export interface TabActivationConversationSyncRuntimePortHost {
  getConversationSyncFingerprint:
    TabActivationConversationSyncRuntimePort['getConversationSyncFingerprint'];
  setLastConversationSyncFingerprint:
    TabActivationConversationSyncRuntimePort['setLastConversationSyncFingerprint'];
  startConversationSyncLoop:
    TabActivationConversationSyncRuntimePort['startConversationSyncLoop'];
  stopConversationSyncLoop:
    TabActivationConversationSyncRuntimePort['stopConversationSyncLoop'];
}

export function createTabActivationConversationSyncRuntimePort(
  host: TabActivationConversationSyncRuntimePortHost,
): TabActivationConversationSyncRuntimePort {
  return {
    getConversationSyncFingerprint: (messages) =>
      host.getConversationSyncFingerprint(messages),
    setLastConversationSyncFingerprint: (fingerprint) => {
      host.setLastConversationSyncFingerprint(fingerprint);
    },
    startConversationSyncLoop: () => {
      host.startConversationSyncLoop();
    },
    stopConversationSyncLoop: () => {
      host.stopConversationSyncLoop();
    },
  };
}

type TabActivationRuntimeTabPort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'getTabManager'
  | 'getActiveTabId'
  | 'getSessionIdForTab'
  | 'getTabRuntimeState'
  | 'getTabMessagesContainer'
>;

type TabActivationConversationStatePort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'setCurrentConversation'
  | 'setCurrentConversationRevertState'
  | 'setOpenCodeSessionId'
  | 'applyConversationSessionSettings'
>;

type TabActivationQuestionTodoPort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'clearPendingQuestionsForTab'
  | 'resetTabSessionState'
  | 'clearTabSessionState'
>;

type TabActivationBackgroundTaskPort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'resetBackgroundTaskSuppressedFingerprint'
  | 'hasBackgroundTaskIndicator'
>;

type TabActivationConversationSyncPort = TabActivationConversationSyncRuntimePort;

type TabActivationViewWritebackPort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'updateSendButtonState'
  | 'setActiveMessagesPane'
  | 'scheduleComposerLayoutSync'
  | 'updateModelSelectorDisplay'
  | 'clearMessagesContainer'
  | 'resetTurnState'
  | 'scheduleSettledScrollToBottom'
>;

export interface TabActivationRuntimeViewHostFactoryHost {
  getTabRuntime(): TabActivationRuntimeTabPort;
  getConversationState(): TabActivationConversationStatePort;
  getQuestionTodoRuntime(): TabActivationQuestionTodoPort;
  getBackgroundTaskRuntime(): TabActivationBackgroundTaskPort;
  getConversationSyncRuntime(): TabActivationConversationSyncPort;
  getViewWriteback(): TabActivationViewWritebackPort;
}

export function createTabActivationRuntimeViewHosts(
  host: TabActivationRuntimeViewHostFactoryHost,
): TabActivationRuntimeBridgeHosts {
  return createTabActivationRuntimeBridgeHosts({
    getTabManager: () => host.getTabRuntime().getTabManager(),
    getActiveTabId: () => host.getTabRuntime().getActiveTabId(),
    getSessionIdForTab: (tabId) => host.getTabRuntime().getSessionIdForTab(tabId),
    setCurrentConversation: (conversation) => {
      host.getConversationState().setCurrentConversation(conversation);
    },
    setCurrentConversationRevertState: (revertState) => {
      host.getConversationState().setCurrentConversationRevertState(revertState);
    },
    setOpenCodeSessionId: (sessionId) => {
      host.getConversationState().setOpenCodeSessionId(sessionId);
    },
    applyConversationSessionSettings: (conversation) => {
      host.getConversationState().applyConversationSessionSettings(conversation);
    },
    clearPendingQuestionsForTab: (tabId) => {
      host.getQuestionTodoRuntime().clearPendingQuestionsForTab(tabId);
    },
    resetTabSessionState: (tabId, sessionId) => {
      host.getQuestionTodoRuntime().resetTabSessionState(tabId, sessionId);
    },
    clearTabSessionState: (tabId) => {
      host.getQuestionTodoRuntime().clearTabSessionState(tabId);
    },
    resetBackgroundTaskSuppressedFingerprint: (tabId) => {
      host.getBackgroundTaskRuntime().resetBackgroundTaskSuppressedFingerprint(tabId);
    },
    getConversationSyncFingerprint: (messages) =>
      host.getConversationSyncRuntime().getConversationSyncFingerprint(messages),
    setLastConversationSyncFingerprint: (fingerprint) => {
      host.getConversationSyncRuntime().setLastConversationSyncFingerprint(fingerprint);
    },
    startConversationSyncLoop: () => {
      host.getConversationSyncRuntime().startConversationSyncLoop();
    },
    stopConversationSyncLoop: () => {
      host.getConversationSyncRuntime().stopConversationSyncLoop();
    },
    getTabRuntimeState: (tabId) => host.getTabRuntime().getTabRuntimeState(tabId),
    getTabMessagesContainer: (tabId) => host.getTabRuntime().getTabMessagesContainer(tabId),
    hasBackgroundTaskIndicator: (tabId) =>
      host.getBackgroundTaskRuntime().hasBackgroundTaskIndicator(tabId),
    updateSendButtonState: () => {
      host.getViewWriteback().updateSendButtonState();
    },
    setActiveMessagesPane: (tabId) => {
      host.getViewWriteback().setActiveMessagesPane(tabId);
    },
    scheduleComposerLayoutSync: () => {
      host.getViewWriteback().scheduleComposerLayoutSync();
    },
    updateModelSelectorDisplay: () => {
      host.getViewWriteback().updateModelSelectorDisplay();
    },
    clearMessagesContainer: () => {
      host.getViewWriteback().clearMessagesContainer();
    },
    resetTurnState: () => {
      host.getViewWriteback().resetTurnState();
    },
    scheduleSettledScrollToBottom: (tabId) => {
      host.getViewWriteback().scheduleSettledScrollToBottom(tabId);
    },
  });
}

type AssemblyFocusContextPreviewPort = Pick<
  import('../services/FocusContextPreviewCoordinator').FocusContextPreviewCoordinator,
  'refreshActiveFocusContextPreview'
>;

type AssemblyQuestionTodoActivationPort = Pick<
  import('../services/QuestionTodoActivationRefreshCoordinator').QuestionTodoActivationRefreshCoordinator,
  'applyActivationPreflight' | 'applyConversationActivation' | 'applyEmptyActivation'
>;

type AssemblyBackgroundTaskActivationPort = Pick<
  import('../services/BackgroundTaskActivationIndicatorCoordinator').BackgroundTaskActivationIndicatorCoordinator,
  | 'prepareOpenConversation'
  | 'syncOpenConversationState'
  | 'renderLoadedConversationIndicator'
  | 'renderOpenConversationIndicator'
>;

type AssemblyActiveTabContextUsagePort = Pick<
  import('../services/ActiveTabContextUsageCoordinator').ActiveTabContextUsageCoordinator,
  'syncIdentity' | 'refreshFromServer'
>;

export interface TabActivationRuntimeAssemblyDeps {
  hostProviderHost: TabActivationRuntimeHostProviderHost;
  focusPreviewRefresh: AssemblyFocusContextPreviewPort;
  questionTodoActivationRefresh: AssemblyQuestionTodoActivationPort;
  backgroundTaskActivationIndicator: AssemblyBackgroundTaskActivationPort;
  activeTabContextUsage: AssemblyActiveTabContextUsagePort;
}

export interface TabActivationRuntimeAssembly {
  tabConversationStateBridge: TabConversationStateBridge;
  tabViewActivationBridge: TabViewActivationBridge;
  tabConversationActivationBridge: TabConversationActivationBridge;
  tabRuntimeStateBridge: TabRuntimeStateBridge;
}

export function createTabActivationRuntimeAssembly(
  deps: TabActivationRuntimeAssemblyDeps,
): TabActivationRuntimeAssembly {
  const bridgeHosts = createTabActivationRuntimeViewHosts(
    createTabActivationRuntimeViewHostFactoryHost(deps.hostProviderHost),
  );
  const tabConversationStateBridge = new TabConversationStateBridge(
    bridgeHosts.tabConversationStateBridgeHost,
  );
  const tabViewActivationBridge = new TabViewActivationBridge({
    host: bridgeHosts.tabActivationBridgeHosts.tabViewActivationBridgeHost,
    focusContextPreviewCoordinator: deps.focusPreviewRefresh,
    questionTodoActivationRefreshCoordinator: deps.questionTodoActivationRefresh,
    backgroundTaskActivationIndicatorCoordinator: deps.backgroundTaskActivationIndicator,
    activeTabContextUsageCoordinator: deps.activeTabContextUsage,
  });
  const tabConversationActivationBridge = new TabConversationActivationBridge({
    host: bridgeHosts.tabActivationBridgeHosts.tabConversationActivationBridgeHost,
    tabConversationStateBridge,
    tabViewActivationBridge,
    questionTodoActivationRefreshCoordinator: deps.questionTodoActivationRefresh,
    backgroundTaskActivationIndicatorCoordinator: deps.backgroundTaskActivationIndicator,
    activeTabContextUsageCoordinator: deps.activeTabContextUsage,
  });
  const tabRuntimeStateBridge = new TabRuntimeStateBridge(
    bridgeHosts.tabRuntimeStateBridgeHost,
  );
  return {
    tabConversationStateBridge,
    tabViewActivationBridge,
    tabConversationActivationBridge,
    tabRuntimeStateBridge,
  };
}
