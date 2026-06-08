/* eslint-disable max-lines-per-function -- Coordinator test groups tab-open behaviors together so backend-preservation and existing navigation flows stay reviewable in one place. */
import type { ToolCallInfo } from '../../../../src/core/types';
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

  describe('buildTaskToolSessionTitle', () => {
    it('uses description when available', () => {
      const coordinator = new ConversationTabOpenCoordinator(createHost(), createPort());
      const title = coordinator.buildTaskToolSessionTitle('session-1', {
        input: { description: '  Do something  ', subagent_type: 'type-a' },
      } as unknown as Pick<ToolCallInfo, 'input'>);
      expect(title).toBe('Subagent: Do something');
    });

    it('falls back to subagent_type when description is empty', () => {
      const coordinator = new ConversationTabOpenCoordinator(createHost(), createPort());
      const title = coordinator.buildTaskToolSessionTitle('session-1', {
        input: { description: '', subagent_type: 'type-b' },
      } as unknown as Pick<ToolCallInfo, 'input'>);
      expect(title).toBe('Subagent: type-b');
    });

    it('falls back to sessionId when both are empty', () => {
      const coordinator = new ConversationTabOpenCoordinator(createHost(), createPort());
      const title = coordinator.buildTaskToolSessionTitle('session-1', {
        input: {},
      } as unknown as Pick<ToolCallInfo, 'input'>);
      expect(title).toBe('Subagent: session-1');
    });

    it('falls back to sessionId when toolCall is null', () => {
      const coordinator = new ConversationTabOpenCoordinator(createHost(), createPort());
      const title = coordinator.buildTaskToolSessionTitle('session-1', null);
      expect(title).toBe('Subagent: session-1');
    });
  });

  describe('openTaskToolSession', () => {
    it('creates conversation from session, opens tab, and activates it', async () => {
      const tabManager = new TabManager('New chat', {
        getMaxTabs: () => 4,
      });
      const parentTab = tabManager.createTab(createConversation('parent'))!;
      const conversation = createConversation('from-session');
      const host = createHost({
        getTabManager: jest.fn().mockReturnValue(tabManager),
        createConversationFromSession: jest.fn().mockResolvedValue(conversation),
      });
      const port = createPort();
      const coordinator = new ConversationTabOpenCoordinator(host, port);

      await coordinator.openTaskToolSession('session-1', {
        input: { description: 'Test task' },
      } as unknown as Pick<ToolCallInfo, 'input'>);

      expect(host.createConversationFromSession).toHaveBeenCalledWith('session-1', {
        title: 'Subagent: Test task',
      });
      const tabs = tabManager.getAllTabs();
      expect(tabs).toHaveLength(2);
      expect(tabs[1]?.conversationId).toBe(conversation.id);
      expect(tabs[1]?.parentTabId).toBe(parentTab.id);
      expect(port.activateTab).toHaveBeenCalledWith(tabs[1]!.id);
    });

    it('creates child sessions even when the visible tab limit is reached', async () => {
      const tabManager = new TabManager('New chat', { getMaxTabs: () => 1 });
      const parentTab = tabManager.createTab(createConversation('existing'))!;
      const conversation = createConversation('child-over-limit');
      const host = createHost({
        getTabManager: jest.fn().mockReturnValue(tabManager),
        getMaxTabs: jest.fn().mockReturnValue(1),
        createConversationFromSession: jest.fn().mockResolvedValue(conversation),
      });
      const port = createPort();
      const coordinator = new ConversationTabOpenCoordinator(host, port);

      await coordinator.openTaskToolSession('session-1');

      const tabs = tabManager.getAllTabs();
      expect(tabs).toHaveLength(2);
      expect(tabs[1]?.conversationId).toBe(conversation.id);
      expect(tabs[1]?.parentTabId).toBe(parentTab.id);
      expect(port.activateTab).toHaveBeenCalledWith(tabs[1]!.id);
      expect(host.deleteConversation).not.toHaveBeenCalled();
      expect(host.showNotice).not.toHaveBeenCalledWith(t('chat.tab.maxReached', { count: '1' }));
    });

    it('syncs active tab conversation and loads when tab manager is absent', async () => {
      const conversation = createConversation('from-session');
      const host = createHost({
        getTabManager: jest.fn().mockReturnValue(null),
        createConversationFromSession: jest.fn().mockResolvedValue(conversation),
      });
      const port = createPort();
      const coordinator = new ConversationTabOpenCoordinator(host, port);

      await coordinator.openTaskToolSession('session-1');

      expect(port.syncActiveTabConversation).toHaveBeenCalledWith(conversation);
      expect(port.loadConversation).toHaveBeenCalledWith(conversation.id, {
        forceServerSync: true,
      });
    });

    it('does nothing for empty sessionId', async () => {
      const host = createHost();
      const port = createPort();
      const coordinator = new ConversationTabOpenCoordinator(host, port);

      await coordinator.openTaskToolSession('   ');

      expect(host.createConversationFromSession).not.toHaveBeenCalled();
    });

    it('surfaces errors through notice', async () => {
      const host = createHost({
        createConversationFromSession: jest.fn().mockRejectedValue(new Error('session-error')),
      });
      const port = createPort();
      const coordinator = new ConversationTabOpenCoordinator(host, port);

      await coordinator.openTaskToolSession('session-1');

      expect(host.showNotice).toHaveBeenCalledWith(t('chat.tab.childOpenFailed'));
    });

    it('passes the parent backend when opening a task tool session', async () => {
      const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
      tabManager.createTab(createConversation('parent'));
      const conversation = createConversation('from-session');
      const host = createHost({
        getTabManager: jest.fn().mockReturnValue(tabManager),
        createConversationFromSession: jest.fn().mockResolvedValue(conversation),
      });
      const port = createPort();
      const coordinator = new ConversationTabOpenCoordinator(host, port);

      await coordinator.openTaskToolSession('session-1', {
        input: { description: 'Test task' },
      } as unknown as Pick<ToolCallInfo, 'input'>, 'claude-code');

      expect(host.createConversationFromSession).toHaveBeenCalledWith('session-1', {
        title: 'Subagent: Test task',
        backend: 'claude-code',
      });
    });

    it('passes undefined backend when no parent backend is specified', async () => {
      const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
      tabManager.createTab(createConversation('parent'));
      const conversation = createConversation('from-session');
      const host = createHost({
        getTabManager: jest.fn().mockReturnValue(tabManager),
        createConversationFromSession: jest.fn().mockResolvedValue(conversation),
      });
      const port = createPort();
      const coordinator = new ConversationTabOpenCoordinator(host, port);

      await coordinator.openTaskToolSession('session-1');

      expect(host.createConversationFromSession).toHaveBeenCalledWith('session-1', {
        title: 'Subagent: session-1',
      });
    });
  });
});
