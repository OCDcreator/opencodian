import {
  ConversationRenderService,
  createHost,
  createMessage,
} from './ConversationRenderService.testSupport';

function collectMessageIds(messagesEl: HTMLElement): string[] {
  return Array.from(
    messagesEl.querySelectorAll<HTMLElement>('.opencodian-message[data-message-id]'),
  ).map((el) => el.dataset.messageId ?? '');
}

describe('ConversationRenderService rerender serialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('coalesces two same-tick rerenders into a single rebuild with unique message ids', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const conversation = host.getCurrentConversation();
    conversation.messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Question' }),
      createMessage({ id: 'assistant-1', role: 'assistant', content: 'Answer' }),
    ];

    await Promise.all([
      service.rerenderConversationMessages(conversation),
      service.rerenderConversationMessages(conversation),
    ]);

    const ids = collectMessageIds(host.messagesEl);
    expect(ids).toEqual(['user-1', 'assistant-1']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);
  });

  it('serializes a rerender requested mid-flight instead of interleaving appends', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const conversation = host.getCurrentConversation();
    conversation.messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Q1' }),
      createMessage({ id: 'assistant-1', role: 'assistant', content: 'A1' }),
      createMessage({ id: 'user-2', role: 'user', content: 'Q2' }),
      createMessage({ id: 'assistant-2', role: 'assistant', content: 'A2' }),
    ];

    const events: string[] = [];
    host.clearMessagesContainer.mockImplementation(() => {
      events.push('clear');
      host.messagesEl.replaceChildren();
    });
    host.createUserMessageFrame.mockImplementation((message) => {
      events.push(`append:${message.id}`);
      const messageEl = document.createElement('div');
      messageEl.className = `opencodian-message opencodian-message--${message.role}`;
      messageEl.dataset.messageId = message.id;
      const contentEl = document.createElement('div');
      contentEl.className = 'opencodian-message-content';
      messageEl.appendChild(contentEl);
      host.messagesEl.appendChild(messageEl);
      return { messageEl, contentEl };
    });

    let releaseFirstAssistantRender: () => void = () => undefined;
    const firstAssistantGate = new Promise<void>((resolve) => {
      releaseFirstAssistantRender = resolve;
    });
    let firstAssistantRenderSeen = false;
    host.assistantShellRender.renderPersistedMessage.mockImplementation(async (message) => {
      if (message.id === 'assistant-1' && !firstAssistantRenderSeen) {
        firstAssistantRenderSeen = true;
        await firstAssistantGate;
      }
      events.push(`append:${message.id}`);
      const messageEl = document.createElement('div');
      messageEl.className = 'opencodian-message opencodian-message--assistant';
      messageEl.dataset.messageId = message.id;
      const contentEl = document.createElement('div');
      contentEl.className = 'opencodian-message-content';
      messageEl.appendChild(contentEl);
      host.messagesEl.appendChild(messageEl);
      return messageEl;
    });

    const first = service.rerenderConversationMessages(conversation);
    // Wait until the first rerender is blocked inside the assistant-1 render.
    while (!firstAssistantRenderSeen) {
      await Promise.resolve();
    }

    const second = service.rerenderConversationMessages(conversation);
    releaseFirstAssistantRender();
    await Promise.all([first, second]);

    const ids = collectMessageIds(host.messagesEl);
    expect(ids).toEqual(['user-1', 'assistant-1', 'user-2', 'assistant-2']);
    expect(new Set(ids).size).toBe(ids.length);
    // The superseded pass never commits its detached staging tree; only the
    // owning pass clears/replaces the live pane.
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(events).toContain('clear');
  });

  it('keeps the live pane intact while deferred history renders off-DOM, then commits atomically', async () => {
    const live = document.createElement('div');
    live.dataset.messageId = 'live-history';
    const host = createHost();
    let releaseMarkdown: () => void = () => undefined;
    const markdownGate = new Promise<void>((resolve) => { releaseMarkdown = resolve; });
    host.assistantShellRender.renderPersistedMessage.mockImplementation(async (message) => {
      const messageEl = document.createElement('div');
      messageEl.className = 'opencodian-message opencodian-message--assistant';
      messageEl.dataset.messageId = message.id;
      host.messagesEl.appendChild(messageEl);
      await markdownGate;
      return messageEl;
    });
    host.messagesEl.appendChild(live);
    const conversation = host.getCurrentConversation();
    conversation.messages = [createMessage({ id: 'hydrated-1', content: 'Hydrated' })];

    const pending = new ConversationRenderService(host).rerenderConversationMessages(conversation);
    await Promise.resolve();
    expect(host.messagesEl.querySelector('[data-message-id="live-history"]')).not.toBeNull();
    expect(host.messagesEl.querySelector('[data-message-id="hydrated-1"]')).toBeNull();
    releaseMarkdown();
    await pending;
    expect(host.messagesEl.querySelector('[data-message-id="live-history"]')).toBeNull();
    expect(host.messagesEl.querySelector('[data-message-id="hydrated-1"]')).not.toBeNull();
  });

  it('discards a staged pass when conversation ownership is lost', async () => {
    const host = createHost();
    const old = document.createElement('div');
    old.dataset.messageId = 'old-live';
    host.messagesEl.appendChild(old);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    host.assistantShellRender.renderPersistedMessage.mockImplementation(async (message) => {
      const el = document.createElement('div');
      el.dataset.messageId = message.id;
      host.messagesEl.appendChild(el);
      await gate;
      return el;
    });
    const conversation = host.getCurrentConversation();
    conversation.messages = [createMessage({ id: 'staged-old' })];
    const pending = new ConversationRenderService(host).rerenderConversationMessages(conversation);
    await Promise.resolve();
    host.getCurrentConversation.mockReturnValue({ ...conversation, id: 'new-conversation' });
    release();
    await pending;
    expect(host.messagesEl.querySelector('[data-message-id="old-live"]')).not.toBeNull();
    expect(host.messagesEl.querySelector('[data-message-id="staged-old"]')).toBeNull();
    expect(host.clearMessagesContainer).not.toHaveBeenCalled();
  });

  it('runs a later rerender after the previous one completes', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const conversation = host.getCurrentConversation();
    conversation.messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Question' }),
      createMessage({ id: 'assistant-1', role: 'assistant', content: 'Answer' }),
    ];

    await service.rerenderConversationMessages(conversation);
    await service.rerenderConversationMessages(conversation);

    const ids = collectMessageIds(host.messagesEl);
    expect(ids).toEqual(['user-1', 'assistant-1']);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });
});
