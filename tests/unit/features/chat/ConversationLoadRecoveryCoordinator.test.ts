import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  ConversationLoadRecoveryCoordinator,
  type ConversationLoadRecoveryHost,
  type ConversationLoadRecoveryPort,
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
    initializeFirstTab: jest.fn().mockResolvedValue(undefined),
    restorePersistedTabs: jest.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe('ConversationLoadRecoveryCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates bootstrap methods to the existing load/recovery ports', async () => {
    const conversation = createConversation('bootstrap');
    const host = createHost(conversation);
    const port = createPort({
      restorePersistedTabs: jest.fn().mockReturnValue('tab-restored'),
    });
    const coordinator = new ConversationLoadRecoveryCoordinator(host, port);

    await coordinator.createConversationInNewTab();
    await coordinator.createConversationInCurrentTab();
    await coordinator.loadConversation(conversation.id, { preserveScrollPosition: true });
    await coordinator.deleteConversationsAndRecover([conversation.id]);
    await coordinator.deleteAllConversationsAndReset([conversation.id]);
    await coordinator.initializeFirstTab();
    const restoredTabId = coordinator.restorePersistedTabs();

    expect(port.createConversationInNewTab).toHaveBeenCalledTimes(1);
    expect(port.createConversationInCurrentTab).toHaveBeenCalledTimes(1);
    expect(port.loadConversation).toHaveBeenCalledWith(conversation.id, {
      preserveScrollPosition: true,
    });
    expect(port.deleteConversationsAndRecover).toHaveBeenCalledWith([conversation.id]);
    expect(port.deleteAllConversationsAndReset).toHaveBeenCalledWith([conversation.id]);
    expect(port.initializeFirstTab).toHaveBeenCalledTimes(1);
    expect(restoredTabId).toBe('tab-restored');
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
});
