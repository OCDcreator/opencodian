import {
  type ChatMessage,
  ConversationRenderService,
  createConversation,
  createHost,
  createMessage,
} from './ConversationRenderService.testSupport';

type TestHost = ReturnType<typeof createHost>;

/**
 * Installs renderers that reproduce the production turn structure:
 * every non-assistant message gets its own `.opencodian-turn` (header holds
 * the message), assistant messages append into the current turn body, and a
 * leading assistant creates an assistant-only turn.
 */
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
    return { turnEl, headerEl, bodyEl };
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

/** Merges consecutive assistant messages into composite-id entries, mirroring
 * `mergeAssistantMessagesForRender`. */
function installMergingGetMessagesForRender(host: TestHost): void {
  host.getMessagesForRender.mockImplementation((messages: ChatMessage[]) => {
    const rendered: ChatMessage[] = [];
    for (const message of messages) {
      const previous = rendered[rendered.length - 1];
      if (message.role === 'assistant' && previous?.role === 'assistant') {
        rendered[rendered.length - 1] = {
          ...message,
          id: `${previous.id}__${message.id}`,
          content: [previous.content, message.content].filter(Boolean).join('\n\n'),
        };
      } else {
        rendered.push(message);
      }
    }
    return rendered;
  });
}

/** Builds the DOM exactly like a full render of `messages` would. */
async function seedRenderedDom(
  host: TestHost,
  messages: ChatMessage[],
): Promise<Map<string, HTMLElement>> {
  const elements = new Map<string, HTMLElement>();
  for (const message of messages) {
    if (message.role === 'assistant') {
      const element = await host.assistantShellRender.renderPersistedMessage(message);
      elements.set(message.id, element as HTMLElement);
      continue;
    }
    const frame = host.createUserMessageFrame(message);
    if (frame) {
      frame.contentEl.textContent = message.content;
      host.addUserMessageFooter(frame.messageEl, message, message.content);
      elements.set(message.id, frame.messageEl);
    }
  }
  return elements;
}

function createFixture(): {
  host: TestHost;
  service: ConversationRenderService;
  conversation: ReturnType<typeof createConversation>;
} {
  const host = createHost();
  // Attach so `isConnected` behaves like an attached Obsidian pane.
  document.body.appendChild(host.messagesEl);
  installTurnStructuredRenderers(host);
  const service = new ConversationRenderService(host);
  const conversation = host.getCurrentConversation() as ReturnType<typeof createConversation>;
  return { host, service, conversation };
}

function user(id: string, content = id): ChatMessage {
  return createMessage({ id, role: 'user', content });
}

function assistant(id: string, content = id): ChatMessage {
  return createMessage({ id, role: 'assistant', content });
}

function turnElements(host: TestHost): HTMLElement[] {
  return Array.from(host.messagesEl.querySelectorAll<HTMLElement>('.opencodian-turn'));
}

