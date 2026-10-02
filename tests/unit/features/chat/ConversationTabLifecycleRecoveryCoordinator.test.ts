import {
  ConversationTabLifecycleRecoveryCoordinator,
  type ConversationTabLifecycleRecoveryHost,
  type ConversationTabLifecycleRecoveryPort,
} from '../../../../src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator';
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

type MockedConversationTabLifecycleRecoveryHost = {
  [Key in keyof ConversationTabLifecycleRecoveryHost]:
    ConversationTabLifecycleRecoveryHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationTabLifecycleRecoveryHost[Key];
};

function createHost(
  overrides: Partial<MockedConversationTabLifecycleRecoveryHost> = {},
): MockedConversationTabLifecycleRecoveryHost {
  return {
    getTabManager: jest.fn().mockReturnValue(null),
    isTabForegroundBusy: jest.fn().mockReturnValue(false),
    getCurrentConversationId: jest.fn().mockReturnValue(null),
    createConversation: jest.fn().mockResolvedValue(createConversation('created')),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    clearTabMessagesPanes: jest.fn(),
    resetTabManager: jest.fn(),
    removeTabMessagesPane: jest.fn(),
    cancelOpenCodeDiagnosticCapture: jest.fn(),
    showNotice: jest.fn(),
    ...overrides,
  };
}

function createPort(): jest.Mocked<ConversationTabLifecycleRecoveryPort> {
  return {
    activateTab: jest.fn().mockResolvedValue(undefined),
    createConversationInNewTab: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ConversationTabLifecycleRecoveryCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks closing a foreground-busy tab and preserves it', async () => {
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const tab = tabManager.createTab(createConversation('busy'));
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      isTabForegroundBusy: jest.fn().mockReturnValue(true),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.closeTabAndRecover(tab!.id);

    expect(tabManager.getTabCount()).toBe(1);
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.tab.streamingBlocked'));
    expect(host.removeTabMessagesPane).not.toHaveBeenCalled();
    expect(port.activateTab).not.toHaveBeenCalled();
  });

  it('closes a tab and activates the tab manager recovery target', async () => {
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const firstTab = tabManager.createTab(createConversation('first'));
    const secondTab = tabManager.createTab(createConversation('second'));
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.closeTabAndRecover(secondTab!.id);

    expect(host.removeTabMessagesPane).toHaveBeenCalledWith(secondTab!.id);
    expect(host.cancelOpenCodeDiagnosticCapture).toHaveBeenCalledWith(secondTab!.id);
    expect(port.activateTab).toHaveBeenCalledWith(firstTab!.id);
    expect(host.createConversation).not.toHaveBeenCalled();
    expect(port.createConversationInNewTab).not.toHaveBeenCalled();
  });

  it('silently creates a fallback tab after closing the final tab', async () => {
    const fallbackConversation = createConversation('fallback');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const tab = tabManager.createTab(createConversation('only'));
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      createConversation: jest.fn().mockResolvedValue(fallbackConversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.closeTabAndRecover(tab!.id);

    const [fallbackTab] = tabManager.getAllTabs();
    expect(host.removeTabMessagesPane).toHaveBeenCalledWith(tab!.id);
    expect(fallbackTab?.conversationId).toBe(fallbackConversation.id);
    expect(port.activateTab).toHaveBeenCalledWith(fallbackTab!.id);
    expect(port.createConversationInNewTab).not.toHaveBeenCalled();
    expect(host.showNotice).not.toHaveBeenCalled();
  });

  it('still creates an internal fallback tab after closing the final tab when tabs are disabled', async () => {
    const fallbackConversation = createConversation('disabled-fallback');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
      areTabsEnabled: () => false,
    });
    const tab = tabManager.createTab(createConversation('only-disabled'));
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      createConversation: jest.fn().mockResolvedValue(fallbackConversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.closeTabAndRecover(tab!.id);

    const [fallbackTab] = tabManager.getAllTabs();
    expect(fallbackTab?.conversationId).toBe(fallbackConversation.id);
    expect(port.activateTab).toHaveBeenCalledWith(fallbackTab!.id);
    expect(port.createConversationInNewTab).not.toHaveBeenCalled();
  });

  it('deletes unique conversations and activates the next tab when the active tab is removed', async () => {
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const firstTab = tabManager.createTab(createConversation('first'));
    const secondTab = tabManager.createTab(createConversation('second'));
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.deleteConversationsAndRecover(['second', 'second']);

    expect(host.deleteConversation).toHaveBeenCalledTimes(1);
    expect(host.deleteConversation).toHaveBeenCalledWith('second');
    expect(host.removeTabMessagesPane).toHaveBeenCalledWith(secondTab!.id);
    expect(port.activateTab).toHaveBeenCalledWith(firstTab!.id);
    expect(port.createConversationInNewTab).not.toHaveBeenCalled();
  });

});

