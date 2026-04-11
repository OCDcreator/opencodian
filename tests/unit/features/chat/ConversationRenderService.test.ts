jest.mock('../../../../src/features/chat/services/ScrollManager', () => {
  const actual = jest.requireActual('../../../../src/features/chat/services/ScrollManager');
  return {
    ...actual,
    captureElementScrollRestoreSnapshot: jest.fn(() => ({
      mode: 'preserve-distance',
      scrollTop: 120,
      distanceFromBottom: 40,
      anchorMessageId: null,
      anchorOffsetTop: 0,
    })),
    restoreElementScrollAfterRender: jest.fn((_messagesEl, _snapshot, options) => {
      options?.onRestored?.(120);
    }),
    isElementNearBottom: jest.fn(() => false),
  };
});

import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  type ConversationRenderHost,
  ConversationRenderService,
  getIncrementalRenderedMessageUpdate,
} from '../../../../src/features/chat/services/ConversationRenderService';
import {
  captureElementScrollRestoreSnapshot,
  restoreElementScrollAfterRender,
} from '../../../../src/features/chat/services/ScrollManager';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

function createConversation(messages: ChatMessage[]): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

type MockedConversationRenderHost = {
  [Key in keyof ConversationRenderHost]:
    ConversationRenderHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationRenderHost[Key];
};

function createHost(
  overrides: Partial<MockedConversationRenderHost> = {},
): MockedConversationRenderHost & {
  messagesEl: HTMLElement;
  renderRuntime: { currentTurnBodyEl: HTMLElement | null };
  scrollRuntime: { autoScrollEnabled: boolean; programmaticScrollGuardUntil: number };
} {
  const messagesEl = document.createElement('div');
  Object.defineProperty(messagesEl, 'scrollTop', {
    value: 120,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(messagesEl, 'scrollHeight', {
    value: 600,
    configurable: true,
  });
  Object.defineProperty(messagesEl, 'clientHeight', {
    value: 300,
    configurable: true,
  });

  const scrollRuntime = {
    autoScrollEnabled: false,
    programmaticScrollGuardUntil: 0,
  };
  const renderRuntime = {
    currentTurnBodyEl: null,
  };
  const conversation = createConversation([]);

  return {
    messagesEl,
    renderRuntime,
    scrollRuntime,
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
    getMessagesContainer: jest.fn().mockReturnValue(messagesEl),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    getScrollRuntimeForTab: jest.fn().mockReturnValue(scrollRuntime),
    getRenderRuntimeForTab: jest.fn().mockReturnValue(renderRuntime),
    clearScheduledScrollToBottom: jest.fn(),
    beginConversationHydration: jest.fn(),
    endConversationHydration: jest.fn(),
    clearMessagesContainer: jest.fn().mockImplementation(() => {
      messagesEl.replaceChildren();
    }),
    resetTurnState: jest.fn(),
    renderMessages: jest.fn().mockResolvedValue(undefined),
    renderMessage: jest.fn().mockResolvedValue(undefined),
    renderSyncedAssistantMessageWithReveal: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    shouldAutoScroll: jest.fn().mockReturnValue(false),
    scrollToBottom: jest.fn(),
    syncPaneScrollMetrics: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    requestAnimationFrame: jest.fn().mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
    getMessagesForRender: jest.fn().mockImplementation((messages: ChatMessage[]) => messages),
    getMessageVisualSignature: jest.fn().mockImplementation((message: ChatMessage) => JSON.stringify({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      displayStyle: message.displayStyle ?? null,
      streamState: message.streamState ?? null,
      contentBlocks: message.contentBlocks ?? null,
    })),
    getAssistantBodySignature: jest.fn().mockImplementation((message: ChatMessage) => JSON.stringify({
      content: message.content,
      displayStyle: message.displayStyle ?? null,
      contentBlocks: message.contentBlocks ?? null,
    })),
    shouldPseudoStreamSyncedAssistantMessage: jest.fn().mockReturnValue(false),
    renderAssistantMessageContent: jest.fn().mockImplementation(
      async (_messageEl: HTMLElement, contentEl: HTMLElement, message: ChatMessage) => {
        contentEl.textContent = message.content;
      },
    ),
    updateAssistantTimestamp: jest.fn(),
    logAssistantFinalizationDebug: jest.fn(),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) =>
      message
        ? {
          id: message.id,
          role: message.role,
        }
        : null),
    ...overrides,
  };
}

