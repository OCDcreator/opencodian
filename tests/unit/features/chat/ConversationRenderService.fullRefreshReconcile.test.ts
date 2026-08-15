import {
  type ChatMessage,
  ConversationRenderService,
  createConversation,
  createHost,
  createMessage,
} from './ConversationRenderService.testSupport';

type TestHost = ReturnType<typeof createHost>;

function installTurnStructuredRenderers(host: TestHost): void {
  const createTurnShell = (extraClass = '') => {
    const turnEl = document.createElement('div');
    turnEl.className = `opencodian-turn${extraClass ? ` ${extraClass}` : ''}`;
    const headerEl = document.createElement('div');
    headerEl.className = 'opencodian-turn-header';
    const bodyEl = document.createElement('div');
    bodyEl.className = 'opencodian-turn-body';
    turnEl.append(headerEl, bodyEl);
    host.messagesEl.appendChild(turnEl);
    host.renderRuntime.currentTurnBodyEl = bodyEl;
    return { headerEl, bodyEl };
  };

  host.createUserMessageFrame.mockImplementation((message: ChatMessage) => {
    const { headerEl } = createTurnShell();
    const messageEl = document.createElement('div');
    messageEl.className = `opencodian-message opencodian-message--${message.role}`;
    messageEl.dataset.messageId = message.id;
    const contentEl = document.createElement('div');
    contentEl.className = 'opencodian-message-content';
    messageEl.appendChild(contentEl);
    headerEl.appendChild(messageEl);
    return { messageEl, contentEl };
  });

  host.assistantShellRender.renderPersistedMessage.mockImplementation(
    async (message: ChatMessage) => {
      let bodyEl = host.renderRuntime.stagedTurnBodyEl ?? host.renderRuntime.currentTurnBodyEl;
      if (!bodyEl?.isConnected) {
        bodyEl = createTurnShell('opencodian-turn--assistant-only').bodyEl;
      }
      const messageEl = document.createElement('div');
      messageEl.className = 'opencodian-message opencodian-message--assistant';
      messageEl.dataset.messageId = message.id;
      const contentEl = document.createElement('div');
      contentEl.className = 'opencodian-message-content';
      contentEl.textContent = message.content;
      messageEl.appendChild(contentEl);
      bodyEl.appendChild(messageEl);
      return messageEl;
    },
  );
}

function user(id: string, content = id): ChatMessage {
  return createMessage({ id, role: 'user', content });
}

function assistant(id: string, content = id): ChatMessage {
  return createMessage({ id, role: 'assistant', content });
}

describe('ConversationRenderService full-refresh keyed reconcile', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('preserves unaffected message nodes when a safe local change enters through full refresh', async () => {
    const previous = [user('u-1'), assistant('a-1', 'before'), user('u-2'), assistant('a-2')];
    const conversation = createConversation(previous);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    document.body.appendChild(host.messagesEl);
    installTurnStructuredRenderers(host);
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    const previousNodes = new Map(
      Array.from(host.messagesEl.querySelectorAll<HTMLElement>('[data-message-id]'))
        .map((element) => [element.dataset.messageId!, element]),
    );

    const next = [user('u-1'), assistant('a-1', 'after'), user('u-2'), assistant('a-2')];
    const updatedConversation = createConversation(next);
    host.getCurrentConversation.mockReturnValue(updatedConversation);

    await service.rerenderConversationMessages(updatedConversation);

    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(host.messagesEl.querySelector('[data-message-id="a-1"]')).not.toBe(previousNodes.get('a-1'));
    expect(host.messagesEl.querySelector('[data-message-id="a-1"]')?.textContent).toContain('after');
    for (const id of ['u-1', 'u-2', 'a-2']) {
      expect(host.messagesEl.querySelector(`[data-message-id="${id}"]`)).toBe(previousNodes.get(id));
    }
  });

  it('falls back to the atomic full rebuild when the live DOM fails reconcile preconditions', async () => {
    const previous = [user('u-1'), assistant('a-1', 'before')];
    const conversation = createConversation(previous);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    document.body.appendChild(host.messagesEl);
    installTurnStructuredRenderers(host);
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    const rogueMessage = document.createElement('div');
    rogueMessage.className = 'opencodian-message';
    rogueMessage.dataset.messageId = 'rogue';
    host.messagesEl.querySelector('.opencodian-turn-body')?.appendChild(rogueMessage);

    const next = [user('u-1'), assistant('a-1', 'after')];
    const updatedConversation = createConversation(next);
    host.getCurrentConversation.mockReturnValue(updatedConversation);

    await service.rerenderConversationMessages(updatedConversation);

    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
    expect(host.messagesEl.querySelector('[data-message-id="rogue"]')).toBeNull();
    expect(host.messagesEl.querySelector('[data-message-id="a-1"]')?.textContent).toContain('after');
  });
});
