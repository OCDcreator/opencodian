import {
  PersistentAssistantNoticeService,
  type PersistentAssistantNoticeServiceHost,
} from '../../../../src/features/chat/services/PersistentAssistantNoticeService';
import type {
  TabConversationSyncFingerprintRuntimePort,
} from '../../../../src/features/chat/services/TabConversationSyncFingerprintPortProvider';

describe('PersistentAssistantNoticeService', () => {
  function createHost(options?: {
    currentConversation?: Record<string, unknown> | null;
  }): PersistentAssistantNoticeServiceHost & {
    getConversationSyncRuntime: jest.Mock<TabConversationSyncFingerprintRuntimePort, []>;
    renderMessage: jest.Mock;
    saveConversation: jest.Mock;
    handleVisibleNoticeMessageAppended: jest.Mock;
    setTabNeedsAttention: jest.Mock;
  } {
    const conversationSyncRuntime: jest.Mocked<TabConversationSyncFingerprintRuntimePort> = {
      getConversationSyncFingerprint: jest.fn((messages: Array<Record<string, unknown>>) => {
        const lastMessage = messages[messages.length - 1];
        return `fingerprint:${messages.length}:${String(lastMessage?.id ?? 'missing')}`;
      }),
      setTabConversationSyncFingerprint: jest.fn(),
    };

    return {
      getCurrentConversation: jest.fn().mockReturnValue(options?.currentConversation ?? null),
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getConversationSyncRuntime: jest.fn(() => conversationSyncRuntime),
      renderMessage: jest.fn().mockResolvedValue(undefined),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      handleVisibleNoticeMessageAppended: jest.fn(),
      setTabNeedsAttention: jest.fn(),
    };
  }

  it('matches an existing persisted notice in a conversation', () => {
    const conversation = {
      id: 'conversation-1',
      messages: [
        {
          id: 'assistant-notice-1',
          role: 'assistant',
          content: 'Task stopped',
          displayStyle: 'notice',
          noticeTitle: 'Stopped',
          noticeTone: 'warning',
        },
      ],
    } as never;
    const host = createHost({ currentConversation: conversation });
    const service = new PersistentAssistantNoticeService(host);

    expect(service.hasMatchingMessage('Stopped', 'Task stopped', 'warning')).toBe(true);
    expect(service.hasMatchingMessage('Stopped', 'Other', 'warning')).toBe(false);
  });

  it('renders and persists visible notices before scrolling state follow-up', async () => {
    const conversation = {
      id: 'conversation-1',
      messages: [],
      updatedAt: 0,
    } as never;
    const host = createHost({ currentConversation: conversation });
    const service = new PersistentAssistantNoticeService(host);

    await service.appendMessage({
      title: 'Diff ready',
      content: 'Updated files',
      tone: 'info',
      timestamp: 123,
      noticeMeta: {
        kind: 'background-task-completion',
        conversationId: 'conversation-1',
        anchorKey: 'anchor-1',
        sourceReminderIds: ['reminder-1'],
        allComplete: false,
        taskIds: ['task-1'],
      },
    });

    expect(host.renderMessage).toHaveBeenCalledTimes(1);
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(conversation.updatedAt).toBe(123);
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({
      id: 'assistant-notice-123',
      role: 'assistant',
      content: 'Updated files',
      timestamp: 123,
      displayStyle: 'notice',
      noticeTitle: 'Diff ready',
      noticeTone: 'info',
      noticeMeta: {
        kind: 'background-task-completion',
        conversationId: 'conversation-1',
        anchorKey: 'anchor-1',
        sourceReminderIds: ['reminder-1'],
        allComplete: false,
        taskIds: ['task-1'],
      },
    });
    expect(host.getConversationSyncRuntime).toHaveBeenCalledTimes(1);
    expect(host.getConversationSyncRuntime().setTabConversationSyncFingerprint)
      .toHaveBeenCalledWith(
      'tab-1',
      'fingerprint:1:assistant-notice-123',
      );
    expect(host.handleVisibleNoticeMessageAppended).toHaveBeenCalledTimes(1);
    expect(host.setTabNeedsAttention).not.toHaveBeenCalled();
  });

  it('persists hidden-tab notices without rendering and marks attention', async () => {
    const currentConversation = {
      id: 'conversation-1',
      messages: [],
      updatedAt: 0,
    } as never;
    const backgroundConversation = {
      id: 'conversation-2',
      messages: [],
      updatedAt: 0,
    } as never;
    const host = createHost({ currentConversation });
    const service = new PersistentAssistantNoticeService(host);

    await service.appendMessage({
      title: 'Background task complete',
      content: 'Task finished',
      tone: 'info',
      conversation: backgroundConversation,
      tabId: 'tab-2',
      timestamp: 456,
    });

    expect(host.renderMessage).not.toHaveBeenCalled();
    expect(host.saveConversation).toHaveBeenCalledWith(backgroundConversation);
    expect(host.getConversationSyncRuntime().setTabConversationSyncFingerprint)
      .toHaveBeenCalledWith(
      'tab-2',
      'fingerprint:1:assistant-notice-456',
      );
    expect(host.handleVisibleNoticeMessageAppended).not.toHaveBeenCalled();
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-2', true);
  });
});
