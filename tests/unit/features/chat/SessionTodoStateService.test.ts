import type { Conversation } from '../../../../src/core/types';
import {
  type SessionTodoStateRuntime,
  SessionTodoStateService,
  type SessionTodoStateServiceHost,
} from '../../../../src/features/chat/services/SessionTodoStateService';
import { t } from '../../../../src/i18n';

type AppendPersistentNoticeOptions =
  Parameters<SessionTodoStateServiceHost['appendPersistentAssistantNoticeMessage']>[0];

interface HostFixture {
  service: SessionTodoStateService;
  runtime: SessionTodoStateRuntime;
  renderSessionTodoDock: jest.Mock<void, [string | null]>;
  appendPersistentAssistantNoticeMessage: jest.Mock<Promise<void>, [AppendPersistentNoticeOptions]>;
}

function createRuntime(
  overrides: Partial<SessionTodoStateRuntime> = {},
): SessionTodoStateRuntime {
  return {
    isStreaming: false,
    sessionTodoSessionId: 'session-1',
    sessionTodos: [],
    sessionTodoFingerprint: null,
    sessionTodoLastChangedAt: null,
    sessionTodoSuppressedFingerprint: null,
    sessionTodoStaleNoticeFingerprint: null,
    sessionStatusSessionId: 'session-1',
    sessionStatus: null,
    sessionStatusLastChangedAt: null,
    backgroundTaskStartedAt: null,
    ...overrides,
  };
}

function createStaleIncompleteRuntime(): SessionTodoStateRuntime {
  return createRuntime({
    sessionTodos: [
      { content: 'Investigate sync issue', status: 'in_progress' },
    ],
    sessionTodoFingerprint: JSON.stringify([
      {
        id: null,
        content: 'Investigate sync issue',
        status: 'in_progress',
        priority: null,
      },
    ]),
    sessionTodoLastChangedAt: Date.now() - 121_000,
    sessionStatusLastChangedAt: Date.now() - 121_000,
    backgroundTaskStartedAt: Date.now() - 121_000,
  });
}

async function flushPendingNoticeTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createFixture(options: {
  runtime?: SessionTodoStateRuntime;
  conversation?: Conversation | null;
  activeTabId?: string | null;
} = {}): HostFixture {
  const runtime = options.runtime ?? createRuntime();
  const conversation = options.conversation ?? null;
  const activeTabId = options.activeTabId ?? 'tab-1';
  const renderSessionTodoDock = jest.fn<void, [string | null]>();
  const appendPersistentAssistantNoticeMessage =
    jest.fn<Promise<void>, [AppendPersistentNoticeOptions]>().mockResolvedValue(undefined);

  const host: SessionTodoStateServiceHost = {
    getTabRuntimeState: (tabId) => (tabId === activeTabId ? runtime : null),
    getActiveTabId: () => activeTabId,
    getSessionIdForTab: (tabId) => {
      if (tabId !== activeTabId) {
        return null;
      }
      return conversation?.openCodeSessionId ?? runtime.sessionTodoSessionId;
    },
    getConversationForTab: (tabId) => (tabId === activeTabId ? conversation : null),
    renderSessionTodoDock,
    hasMatchingPersistentAssistantNoticeMessage: (title, content, tone, targetConversation = conversation) =>
      targetConversation?.messages.some((message) =>
        message.role === 'assistant'
        && message.displayStyle === 'notice'
        && message.noticeTitle === title
        && message.noticeTone === tone
        && message.content === content,
      ) ?? false,
    appendPersistentAssistantNoticeMessage,
  };

  return {
    service: new SessionTodoStateService(host),
    runtime,
    renderSessionTodoDock,
    appendPersistentAssistantNoticeMessage,
  };
}

function createConversation(noticeContent: string | null = null): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    openCodeSessionId: 'session-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: noticeContent
      ? [
        {
          id: 'assistant-notice-1',
          role: 'assistant',
          content: noticeContent,
          timestamp: Date.now(),
          displayStyle: 'notice',
          noticeTitle: t('chat.todo.staleTitle'),
          noticeTone: 'warning',
        },
      ]
      : [],
  };
}

