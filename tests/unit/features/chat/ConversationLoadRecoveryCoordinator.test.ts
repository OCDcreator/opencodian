/* eslint-disable max-lines -- Conversation recovery coverage keeps initialization, active-backend restore, rewind, fork, and host factory regressions with one shared fixture. */

import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import type { AgentBackendKind } from '../../../../src/core/types/chat';
import {
  ConversationLoadRecoveryCoordinator,
  type ConversationLoadRecoveryHost,
  type ConversationLoadRecoveryHostDependencies,
  type ConversationLoadRecoveryPort,
  createConversationLoadRecoveryHost,
} from '../../../../src/features/chat/services/ConversationLoadRecoveryCoordinator';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';
import { t } from '../../../../src/i18n';

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

function createBackendConversation(
  id: string,
  backend: AgentBackendKind,
  title = `Chat ${id}`,
): Conversation {
  const conversation = createConversation(id, title);
  conversation.backend = backend;
  conversation.backendSessionId = `${id}-${backend}-session`;
  if (backend !== 'opencode') {
    delete conversation.openCodeSessionId;
  }
  return conversation;
}

function createMessage(
  id = 'message-1',
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    role: 'user',
    content: `Message ${id}`,
    timestamp: 1,
    sourceMessageId: `${id}-source`,
    ...overrides,
  };
}

type MockedConversationLoadRecoveryHost = {
  [Key in keyof ConversationLoadRecoveryHost]:
    ConversationLoadRecoveryHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationLoadRecoveryHost[Key];
};

type MockedConversationLoadRecoveryPort = {
  [Key in keyof ConversationLoadRecoveryPort]:
    ConversationLoadRecoveryPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationLoadRecoveryPort[Key];
};

function createHost(
  conversation: Conversation,
  overrides: Partial<MockedConversationLoadRecoveryHost> = {},
): MockedConversationLoadRecoveryHost {
  return {
    isActiveTabStreaming: jest.fn(() => false),
    getCurrentConversation: jest.fn(() => conversation),
    getTabManager: jest.fn(() => null),
    getMaxTabs: jest.fn(() => 4),
    getPersistedTabState: jest.fn().mockReturnValue({
      tabs: [],
      activeTabIndex: 0,
    }),
    resetPersistedTabState: jest.fn(),
    persistTabState: jest.fn(),
    loadConversations: jest.fn().mockResolvedValue(undefined),
    getConversations: jest.fn().mockReturnValue([]),
    getActiveBackend: jest.fn(() => 'opencode'),
    createConversation: jest.fn().mockResolvedValue(createConversation('created')),
    chooseForkTarget: jest.fn().mockResolvedValue('current-tab'),
    confirmRewind: jest.fn(() => true),
    revertSession: jest.fn().mockResolvedValue(true),
    unrevertSession: jest.fn().mockResolvedValue(true),
    forkSession: jest.fn().mockResolvedValue({ id: 'fork-session' }),
    createConversationFromSession: jest.fn().mockResolvedValue(createConversation('forked')),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    syncActiveTabConversation: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    showNotice: jest.fn(),
    ...overrides,
  };
}

