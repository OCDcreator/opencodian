import {
  appendAssistantTail,
  type ChatMessage,
  ConversationRenderService,
  createConversation,
  createHost,
  createMessage,
} from './ConversationRenderService.testSupport';

describe('ConversationRenderService trailing assistant updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finalizes a stable trailing assistant footer without forcing a full rerender', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Stable answer', timestamp: 2, streamState: 'interrupted' }),
    ];
    const conversation = createConversation(nextMessages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const tailEl = appendAssistantTail(host.messagesEl);
    const service = new ConversationRenderService(host);

    await service.applySyncedConversationUpdate(previousMessages, nextMessages);

    expect(host.assistantTailRender.finalizePersistedFooter).toHaveBeenCalledWith(tailEl, nextMessages[0]);
    expect(host.assistantTailRender.renderMessageBody).not.toHaveBeenCalled();
    expect(host.clearMessagesContainer).not.toHaveBeenCalled();
    expect(tailEl.dataset.messageId).toBe('assistant-2');
  });

  it('re-renders trailing assistant content when the body signature changes', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 2 }),
    ];
    const host = createHost();
    const tailEl = appendAssistantTail(host.messagesEl, 'Stable answer');
    const contentEl = tailEl.querySelector('.opencodian-message-content');
    if (!(contentEl instanceof HTMLElement)) {
      throw new Error('expected assistant content element');
    }
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(true);
    expect(host.assistantTailRender.renderMessageBody).toHaveBeenCalledWith(
      contentEl,
      nextMessages[0],
    );
    expect(host.assistantTailRender.finalizePersistedFooter).not.toHaveBeenCalled();
    expect(contentEl.textContent).toBe('Updated answer');
  });

  it('temporarily swaps the current turn body during trailing assistant content patching', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 2 }),
    ];
    const renderMessageBody = jest.fn().mockImplementation(
      async (contentEl: HTMLElement, message: ChatMessage) => {
        expect(host.renderRuntime.currentTurnBodyEl).toBe(host.messagesEl);
        contentEl.textContent = message.content;
      },
    );
    const host = createHost({
      assistantTailRender: {
        renderMessageBody,
      },
    });
    const previousTurnBodyEl = document.createElement('div');
    host.renderRuntime.currentTurnBodyEl = previousTurnBodyEl;
    appendAssistantTail(host.messagesEl, 'Stable answer');
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(true);
    expect(host.renderRuntime.currentTurnBodyEl).toBe(previousTurnBodyEl);
  });

  it('restores the patched turn body when no previous turn body exists', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 2 }),
    ];
    const transientTurnBodyEl = document.createElement('div');
    const renderMessageBody = jest.fn().mockImplementation(
      async (contentEl: HTMLElement, message: ChatMessage) => {
        expect(host.renderRuntime.currentTurnBodyEl).toBe(host.messagesEl);
        host.renderRuntime.currentTurnBodyEl = transientTurnBodyEl;
        contentEl.textContent = message.content;
      },
    );
    const host = createHost({
      assistantTailRender: {
        renderMessageBody,
      },
    });
    appendAssistantTail(host.messagesEl, 'Stable answer');
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(true);
    expect(host.renderRuntime.currentTurnBodyEl).toBe(host.messagesEl);
  });

  it('restores the current turn body after trailing assistant content patch failures', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 2 }),
    ];
    const renderError = new Error('render failed');
    const renderMessageBody = jest.fn().mockImplementation(async () => {
      expect(host.renderRuntime.currentTurnBodyEl).toBe(host.messagesEl);
      throw renderError;
    });
    const host = createHost({
      assistantTailRender: {
        renderMessageBody,
      },
    });
    const previousTurnBodyEl = document.createElement('div');
    host.renderRuntime.currentTurnBodyEl = previousTurnBodyEl;
    appendAssistantTail(host.messagesEl, 'Stable answer');
    const service = new ConversationRenderService(host);

    await expect(
      service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1'),
    ).rejects.toThrow('render failed');
    expect(host.renderRuntime.currentTurnBodyEl).toBe(previousTurnBodyEl);
  });
});