describe('ConversationTabLifecycleRecoveryCoordinator deletion results', () => {
  it('retains a pending conversation tab/pane and recovers only after retry completes', async () => {
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    const retainedTab = tabManager.createTab(createConversation('pending'))!;
    const pending = new Error('Codex deletion pending (admitted); retained');
    const host = createHost({
      getTabManager: jest.fn(() => tabManager),
      deleteConversation: jest.fn().mockRejectedValue(pending),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);
    await expect(coordinator.deleteConversationsAndRecover(['pending'])).rejects.toBe(pending);
    expect(tabManager.getTab(retainedTab.id)?.conversationId).toBe('pending');
    expect(tabManager.getActiveTab()?.id).toBe(retainedTab.id);
    expect(host.removeTabMessagesPane).not.toHaveBeenCalled();
    expect(host.cancelOpenCodeDiagnosticCapture).not.toHaveBeenCalled();
    expect(port.createConversationInNewTab).not.toHaveBeenCalled();
    host.deleteConversation.mockResolvedValue(undefined);
    await coordinator.deleteConversationsAndRecover(['pending']);
    expect(host.removeTabMessagesPane).toHaveBeenCalledWith(retainedTab.id);
    expect(port.createConversationInNewTab).toHaveBeenCalledTimes(1);
  });

  it.each(['selected', 'all'])('closes only completed tabs for partial %s deletion, keeping failed and pending tabs retryable', async (mode) => {
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    const first = tabManager.createTab(createConversation('verified-first'))!;
    const failed = tabManager.createTab(createConversation('failed'))!;
    const last = tabManager.createTab(createConversation('verified-last'))!;
    const pending = tabManager.createTab(createConversation('pending'))!;
    const host = createHost({
      getTabManager: jest.fn(() => tabManager),
      deleteConversation: jest.fn(async (id: string) => {
        if (id === 'failed') throw new Error('native refused');
        if (id === 'pending') throw new Error('Codex deletion pending (admitted); retained');
      }),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);
    const ids = ['verified-first', 'failed', 'verified-last', 'pending', 'failed'];
    const run = () => mode === 'all' ? coordinator.deleteAllConversationsAndReset(ids) : coordinator.deleteConversationsAndRecover(ids);
    await expect(run()).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: 'native refused' }), expect.objectContaining({ message: expect.stringContaining('pending (admitted)') })],
    });
    expect(host.deleteConversation).toHaveBeenCalledTimes(4);
    expect(tabManager.getAllTabs().map((tab) => tab.id)).toEqual([failed.id, pending.id]);
    expect(tabManager.getActiveTab()?.id).toBe(pending.id);
    expect(host.removeTabMessagesPane.mock.calls.map(([id]) => id)).toEqual([first.id, last.id]);
    expect(host.cancelOpenCodeDiagnosticCapture).not.toHaveBeenCalledWith(failed.id);
    expect(host.cancelOpenCodeDiagnosticCapture).not.toHaveBeenCalledWith(pending.id);
    expect(host.clearTabMessagesPanes).not.toHaveBeenCalled();
    expect(host.resetTabManager).not.toHaveBeenCalled();
    expect(port.createConversationInNewTab).not.toHaveBeenCalled();
    host.deleteConversation.mockResolvedValue(undefined);
    await coordinator.deleteConversationsAndRecover(['failed', 'pending']);
    expect(tabManager.getTabCount()).toBe(0);
    expect(port.createConversationInNewTab).toHaveBeenCalledTimes(1);
  });

  it('uses the noticed new-tab path when deletion closes every tab', async () => {
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const firstTab = tabManager.createTab(createConversation('first'));
    const secondTab = tabManager.createTab(createConversation('second'));
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.deleteConversationsAndRecover(['first', 'second']);

    expect(host.removeTabMessagesPane).toHaveBeenCalledWith(firstTab!.id);
    expect(host.removeTabMessagesPane).toHaveBeenCalledWith(secondTab!.id);
    expect(tabManager.getTabCount()).toBe(0);
    expect(port.createConversationInNewTab).toHaveBeenCalledTimes(1);
    expect(host.createConversation).not.toHaveBeenCalled();
  });

  it('creates an internal fallback tab after deletion closes every tab when tabs are disabled', async () => {
    const fallbackConversation = createConversation('disabled-delete-fallback');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
      areTabsEnabled: () => false,
    });
    tabManager.createTab(createConversation('first'));
    const host = createHost({
      getTabManager: jest.fn().mockReturnValue(tabManager),
      createConversation: jest.fn().mockResolvedValue(fallbackConversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.deleteConversationsAndRecover(['first']);

    const [fallbackTab] = tabManager.getAllTabs();
    expect(fallbackTab?.conversationId).toBe(fallbackConversation.id);
    expect(port.activateTab).toHaveBeenCalledWith(fallbackTab!.id);
    expect(port.createConversationInNewTab).not.toHaveBeenCalled();
  });

  it('keeps the no-tab-manager current-conversation deletion fallback delegated', async () => {
    const host = createHost({
      getCurrentConversationId: jest.fn().mockReturnValue('current'),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.deleteConversationsAndRecover(['current']);

    expect(host.deleteConversation).toHaveBeenCalledWith('current');
    expect(port.createConversationInNewTab).toHaveBeenCalledTimes(1);
  });

  it('resets the tab manager and bootstraps a new tab after deleting all conversations', async () => {
    const host = createHost();
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.deleteAllConversationsAndReset(['first', 'second', 'second']);

    expect(host.deleteConversation).toHaveBeenCalledTimes(2);
    expect(host.deleteConversation).toHaveBeenNthCalledWith(1, 'first');
    expect(host.deleteConversation).toHaveBeenNthCalledWith(2, 'second');
    expect(host.clearTabMessagesPanes).toHaveBeenCalledTimes(1);
    expect(host.resetTabManager).toHaveBeenCalledTimes(1);
    expect(port.createConversationInNewTab).toHaveBeenCalledTimes(1);
    expect(host.removeTabMessagesPane).not.toHaveBeenCalled();
  });

  it('creates an internal fallback tab after reset deletes all conversations when tabs are disabled', async () => {
    let tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
      areTabsEnabled: () => false,
    });
    const fallbackConversation = createConversation('disabled-reset-fallback');
    const host = createHost({
      getTabManager: jest.fn(() => tabManager),
      resetTabManager: jest.fn(() => {
        tabManager = new TabManager('New chat', {
          getMaxTabs: () => 4,
          areTabsEnabled: () => false,
        });
      }),
      createConversation: jest.fn().mockResolvedValue(fallbackConversation),
    });
    const port = createPort();
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);

    await coordinator.deleteAllConversationsAndReset(['first', 'second']);

    const [fallbackTab] = tabManager.getAllTabs();
    expect(fallbackTab?.conversationId).toBe(fallbackConversation.id);
    expect(port.activateTab).toHaveBeenCalledWith(fallbackTab!.id);
    expect(port.createConversationInNewTab).not.toHaveBeenCalled();
  });

});
