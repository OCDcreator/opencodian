import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  type MessageFinalizationHost,
  MessageFinalizationService,
  shouldSyncAfterStream,
} from '../../../../src/features/chat/services/MessageFinalizationService';
import { OpenCodeService } from '../../core/opencode/OpenCodeService.testSupport';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

function createConversation(messages: ChatMessage[]): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

type MockedMessageFinalizationHost = {
  [Key in keyof MessageFinalizationHost]:
    MessageFinalizationHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : MessageFinalizationHost[Key];
};

function createHost(
  conversation: Conversation,
  overrides: Partial<MockedMessageFinalizationHost> = {},
): MockedMessageFinalizationHost {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
      messages: conversation.messages,
      changed: false,
      fingerprint: OpenCodeService.getCanonicalConversationFingerprint(conversation.messages),
    }),
    getConversationSyncFingerprint: jest.fn().mockImplementation(
      (messages: ChatMessage[]) => OpenCodeService.getCanonicalConversationFingerprint(messages),
    ),
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    appendTurnDiffNoticeIfNeeded: jest.fn().mockResolvedValue(undefined),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([]),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    setConversationSyncInFlight: jest.fn(),
    setLastConversationSyncFingerprint: jest.fn(),
    clearPendingEditedFiles: jest.fn(),
    setTabNeedsAttention: jest.fn(),
    setActiveTabConversation: jest.fn(),
    syncActiveTabContextUsageIdentity: jest.fn(),
    refreshActiveTabContextUsageFromServer: jest.fn().mockResolvedValue(undefined),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) => (
      message
        ? {
          id: message.id,
          role: message.role,
        }
        : null
    )),
    ...overrides,
  };
}

describe('shouldSyncAfterStream', () => {
  it.each([
    [{ streamCompleted: true, streamTimedOut: false, streamInterrupted: false, latestErrorMessage: null }, true],
    [{ streamCompleted: false, streamTimedOut: false, streamInterrupted: false, latestErrorMessage: null }, false],
    [{ streamCompleted: true, streamTimedOut: true, streamInterrupted: false, latestErrorMessage: null }, false],
    [{ streamCompleted: true, streamTimedOut: false, streamInterrupted: true, latestErrorMessage: null }, false],
    [{ streamCompleted: true, streamTimedOut: false, streamInterrupted: false, latestErrorMessage: 'boom' }, false],
  ])('returns %s => %s', (options, expected) => {
    expect(shouldSyncAfterStream(options)).toBe(expected);
  });
});

describe('MessageFinalizationService foreground finalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips server sync and render patching when final sync is not needed', async () => {
    const conversation = createConversation([
      createMessage({ id: 'assistant-1', timestamp: 10 }),
    ]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const logStage = jest.fn();

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: false,
      editedFiles: ['notes.md'],
      logStage,
    });

    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
    expect(host.appendTurnDiffNoticeIfNeeded).not.toHaveBeenCalled();
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith('tab-1', 'session-1', { suppressErrors: true });
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(host.clearPendingEditedFiles).toHaveBeenCalledWith('tab-1');
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-1', false);
    expect(host.setActiveTabConversation).toHaveBeenCalledWith(conversation);
    expect(host.syncActiveTabContextUsageIdentity).toHaveBeenCalledTimes(1);
    expect(host.refreshActiveTabContextUsageFromServer).toHaveBeenCalledTimes(1);
    expect(host.setConversationSyncInFlight).not.toHaveBeenCalled();
    expect(logStage).not.toHaveBeenCalledWith('server-sync-requested', expect.anything());
  });

  it('avoids patching or rerendering when synced visual fingerprint is unchanged', async () => {
    const conversation = createConversation([
      createMessage({ id: 'assistant-1', content: 'Stable', timestamp: 10 }),
    ]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const logStage = jest.fn();

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage,
    });

    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(conversation, 'tab-1', 'send-finalization');
    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
    expect(host.appendTurnDiffNoticeIfNeeded).toHaveBeenCalledWith(conversation, ['notes.md'], 'tab-1');
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith('tab-1', 'session-1', { suppressErrors: true });
    const stableFingerprint = host.getConversationSyncFingerprint(conversation.messages);
    expect(host.setLastConversationSyncFingerprint).toHaveBeenNthCalledWith(1, 'tab-1', stableFingerprint);
    expect(host.setLastConversationSyncFingerprint).toHaveBeenNthCalledWith(
      2,
      'tab-1',
      stableFingerprint,
    );
    expect(host.setConversationSyncInFlight).toHaveBeenCalledWith('tab-1', false);
  });

  it('delegates synced render application when visuals changed', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Before', timestamp: 10 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'After', timestamp: 11 }),
    ];
    const conversation = createConversation(previousMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn().mockImplementation(async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: 'sync-fingerprint-2',
        };
      }),
    });
    const service = new MessageFinalizationService(host);
    const logStage = jest.fn();

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage,
    });

    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(previousMessages, nextMessages);
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('post-sync-render-apply-complete');
  });

  it('keeps synced render application centralized for changed foreground syncs', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Before', timestamp: 10 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'After', timestamp: 11 }),
    ];
    const conversation = createConversation(previousMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn().mockImplementation(async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: 'sync-fingerprint-2',
        };
      }),
    });
    const service = new MessageFinalizationService(host);
    const logStage = jest.fn();

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage,
    });

    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(previousMessages, nextMessages);
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('post-sync-render-apply-complete');
  });
});