describe('ConversationRenderService trailing assistant diagnostics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('precomputes trailing assistant completion summaries before patch execution', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 2 }),
    ];
    const renderMessageBody = jest.fn().mockImplementation(
      async (contentEl: HTMLElement, message: ChatMessage) => {
        expect(host.summarizeChatMessageForDebug).toHaveBeenCalledTimes(2);
        expect(host.summarizeChatMessageForDebug).toHaveBeenNthCalledWith(1, previousMessages[0]);
        expect(host.summarizeChatMessageForDebug).toHaveBeenNthCalledWith(2, nextMessages[0]);
        contentEl.textContent = message.content;
      },
    );
    const host = createHost({
      assistantTailRender: {
        renderMessageBody,
      },
    });
    appendAssistantTail(host.messagesEl, 'Stable answer');
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(true);
    expect(host.summarizeChatMessageForDebug).toHaveBeenCalledTimes(2);
  });

  it('logs trailing assistant patch completion with summarized tail payloads', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 2 }),
    ];
    const host = createHost({
      shouldAutoScroll: jest.fn().mockReturnValue(true),
      summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) =>
        message
          ? {
            id: message.id,
            content: message.content,
          }
          : null),
    });
    appendAssistantTail(host.messagesEl, 'Stable answer');
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(true);
    expect(host.logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'patch-trailing-assistant-render-complete',
      {
        tabId: 'tab-1',
        shouldStickToBottom: true,
        previousTail: {
          id: 'assistant-1',
          content: 'Stable answer',
        },
        nextTail: {
          id: 'assistant-2',
          content: 'Updated answer',
        },
      },
    );
  });

  it('applies trailing assistant tail state after patching', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1, sourceMessageId: 'source-1' }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Stable answer', timestamp: 2 }),
    ];
    const host = createHost({
      shouldAutoScroll: jest.fn().mockReturnValue(true),
    });
    const tailEl = appendAssistantTail(host.messagesEl);
    tailEl.dataset.sourceMessageId = 'source-1';
    tailEl.style.animation = 'fade-in 1s';
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(true);
    expect(tailEl.dataset.messageId).toBe('assistant-2');
    expect(tailEl.dataset.sourceMessageId).toBeUndefined();
    expect(tailEl.style.animation).toBe('none');
    expect(host.scrollToBottom).toHaveBeenCalledWith({ tabId: 'tab-1' });
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

    expect(host.beginConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(host.assistantShellRender.renderPersistedMessage).toHaveBeenCalledWith(nextMessages[0]);
    expect(host.endConversationHydration).toHaveBeenCalledWith('tab-1');
  });
});

describe('ConversationRenderService trailing assistant skip paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips trailing assistant patching when the target tab is no longer active', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 2 }),
    ];
    const host = createHost({
      getActiveTabId: jest.fn().mockReturnValue('tab-2'),
    });
    appendAssistantTail(host.messagesEl);
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(false);
    expect(host.assistantTailRender.finalizePersistedFooter).not.toHaveBeenCalled();
    expect(host.assistantTailRender.renderMessageBody).not.toHaveBeenCalled();
  });

  it('logs skipped trailing assistant patch payloads when the messages container is missing', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 2 }),
    ];
    const host = createHost({
      getMessagesContainer: jest.fn().mockReturnValue(null),
    });
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(false);
    expect(host.logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'patch-trailing-assistant-render-skipped',
      {
        reason: 'missing-container-or-inactive-tab',
        tabId: 'tab-1',
        previousRenderedCount: 1,
        nextRenderedCount: 1,
      },
    );
    expect(host.assistantTailRender.finalizePersistedFooter).not.toHaveBeenCalled();
    expect(host.assistantTailRender.renderMessageBody).not.toHaveBeenCalled();
  });

  it('logs skipped trailing assistant patch payloads when rendered message counts mismatch', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 2 }),
    ];
    const host = createHost({
      getMessagesForRender: jest.fn().mockImplementation((messages: ChatMessage[]) =>
        messages.some((message) => message.id === 'assistant-2')
          ? []
          : messages),
    });
    appendAssistantTail(host.messagesEl);
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(false);
    expect(host.logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'patch-trailing-assistant-render-skipped',
      {
        reason: 'rendered-message-count-mismatch',
        tabId: 'tab-1',
        previousRenderedCount: 1,
        nextRenderedCount: 0,
      },
    );
  });

  it('logs skipped trailing assistant patch payloads with non-tail mismatch indices', async () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi', timestamp: 1 }),
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 2 }),
    ];
    const nextMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Changed', timestamp: 3 }),
      createMessage({ id: 'assistant-2', content: 'Updated answer', timestamp: 4 }),
    ];
    const host = createHost();
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(false);
    expect(host.logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'patch-trailing-assistant-render-skipped',
      {
        reason: 'non-tail-message-signature-mismatch',
        tabId: 'tab-1',
        previousRenderedCount: 2,
        nextRenderedCount: 2,
        mismatchIndex: 0,
      },
    );
  });

  it('logs skipped trailing assistant patch payloads with summarized rendered tail messages', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
      createMessage({ id: 'filtered-assistant-1', content: 'Filtered previous tail', timestamp: 2 }),
    ];
    const nextMessages = [
      createMessage({ id: 'user-2', role: 'user', content: 'Follow-up question', timestamp: 3 }),
      createMessage({ id: 'filtered-assistant-2', content: 'Filtered next tail', timestamp: 4 }),
    ];
    const host = createHost({
      getMessagesForRender: jest.fn().mockImplementation((messages: ChatMessage[]) =>
        messages.filter((message) => !message.id.startsWith('filtered-'))),
      summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) =>
        message
          ? {
            id: message.id,
            role: message.role,
            content: message.content,
          }
          : null),
    });
    const service = new ConversationRenderService(host);

    const patched = await service.patchTrailingAssistantRender(previousMessages, nextMessages, 'tab-1');

    expect(patched).toBe(false);
    expect(host.summarizeChatMessageForDebug).toHaveBeenNthCalledWith(1, previousMessages[0]);
    expect(host.summarizeChatMessageForDebug).toHaveBeenNthCalledWith(2, nextMessages[0]);
    expect(host.logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'patch-trailing-assistant-render-skipped',
      {
        reason: 'tail-message-not-mergeable-assistant',
        tabId: 'tab-1',
        previousRenderedCount: 1,
        nextRenderedCount: 1,
        previousTail: {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Stable answer',
        },
        nextTail: {
          id: 'user-2',
          role: 'user',
          content: 'Follow-up question',
        },
      },
    );
  });
});
