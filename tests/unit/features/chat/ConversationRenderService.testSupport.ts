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
  type ConversationAssistantShellRenderPort,
  type ConversationAssistantTailRenderPort,
  type ConversationRenderHost,
  ConversationRenderService,
  getIncrementalRenderedMessageUpdate,
} from '../../../../src/features/chat/services/ConversationRenderService';
import {
  captureElementScrollRestoreSnapshot,
  restoreElementScrollAfterRender,
} from '../../../../src/features/chat/services/ScrollManager';

export {
  captureElementScrollRestoreSnapshot,
  ConversationRenderService,
  getIncrementalRenderedMessageUpdate,
  restoreElementScrollAfterRender,
};
export type { ChatMessage, Conversation };

type MockedConversationAssistantTailRenderPort = {
  [Key in keyof ConversationAssistantTailRenderPort]:
    ConversationAssistantTailRenderPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationAssistantTailRenderPort[Key];
};

type MockedConversationAssistantShellRenderPort = {
  [Key in keyof ConversationAssistantShellRenderPort]:
    ConversationAssistantShellRenderPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationAssistantShellRenderPort[Key];
};

export function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

export function createConversation(messages: ChatMessage[]): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

export type MockedConversationRenderHost = {
  [Key in keyof ConversationRenderHost]:
    Key extends 'assistantTailRender'
      ? MockedConversationAssistantTailRenderPort
      : Key extends 'assistantShellRender'
        ? MockedConversationAssistantShellRenderPort
        : ConversationRenderHost[Key] extends (...args: infer Args) => infer Result
          ? jest.Mock<Result, Args>
          : ConversationRenderHost[Key];
};

export function createHost(
  overrides: Partial<Omit<MockedConversationRenderHost, 'assistantTailRender' | 'assistantShellRender'>> & {
    assistantTailRender?: Partial<MockedConversationAssistantTailRenderPort>;
    assistantShellRender?: Partial<MockedConversationAssistantShellRenderPort>;
  } = {},
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
  const assistantTailRender: MockedConversationAssistantTailRenderPort = {
    getBodySignature: jest.fn().mockImplementation((message: ChatMessage) => JSON.stringify({
      content: message.content,
      displayStyle: message.displayStyle ?? null,
      contentBlocks: message.contentBlocks ?? null,
    })),
    renderMessageBody: jest.fn().mockImplementation(
      async (contentEl: HTMLElement, message: ChatMessage) => {
        contentEl.textContent = message.content;
      },
    ),
    finalizePersistedFooter: jest.fn(),
    ...overrides.assistantTailRender,
  };
  const assistantShellRender: MockedConversationAssistantShellRenderPort = {
    renderPersistedMessage: jest.fn().mockImplementation(async (message: ChatMessage) => {
      const messageEl = document.createElement('div');
      messageEl.className = 'opencodian-message opencodian-message--assistant';
      messageEl.dataset.messageId = message.id;
      const contentEl = document.createElement('div');
      contentEl.className = 'opencodian-message-content';
      contentEl.textContent = message.content;
      messageEl.appendChild(contentEl);
      messagesEl.appendChild(messageEl);
      return messageEl;
    }),
    createAssistantMessageElement: jest.fn().mockImplementation(() => {
      const messageEl = document.createElement('div');
      messageEl.className = 'opencodian-message opencodian-message--assistant is-streaming';
      const contentEl = document.createElement('div');
      contentEl.className = 'opencodian-message-content';
      messageEl.appendChild(contentEl);
      messagesEl.appendChild(messageEl);
      return {
        messageEl,
        contentEl,
      };
    }),
    finalizePseudoStreamFooter: jest.fn(),
    clearStreamingMessageState: jest.fn(),
    ...overrides.assistantShellRender,
  };
  const hostOverrides = { ...overrides };
  delete hostOverrides.assistantTailRender;
  delete hostOverrides.assistantShellRender;

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
    shouldRenderEmptyConversationNotice: jest.fn().mockReturnValue(false),
    createEmptyConversationNoticeMessage: jest.fn().mockImplementation(() =>
      createMessage({
        id: 'opencodian-empty-rewind',
        content: 'Nothing to show',
        displayStyle: 'notice',
      })),
    createUserMessageFrame: jest.fn().mockImplementation((message: ChatMessage) => {
      const messageEl = document.createElement('div');
      messageEl.className = `opencodian-message opencodian-message--${message.role}`;
      messageEl.dataset.messageId = message.id;
      const contentEl = document.createElement('div');
      contentEl.className = 'opencodian-message-content';
      messageEl.appendChild(contentEl);
      messagesEl.appendChild(messageEl);
      return {
        messageEl,
        contentEl,
      };
    }),
    userMessageContentRenderer: {
      renderUserMessageContent: jest.fn().mockImplementation(async (
        contentEl: HTMLElement,
        message: ChatMessage,
      ) => {
        contentEl.textContent = message.content;
        return message.content;
      }),
      renderCompactionDivider: jest.fn().mockImplementation((
        messageEl: HTMLElement,
        divider: { auto: boolean; overflow: boolean; tailStartId: string },
      ) => {
        const lineEl = document.createElement('div');
        lineEl.className = 'opencodian-compaction-divider-line';
        lineEl.textContent = divider.auto ? 'Auto' : 'Manual';
        messageEl.appendChild(lineEl);
      }),
    } as never,
    addUserMessageFooter: jest.fn(),
    renderMarkdownInto: jest.fn().mockImplementation(async (
      contentEl: HTMLElement,
      markdown: string,
    ) => {
      contentEl.textContent = markdown;
    }),
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
    assistantShellRender,
    assistantTailRender,
    logAssistantFinalizationDebug: jest.fn(),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) =>
      message
        ? {
          id: message.id,
          role: message.role,
        }
        : null),
    ...hostOverrides,
  };
}

export function appendAssistantTail(messagesEl: HTMLElement, content = 'Hello'): HTMLElement {
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