describe('MessageFinalizationService background and recovery paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the tab for attention instead of foreground updates when user switched away', async () => {
    const sendingConversation = createConversation([
      createMessage({ id: 'assistant-1', timestamp: 10 }),
    ]);
    const visibleConversation = createConversation([
      createMessage({ id: 'assistant-visible', timestamp: 20 }),
    ]);
    const host = createHost(sendingConversation, {
      getCurrentConversation: jest.fn().mockReturnValue(visibleConversation),
      getActiveTabId: jest.fn().mockReturnValue('tab-2'),
    });
    const service = new MessageFinalizationService(host);

    await service.finalizeAfterStream({
      conversation: sendingConversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage: jest.fn(),
    });

    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.setActiveTabConversation).not.toHaveBeenCalled();
    expect(host.syncActiveTabContextUsageIdentity).not.toHaveBeenCalled();
    expect(host.refreshActiveTabContextUsageFromServer).not.toHaveBeenCalled();
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-1', true);
  });

  it('routes canonical-only sync drift through the centralized foreground render input', async () => {
    const previousMessages = [
      createMessage({
        id: 'user-1',
        role: 'user',
        content: 'Question',
        timestamp: 1,
        parts: [
          {
            id: 'part-user-visible',
            sessionID: 'session-1',
            messageID: 'user-1',
            type: 'text',
            text: 'Question',
          },
        ],
      }),
      createMessage({
        id: 'assistant-1',
        content: 'Stable answer',
        timestamp: 2,
      }),
    ];
    const nextMessages = [
      {
        ...previousMessages[0],
        parts: [
          {
            id: 'part-user-visible',
            sessionID: 'session-1',
            messageID: 'user-1',
            type: 'text',
            text: 'Question',
          },
          {
            id: 'part-user-plugin',
            sessionID: 'session-1',
            messageID: 'user-1',
            type: 'text',
            text: 'Injected plugin prompt',
            synthetic: true,
            metadata: {
              source: 'plugin',
              pluginName: 'opencode-plugin-x',
            },
          },
        ],
      },
      previousMessages[1],
    ];
    const conversation = createConversation(previousMessages);
    const nextFingerprint = OpenCodeService.getCanonicalConversationFingerprint(nextMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn().mockImplementation(async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: nextFingerprint,
        };
      }),
    });
    const service = new MessageFinalizationService(host);

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage: jest.fn(),
    });

    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(
      previousMessages,
      nextMessages,
    );
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalledWith('tab-1');
    expect(host.setLastConversationSyncFingerprint).toHaveBeenNthCalledWith(
      1,
      'tab-1',
      nextFingerprint,
    );
    expect(host.setLastConversationSyncFingerprint).toHaveBeenNthCalledWith(
      2,
      'tab-1',
      nextFingerprint,
    );
  });

  it('clears the sync lock even when final save fails', async () => {
    const conversation = createConversation([
      createMessage({ id: 'assistant-1', timestamp: 10 }),
    ]);
    const host = createHost(conversation, {
      saveConversation: jest.fn().mockRejectedValue(new Error('save failed')),
    });
    const service = new MessageFinalizationService(host);
    const logStage = jest.fn();

    await expect(service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage,
    })).rejects.toThrow('save failed');

    expect(host.setConversationSyncInFlight).toHaveBeenCalledWith('tab-1', false);
    expect(logStage).toHaveBeenCalledWith('conversation-sync-lock-cleared');
  });
});