function createPort(
  overrides: Partial<MockedConversationLoadRecoveryPort> = {},
): MockedConversationLoadRecoveryPort {
  return {
    activateTab: jest.fn().mockResolvedValue(undefined),
    createConversationInNewTab: jest.fn().mockResolvedValue(undefined),
    createConversationInCurrentTab: jest.fn().mockResolvedValue(undefined),
    loadConversation: jest.fn().mockResolvedValue(undefined),
    deleteConversationsAndRecover: jest.fn().mockResolvedValue(undefined),
    deleteAllConversationsAndReset: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('ConversationLoadRecoveryCoordinator initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates create/load/delete methods to the existing load/recovery ports', async () => {
    const conversation = createConversation('bootstrap');
    const host = createHost(conversation);
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.createConversationInNewTab();
    await coordinator.createConversationInCurrentTab();
    await coordinator.loadConversation(conversation.id, { preserveScrollPosition: true });
    await coordinator.deleteConversationsAndRecover([conversation.id]);
    await coordinator.deleteAllConversationsAndReset([conversation.id]);

    expect(port.createConversationInNewTab).toHaveBeenCalledTimes(1);
    expect(port.createConversationInCurrentTab).toHaveBeenCalledTimes(1);
    expect(port.loadConversation).toHaveBeenCalledWith(conversation.id, {
      preserveScrollPosition: true,
    });
    expect(port.deleteConversationsAndRecover).toHaveBeenCalledWith([conversation.id]);
    expect(port.deleteAllConversationsAndReset).toHaveBeenCalledWith([conversation.id]);
  });

  it('loads conversations before restoring persisted tabs during first open', async () => {
    const conversation = createConversation('restored');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost(conversation, {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getPersistedTabState: jest.fn().mockReturnValue({
        tabs: [{ conversationId: conversation.id, title: conversation.title, modelOverride: null }],
        activeTabIndex: 0,
      }),
      getConversations: jest.fn().mockReturnValue([conversation]),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.initializeFirstTab();

    expect(host.loadConversations).toHaveBeenCalledTimes(1);
    expect(host.getPersistedTabState).toHaveBeenCalledTimes(1);
    expect(port.activateTab).toHaveBeenCalledWith(tabManager.getActiveTab()!.id);
    expect(host.loadConversations.mock.invocationCallOrder[0]).toBeLessThan(
      host.getPersistedTabState.mock.invocationCallOrder[0]!,
    );
  });

  it('reuses the first existing conversation when no persisted tabs are available', async () => {
    const conversation = createConversation('existing');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost(conversation, {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getConversations: jest.fn().mockReturnValue([conversation]),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.initializeFirstTab();

    const tabs = tabManager.getAllTabs();
    expect(host.createConversation).not.toHaveBeenCalled();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.conversationId).toBe(conversation.id);
    expect(port.activateTab).toHaveBeenCalledWith(tabs[0]!.id);
  });

  it('uses only active-backend conversations during first-open bootstrap', async () => {
    const opencodeConversation = createBackendConversation('opencode-existing', 'opencode');
    const claudeConversation = createBackendConversation('claude-existing', 'claude-code');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost(claudeConversation, {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getActiveBackend: jest.fn(() => 'claude-code'),
      getConversations: jest.fn().mockReturnValue([opencodeConversation, claudeConversation]),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.initializeFirstTab();

    const tabs = tabManager.getAllTabs();
    expect(host.createConversation).not.toHaveBeenCalled();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.conversationId).toBe(claudeConversation.id);
  });

  it('restores only active-backend persisted tabs', () => {
    const opencodeConversation = createBackendConversation('opencode-restored', 'opencode');
    const claudeConversation = createBackendConversation('claude-restored', 'claude-code');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost(claudeConversation, {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getActiveBackend: jest.fn(() => 'claude-code'),
      getPersistedTabState: jest.fn().mockReturnValue({
        tabs: [
          { conversationId: opencodeConversation.id, title: opencodeConversation.title, modelOverride: null },
          { conversationId: claudeConversation.id, title: claudeConversation.title, modelOverride: null },
        ],
        activeTabIndex: 0,
      }),
      getConversations: jest.fn().mockReturnValue([opencodeConversation, claudeConversation]),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    const restoredTabId = coordinator.restorePersistedTabs();

    expect(restoredTabId).toBeTruthy();
    expect(tabManager.getAllTabs()).toHaveLength(1);
    expect(tabManager.getActiveTab()?.conversationId).toBe(claudeConversation.id);
  });

  it('creates a new conversation when first open has no persisted tabs or existing conversations', async () => {
    const conversation = createConversation('load-created');
    const createdConversation = createConversation('created-conversation');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost(conversation, {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getConversations: jest.fn().mockReturnValue([]),
      createConversation: jest.fn().mockResolvedValue(createdConversation),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.initializeFirstTab();

    const tabs = tabManager.getAllTabs();
    expect(host.createConversation).toHaveBeenCalledTimes(1);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.conversationId).toBe(createdConversation.id);
    expect(port.activateTab).toHaveBeenCalledWith(tabs[0]!.id);
  });

  it('falls back to an empty tab when initial conversation bootstrap fails', async () => {
    const conversation = createConversation('load-created');
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    const host = createHost(conversation, {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getConversations: jest.fn().mockReturnValue([]),
      createConversation: jest.fn().mockRejectedValue(new Error('Cannot create conversation: opencode backend is not enabled')),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await expect(coordinator.initializeFirstTab()).resolves.toBeUndefined();

    const tabs = tabManager.getAllTabs();
    expect(host.createConversation).toHaveBeenCalledTimes(1);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.conversationId).toBeNull();
    expect(port.activateTab).toHaveBeenCalledWith(tabs[0]!.id);
  });

  it('resets persisted tab state when restore returns no tabs', () => {
    const conversation = createConversation('missing');
    const tabManager = {
      canCreateTab: jest.fn(),
      createTab: jest.fn(),
      getActiveTabModelOverride: jest.fn(),
      setActiveTabModelOverride: jest.fn(),
      restoreTabs: jest.fn().mockReturnValue(null),
    };
    const host = createHost(conversation, {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getPersistedTabState: jest.fn().mockReturnValue({
        tabs: [{ conversationId: 'missing', title: 'Missing', modelOverride: null }],
        activeTabIndex: 0,
      }),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    const restoredTabId = coordinator.restorePersistedTabs();

    expect(restoredTabId).toBeNull();
    expect(host.resetPersistedTabState).toHaveBeenCalledTimes(1);
    expect(host.persistTabState).toHaveBeenCalledWith({ flush: true });
  });
});

describe('ConversationLoadRecoveryCoordinator rewind and restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rewinds a conversation through the service port and reloads with force sync', async () => {
    const conversation = createConversation('rewind');
    const message = createMessage('rewind-message', {
      content: 'A'.repeat(160),
    });
    const host = createHost(conversation);
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRewindRequest(message);

    expect(host.confirmRewind).toHaveBeenCalledTimes(1);
    expect(host.revertSession).toHaveBeenCalledWith(
      conversation.openCodeSessionId,
      message.sourceMessageId,
    );
    expect(port.loadConversation).toHaveBeenCalledWith(conversation.id, {
      forceServerSync: true,
    });
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.success'));
  });

  it('restores a rewound conversation and reloads the current conversation', async () => {
    const conversation = createConversation('restore');
    const host = createHost(conversation);
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRestoreRewindRequest();

    expect(host.unrevertSession).toHaveBeenCalledWith(conversation.openCodeSessionId);
    expect(port.loadConversation).toHaveBeenCalledWith(conversation.id, {
      forceServerSync: true,
    });
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.restoreSuccess'));
  });

  it('shows streamingBlocked notice when tab is streaming', async () => {
    const conversation = createConversation('rewind-streaming');
    const host = createHost(conversation, {
      isActiveTabStreaming: jest.fn(() => true),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRewindRequest(createMessage());

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.streamingBlocked'));
    expect(host.revertSession).not.toHaveBeenCalled();
  });

  it('shows unavailable notice when no current conversation', async () => {
    const conversation = createConversation('rewind-missing-conversation');
    const host = createHost(conversation, {
      getCurrentConversation: jest.fn(() => null),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRewindRequest(createMessage());

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.unavailable'));
  });

  it('shows unavailable notice for non-OpenCode backend', async () => {
    const conversation = createBackendConversation('claude-conv', 'claude-code');
    const host = createHost(conversation);
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRewindRequest(createMessage());

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.unavailable'));
    expect(host.revertSession).not.toHaveBeenCalled();
  });

  it('shows unavailable notice when message has no sourceMessageId', async () => {
    const conversation = createConversation('rewind-missing-source');
    const message = createMessage('message-without-source', {
      sourceMessageId: undefined,
    });
    const host = createHost(conversation);
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRewindRequest(message);

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.unavailable'));
  });

  it('does nothing when user cancels the rewind confirmation', async () => {
    const conversation = createConversation('rewind-cancelled');
    const host = createHost(conversation, {
      confirmRewind: jest.fn(() => false),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRewindRequest(createMessage());

    expect(host.revertSession).not.toHaveBeenCalled();
    expect(host.showNotice).not.toHaveBeenCalled();
  });

  it('shows failed notice when revertSession returns false', async () => {
    const conversation = createConversation('rewind-revert-false');
    const host = createHost(conversation, {
      revertSession: jest.fn().mockResolvedValue(false),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRewindRequest(createMessage());

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.failed'));
    expect(port.loadConversation).not.toHaveBeenCalled();
  });

  it('shows failed notice when revertSession throws', async () => {
    const conversation = createConversation('rewind-revert-throws');
    const host = createHost(conversation, {
      revertSession: jest.fn().mockRejectedValue(new Error('server error')),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRewindRequest(createMessage());

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.failed'));
  });

  it('shows streamingBlocked notice when tab is streaming during restore', async () => {
    const conversation = createConversation('restore-streaming');
    const host = createHost(conversation, {
      isActiveTabStreaming: jest.fn(() => true),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRestoreRewindRequest();

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.streamingBlocked'));
  });

  it('shows restoreFailed for non-OpenCode backend during restore', async () => {
    const conversation = createBackendConversation('claude-restore', 'claude-code');
    const host = createHost(conversation);
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRestoreRewindRequest();

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.restoreFailed'));
  });

  it('shows restoreFailed when unrevertSession returns false', async () => {
    const conversation = createConversation('restore-unrevert-false');
    const host = createHost(conversation, {
      unrevertSession: jest.fn().mockResolvedValue(false),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRestoreRewindRequest();

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.restoreFailed'));
  });

  it('shows restoreFailed when unrevertSession throws', async () => {
    const conversation = createConversation('restore-unrevert-throws');
    const host = createHost(conversation, {
      unrevertSession: jest.fn().mockRejectedValue(new Error('restore error')),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleRestoreRewindRequest();

    expect(host.showNotice).toHaveBeenCalledWith(t('chat.rewind.restoreFailed'));
  });
});

describe('ConversationLoadRecoveryCoordinator forking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forks into the current tab and reloads the forked conversation without force sync', async () => {
    const conversation = createConversation('source', 'Source Chat');
    conversation.currentNote = 'Daily.md';
    conversation.externalContextPaths = ['Projects/Alpha.md'];
    const beforeMessage = createMessage('message-before', {
      content: 'Before target',
      sourceMessageId: 'before-source',
    });
    const targetMessage = createMessage('message-target', {
      content: 'Fork target',
      sourceMessageId: 'target-source',
    });
    conversation.messages = [beforeMessage, targetMessage];
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    tabManager.createTab(conversation);
    const forkConversation = createConversation('forked-current', 'Forked');
    const host = createHost(conversation, {
      getTabManager: jest.fn(() => tabManager),
      createConversationFromSession: jest.fn().mockResolvedValue(forkConversation),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleForkRequest(targetMessage);

    expect(host.forkSession).toHaveBeenCalledWith(
      conversation.openCodeSessionId,
      targetMessage.sourceMessageId,
    );
    expect(host.createConversationFromSession).toHaveBeenCalledWith('fork-session', {
      title: 'Fork: Source Chat',
      messages: [beforeMessage],
      currentNote: 'Daily.md',
      externalContextPaths: ['Projects/Alpha.md'],
    });
    const forkArgs = host.createConversationFromSession.mock.calls[0]?.[1];
    expect(forkArgs?.messages[0]).not.toBe(beforeMessage);
    expect(host.syncActiveTabConversation).toHaveBeenCalledWith(forkConversation);
    expect(port.loadConversation).toHaveBeenCalledWith(forkConversation.id, {
      forceServerSync: false,
    });
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.fork.successCurrentTab'));
  });

  it('forks into a new tab and preserves the active model override', async () => {
    const conversation = createConversation('source-new-tab');
    const targetMessage = createMessage('fork-message');
    conversation.messages = [targetMessage];
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
    });
    tabManager.createTab(conversation);
    tabManager.setActiveTabModelOverride({
      provider: 'openai',
      model: 'gpt-5.4',
    });
    const forkConversation = createConversation('forked-new-tab', 'Forked New Tab');
    const host = createHost(conversation, {
      chooseForkTarget: jest.fn().mockResolvedValue('new-tab'),
      getTabManager: jest.fn(() => tabManager),
      getMaxTabs: jest.fn(() => 1),
      createConversationFromSession: jest.fn().mockResolvedValue(forkConversation),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleForkRequest(targetMessage);

    const forkTab = tabManager.getAllTabs().find((tab) => tab.conversationId === forkConversation.id);
    expect(forkTab).toBeDefined();
    expect(port.activateTab).toHaveBeenCalledWith(forkTab!.id);
    expect(tabManager.getActiveTabModelOverride()).toEqual({
      provider: 'openai',
      model: 'gpt-5.4',
    });
    expect(host.updateModelSelectorDisplay).toHaveBeenCalledTimes(1);
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.fork.successNewTab'));
  });

  it('forks into the current tab when tabs are disabled even if new-tab was chosen', async () => {
    const conversation = createConversation('source-tabs-disabled');
    const targetMessage = createMessage('fork-message-disabled');
    conversation.messages = [targetMessage];
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 4,
      areTabsEnabled: () => false,
    });
    tabManager.createTab(conversation);
    const forkConversation = createConversation('forked-tabs-disabled', 'Forked Without Tabs');
    const host = createHost(conversation, {
      chooseForkTarget: jest.fn().mockResolvedValue('new-tab'),
      getTabManager: jest.fn(() => tabManager),
      createConversationFromSession: jest.fn().mockResolvedValue(forkConversation),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleForkRequest(targetMessage);

    expect(tabManager.getAllTabs()).toHaveLength(1);
    expect(host.syncActiveTabConversation).toHaveBeenCalledWith(forkConversation);
    expect(port.loadConversation).toHaveBeenCalledWith(forkConversation.id, {
      forceServerSync: false,
    });
    expect(port.activateTab).not.toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.fork.successCurrentTab'));
  });

  it('cleans up the forked conversation when the new-tab target exceeds max tabs', async () => {
    const conversation = createConversation('source-max');
    const targetMessage = createMessage('fork-message-max');
    conversation.messages = [targetMessage];
    const tabManager = new TabManager('New chat', {
      getMaxTabs: () => 1,
    });
    tabManager.createTab(conversation);
    const forkConversation = createConversation('forked-overflow');
    const host = createHost(conversation, {
      chooseForkTarget: jest.fn().mockResolvedValue('new-tab'),
      getTabManager: jest.fn(() => tabManager),
      getMaxTabs: jest.fn(() => 1),
      createConversationFromSession: jest.fn().mockResolvedValue(forkConversation),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleForkRequest(targetMessage);

    expect(host.deleteConversation).toHaveBeenCalledWith(forkConversation.id);
    expect(port.activateTab).not.toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith(
      t('chat.fork.maxTabsReached', { count: '1' }),
    );
  });

  it('preserves the source conversation backend when forking a claude-code conversation', async () => {
    const claudeConversation = createBackendConversation('claude-source', 'claude-code', 'Claude Chat');
    const beforeMessage = createMessage('msg-before', {
      content: 'Before fork',
      sourceMessageId: 'before-source',
    });
    const targetMessage = createMessage('msg-target', {
      content: 'Fork target',
      sourceMessageId: 'target-source',
    });
    claudeConversation.messages = [beforeMessage, targetMessage];
    claudeConversation.currentNote = 'Daily.md';
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    tabManager.createTab(claudeConversation);
    const forkConversation = createBackendConversation('forked-claude', 'claude-code', 'Forked');
    const host = createHost(claudeConversation, {
      getTabManager: jest.fn(() => tabManager),
      createConversationFromSession: jest.fn().mockResolvedValue(forkConversation),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.handleForkRequest(targetMessage);

    expect(host.forkSession).toHaveBeenCalledWith(
      'claude-source-claude-code-session',
      'target-source',
    );
    expect(host.createConversationFromSession).toHaveBeenCalledWith('fork-session', {
      title: 'Fork: Claude Chat',
      messages: [beforeMessage],
      currentNote: 'Daily.md',
      backend: 'claude-code',
    });
  });
});

describe('createConversationLoadRecoveryHost factory', () => {
  const mockApp = {} as never;

  function createFactoryDeps(
    overrides: Partial<ConversationLoadRecoveryHostDependencies> = {},
  ): ConversationLoadRecoveryHostDependencies {
    return {
      isActiveTabStreaming: jest.fn(() => false),
      getCurrentConversation: jest.fn(() => createConversation('factory-test')),
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
      getActiveBackend: jest.fn(() => 'opencode'),
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates isActiveTabStreaming to the provided dependency', () => {
    const deps = createFactoryDeps({ isActiveTabStreaming: jest.fn(() => true) });
    const host = createConversationLoadRecoveryHost(deps);

    expect(host.isActiveTabStreaming()).toBe(true);
    expect(deps.isActiveTabStreaming).toHaveBeenCalledTimes(1);
  });

  it('delegates getCurrentConversation to the provided dependency', () => {
    const conversation = createConversation('factory-conv');
    const deps = createFactoryDeps({ getCurrentConversation: jest.fn(() => conversation) });
    const host = createConversationLoadRecoveryHost(deps);

    expect(host.getCurrentConversation()).toBe(conversation);
    expect(deps.getCurrentConversation).toHaveBeenCalledTimes(1);
  });

  it('delegates revertSession with the correct arguments', async () => {
    const revertSession = jest.fn().mockResolvedValue(true);
    const deps = createFactoryDeps({ revertSession });
    const host = createConversationLoadRecoveryHost(deps);

    const result = await host.revertSession('session-1', 'message-1');
    expect(result).toBe(true);
    expect(revertSession).toHaveBeenCalledWith('session-1', 'message-1');
  });

  it('delegates createConversationFromSession with initial state', async () => {
    const forked = createConversation('forked-from-factory');
    const createFromSession = jest.fn().mockResolvedValue(forked);
    const deps = createFactoryDeps({ createConversationFromSession: createFromSession });
    const host = createConversationLoadRecoveryHost(deps);

    const initial = { title: 'Test', messages: [] };
    const result = await host.createConversationFromSession('session-id', initial);
    expect(result).toBe(forked);
    expect(createFromSession).toHaveBeenCalledWith('session-id', initial);
  });

  it('delegates persistTabState with options', () => {
    const persistTabState = jest.fn();
    const deps = createFactoryDeps({ persistTabState });
    const host = createConversationLoadRecoveryHost(deps);

    host.persistTabState({ flush: true });
    expect(persistTabState).toHaveBeenCalledWith({ flush: true });
  });

  it('resets persisted tab state by calling setPersistedTabState with default state', () => {
    const setPersistedTabState = jest.fn();
    const deps = createFactoryDeps({ setPersistedTabState });
    const host = createConversationLoadRecoveryHost(deps);

    host.resetPersistedTabState();
    expect(setPersistedTabState).toHaveBeenCalledTimes(1);
    const calledWith = setPersistedTabState.mock.calls[0]![0];
    expect(calledWith).toEqual({ tabs: [], activeTabIndex: 0 });
  });
});

describe('ConversationLoadRecoveryCoordinator Codex provisional warning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createCodexConversation(id: string, sessionId: string): Conversation {
    return {
      id,
      title: `Codex ${id}`,
      createdAt: 1,
      updatedAt: 1,
      backend: 'codex',
      backendSessionId: sessionId,
      messages: [],
    };
  }

  it('shows a persistent warning when loading a Codex conversation with a provisional session id', async () => {
    const conversation = createCodexConversation('codex-prov', 'codex-local-abc-123');
    const host = createHost(conversation, {
      getActiveBackend: jest.fn(() => 'codex'),
      appendPersistentNotice: jest.fn().mockResolvedValue(undefined),
      hasMatchingPersistentNotice: jest.fn(() => false),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.loadConversation(conversation.id);

    expect(host.appendPersistentNotice).toHaveBeenCalledWith(expect.objectContaining({
      title: t('chat.codex.provisionalWarning.title'),
      content: t('chat.codex.provisionalWarning.description'),
      tone: 'warning',
      conversation,
    }));
  });

  it('does not show a warning when loading a Codex conversation with a real thread id', async () => {
    const conversation = createCodexConversation('codex-real', 'thread_abc123');
    const host = createHost(conversation, {
      getActiveBackend: jest.fn(() => 'codex'),
      appendPersistentNotice: jest.fn().mockResolvedValue(undefined),
      hasMatchingPersistentNotice: jest.fn(() => false),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.loadConversation(conversation.id);

    expect(host.appendPersistentNotice).not.toHaveBeenCalled();
  });

  it('does not show a warning for non-Codex backends', async () => {
    const conversation = createBackendConversation('opencode-conv', 'opencode');
    const host = createHost(conversation, {
      appendPersistentNotice: jest.fn().mockResolvedValue(undefined),
      hasMatchingPersistentNotice: jest.fn(() => false),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.loadConversation(conversation.id);

    expect(host.appendPersistentNotice).not.toHaveBeenCalled();
  });

  it('does not duplicate the warning if it already exists', async () => {
    const conversation = createCodexConversation('codex-dup', 'codex-local-dup-123');
    const host = createHost(conversation, {
      getActiveBackend: jest.fn(() => 'codex'),
      appendPersistentNotice: jest.fn().mockResolvedValue(undefined),
      hasMatchingPersistentNotice: jest.fn(() => true),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.loadConversation(conversation.id);

    expect(host.appendPersistentNotice).not.toHaveBeenCalled();
    expect(host.hasMatchingPersistentNotice).toHaveBeenCalledWith(
      t('chat.codex.provisionalWarning.title'),
      t('chat.codex.provisionalWarning.description'),
      'warning',
      conversation,
    );
  });

  it('shows a persistent warning when activating a tab with a provisional Codex session', async () => {
    const conversation = createCodexConversation('codex-tab', 'codex-local-tab-123');
    const host = createHost(conversation, {
      getActiveBackend: jest.fn(() => 'codex'),
      appendPersistentNotice: jest.fn().mockResolvedValue(undefined),
      hasMatchingPersistentNotice: jest.fn(() => false),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.activateTab('tab-1');

    expect(host.appendPersistentNotice).toHaveBeenCalledWith(expect.objectContaining({
      title: t('chat.codex.provisionalWarning.title'),
      content: t('chat.codex.provisionalWarning.description'),
      tone: 'warning',
      conversation,
    }));
  });

  it('does not show a warning when activating a tab with a real Codex thread id', async () => {
    const conversation = createCodexConversation('codex-tab-real', 'thread_real123');
    const host = createHost(conversation, {
      getActiveBackend: jest.fn(() => 'codex'),
      appendPersistentNotice: jest.fn().mockResolvedValue(undefined),
      hasMatchingPersistentNotice: jest.fn(() => false),
    });
    const port = createPort();
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.activateTab('tab-1');

    expect(host.appendPersistentNotice).not.toHaveBeenCalled();
  });
});
