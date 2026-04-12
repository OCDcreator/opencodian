import type {
  ConversationHydrationRenderContext,
  ConversationHydrationRenderPort,
} from '../../../../src/features/chat/runtime/ConversationHydrationRenderBridge';
import {
  TabViewActivationBridge,
  type TabViewActivationBridgeHost,
} from '../../../../src/features/chat/runtime/TabViewActivationBridge';
import {
  type ConversationViewStateHost,
  ConversationViewStateService,
} from '../../../../src/features/chat/services/ConversationViewStateService';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';

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
    applyStreamingConversationActivation: jest.fn(),
    applyEmptyTabActivation: jest.fn(),
    prepareConversationTransition: jest.fn().mockResolvedValue(undefined),
    applyLoadedConversationActivation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
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
    commitConversationSyncBaseline: jest.fn(),
    endConversationHydration: jest.fn(),
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
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    scheduleComposerLayoutSync: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    syncActiveTabContextUsageIdentity: jest.fn(),
    refreshActiveTabContextUsageFromServer: jest.fn().mockResolvedValue(undefined),
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

type MockedConversationHydrationRenderPort = {
  [Key in keyof ConversationHydrationRenderPort]:
    ConversationHydrationRenderPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationHydrationRenderPort[Key];
};

function createHydrationRenderBridge(
  overrides: Partial<MockedConversationHydrationRenderPort> = {},
): MockedConversationHydrationRenderPort {
  const context: ConversationHydrationRenderContext = {
    activeTabId: 'tab-1',
    messagesEl: document.createElement('div'),
    runtime: {
      autoScrollEnabled: false,
      programmaticScrollGuardUntil: 0,
    },
    preserveScrollPosition: true,
    previousScrollTop: 120,
    shouldStickToBottom: false,
  };

  return {
    captureHydrationContext: jest.fn().mockReturnValue(context),
    beginHydrationShell: jest.fn(),
    restoreHydrationShell: jest.fn(),
    ...overrides,
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
    const hydrationRenderBridge = createHydrationRenderBridge();
    const service = new ConversationViewStateService(host, bridge, hydrationRenderBridge);
    const loadConversationSpy = jest.spyOn(service, 'loadConversation').mockResolvedValue(undefined);
    const activationPreflightSpy = jest.spyOn(bridge, 'applyActivationPreflight');

    await service.activateTab(tab!.id);

    expect(activationPreflightSpy).toHaveBeenCalledWith(tab!.id);
    expect(host.applyStreamingConversationActivation).toHaveBeenCalledWith(tab!.id, conversation);
    expect(loadConversationSpy).not.toHaveBeenCalled();
    expect(hydrationRenderBridge.captureHydrationContext).not.toHaveBeenCalled();
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
    const hydrationRenderBridge = createHydrationRenderBridge();
    const service = new ConversationViewStateService(host, bridge, hydrationRenderBridge);
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
    const hydrationRenderBridge = createHydrationRenderBridge();
    const service = new ConversationViewStateService(host, bridge, hydrationRenderBridge);

    await service.activateTab(tab!.id);

    expect(host.applyEmptyTabActivation).toHaveBeenCalledWith(tab!.id);
    expect(host.applyStreamingConversationActivation).not.toHaveBeenCalled();
    expect(hydrationRenderBridge.captureHydrationContext).not.toHaveBeenCalled();
  });

  it('delegates the loaded-conversation hydration shell to the dedicated bridge', async () => {
    const conversation = createConversation('load-target');
    const host = createHost({
      getConversationById: jest.fn().mockResolvedValue(conversation),
    });
    const { bridge } = createActivationBridge();
    const hydrationRenderBridge = createHydrationRenderBridge();
    const service = new ConversationViewStateService(host, bridge, hydrationRenderBridge);
    const postRenderOutcomeSpy = jest.spyOn(bridge, 'applyLoadedConversationPostRenderOutcome');
    const hydrationTailSpy = jest.spyOn(bridge, 'applyLoadedConversationHydrationTail');

    await service.loadConversation(conversation.id, {
      preserveScrollPosition: true,
    });

    expect(host.prepareConversationTransition).toHaveBeenCalledWith(conversation.id);
    expect(hydrationRenderBridge.captureHydrationContext).toHaveBeenCalledWith(true);
    expect(host.applyLoadedConversationActivation).toHaveBeenCalledWith('tab-1', conversation);
    expect(host.beginConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(hydrationRenderBridge.beginHydrationShell).toHaveBeenCalledTimes(1);
    expect(host.renderMessages).toHaveBeenCalledWith(conversation.messages);
    expect(postRenderOutcomeSpy).toHaveBeenCalledWith('tab-1', conversation.openCodeSessionId);
    expect(host.commitConversationSyncBaseline).toHaveBeenCalledWith(conversation.messages);
    expect(hydrationRenderBridge.restoreHydrationShell).toHaveBeenCalledTimes(1);
    expect(hydrationTailSpy).toHaveBeenCalledTimes(1);
    expect(host.endConversationHydration).toHaveBeenCalledWith('tab-1');
  });
});