function appendAssistantTail(messagesEl: HTMLElement, content = 'Hello'): HTMLElement {
  const messageEl = document.createElement('div');
  messageEl.className = 'opencodian-message opencodian-message--assistant';
  messageEl.dataset.messageId = 'message-1';
  const contentEl = document.createElement('div');
  contentEl.className = 'opencodian-message-content';
  contentEl.textContent = content;
  messageEl.appendChild(contentEl);
  messagesEl.appendChild(messageEl);
  return messageEl;
}

describe('ConversationRenderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when rendered messages shrink', () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const nextMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: (message) => JSON.stringify(message),
    });

    expect(result).toBeNull();
  });

  it('returns null when a non-tail rendered signature changes', () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const nextMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Changed' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: (message) => JSON.stringify(message),
    });

    expect(result).toBeNull();
  });

  it('appends rendered messages without forcing a full rerender', async () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];
    const appendedMessage = createMessage({ id: 'assistant-2', content: 'Hello there' });
    const nextMessages = [...previousMessages, appendedMessage];
    const conversation = createConversation(nextMessages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.applySyncedConversationUpdate(previousMessages, nextMessages);

    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(conversation);
    expect(host.renderMessage).toHaveBeenCalledWith(appendedMessage);
    expect(host.renderMessages).not.toHaveBeenCalled();
  });

  it('patches a trailing assistant timestamp without forcing a full rerender', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Stable answer', timestamp: 2 }),
    ];
    const conversation = createConversation(nextMessages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const tailEl = appendAssistantTail(host.messagesEl);
    const service = new ConversationRenderService(host);

    await service.applySyncedConversationUpdate(previousMessages, nextMessages);

    expect(host.updateAssistantTimestamp).toHaveBeenCalledWith(tailEl, nextMessages[0]);
    expect(host.renderAssistantMessageContent).not.toHaveBeenCalled();
    expect(host.renderMessages).not.toHaveBeenCalled();
    expect(tailEl.dataset.messageId).toBe('assistant-2');
  });

  it('falls back to a full rerender when trailing assistant patching fails', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Stable answer', timestamp: 2 }),
    ];
    const conversation = createConversation(nextMessages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const brokenTailEl = document.createElement('div');
    brokenTailEl.className = 'opencodian-message opencodian-message--assistant';
    host.messagesEl.appendChild(brokenTailEl);
    const service = new ConversationRenderService(host);

    await service.applySyncedConversationUpdate(previousMessages, nextMessages);

    expect(host.renderMessages).toHaveBeenCalledWith(nextMessages);
    expect(host.beginConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(host.endConversationHydration).toHaveBeenCalledWith('tab-1');
  });

  it('uses pseudo-stream reveal for appended synced text assistants', async () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];
    const appendedMessage = createMessage({ id: 'assistant-2', content: 'Reveal me' });
    const nextMessages = [...previousMessages, appendedMessage];
    const conversation = createConversation(nextMessages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      shouldPseudoStreamSyncedAssistantMessage: jest.fn().mockImplementation(
        (message: ChatMessage) => message.id === 'assistant-2',
      ),
    });
    const service = new ConversationRenderService(host);

    await service.applySyncedConversationUpdate(previousMessages, nextMessages);

    expect(host.renderSyncedAssistantMessageWithReveal).toHaveBeenCalledWith(appendedMessage);
    expect(host.renderMessage).not.toHaveBeenCalled();
  });

  it('preserves hydration, scroll restore, and layout sync during full rerenders', async () => {
    const messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);

    expect(host.beginConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(host.clearScheduledScrollToBottom).toHaveBeenCalledTimes(1);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(host.resetTurnState).toHaveBeenCalledTimes(1);
    expect(host.renderMessages).toHaveBeenCalledWith(messages);
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledTimes(1);
    expect(captureElementScrollRestoreSnapshot).toHaveBeenCalledWith(host.messagesEl, false, 120);
    expect(restoreElementScrollAfterRender).toHaveBeenCalled();
    expect(host.syncPaneScrollMetrics).toHaveBeenCalledWith('tab-1', host.messagesEl);
    expect(host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);
    expect(host.endConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(host.messagesEl.classList.contains('is-rehydrating')).toBe(false);
  });
});