describe('ConversationRenderService keyed reconcile', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('inserts a mid-conversation turn without remounting unchanged messages', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1'), user('u-2'), assistant('a-2')];
    const seeded = await seedRenderedDom(host, previous);
    const turns = turnElements(host);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    const next = [
      user('u-1'), assistant('a-1'),
      user('u-3'), assistant('a-3'),
      user('u-2'), assistant('a-2'),
    ];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).not.toHaveBeenCalled();
    // Unchanged messages keep their DOM node identity.
    for (const id of ['u-1', 'a-1', 'u-2', 'a-2']) {
      expect(host.messagesEl.querySelector(`[data-message-id="${id}"]`)).toBe(seeded.get(id));
    }
    // The inserted turn lands between the two original turns, in order.
    const finalTurns = turnElements(host);
    expect(finalTurns).toHaveLength(3);
    expect(finalTurns[0]).toBe(turns[0]);
    expect(finalTurns[2]).toBe(turns[1]);
    expect(finalTurns[1].querySelector('[data-message-id="u-3"]')).not.toBeNull();
    expect(finalTurns[1].querySelector('[data-message-id="a-3"]')).not.toBeNull();
    // The turn body cursor points at the last turn body for later appends.
    expect(host.renderRuntime.currentTurnBodyEl).toBe(
      finalTurns[2].querySelector('.opencodian-turn-body'),
    );
  });

  it('removes a mid-conversation turn and prunes the empty shell', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [
      user('u-1'), assistant('a-1'),
      user('u-2'), assistant('a-2'),
      user('u-3'), assistant('a-3'),
    ];
    const seeded = await seedRenderedDom(host, previous);
    const turns = turnElements(host);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    const next = [user('u-1'), assistant('a-1'), user('u-3'), assistant('a-3')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).not.toHaveBeenCalled();
    expect(turnElements(host)).toEqual([turns[0], turns[2]]);
    for (const id of ['u-1', 'a-1', 'u-3', 'a-3']) {
      expect(host.messagesEl.querySelector(`[data-message-id="${id}"]`)).toBe(seeded.get(id));
    }
    expect(host.messagesEl.querySelector('[data-message-id="u-2"]')).toBeNull();
    expect(host.messagesEl.querySelector('[data-message-id="a-2"]')).toBeNull();
  });

  it('handles tail shrink without a full rebuild', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1'), user('u-2'), assistant('a-2')];
    const seeded = await seedRenderedDom(host, previous);
    const turns = turnElements(host);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    const next = [user('u-1'), assistant('a-1')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).not.toHaveBeenCalled();
    expect(turnElements(host)).toEqual([turns[0]]);
    expect(host.messagesEl.querySelector('[data-message-id="u-1"]')).toBe(seeded.get('u-1'));
    expect(host.messagesEl.querySelector('[data-message-id="a-1"]')).toBe(seeded.get('a-1'));
  });

  it('updates an edited user message in place, keeping its node', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1', 'before'), assistant('a-1')];
    const seeded = await seedRenderedDom(host, previous);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    const next = [user('u-1', 'after'), assistant('a-1')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).not.toHaveBeenCalled();
    const userEl = host.messagesEl.querySelector<HTMLElement>('[data-message-id="u-1"]');
    expect(userEl).toBe(seeded.get('u-1'));
    expect(userEl?.textContent).toContain('after');
    expect(host.messagesEl.querySelector('[data-message-id="a-1"]')).toBe(seeded.get('a-1'));
  });

  it('replaces a changed mid-conversation assistant message but keeps its siblings', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1', 'old'), user('u-2'), assistant('a-2')];
    const seeded = await seedRenderedDom(host, previous);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    const next = [user('u-1'), assistant('a-1', 'new'), user('u-2'), assistant('a-2')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).not.toHaveBeenCalled();
    const replaced = host.messagesEl.querySelector<HTMLElement>('[data-message-id="a-1"]');
    expect(replaced).not.toBeNull();
    expect(replaced).not.toBe(seeded.get('a-1'));
    expect(replaced?.textContent).toContain('new');
    // The replacement stays inside the first turn's body.
    const turns = turnElements(host);
    expect(turns[0].querySelector('.opencodian-turn-body')?.contains(replaced ?? null)).toBe(true);
    for (const id of ['u-1', 'u-2', 'a-2']) {
      expect(host.messagesEl.querySelector(`[data-message-id="${id}"]`)).toBe(seeded.get(id));
    }
  });

  it('reconciles a mid-list assistant merge into the composite rendered id', async () => {
    const { host, service, conversation } = createFixture();
    installMergingGetMessagesForRender(host);
    const previous = [user('u-1'), assistant('a-1'), user('u-2'), assistant('a-3')];
    const previousRendered = host.getMessagesForRender(previous);
    const seeded = await seedRenderedDom(host, previousRendered);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    // a-2 arrives and merges with a-1 into the composite a-1__a-2.
    const next = [user('u-1'), assistant('a-1'), assistant('a-2'), user('u-2'), assistant('a-3')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).not.toHaveBeenCalled();
    expect(host.messagesEl.querySelector('[data-message-id="a-1"]')).toBeNull();
    const merged = host.messagesEl.querySelector<HTMLElement>('[data-message-id="a-1__a-2"]');
    expect(merged).not.toBeNull();
    const turns = turnElements(host);
    expect(turns).toHaveLength(2);
    expect(turns[0].querySelector('.opencodian-turn-body')?.contains(merged ?? null)).toBe(true);
    expect(host.messagesEl.querySelector('[data-message-id="u-2"]')).toBe(seeded.get('u-2'));
    expect(host.messagesEl.querySelector('[data-message-id="a-3"]')).toBe(seeded.get('a-3'));
  });

  it('reconciles a mid-list assistant split from a composite rendered id', async () => {
    const { host, service, conversation } = createFixture();
    installMergingGetMessagesForRender(host);
    const previous = [user('u-1'), assistant('a-1'), assistant('a-2'), user('u-2'), assistant('a-3')];
    const previousRendered = host.getMessagesForRender(previous);
    const seeded = await seedRenderedDom(host, previousRendered);
    expect(host.messagesEl.querySelector('[data-message-id="a-1__a-2"]')).toBe(
      seeded.get('a-1__a-2'),
    );
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    // a-2 disappears: the composite splits back to the single a-1.
    const next = [user('u-1'), assistant('a-1'), user('u-2'), assistant('a-3')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).not.toHaveBeenCalled();
    expect(host.messagesEl.querySelector('[data-message-id="a-1__a-2"]')).toBeNull();
    expect(host.messagesEl.querySelector('[data-message-id="a-1"]')).not.toBeNull();
    expect(host.messagesEl.querySelector('[data-message-id="u-2"]')).toBe(seeded.get('u-2'));
    expect(host.messagesEl.querySelector('[data-message-id="a-3"]')).toBe(seeded.get('a-3'));
  });

});

