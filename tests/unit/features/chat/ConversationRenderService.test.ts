import {
  captureElementScrollRestoreSnapshot,
  ConversationRenderService,
  createConversation,
  createHost,
  createMessage,
  getIncrementalRenderedMessageUpdate,
  restoreElementScrollAfterRender,
} from './ConversationRenderService.testSupport';

describe('getIncrementalRenderedMessageUpdate', () => {
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
});

describe('ConversationRenderService render flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the empty conversation notice when a rewind leaves no messages', async () => {
    const host = createHost({
      shouldRenderEmptyConversationNotice: jest.fn().mockReturnValue(true),
    });
    const service = new ConversationRenderService(host);

    await service.renderMessages([]);

    expect(host.createEmptyConversationNoticeMessage).toHaveBeenCalledTimes(1);
    expect(host.assistantShellRender.renderPersistedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'opencodian-empty-rewind',
        displayStyle: 'notice',
      }),
    );
  });

  it('rerenders stored user messages through the shared user render hooks', async () => {
    const host = createHost();
    const messageEl = document.createElement('div');
    messageEl.className = 'opencodian-message opencodian-message--user';
    messageEl.dataset.messageId = 'user-1';
    messageEl.dataset.sourceMessageId = 'source-1';
    const staleContentEl = document.createElement('div');
    staleContentEl.className = 'opencodian-message-content';
    staleContentEl.textContent = 'stale';
    messageEl.appendChild(staleContentEl);
    host.messagesEl.appendChild(messageEl);
    const updatedMessage = createMessage({
      id: 'user-2',
      role: 'user',
      content: 'Updated user text',
    });
    const service = new ConversationRenderService(host);

    await service.rerenderSingleUserMessage('user-1', updatedMessage);

    expect(host.renderUserMessageContent).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      updatedMessage,
    );
    expect(host.addUserMessageFooter).toHaveBeenCalledWith(
      messageEl,
      updatedMessage,
      updatedMessage.content,
    );
    expect(messageEl.dataset.messageId).toBe('user-2');
    expect(messageEl.dataset.sourceMessageId).toBeUndefined();
    expect(messageEl.querySelector('.opencodian-message-content')?.textContent).toBe(
      updatedMessage.content,
    );
  });

  it('appends rendered messages without forcing a full rerender', async () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];
    const appendedMessage = createMessage({
      id: 'assistant-2',
      content: 'Hello there',
      contentBlocks: [{ type: 'thinking', thinking: 'step' }],
    });
    const nextMessages = [...previousMessages, appendedMessage];
    const conversation = createConversation(nextMessages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.applySyncedConversationUpdate(previousMessages, nextMessages);

    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(conversation);
    expect(host.assistantShellRender.renderPersistedMessage).toHaveBeenCalledWith(appendedMessage);
    expect(host.clearMessagesContainer).not.toHaveBeenCalled();
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
    });
    const service = new ConversationRenderService(host);

    await service.applySyncedConversationUpdate(previousMessages, nextMessages);

    expect(host.assistantShellRender.createAssistantMessageElement).toHaveBeenCalledTimes(1);
    expect(host.renderMarkdownInto).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      appendedMessage.content,
    );
    expect(host.assistantShellRender.finalizePseudoStreamFooter).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      appendedMessage,
    );
    expect(host.assistantShellRender.renderPersistedMessage).not.toHaveBeenCalled();
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
    expect(host.createUserMessageFrame).toHaveBeenCalledWith(messages[0]);
    expect(host.assistantShellRender.renderPersistedMessage).toHaveBeenCalledWith(messages[1]);
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledTimes(1);
    expect(captureElementScrollRestoreSnapshot).toHaveBeenCalledWith(host.messagesEl, false, 120);
    expect(restoreElementScrollAfterRender).toHaveBeenCalled();
    expect(host.syncPaneScrollMetrics).toHaveBeenCalledWith('tab-1', host.messagesEl);
    expect(host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);
    expect(host.endConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(host.messagesEl.classList.contains('is-rehydrating')).toBe(false);
  });
});
