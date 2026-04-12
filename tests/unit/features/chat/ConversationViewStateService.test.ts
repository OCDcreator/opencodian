import {
  type ConversationLoadRuntimePort,
} from '../../../../src/features/chat/runtime/ConversationLoadRuntimeBridge';
import {
  TabViewActivationBridge,
  type TabViewActivationBridgeHost,
} from '../../../../src/features/chat/runtime/TabViewActivationBridge';
import type { TabConversationActivationBridge } from '../../../../src/features/chat/runtime/TabConversationActivationBridge';
import type { ConversationTransitionPort, LoadedConversationTransitionContext } from '../../../../src/features/chat/runtime/ConversationTransitionBridge';
import {
  type ConversationViewStateHost,
  ConversationViewStateService,
} from '../../../../src/features/chat/services/ConversationViewStateService';
import type { QuestionTodoStatusRefreshCoordinator } from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';
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
    applyStreamingConversationActivation: jest.fn(),
    applyLoadedConversationActivation: jest.fn(),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderMessages: jest.fn().mockResolvedValue(undefined),
    commitConversationSyncBaseline: jest.fn(),
    ...overrides,
  };
}

type MockedTabConversationActivationPort = jest.Mocked<
  Pick<TabConversationActivationBridge, 'applyEmptyTabActivation'>
>;

function createTabConversationActivationBridge(): MockedTabConversationActivationPort {
  return {
    applyEmptyTabActivation: jest.fn(),
  };
}

function createActivationBridge() {
  const refreshCoordinator: jest.Mocked<Pick<
    QuestionTodoStatusRefreshCoordinator,
    'refreshAfterActivation'
  >> = {
    refreshAfterActivation: jest.fn().mockResolvedValue(undefined),
  };
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
    updateSendButtonState: jest.fn(),
  };

  return {
    bridge: new TabViewActivationBridge(host, refreshCoordinator),
    host,
    refreshCoordinator,
  };
}

type MockedConversationLoadRuntimePort = {
  [Key in keyof ConversationLoadRuntimePort]:
    ConversationLoadRuntimePort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationLoadRuntimePort[Key];
};

