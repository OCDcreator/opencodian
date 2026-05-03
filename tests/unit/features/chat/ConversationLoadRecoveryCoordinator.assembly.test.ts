import type {
  Conversation,
} from '../../../../src/core/types';
import {
  assembleConversationLoadRecovery,
  type ConversationLoadRecoveryAssemblyDependencies,
  type ConversationLoadRecoveryHostDependencies,
} from '../../../../src/features/chat/services/ConversationLoadRecoveryCoordinator';

function createConversation(id: string, title = `Chat ${id}`): Conversation {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `${id}-session`,
    messages: [],
  };
}

const mockApp = {} as never;

function createLoadRecoveryHostDeps(
  overrides: Partial<ConversationLoadRecoveryHostDependencies> = {},
): ConversationLoadRecoveryHostDependencies {
  return {
    isActiveTabStreaming: jest.fn(() => false),
    getCurrentConversation: jest.fn(() => createConversation('assembly-test')),
    getTabManager: jest.fn(() => null),
    getMaxTabs: jest.fn(() => 4),
    getPersistedTabState: jest.fn().mockReturnValue({
      tabs: [],
      activeTabIndex: 0,
    }),
    setPersistedTabState: jest.fn(),
    persistTabState: jest.fn(),
    loadConversations: jest.fn().mockResolvedValue(undefined),
    getConversations: jest.fn().mockReturnValue([]),
    createConversation: jest.fn().mockResolvedValue(createConversation('created')),
    app: mockApp,
    revertSession: jest.fn().mockResolvedValue(true),
    unrevertSession: jest.fn().mockResolvedValue(true),
    forkSession: jest.fn().mockResolvedValue({ id: 'fork-session' }),
    createConversationFromSession: jest.fn().mockResolvedValue(createConversation('forked')),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    syncActiveTabConversation: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    ...overrides,
  };
}

function createAssemblyDeps(
  overrides: Partial<ConversationLoadRecoveryAssemblyDependencies> = {},
): ConversationLoadRecoveryAssemblyDependencies {
  const conversation = createConversation('assembly-test');
  return {
    viewStateHost: {
      getTabManager: jest.fn(() => null),
    },
    tabConversationActivationBridge: {
      applyEmptyTabActivation: jest.fn(),
      applyLoadedConversationActivation: jest.fn(),
      applyStreamingConversationActivation: jest.fn(),
      openConversation: jest.fn(),
    } as never,
    tabViewActivationBridge: {
      applyActivationPreflight: jest.fn(),
      applyLoadedConversationHydrationTail: jest.fn(),
    },
    conversationHydrationOutcomeBridge: {
      onHydrationComplete: jest.fn(),
      applyLoadedConversationOutcome: jest.fn().mockResolvedValue(undefined),
    } as never,
    conversationTransitionBridge: {
      transitionToConversation: jest.fn().mockResolvedValue(undefined),
      prepareLoadedConversationTransition: jest.fn().mockResolvedValue(undefined),
      captureLoadedConversationTransition: jest.fn().mockReturnValue({ activeTabId: 'tab-1' }),
      beginLoadedConversationTransition: jest.fn(),
      restoreLoadedConversationTransition: jest.fn().mockResolvedValue(undefined),
      endLoadedConversationTransition: jest.fn(),
    } as never,
    conversationLoadRuntimeBridge: {
      resolveConversation: jest.fn().mockResolvedValue(conversation),
      loadConversation: jest.fn().mockResolvedValue(undefined),
      loadConversationMessages: jest.fn().mockResolvedValue([]),
    } as never,
    tabOpenHost: {
      getTabManager: jest.fn(() => null),
      getMaxTabs: jest.fn(() => 4),
      createConversation: jest.fn().mockResolvedValue(conversation),
      canCreateTab: jest.fn(() => true),
      createTab: jest.fn(),
      activateTab: jest.fn().mockResolvedValue(undefined),
      syncActiveTabConversation: jest.fn(),
    } as never,
    lifecycleRecoveryHost: {
      getTabManager: jest.fn(() => null),
      getCurrentConversationId: jest.fn(() => conversation.id),
      isTabForegroundBusy: jest.fn(() => false),
      isActiveTabStreaming: jest.fn(() => false),
      deleteConversation: jest.fn().mockResolvedValue(undefined),
      getConversations: jest.fn().mockReturnValue([]),
      createConversation: jest.fn().mockResolvedValue(conversation),
      syncActiveTabConversation: jest.fn(),
      showNotice: jest.fn(),
      persistTabState: jest.fn(),
      clearTabMessagesPanes: jest.fn(),
      resetTabManager: jest.fn(),
      removeTabMessagesPane: jest.fn(),
    } as never,
    loadRecoveryHostDeps: createLoadRecoveryHostDeps(),
    ...overrides,
  };
}

