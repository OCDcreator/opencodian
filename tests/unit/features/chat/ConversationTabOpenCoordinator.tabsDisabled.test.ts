import {
  ConversationTabOpenCoordinator,
  type ConversationTabOpenHost,
  type ConversationTabOpenPort,
} from '../../../../src/features/chat/services/ConversationTabOpenCoordinator';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';
import { t } from '../../../../src/i18n';

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
    createConversationFromSession: jest.fn().mockResolvedValue(createConversation('from-session')),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    showNotice: jest.fn(),
    ...overrides,
  };
}

function createPort(): jest.Mocked<ConversationTabOpenPort> {
  return {
    activateTab: jest.fn().mockResolvedValue(undefined),
    openConversationInCurrentTab: jest.fn(),
    syncActiveTabConversation: jest.fn(),
    loadConversation: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ConversationTabOpenCoordinator with tabs disabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens a requested new tab conversation in the current tab instead', async () => {
    const conversation = createConversation('tabs-disabled-current');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
      areTabsEnabled: () => false,
    });
    tabManager.createTab(createConversation('existing'));
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      createConversation: jest.fn().mockResolvedValue(conversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.createConversationInNewTab();

    expect(tabManager.getAllTabs()).toHaveLength(1);
    expect(port.openConversationInCurrentTab).toHaveBeenCalledWith(conversation);
    expect(port.activateTab).not.toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.tab.newCurrentCreated'));
  });

  it('opens a task tool session as a hidden child tab when tabs are disabled', async () => {
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
      areTabsEnabled: () => false,
    });
    const parentTab = tabManager.createTab(createConversation('parent'));
    const conversation = createConversation('from-session');
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      createConversationFromSession: jest.fn().mockResolvedValue(conversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.openTaskToolSession('session-1');

    const tabs = tabManager.getAllTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs[1]?.conversationId).toBe(conversation.id);
    expect(tabs[1]?.parentTabId).toBe(parentTab?.id);
    expect(port.activateTab).toHaveBeenCalledWith(tabs[1]!.id);
    expect(port.syncActiveTabConversation).not.toHaveBeenCalled();
    expect(port.loadConversation).not.toHaveBeenCalled();
  });

  it('opens a hidden child tab while the active tab is streaming', async () => {
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
      areTabsEnabled: () => false,
    });
    const parentTab = tabManager.createTab(createConversation('streaming-parent'));
    const conversation = createConversation('streaming-child');
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      isActiveTabStreaming: jest.fn().mockReturnValue(true),
      createConversationFromSession: jest.fn().mockResolvedValue(conversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.openTaskToolSession('session-1');

    const tabs = tabManager.getAllTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs[1]?.conversationId).toBe(conversation.id);
    expect(tabs[1]?.parentTabId).toBe(parentTab?.id);
    expect(port.activateTab).toHaveBeenCalledWith(tabs[1]!.id);
    expect(port.syncActiveTabConversation).not.toHaveBeenCalled();
    expect(port.loadConversation).not.toHaveBeenCalled();
    expect(host.showNotice).not.toHaveBeenCalledWith(t('chat.tab.newBlockedWhileStreaming'));
  });

  it('does not apply the visible max-tabs limit to hidden child sessions', async () => {
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 1,
      areTabsEnabled: () => false,
    });
    const parentTab = tabManager.createTab(createConversation('parent-at-limit'));
    const conversation = createConversation('hidden-child-over-limit');
    const host = createHost({
      getMaxTabs: jest.fn().mockReturnValue(1),
      getTabManager: jest.fn().mockReturnValue(tabManager),
      createConversationFromSession: jest.fn().mockResolvedValue(conversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.openTaskToolSession('session-over-limit');

    const tabs = tabManager.getAllTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs[1]?.conversationId).toBe(conversation.id);
    expect(tabs[1]?.parentTabId).toBe(parentTab?.id);
    expect(port.activateTab).toHaveBeenCalledWith(tabs[1]!.id);
    expect(host.showNotice).not.toHaveBeenCalledWith(t('chat.tab.maxReached', { count: '1' }));
  });

  it('shows a generic child-session failure when the child tab cannot be created defensively', async () => {
    const conversation = createConversation('orphaned-child');
    const tabManager = {
      areTabsEnabled: jest.fn(() => false),
      canCreateTab: jest.fn(() => false),
      createTab: jest.fn(() => null),
      getActiveTab: jest.fn(() => ({ id: 'tab-parent' })),
    };
    const host = createHost({
      getMaxTabs: jest.fn().mockReturnValue(1),
      getTabManager: jest.fn().mockReturnValue(tabManager),
      createConversationFromSession: jest.fn().mockResolvedValue(conversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabOpenCoordinator(host, port);

    await coordinator.openTaskToolSession('session-defensive-failure');

    expect(host.deleteConversation).toHaveBeenCalledWith(conversation.id);
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.tab.childOpenFailed'));
    expect(host.showNotice).not.toHaveBeenCalledWith(t('chat.tab.maxReached', { count: '1' }));
    expect(port.activateTab).not.toHaveBeenCalled();
  });
});
