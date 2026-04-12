import {
  type ConversationViewStateHost,
  ConversationViewStateService,
} from '../../../../src/features/chat/services/ConversationViewStateService';
import {
  TabViewActivationBridge,
  type TabViewActivationBridgeHost,
} from '../../../../src/features/chat/runtime/TabViewActivationBridge';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';

jest.mock('../../../../src/features/chat/services/ScrollManager', () => {
  const actual = jest.requireActual('../../../../src/features/chat/services/ScrollManager');
  return {
    ...actual,
    captureElementScrollRestoreSnapshot: jest.fn(() => ({
      mode: 'preserve-distance',
      scrollTop: 120,
      distanceFromBottom: 40,
      anchorMessageId: null,
      anchorOffsetTop: 0,
    })),
    restoreElementScrollAfterRender: jest.fn((_messagesEl, _snapshot, options) => {
      options?.onRestored?.(120);
    }),
    isElementNearBottom: jest.fn(() => false),
  };
});

import {
  captureElementScrollRestoreSnapshot,
  restoreElementScrollAfterRender,
} from '../../../../src/features/chat/services/ScrollManager';

function createConversation(id: string, title = `Chat ${id}`) {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `${id}-session`,
    messages: [],
  };
}

type MockedConversationViewStateHost = {
  [Key in keyof ConversationViewStateHost]:
    ConversationViewStateHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationViewStateHost[Key];
};

function createHost(
  overrides: Partial<MockedConversationViewStateHost> = {},
): MockedConversationViewStateHost {
  const messagesEl = document.createElement('div');
  Object.defineProperty(messagesEl, 'scrollTop', {
    value: 120,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(messagesEl, 'scrollHeight', {
    value: 600,
    configurable: true,
  });
  Object.defineProperty(messagesEl, 'clientHeight', {
    value: 300,
    configurable: true,
  });

  return {
    getTabManager: jest.fn().mockReturnValue(null),
    getPersistedTabState: jest.fn().mockReturnValue({
      tabs: [],
      activeTabIndex: 0,
    }),
    resetPersistedTabState: jest.fn(),
    persistTabState: jest.fn(),
    loadConversations: jest.fn().mockResolvedValue(undefined),
    getConversations: jest.fn().mockReturnValue([]),
    createConversation: jest.fn().mockResolvedValue(createConversation('created')),
    getConversationById: jest.fn().mockResolvedValue(null),
    renderQuestionDock: jest.fn(),
    applyStreamingConversationActivation: jest.fn(),
    applyEmptyTabActivation: jest.fn(),
    prepareConversationTransition: jest.fn().mockResolvedValue(undefined),
    applyLoadedConversationActivation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    getMessagesContainer: jest.fn().mockReturnValue(messagesEl),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    getScrollRuntimeForTab: jest.fn().mockReturnValue({
      autoScrollEnabled: false,
      programmaticScrollGuardUntil: 0,
    }),
    clearScheduledScrollToBottom: jest.fn(),
    beginConversationHydration: jest.fn(),
    clearMessagesContainer: jest.fn(),
    resetTurnState: jest.fn(),
    shouldSyncConversationFromServer: jest.fn().mockReturnValue(false),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
      messages: [],
      revertState: null,
    }),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderMessages: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    renderSessionTodoDock: jest.fn(),
    refreshTabSessionStatus: jest.fn().mockResolvedValue(null),
    refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([]),
    refreshActiveSessionTodos: jest.fn().mockResolvedValue([]),
    commitConversationSyncBaseline: jest.fn(),
    scrollToBottom: jest.fn(),
    syncPaneScrollMetrics: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    syncActiveTabContextUsageIdentity: jest.fn(),
    refreshActiveTabContextUsageFromServer: jest.fn().mockResolvedValue(undefined),
    endConversationHydration: jest.fn(),
    requestAnimationFrame: jest.fn().mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
    ...overrides,
  };
}