describe('assembleConversationLoadRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all four assembled services', () => {
    const deps = createAssemblyDeps();
    const result = assembleConversationLoadRecovery(deps);

    expect(result.conversationViewStateService).toBeDefined();
    expect(result.conversationTabOpenCoordinator).toBeDefined();
    expect(result.conversationTabLifecycleRecoveryCoordinator).toBeDefined();
    expect(result.conversationLoadRecoveryCoordinator).toBeDefined();
  });

  it('wires loadRecoveryCoordinator.activateTab to viewStateService.activateTab', async () => {
    const deps = createAssemblyDeps();
    const result = assembleConversationLoadRecovery(deps);

    const activateTabSpy = jest.spyOn(result.conversationViewStateService, 'activateTab');
    await result.conversationLoadRecoveryCoordinator.activateTab('tab-1');

    expect(activateTabSpy).toHaveBeenCalledWith('tab-1');
  });

  it('wires loadRecoveryCoordinator.createConversationInNewTab to tabOpenCoordinator', async () => {
    const deps = createAssemblyDeps();
    const result = assembleConversationLoadRecovery(deps);

    const createSpy = jest.spyOn(result.conversationTabOpenCoordinator, 'createConversationInNewTab');
    await result.conversationLoadRecoveryCoordinator.createConversationInNewTab();

    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('wires loadRecoveryCoordinator.createConversationInCurrentTab to tabOpenCoordinator', async () => {
    const deps = createAssemblyDeps();
    const result = assembleConversationLoadRecovery(deps);

    const createSpy = jest.spyOn(result.conversationTabOpenCoordinator, 'createConversationInCurrentTab');
    await result.conversationLoadRecoveryCoordinator.createConversationInCurrentTab();

    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('wires loadRecoveryCoordinator.loadConversation to viewStateService', async () => {
    const deps = createAssemblyDeps();
    const result = assembleConversationLoadRecovery(deps);

    const loadSpy = jest.spyOn(result.conversationViewStateService, 'loadConversation');
    await result.conversationLoadRecoveryCoordinator.loadConversation('conv-1', { forceServerSync: true });

    expect(loadSpy).toHaveBeenCalledWith('conv-1', { forceServerSync: true });
  });

  it('wires loadRecoveryCoordinator.deleteConversationsAndRecover to lifecycleRecoveryCoordinator', async () => {
    const deps = createAssemblyDeps();
    const result = assembleConversationLoadRecovery(deps);

    const deleteSpy = jest.spyOn(result.conversationTabLifecycleRecoveryCoordinator, 'deleteConversationsAndRecover');
    await result.conversationLoadRecoveryCoordinator.deleteConversationsAndRecover(['conv-1']);

    expect(deleteSpy).toHaveBeenCalledWith(['conv-1']);
  });

  it('wires loadRecoveryCoordinator.deleteAllConversationsAndReset to lifecycleRecoveryCoordinator', async () => {
    const deps = createAssemblyDeps();
    const result = assembleConversationLoadRecovery(deps);

    const deleteSpy = jest.spyOn(result.conversationTabLifecycleRecoveryCoordinator, 'deleteAllConversationsAndReset');
    await result.conversationLoadRecoveryCoordinator.deleteAllConversationsAndReset(['conv-1']);

    expect(deleteSpy).toHaveBeenCalledWith(['conv-1']);
  });

  it('assembles lifecycle recovery coordinator with valid host and port', () => {
    const conversation = createConversation('test');
    const assemblyDeps = createAssemblyDeps({
      lifecycleRecoveryHost: {
        getTabManager: jest.fn(() => null),
        getCurrentConversation: jest.fn(() => conversation),
        isActiveTabStreaming: jest.fn(() => false),
        deleteConversation: jest.fn().mockResolvedValue(undefined),
        getConversations: jest.fn().mockReturnValue([conversation]),
        createConversation: jest.fn().mockResolvedValue(conversation),
        syncActiveTabConversation: jest.fn(),
        showNotice: jest.fn(),
        persistTabState: jest.fn(),
      } as never,
    });
    const assemblyResult = assembleConversationLoadRecovery(assemblyDeps);

    expect(assemblyResult.conversationLoadRecoveryCoordinator).toBeDefined();
    expect(assemblyResult.conversationTabLifecycleRecoveryCoordinator).toBeDefined();
  });

  it('wires tabOpenCoordinator.createConversationInCurrentTab to tabConversationActivationBridge', async () => {
    const conversation = createConversation('open-test');
    const tabManager = {
      canCreateTab: jest.fn(() => true),
      createTab: jest.fn(() => ({ id: 'tab-1', conversationId: conversation.id, title: conversation.title, modelOverride: null })),
      getActiveTabModelOverride: jest.fn(() => null),
      setActiveTabModelOverride: jest.fn(),
      restoreTabs: jest.fn(() => null),
    };
    const deps = createAssemblyDeps({
      tabOpenHost: {
        getTabManager: jest.fn(() => tabManager),
        getMaxTabs: jest.fn(() => 4),
        createConversation: jest.fn().mockResolvedValue(conversation),
        canCreateTab: jest.fn(() => true),
        createTab: jest.fn(),
        activateTab: jest.fn().mockResolvedValue(undefined),
        syncActiveTabConversation: jest.fn(),
        showNotice: jest.fn(),
        isActiveTabStreaming: jest.fn(() => false),
      } as never,
    });
    const result = assembleConversationLoadRecovery(deps);

    await result.conversationTabOpenCoordinator.createConversationInCurrentTab();

    expect(deps.tabConversationActivationBridge.openConversation).toHaveBeenCalled();
  });

  it('wires tabOpenCoordinator.createConversationInNewTab through to loadRecoveryCoordinator', async () => {
    const deps = createAssemblyDeps();
    const result = assembleConversationLoadRecovery(deps);

    const createSpy = jest.spyOn(result.conversationTabOpenCoordinator, 'createConversationInNewTab');
    await result.conversationLoadRecoveryCoordinator.createConversationInNewTab();

    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});
