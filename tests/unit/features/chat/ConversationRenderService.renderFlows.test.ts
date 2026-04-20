import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
  OpenCodeCanonicalSessionState,
} from '../../../../src/core/opencode';
import { OpenCodeService } from '../../core/opencode/OpenCodeService.testSupport';
import {
  captureElementScrollRestoreSnapshot,
  ConversationRenderService,
  createConversation,
  createHost,
  createMessage,
  restoreElementScrollAfterRender,
} from './ConversationRenderService.testSupport';

function createCanonicalMessage(
  overrides: Partial<OpenCodeCanonicalMessageInfo> & {
    id: string;
    role: OpenCodeCanonicalMessageInfo['role'];
  },
): OpenCodeCanonicalMessageInfo {
  return {
    sessionID: 'session-1',
    time: { created: 1 },
    ...overrides,
  };
}

function createCanonicalPart(
  overrides: Partial<OpenCodeCanonicalPart> & {
    id: string;
    messageID: string;
    type: string;
  },
): OpenCodeCanonicalPart {
  return {
    sessionID: 'session-1',
    ...overrides,
  };
}

function hydrateCanonicalMessage(
  info: OpenCodeCanonicalMessageInfo,
  parts: OpenCodeCanonicalPart[],
) {
  return createMessage({
    id: info.id,
    role: info.role,
    content: parts
      .filter((part) => typeof part.text === 'string')
      .map((part) => part.text as string)
      .join(''),
    timestamp: info.time.created,
    sourceMessageId: info.id,
    parts,
  });
}

describe('ConversationRenderService incremental render flows', () => {
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

  it('renders tool-first assistant sync updates from canonical state without leaving a blank block', async () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Inspect docs', timestamp: 1 }),
    ];
    const blankAssistantMessage = createMessage({
      id: 'assistant-1',
      content: '',
      timestamp: 2,
      sourceMessageId: 'assistant-1',
    });
    const nextMessages = [...previousMessages, blankAssistantMessage];
    const conversation = createConversation(nextMessages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host, {
      getCanonicalSessionState: jest.fn().mockReturnValue({
        sessionID: 'session-1',
        messages: [
          createCanonicalMessage({ id: 'user-1', role: 'user', time: { created: 1 } }),
          createCanonicalMessage({ id: 'assistant-1', role: 'assistant', time: { created: 2 } }),
        ],
        partsByMessageID: {
          'user-1': [
            createCanonicalPart({
              id: 'part-user-1',
              messageID: 'user-1',
              type: 'text',
              text: 'Inspect docs',
            }),
          ],
          'assistant-1': [
            createCanonicalPart({
              id: 'part-tool-1',
              messageID: 'assistant-1',
              type: 'tool',
              tool: 'read',
              callID: 'call-read-1',
              state: {
                status: 'running',
                input: { filePath: 'docs/architecture/README.md' },
              },
            }),
            createCanonicalPart({
              id: 'part-text-1',
              messageID: 'assistant-1',
              type: 'text',
              text: '',
            }),
          ],
        },
      }),
      hydrateOpenCodeMessage: jest.fn((info, parts) =>
        OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never)),
    });

    await service.applySyncedConversationUpdate(previousMessages, nextMessages);

    expect(host.assistantShellRender.renderPersistedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'assistant-1',
        content: '',
        contentBlocks: [
          expect.objectContaining({
            type: 'tool_use',
            toolId: 'call-read-1',
            toolName: 'read',
            toolStatus: 'running',
          }),
        ],
      }),
    );
  });
});

describe('ConversationRenderService full rerender flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('uses canonical turn view-models as the full-rerender source when available', async () => {
    const conversation = createConversation([
      createMessage({ id: 'stale-user', role: 'user', content: 'stale user' }),
      createMessage({ id: 'stale-assistant', content: 'stale assistant' }),
    ]);
    const canonicalState: OpenCodeCanonicalSessionState = {
      sessionID: 'session-1',
      messages: [
        createCanonicalMessage({ id: 'user-1', role: 'user', time: { created: 10 } }),
        createCanonicalMessage({ id: 'assistant-1', role: 'assistant', time: { created: 20 } }),
      ],
      partsByMessageID: {
        'user-1': [
          createCanonicalPart({
            id: 'part-user',
            messageID: 'user-1',
            type: 'text',
            text: 'canonical user',
          }),
        ],
        'assistant-1': [
          createCanonicalPart({
            id: 'part-assistant',
            messageID: 'assistant-1',
            type: 'text',
            text: 'canonical assistant',
          }),
        ],
      },
    };
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host, {
      getCanonicalSessionState: jest.fn().mockReturnValue(canonicalState),
      hydrateOpenCodeMessage: jest.fn(hydrateCanonicalMessage),
    });

    await service.rerenderConversationMessages(conversation);

    expect(host.createUserMessageFrame).toHaveBeenCalledWith(expect.objectContaining({
      id: 'user-1',
      content: 'canonical user',
    }));
    expect(host.assistantShellRender.renderPersistedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'assistant-1',
        content: 'canonical assistant',
      }),
    );
    expect(host.createUserMessageFrame).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 'stale-user',
    }));
  });
});

describe('ConversationRenderService canonical reload regressions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rebuilds the same canonical turn after reload when plugin synthetic parts are present', async () => {
    const conversation = createConversation([
      createMessage({ id: 'stale-user', role: 'user', content: 'stale question' }),
      createMessage({ id: 'stale-assistant', content: 'stale answer' }),
    ]);
    const canonicalState: OpenCodeCanonicalSessionState = {
      sessionID: 'session-1',
      messages: [
        createCanonicalMessage({ id: 'user-1', role: 'user', time: { created: 10 } }),
        createCanonicalMessage({ id: 'assistant-1', role: 'assistant', time: { created: 20 } }),
      ],
      partsByMessageID: {
        'user-1': [
          createCanonicalPart({
            id: 'part-user-visible',
            messageID: 'user-1',
            type: 'text',
            text: 'Question only',
          }),
          createCanonicalPart({
            id: 'part-user-plugin',
            messageID: 'user-1',
            type: 'text',
            text: 'Injected plugin prompt',
            synthetic: true,
            metadata: {
              source: 'plugin',
              pluginName: 'opencode-plugin-x',
            },
          }),
        ],
        'assistant-1': [
          createCanonicalPart({
            id: 'part-tool-reload',
            messageID: 'assistant-1',
            type: 'tool',
            tool: 'read',
            callID: 'call-read-reload',
            state: {
              status: 'completed',
              input: { filePath: 'docs/architecture/README.md' },
              output: 'done',
            },
          }),
          createCanonicalPart({
            id: 'part-text-reload',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Reloaded answer',
          }),
        ],
      },
    };
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host, {
      getCanonicalSessionState: jest.fn().mockReturnValue(canonicalState),
      hydrateOpenCodeMessage: jest.fn((info, parts) =>
        OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never)),
    });

    await service.rerenderConversationMessages(conversation);

    expect(host.createUserMessageFrame).toHaveBeenCalledWith(expect.objectContaining({
      id: 'user-1',
      content: 'Question only',
    }));
    expect(host.createUserMessageFrame).not.toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Injected plugin prompt'),
    }));
    expect(host.assistantShellRender.renderPersistedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'assistant-1',
        content: 'Reloaded answer',
        contentBlocks: expect.arrayContaining([
          expect.objectContaining({
            type: 'tool_use',
            toolId: 'call-read-reload',
            toolName: 'read',
            toolStatus: 'completed',
          }),
          expect.objectContaining({
            type: 'text',
            text: 'Reloaded answer',
          }),
        ]),
      }),
    );
  });
});
