import { ConversationWriteSerializationService } from '../../../../src/features/chat/services/ConversationWriteSerializationService';
import {
  PersistentAssistantNoticeService,
  type PersistentAssistantNoticeServiceHost,
} from '../../../../src/features/chat/services/PersistentAssistantNoticeService';
import type {
  TabConversationSyncFingerprintRuntimePort,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle';

function createHost(options?: {
  currentConversation?: Record<string, unknown> | null;
}): PersistentAssistantNoticeServiceHost & {
  getConversationSyncRuntime: jest.Mock<TabConversationSyncFingerprintRuntimePort, []>;
  renderAssistantMessage: jest.Mock;
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
    renderAssistantMessage: jest.fn().mockResolvedValue(undefined),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    handleVisibleNoticeMessageAppended: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
}

describe('PersistentAssistantNoticeService', () => {
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

    expect(host.renderAssistantMessage).toHaveBeenCalledTimes(1);
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

  it('persists conversation state before rendering a visible turn diff notice', async () => {
    const conversation = {
      id: 'conversation-turn-diff',
      messages: [],
      updatedAt: 0,
    } as never;
    const events: string[] = [];
    const host = createHost({ currentConversation: conversation });
    host.saveConversation.mockImplementation(async () => {
      events.push('save');
    });
    host.renderAssistantMessage.mockImplementation(async () => {
      events.push('render');
    });
    const service = new PersistentAssistantNoticeService(host);

    await service.appendMessage({
      title: 'Files changed',
      content: 'notes.md',
      tone: 'info',
      timestamp: 234,
      noticeMeta: {
        kind: 'turn-diff',
        sourceMessageId: 'user-1',
        entries: [{ file: 'notes.md', additions: 1, deletions: 0 }],
      },
    });

    expect(events).toEqual(['save', 'render']);
    expect(conversation.messages).toHaveLength(1);
  });

  it('queues notice persistence behind earlier conversation writes', async () => {
    const conversation = {
      id: 'conversation-serialized',
      messages: [],
      updatedAt: 0,
    } as never;
    const host = createHost({ currentConversation: conversation });
    const writeSerialization = new ConversationWriteSerializationService();
    let releaseBlocker: () => void = () => undefined;
    const blockerGate = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const blockerTicket = writeSerialization.createTicket(conversation.id);
    const blockerCommit = writeSerialization.commit({
      conversation,
      ticket: blockerTicket,
      reason: 'earlier-conversation-write',
      write: async () => blockerGate,
    });
    const service = new PersistentAssistantNoticeService(host);

    const appendPromise = service.appendMessage({
      title: 'Files changed',
      content: 'notes.md',
      tone: 'info',
      timestamp: 345,
      noticeMeta: {
        kind: 'turn-diff',
        sourceMessageId: 'user-1',
        entries: [{ file: 'notes.md', additions: 1, deletions: 0 }],
      },
    });
    await Promise.resolve();

    expect(conversation.messages).toHaveLength(0);
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(host.renderAssistantMessage).not.toHaveBeenCalled();

    releaseBlocker();
    await blockerCommit;
    await appendPromise;

    expect(conversation.messages).toHaveLength(1);
    expect(host.saveConversation).toHaveBeenCalledTimes(1);
    expect(host.renderAssistantMessage).toHaveBeenCalledTimes(1);
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

    expect(host.renderAssistantMessage).not.toHaveBeenCalled();
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

describe('PersistentAssistantNoticeService detached conversation handling', () => {
  it('persists a visible notice to the live conversation when the caller holds a detached copy', async () => {
    const liveConversation = {
      id: 'conversation-detached-copy',
      messages: [],
      updatedAt: 0,
    } as never;
    const detachedConversation = {
      id: 'conversation-detached-copy',
      messages: [],
      updatedAt: 0,
    } as never;
    const host = createHost({ currentConversation: liveConversation });
    const service = new PersistentAssistantNoticeService(host);

    await service.appendMessage({
      title: 'Files changed',
      content: 'notes.md',
      tone: 'info',
      conversation: detachedConversation,
      timestamp: 300,
      noticeMeta: {
        kind: 'turn-diff',
        sourceMessageId: 'user-1',
        entries: [{ file: 'notes.md', additions: 1, deletions: 0 }],
      },
    });

    expect(host.saveConversation).toHaveBeenCalledWith(liveConversation);
    expect(liveConversation.messages).toHaveLength(1);
    expect(detachedConversation.messages).toHaveLength(0);
    expect(host.renderAssistantMessage).toHaveBeenCalledTimes(1);
  });
});