function createConversationLoadRuntimeBridge(
  overrides: Partial<MockedConversationLoadRuntimePort> = {},
): MockedConversationLoadRuntimePort {
  return {
    resolveConversation: jest.fn().mockResolvedValue(null),
    loadConversationMessages: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

type MockedConversationTransitionPort = {
  [Key in keyof ConversationTransitionPort]:
    ConversationTransitionPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationTransitionPort[Key];
};

function createTransitionBridge(
  overrides: Partial<MockedConversationTransitionPort> = {},
): MockedConversationTransitionPort {
  const context: LoadedConversationTransitionContext = {
    activeTabId: 'tab-1',
    hydrationRenderContext: {
      activeTabId: 'tab-1',
      messagesEl: document.createElement('div'),
      runtime: {
        autoScrollEnabled: false,
        programmaticScrollGuardUntil: 0,
      },
      preserveScrollPosition: true,
      previousScrollTop: 120,
      shouldStickToBottom: false,
    },
  };

  return {
    prepareLoadedConversationTransition: jest.fn().mockResolvedValue(undefined),
    captureLoadedConversationTransition: jest.fn().mockReturnValue(context),
    beginLoadedConversationTransition: jest.fn(),
    restoreLoadedConversationTransition: jest.fn(),
    endLoadedConversationTransition: jest.fn(),
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
    });
    const tabConversationActivationBridge = createTabConversationActivationBridge();
    const { bridge } = createActivationBridge();
    const transitionBridge = createTransitionBridge();
    const conversationLoadRuntimeBridge = createConversationLoadRuntimeBridge({
      resolveConversation: jest.fn().mockResolvedValue(conversation),
    });
    const service = new ConversationViewStateService(
      host,
      tabConversationActivationBridge,
      bridge,
      transitionBridge,
      conversationLoadRuntimeBridge,
    );
    const loadConversationSpy = jest.spyOn(service, 'loadConversation').mockResolvedValue(undefined);
    const activationPreflightSpy = jest.spyOn(bridge, 'applyActivationPreflight');

    await service.activateTab(tab!.id);

    expect(activationPreflightSpy).toHaveBeenCalledWith(tab!.id);
    expect(conversationLoadRuntimeBridge.resolveConversation).toHaveBeenCalledWith(conversation.id);
    expect(host.applyStreamingConversationActivation).toHaveBeenCalledWith(tab!.id, conversation);
    expect(loadConversationSpy).not.toHaveBeenCalled();
    expect(transitionBridge.captureLoadedConversationTransition).not.toHaveBeenCalled();
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
    const tabConversationActivationBridge = createTabConversationActivationBridge();
    const { bridge } = createActivationBridge();
    const transitionBridge = createTransitionBridge();
    const conversationLoadRuntimeBridge = createConversationLoadRuntimeBridge();
    const service = new ConversationViewStateService(
      host,
      tabConversationActivationBridge,
      bridge,
      transitionBridge,
      conversationLoadRuntimeBridge,
    );
    const loadConversationSpy = jest.spyOn(service, 'loadConversation').mockResolvedValue(undefined);

    await service.activateTab(tab!.id);

    expect(loadConversationSpy).toHaveBeenCalledWith(conversation.id, {
      preserveScrollPosition: true,
    });
    expect(host.applyStreamingConversationActivation).not.toHaveBeenCalled();
    expect(tabConversationActivationBridge.applyEmptyTabActivation).not.toHaveBeenCalled();
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
    const tabConversationActivationBridge = createTabConversationActivationBridge();
    const { bridge } = createActivationBridge();
    const transitionBridge = createTransitionBridge();
    const conversationLoadRuntimeBridge = createConversationLoadRuntimeBridge();
    const service = new ConversationViewStateService(
      host,
      tabConversationActivationBridge,
      bridge,
      transitionBridge,
      conversationLoadRuntimeBridge,
    );

    await service.activateTab(tab!.id);

    expect(tabConversationActivationBridge.applyEmptyTabActivation).toHaveBeenCalledWith(tab!.id);
    expect(host.applyStreamingConversationActivation).not.toHaveBeenCalled();
    expect(transitionBridge.captureLoadedConversationTransition).not.toHaveBeenCalled();
  });

  it('delegates the loaded-conversation transition shell to the dedicated bridge', async () => {
    const conversation = createConversation('load-target');
    const host = createHost();
    const tabConversationActivationBridge = createTabConversationActivationBridge();
    const { bridge } = createActivationBridge();
    const transitionBridge = createTransitionBridge();
    const conversationLoadRuntimeBridge = createConversationLoadRuntimeBridge({
      resolveConversation: jest.fn().mockResolvedValue(conversation),
      loadConversationMessages: jest.fn().mockResolvedValue(conversation.messages),
    });
    const service = new ConversationViewStateService(
      host,
      tabConversationActivationBridge,
      bridge,
      transitionBridge,
      conversationLoadRuntimeBridge,
    );
    const postRenderOutcomeSpy = jest.spyOn(bridge, 'applyLoadedConversationPostRenderOutcome');
    const hydrationTailSpy = jest.spyOn(bridge, 'applyLoadedConversationHydrationTail');

    await service.loadConversation(conversation.id, {
      preserveScrollPosition: true,
    });

    expect(transitionBridge.prepareLoadedConversationTransition).toHaveBeenCalledWith(conversation.id);
    expect(conversationLoadRuntimeBridge.resolveConversation).toHaveBeenCalledWith(conversation.id, {
      reloadIfMissing: true,
    });
    expect(transitionBridge.captureLoadedConversationTransition).toHaveBeenCalledWith(true);
    expect(host.applyLoadedConversationActivation).toHaveBeenCalledWith('tab-1', conversation);
    expect(transitionBridge.beginLoadedConversationTransition).toHaveBeenCalledTimes(1);
    expect(conversationLoadRuntimeBridge.loadConversationMessages).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      { forceServerSync: undefined },
    );
    expect(host.renderMessages).toHaveBeenCalledWith(conversation.messages);
    expect(postRenderOutcomeSpy).toHaveBeenCalledWith('tab-1', conversation.openCodeSessionId);
    expect(host.commitConversationSyncBaseline).toHaveBeenCalledWith(conversation.messages);
    expect(transitionBridge.restoreLoadedConversationTransition).toHaveBeenCalledTimes(1);
    expect(hydrationTailSpy).toHaveBeenCalledTimes(1);
    expect(transitionBridge.endLoadedConversationTransition).toHaveBeenCalledTimes(1);
  });
});
