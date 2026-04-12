import { t } from '../../../../src/i18n';
import {
  ConversationTabOpenCoordinator,
  type ConversationTabOpenHost,
  type ConversationTabOpenPort,
} from '../../../../src/features/chat/services/ConversationTabOpenCoordinator';
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

type MockedConversationTabOpenHost = {
  [Key in keyof ConversationTabOpenHost]:
    ConversationTabOpenHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationTabOpenHost[Key];
};

function createHost(
  overrides: Partial<MockedConversationTabOpenHost> = {},
): MockedConversationTabOpenHost {
  return {
    getTabManager: jest.fn().mockReturnValue(null),
    getMaxTabs: jest.fn().mockReturnValue(4),
    isActiveTabStreaming: jest.fn().mockReturnValue(false),
    createConversation: jest.fn().mockResolvedValue(createConversation('created')),
    showNotice: jest.fn(),
    ...overrides,
  };
}

function createPort(): jest.Mocked<ConversationTabOpenPort> {
  return {
    activateTab: jest.fn().mockResolvedValue(undefined),
    openConversationInCurrentTab: jest.fn(),
  };
}

function createTabManagerStub() {
  return {
    canCreateTab: jest.fn().mockReturnValue(true),
    createTab: jest.fn().mockReturnValue(null),
  };
}

describe('ConversationTabOpenCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates, activates, and announces a new tab conversation', async () => {
    const conversation = createConversation('new-tab');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      createConversation: jest.fn().mockResolvedValue(conversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.createConversationInNewTab();

    const tabs = tabManager.getAllTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.conversationId).toBe(conversation.id);
    expect(port.activateTab).toHaveBeenCalledWith(tabs[0]!.id);
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.tab.created'));
  });

  it('shows the max-tabs notice instead of creating another tab', async () => {
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 1,
    });
    tabManager.createTab(createConversation('existing'));
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getMaxTabs: jest.fn().mockReturnValue(1),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.createConversationInNewTab();

    expect(host.createConversation).not.toHaveBeenCalled();
    expect(port.activateTab).not.toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith(
      t('chat.tab.maxReached', { count: '1' }),
    );
  });

  it('blocks current-tab replacement while the active tab is streaming', async () => {
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(createTabManagerStub()),
      isActiveTabStreaming: jest.fn().mockReturnValue(true),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.createConversationInCurrentTab();

    expect(host.createConversation).not.toHaveBeenCalled();
    expect(port.openConversationInCurrentTab).not.toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.tab.newBlockedWhileStreaming'));
  });

  it('opens a created conversation in the current tab and announces success', async () => {
    const conversation = createConversation('current-tab');
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(createTabManagerStub()),
      createConversation: jest.fn().mockResolvedValue(conversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.createConversationInCurrentTab();

    expect(port.openConversationInCurrentTab).toHaveBeenCalledWith(conversation);
    expect(port.activateTab).not.toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.tab.newCurrentCreated'));
  });

  it('surfaces create errors through the shared notice path', async () => {
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(createTabManagerStub()),
      createConversation: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.createConversationInCurrentTab();

    expect(host.showNotice).toHaveBeenCalledWith('boom');
  });
});