function createActivationBridge() {
  const host: jest.Mocked<TabViewActivationBridgeHost> = {
    setActiveMessagesPane: jest.fn(),
    refreshActiveFocusContextPreview: jest.fn(),
    renderQuestionDock: jest.fn(),
    updateSessionTodoDockForTab: jest.fn(),
    renderSessionTodoDock: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    syncActiveTabContextUsageIdentity: jest.fn(),
    refreshTabSessionStatus: jest.fn().mockResolvedValue(null),
    refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([]),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([]),
    updateSendButtonState: jest.fn(),
  };

  return {
    bridge: new TabViewActivationBridge(host),
    host,
  };
}

describe('ConversationViewStateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the streaming activation fast path without triggering a full conversation load', async () => {
    const conversation = createConversation('streaming');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const tab = tabManager.createTab(conversation);
    expect(tab).not.toBeNull();
    tabManager.setTabStreaming(tab!.id, true);

    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getConversationById: jest.fn().mockResolvedValue(conversation),
    });
    const { bridge } = createActivationBridge();
    const service = new ConversationViewStateService(host, bridge);
    const loadConversationSpy = jest.spyOn(service, 'loadConversation').mockResolvedValue(undefined);
    const activationPreflightSpy = jest.spyOn(bridge, 'applyActivationPreflight');

    await service.activateTab(tab!.id);

    expect(activationPreflightSpy).toHaveBeenCalledWith(tab!.id);
    expect(host.applyStreamingConversationActivation).toHaveBeenCalledWith(tab!.id, conversation);
    expect(loadConversationSpy).not.toHaveBeenCalled();
  });

  it('loads a non-streaming tab conversation with preserved scroll state', async () => {
    const conversation = createConversation('standard');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const tab = tabManager.createTab(conversation);
    expect(tab).not.toBeNull();

    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
    });
    const { bridge } = createActivationBridge();
    const service = new ConversationViewStateService(host, bridge);
    const loadConversationSpy = jest.spyOn(service, 'loadConversation').mockResolvedValue(undefined);

    await service.activateTab(tab!.id);

    expect(loadConversationSpy).toHaveBeenCalledWith(conversation.id, {
      preserveScrollPosition: true,
    });
    expect(host.applyStreamingConversationActivation).not.toHaveBeenCalled();
    expect(host.applyEmptyTabActivation).not.toHaveBeenCalled();
  });

  it('clears the active conversation state when activating an empty tab', async () => {
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const tab = tabManager.createTab(null);
    expect(tab).not.toBeNull();

    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
    });
    const { bridge } = createActivationBridge();
    const service = new ConversationViewStateService(host, bridge);

    await service.activateTab(tab!.id);

    expect(host.applyEmptyTabActivation).toHaveBeenCalledWith(tab!.id);
    expect(host.applyStreamingConversationActivation).not.toHaveBeenCalled();
  });

  it('preserves scroll hydration flow and clears pending questions when the session changes', async () => {
    const conversation = createConversation('load-target');
    const host = createHost({
      getConversationById: jest.fn().mockResolvedValue(conversation),
    });
    const { bridge } = createActivationBridge();
    const service = new ConversationViewStateService(host, bridge);
    const messagesEl = host.getMessagesContainer();

    await service.loadConversation(conversation.id, {
      preserveScrollPosition: true,
    });

    expect(host.prepareConversationTransition).toHaveBeenCalledWith(conversation.id);
    expect(host.applyLoadedConversationActivation).toHaveBeenCalledWith('tab-1', conversation);
    expect(host.beginConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(host.renderMessages).toHaveBeenCalledWith(conversation.messages);
    expect(host.commitConversationSyncBaseline).toHaveBeenCalledWith(conversation.messages);
    expect(captureElementScrollRestoreSnapshot).toHaveBeenCalledWith(messagesEl, false, 120);
    expect(restoreElementScrollAfterRender).toHaveBeenCalled();
    expect(host.syncPaneScrollMetrics).toHaveBeenCalledWith('tab-1', messagesEl);
    expect(host.endConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(messagesEl?.classList.contains('is-rehydrating')).toBe(false);
  });
});
