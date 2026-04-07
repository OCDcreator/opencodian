import { WorkspaceLeaf } from 'obsidian';

const openCodeMessageToChatMessage = jest.fn();

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {
    static openCodeMessageToChatMessage = openCodeMessageToChatMessage;
  },
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

describe('OpenCodianView stream error notice preservation', () => {
  function createView(overrides: Record<string, unknown> = {}): OpenCodianView {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
      },
      openCodeService: {
        getSessionMessages: jest.fn().mockResolvedValue([{ info: {}, parts: [] }]),
        getSessionRevertState: jest.fn().mockResolvedValue(null),
      },
      saveConversation: jest.fn().mockResolvedValue(undefined),
      storage: {
        saveConversation: jest.fn().mockResolvedValue(undefined),
      },
      ...overrides,
    } as never);
  }

  beforeEach(() => {
    openCodeMessageToChatMessage.mockReset();
  });

  it('preserves a local stream error notice when the synced assistant has no visible content', async () => {
    openCodeMessageToChatMessage.mockReturnValue({
      id: 'assistant-server-empty',
      role: 'assistant',
      content: '',
      timestamp: 1001,
      sourceMessageId: 'msg-empty-1',
    });

    const view = createView() as unknown as {
      syncConversationMessagesFromServer: (conversation: Record<string, unknown>, tabId: string) => Promise<{
        messages: Array<Record<string, unknown>>;
      }>;
    };

    const conversation = {
      id: 'conv-1',
      title: 'Conversation',
      openCodeSessionId: 'session-1',
      messages: [
        {
          id: 'assistant-error-notice-msg-empty-1',
          role: 'assistant',
          content: 'OpenCode returned no response.',
          timestamp: 1000,
          modelId: 'alibaba/qwen-max',
          sourceMessageId: 'msg-empty-1',
          displayStyle: 'notice',
          noticeTitle: 'Reply did not complete',
          noticeTone: 'error',
        },
      ],
      updatedAt: 1000,
    };

    const result = await view.syncConversationMessagesFromServer(conversation, 'tab-1');

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: 'assistant-error-notice-msg-empty-1',
      displayStyle: 'notice',
      sourceMessageId: 'msg-empty-1',
      noticeTone: 'error',
    });
  });

  it('drops a local stream error notice once a visible synced assistant arrives for the same source message', async () => {
    openCodeMessageToChatMessage.mockReturnValue({
      id: 'assistant-server-visible',
      role: 'assistant',
      content: 'Visible reply',
      timestamp: 1001,
      sourceMessageId: 'msg-visible-1',
    });

    const view = createView() as unknown as {
      syncConversationMessagesFromServer: (conversation: Record<string, unknown>, tabId: string) => Promise<{
        messages: Array<Record<string, unknown>>;
      }>;
    };

    const conversation = {
      id: 'conv-2',
      title: 'Conversation',
      openCodeSessionId: 'session-2',
      messages: [
        {
          id: 'assistant-error-notice-msg-visible-1',
          role: 'assistant',
          content: 'OpenCode returned no response.',
          timestamp: 1000,
          modelId: 'alibaba/qwen-max',
          sourceMessageId: 'msg-visible-1',
          displayStyle: 'notice',
          noticeTitle: 'Reply did not complete',
          noticeTone: 'error',
        },
      ],
      updatedAt: 1000,
    };

    const result = await view.syncConversationMessagesFromServer(conversation, 'tab-1');

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: 'assistant-server-visible',
      content: 'Visible reply',
      sourceMessageId: 'msg-visible-1',
      modelId: 'alibaba/qwen-max',
    });
    expect(result.messages[0].displayStyle).toBeUndefined();
  });

  it('renders stream error placeholders as notice cards and keeps the source message id', async () => {
    const view = createView() as unknown as {
      renderAssistantPlaceholderAsNotice: (
        messageEl: HTMLElement,
        noticeMessage: Record<string, unknown>,
        reason?: string,
      ) => Promise<void>;
    };

    const messageEl = document.createElement('div');
    messageEl.hidden = true;

    await view.renderAssistantPlaceholderAsNotice(
      messageEl,
      {
        id: 'assistant-error-notice-msg-1',
        role: 'assistant',
        content: 'OpenCode returned no response.',
        timestamp: 1000,
        modelId: 'alibaba/qwen-max',
        sourceMessageId: 'msg-1',
        displayStyle: 'notice',
        noticeTitle: 'Reply did not complete',
        noticeTone: 'error',
      },
      'render-stream-error-notice',
    );

    expect(messageEl.hidden).toBe(false);
    expect(messageEl.dataset.sourceMessageId).toBe('msg-1');
    expect(messageEl.classList.contains('opencodian-message--notice')).toBe(true);
    expect(messageEl.querySelector('.opencodian-chat-notice-card.is-error')).not.toBeNull();
  });
});