describe('ConversationRenderService keyed reconcile reorder', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves reordered turns without re-rendering their messages', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1'), user('u-2'), assistant('a-2')];
    const seeded = await seedRenderedDom(host, previous);
    const turns = turnElements(host);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    const next = [user('u-2'), assistant('a-2'), user('u-1'), assistant('a-1')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).not.toHaveBeenCalled();
    expect(turnElements(host)).toEqual([turns[1], turns[0]]);
    for (const id of ['u-1', 'a-1', 'u-2', 'a-2']) {
      expect(host.messagesEl.querySelector(`[data-message-id="${id}"]`)).toBe(seeded.get(id));
    }
    // Only the seed renders happened; the reorder itself rendered nothing.
    expect(host.assistantShellRender.renderPersistedMessage).toHaveBeenCalledTimes(2);
    expect(host.createUserMessageFrame).toHaveBeenCalledTimes(2);
  });
});

describe('ConversationRenderService keyed reconcile fallbacks', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('falls back to a full rebuild when the DOM drifted from the previous render', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1'), user('u-2'), assistant('a-2')];
    await seedRenderedDom(host, previous);
    // Drift: an unexpected extra message element appears in the container.
    const stray = document.createElement('div');
    stray.className = 'opencodian-message opencodian-message--assistant';
    stray.dataset.messageId = 'stray';
    host.messagesEl.appendChild(stray);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    // A mid-conversation insertion would normally go through keyed reconcile.
    const next = [user('u-1'), user('u-3'), assistant('a-1'), user('u-2'), assistant('a-2')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a full rebuild while a streaming shell is present', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1'), user('u-2'), assistant('a-2')];
    await seedRenderedDom(host, previous);
    const streaming = document.createElement('div');
    streaming.className = 'opencodian-message opencodian-message--assistant is-streaming';
    host.messagesEl.querySelector('.opencodian-turn-body')?.appendChild(streaming);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    const next = [user('u-1'), user('u-3'), assistant('a-1'), user('u-2'), assistant('a-2')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(rerenderSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a full rebuild when the next render list is empty', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1')];
    await seedRenderedDom(host, previous);
    const rerenderSpy = jest.spyOn(service, 'rerenderConversationMessages');

    conversation.messages = [];
    await service.applySyncedConversationUpdate(previous, []);

    expect(rerenderSpy).toHaveBeenCalledTimes(1);
  });

  it('captures and restores scroll around the reconcile and re-renders the background indicator', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1'), user('u-2'), assistant('a-2')];
    await seedRenderedDom(host, previous);

    const next = [user('u-1'), assistant('a-1'), user('u-3'), assistant('a-3'), user('u-2'), assistant('a-2')];
    conversation.messages = next;
    await service.applySyncedConversationUpdate(previous, next);

    expect(host.beginConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(host.endConversationHydration).toHaveBeenCalledWith('tab-1');
    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(conversation);
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalled();
    expect(host.syncPaneScrollMetrics).toHaveBeenCalledWith('tab-1', host.messagesEl);
  });

  it('stages delayed assistant markdown outside the live current turn until it completes', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1', 'old'), user('u-2'), assistant('a-2')];
    await seedRenderedDom(host, previous);
    const liveBody = host.messagesEl.querySelector<HTMLElement>('.opencodian-turn-body');
    host.renderRuntime.currentTurnBodyEl = liveBody;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const render = host.assistantShellRender.renderPersistedMessage;
    render.mockImplementationOnce(async (message: ChatMessage) => {
      await pending;
      const stagedBody = host.renderRuntime.stagedTurnBodyEl;
      const messageEl = document.createElement('div');
      messageEl.className = 'opencodian-message opencodian-message--assistant';
      messageEl.dataset.messageId = message.id;
      messageEl.textContent = message.content;
      stagedBody?.appendChild(messageEl);
      return messageEl;
    });

    conversation.messages = [user('u-1'), assistant('a-1', 'new'), user('u-2'), assistant('a-2')];
    const applying = service.applySyncedConversationUpdate(previous, conversation.messages);
    await Promise.resolve();
    expect(host.messagesEl.querySelector('[data-message-id="a-1"]')?.textContent).toBe('old');
    expect(host.messagesEl.querySelectorAll('[data-message-id="a-1"]').length).toBe(1);
    release();
    await applying;
    expect(host.messagesEl.querySelector('[data-message-id="a-1"]')?.textContent).toBe('new');
  });

  it('does not remove a same-id node rendered by a newer owner after staging loses ownership', async () => {
    const { host, service, conversation } = createFixture();
    const previous = [user('u-1'), assistant('a-1', 'old'), user('u-2'), assistant('a-2')];
    await seedRenderedDom(host, previous);
    jest.spyOn(service, 'rerenderConversationMessages').mockResolvedValue();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    host.assistantShellRender.renderPersistedMessage.mockImplementationOnce(async (message: ChatMessage) => {
      await pending;
      const stagedBody = host.renderRuntime.stagedTurnBodyEl;
      const messageEl = document.createElement('div');
      messageEl.className = 'opencodian-message opencodian-message--assistant';
      messageEl.dataset.messageId = message.id;
      stagedBody?.appendChild(messageEl);
      return messageEl;
    });
    conversation.messages = [user('u-1'), assistant('a-1', 'new'), user('u-2'), assistant('a-2')];
    const applying = service.applySyncedConversationUpdate(previous, conversation.messages);
    await Promise.resolve();
    const replacementConversation = createConversation(conversation.messages);
    host.getCurrentConversation.mockReturnValue(replacementConversation);
    const newerNode = document.createElement('div');
    newerNode.className = 'opencodian-message opencodian-message--assistant';
    newerNode.dataset.messageId = 'a-1';
    newerNode.textContent = 'new-owner';
    host.messagesEl.querySelector('.opencodian-turn-body')?.appendChild(newerNode);
    release();
    await applying;
    expect(newerNode.isConnected).toBe(true);
  });
});
