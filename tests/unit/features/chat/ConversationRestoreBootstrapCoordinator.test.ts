import {
  type ConversationRestoreBootstrapActivationPort,
  ConversationRestoreBootstrapCoordinator,
  type ConversationRestoreBootstrapHost,
} from '../../../../src/features/chat/services/ConversationRestoreBootstrapCoordinator';
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

type MockedConversationRestoreBootstrapHost = {
  [Key in keyof ConversationRestoreBootstrapHost]:
    ConversationRestoreBootstrapHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationRestoreBootstrapHost[Key];
};

function createHost(
  overrides: Partial<MockedConversationRestoreBootstrapHost> = {},
): MockedConversationRestoreBootstrapHost {
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
    ...overrides,
  };
}

function createActivationPort(): jest.Mocked<ConversationRestoreBootstrapActivationPort> {
  return {
    activateTab: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ConversationRestoreBootstrapCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads conversations before restoring persisted tabs during first open', async () => {
    const conversation = createConversation('restored');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getPersistedTabState: jest.fn().mockReturnValue({
        tabs: [{ conversationId: conversation.id, title: conversation.title, modelOverride: null }],
        activeTabIndex: 0,
      }),
      getConversations: jest.fn().mockReturnValue([conversation]),
    });
    const activationPort = createActivationPort();
    const coordinator = new ConversationRestoreBootstrapCoordinator(host, activationPort);

    await coordinator.initializeFirstTab();

    expect(host.loadConversations).toHaveBeenCalledTimes(1);
    expect(host.getPersistedTabState).toHaveBeenCalledTimes(1);
    expect(activationPort.activateTab).toHaveBeenCalledWith(tabManager.getActiveTab()!.id);
    expect(host.loadConversations.mock.invocationCallOrder[0]).toBeLessThan(
      host.getPersistedTabState.mock.invocationCallOrder[0]!,
    );
  });

  it('reuses the first existing conversation when no persisted tabs are available', async () => {
    const conversation = createConversation('existing');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getConversations: jest.fn().mockReturnValue([conversation]),
    });
    const activationPort = createActivationPort();
    const coordinator = new ConversationRestoreBootstrapCoordinator(host, activationPort);

    await coordinator.initializeFirstTab();

    const tabs = tabManager.getAllTabs();
    expect(host.createConversation).not.toHaveBeenCalled();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.conversationId).toBe(conversation.id);
    expect(activationPort.activateTab).toHaveBeenCalledWith(tabs[0]!.id);
  });

  it('creates a new conversation when first open has no persisted tabs or existing conversations', async () => {
    const createdConversation = createConversation('created-conversation');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getConversations: jest.fn().mockReturnValue([]),
      createConversation: jest.fn().mockResolvedValue(createdConversation),
    });
    const activationPort = createActivationPort();
    const coordinator = new ConversationRestoreBootstrapCoordinator(host, activationPort);

    await coordinator.initializeFirstTab();

    const tabs = tabManager.getAllTabs();
    expect(host.createConversation).toHaveBeenCalledTimes(1);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.conversationId).toBe(createdConversation.id);
    expect(activationPort.activateTab).toHaveBeenCalledWith(tabs[0]!.id);
  });

  it('resets persisted tab state when restore returns no tabs', () => {
    const tabManager = {
      createTab: jest.fn(),
      restoreTabs: jest.fn().mockReturnValue(null),
    };
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getPersistedTabState: jest.fn().mockReturnValue({
        tabs: [{ conversationId: 'missing', title: 'Missing', modelOverride: null }],
        activeTabIndex: 0,
      }),
    });
    const activationPort = createActivationPort();
    const coordinator = new ConversationRestoreBootstrapCoordinator(host, activationPort);

    const restoredTabId = coordinator.restorePersistedTabs();

    expect(restoredTabId).toBeNull();
    expect(host.resetPersistedTabState).toHaveBeenCalledTimes(1);
    expect(host.persistTabState).toHaveBeenCalledWith({ flush: true });
  });
});
