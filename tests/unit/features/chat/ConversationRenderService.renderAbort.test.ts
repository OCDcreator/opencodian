import {
  ConversationRenderService,
  createHost,
  createMessage,
} from './ConversationRenderService.testSupport';

describe('ConversationRenderService hydration render continuation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stops rendering remaining messages once shouldContinueRender turns false', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Q1' }),
      createMessage({ id: 'assistant-1', role: 'assistant', content: 'A1' }),
      createMessage({ id: 'user-2', role: 'user', content: 'Q2' }),
    ];

    await service.renderMessages(messages, {
      shouldContinueRender: () => host.messagesEl.children.length === 0,
    });

    expect(host.messagesEl.querySelectorAll('.opencodian-message')).toHaveLength(1);
  });
});

describe('ConversationRenderService pseudo-stream reveal abort', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stops the reveal when the messages container is cleared mid-reveal', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const conversation = host.getCurrentConversation();
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Question' }),
    ];
    const syncedAssistant = createMessage({
      id: 'assistant-2',
      role: 'assistant',
      content: '一。二。三。四。五。六。七。八。九。十。十一。十二。',
    });
    conversation.messages = [...previousMessages, syncedAssistant];

    let markdownCalls = 0;
    host.renderMarkdownInto.mockImplementation(async (contentEl, markdown) => {
      markdownCalls += 1;
      contentEl.textContent = markdown;
      if (markdownCalls === 2) {
        // Simulate a concurrent hydration/rerender clearing the pane mid-reveal.
        host.clearMessagesContainer();
      }
    });

    await service.applySyncedConversationUpdate(previousMessages, conversation.messages);

    expect(markdownCalls).toBeLessThanOrEqual(3);
    expect(host.assistantShellRender.finalizePseudoStreamFooter).not.toHaveBeenCalled();
  });

  it('drops an incremental append when a newer render surface pass starts while patching', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const conversation = host.getCurrentConversation();
    const previous = [
      createMessage({ id: 'user-1', role: 'user', content: 'Question' }),
      createMessage({ id: 'assistant-1', role: 'assistant', content: 'Before' }),
    ];
    const next = [
      previous[0],
      createMessage({ id: 'assistant-1', role: 'assistant', content: 'After' }),
      createMessage({ id: 'user-2', role: 'user', content: 'Follow-up' }),
    ];
    conversation.messages = next;

    let releasePatch: () => void = () => undefined;
    const patchGate = new Promise<void>((resolve) => { releasePatch = resolve; });
    jest.spyOn(service, 'patchTrailingAssistantRender').mockImplementation(async () => {
      await patchGate;
      return true;
    });

    const update = service.applySyncedConversationUpdate(previous, next);
    await Promise.resolve();
    // A full/load render starts on the same pane while the incremental patch awaits.
    const newerPass = service.renderMessages([]);
    releasePatch();
    await Promise.all([update, newerPass]);

    expect(host.messagesEl.querySelector('[data-message-id="user-2"]')).toBeNull();
  });

  it('does not apply incremental updates while a full rerender owns the pane lease', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const conversation = host.getCurrentConversation();
    const previous = [
      createMessage({ id: 'user-1', role: 'user', content: 'Question' }),
      createMessage({ id: 'assistant-1', role: 'assistant', content: 'Answer' }),
    ];
    const next = [...previous, createMessage({ id: 'user-2', role: 'user', content: 'Follow-up' })];
    conversation.messages = next;

    let releaseFull: () => void = () => undefined;
    const fullGate = new Promise<void>((resolve) => { releaseFull = resolve; });
    host.assistantShellRender.renderPersistedMessage.mockImplementation(async (message) => {
      await fullGate;
      const el = document.createElement('div');
      el.className = 'opencodian-message';
      el.dataset.messageId = message.id;
      host.messagesEl.appendChild(el);
      return el;
    });
    host.beginConversationHydration.mockImplementation(() => {
      host.scrollRuntime.isHydratingConversation = true;
    });
    host.endConversationHydration.mockImplementation(() => {
      host.scrollRuntime.isHydratingConversation = false;
    });
    const patchSpy = jest.spyOn(service, 'patchTrailingAssistantRender');

    const full = service.rerenderConversationMessages(conversation);
    while (host.assistantShellRender.renderPersistedMessage.mock.calls.length === 0) {
      await Promise.resolve();
    }
    await service.applySyncedConversationUpdate(previous, next);
    releaseFull();
    await full;

    expect(patchSpy).not.toHaveBeenCalled();
  });
});