describe('SessionTodoStateService stale suppression', () => {
  it('suppresses stale incomplete todos after prolonged inactivity', () => {
    const runtime = createStaleIncompleteRuntime();
    const { service, renderSessionTodoDock } = createFixture({ runtime });

    const staleTodos = service.suppressStaleSessionTodosIfNeeded('tab-1');

    expect(staleTodos).toEqual([
      { content: 'Investigate sync issue', status: 'in_progress' },
    ]);
    expect(runtime.sessionTodoSuppressedFingerprint).toBe(runtime.sessionTodoFingerprint);
    expect(runtime.sessionTodos).toEqual([]);
    expect(renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
  });

  it('restores a previously hidden snapshot when the stale notice already exists in conversation history', () => {
    const runtime = createRuntime({
      sessionTodoSessionId: null,
      sessionStatusSessionId: null,
    });
    const baseTodos = [
      { content: 'Investigate sync issue', status: 'in_progress' as const },
    ];
    const previewFixture = createFixture({ runtime });
    const content = previewFixture.service.buildStaleSessionTodoNoticeContent(baseTodos);
    const { service } = createFixture({
      runtime,
      conversation: createConversation(content),
    });

    service.setTabSessionTodos('tab-1', baseTodos, 'session-1');

    expect(runtime.sessionTodoSessionId).toBe('session-1');
    expect(runtime.sessionTodoSuppressedFingerprint).toBe(runtime.sessionTodoFingerprint);
    expect(runtime.sessionTodoStaleNoticeFingerprint).toBe(content);
    expect(runtime.sessionTodos).toEqual([]);
  });

  it('clears stale suppression when the session becomes live again', () => {
    const runtime = createRuntime({
      sessionTodoSuppressedFingerprint: 'todo-fingerprint',
      sessionTodoStaleNoticeFingerprint: 'todo-notice',
    });
    const { service, renderSessionTodoDock } = createFixture({ runtime });

    service.setTabSessionStatus('tab-1', { type: 'busy' }, 'session-1');

    expect(runtime.sessionTodoSuppressedFingerprint).toBeNull();
    expect(runtime.sessionTodoStaleNoticeFingerprint).toBeNull();
    expect(renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
  });
});

describe('SessionTodoStateService stale notices', () => {
  it('appends a stale notice after suppressing a stale snapshot', async () => {
    const runtime = createStaleIncompleteRuntime();
    const conversation = createConversation();
    const { service, appendPersistentAssistantNoticeMessage } = createFixture({
      runtime,
      conversation,
    });

    service.reconcileStaleSessionTodoState('tab-1');
    await flushPendingNoticeTasks();

    const content = service.buildStaleSessionTodoNoticeContent([
      { content: 'Investigate sync issue', status: 'in_progress' },
    ]);
    expect(appendPersistentAssistantNoticeMessage).toHaveBeenCalledWith({
      title: t('chat.todo.staleTitle'),
      content,
      tone: 'warning',
    });
    expect(runtime.sessionTodoStaleNoticeFingerprint).toBe(content);
  });

  it('reuses an existing persisted stale notice instead of appending a duplicate', async () => {
    const runtime = createStaleIncompleteRuntime();
    const previewFixture = createFixture({ runtime });
    const content = previewFixture.service.buildStaleSessionTodoNoticeContent([
      { content: 'Investigate sync issue', status: 'in_progress' },
    ]);
    const { service, appendPersistentAssistantNoticeMessage } = createFixture({
      runtime,
      conversation: createConversation(content),
    });

    service.reconcileStaleSessionTodoState('tab-1');
    await flushPendingNoticeTasks();

    expect(appendPersistentAssistantNoticeMessage).not.toHaveBeenCalled();
    expect(runtime.sessionTodoSuppressedFingerprint).toBe(runtime.sessionTodoFingerprint);
    expect(runtime.sessionTodoStaleNoticeFingerprint).toBe(content);
  });

  it('resets the stale notice fingerprint when notice append fails', async () => {
    const runtime = createStaleIncompleteRuntime();
    const conversation = createConversation();
    const { service, appendPersistentAssistantNoticeMessage } = createFixture({
      runtime,
      conversation,
    });
    appendPersistentAssistantNoticeMessage.mockRejectedValueOnce(new Error('append failed'));

    service.reconcileStaleSessionTodoState('tab-1');
    await flushPendingNoticeTasks();

    expect(appendPersistentAssistantNoticeMessage).toHaveBeenCalledTimes(1);
    expect(runtime.sessionTodoSuppressedFingerprint).toBe(runtime.sessionTodoFingerprint);
    expect(runtime.sessionTodoStaleNoticeFingerprint).toBeNull();
  });
});
