import {
  type MessageFinalizationHost,
  MessageFinalizationService,
  shouldSyncAfterStream,
} from '../../../../src/features/chat/services/MessageFinalizationService';
import { OpenCodeService } from '../../core/opencode/OpenCodeService.testSupport';
import { createConversation, createHost, createMessage } from './MessageFinalizationService.testSupport';

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
    expect(host.setActiveTabConversation).toHaveBeenCalledWith(conversation, 'tab-1');
    expect(host.syncActiveTabContextUsageIdentity).toHaveBeenCalledTimes(1);
    expect(host.refreshActiveTabContextUsageFromServer).toHaveBeenCalledTimes(1);
    expect(host.setConversationSyncInFlight).not.toHaveBeenCalled();
    expect(host.transitionTabSessionLifecycle).toHaveBeenCalledWith(
      'tab-1',
      'idle',
      'send-finalization-complete',
    );
    expect(logStage).toHaveBeenCalledWith('tab-session-lifecycle-idle');
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
});

describe('MessageFinalizationService canonical-first foreground finalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers canonical convergence before server sync for changed foreground text responses', async () => {
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
    }) as CanonicalAwareMessageFinalizationHost;
    host.syncConversationMessagesFromCanonicalState = jest.fn().mockImplementation(
      async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: 'canonical-fingerprint-2',
        };
      },
    );
    const service = new MessageFinalizationService(host as unknown as MessageFinalizationHost);
    const logStage = jest.fn();

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage,
    });

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      'send-finalization',
    );
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(previousMessages, nextMessages);
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('post-sync-render-apply-complete');
  });

  it('prefers canonical convergence for tool-first assistant responses without reviving stale local body data', async () => {
    const previousMessages = [
      createMessage({
        id: 'assistant-local',
        content: 'stale local answer',
        timestamp: 10,
        sourceMessageId: 'assistant-1',
        structured: { stale: true },
        contentBlocks: [
          { type: 'tool_use', toolId: 'call-stale', toolName: 'structured_output' },
          { type: 'text', text: 'stale local answer' },
        ],
      }),
    ];
    const nextMessages = [
      createMessage({
        id: 'assistant-1',
        content: 'Canonical tool answer',
        timestamp: 11,
        sourceMessageId: 'assistant-1',
        contentBlocks: [
          { type: 'tool_use', toolId: 'call-read-1', toolName: 'read' },
          { type: 'text', text: 'Canonical tool answer' },
        ],
      }),
    ];
    const conversation = createConversation(previousMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn(),
    }) as CanonicalAwareMessageFinalizationHost;
    host.syncConversationMessagesFromCanonicalState = jest.fn().mockImplementation(
      async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: OpenCodeService.getCanonicalConversationFingerprint(nextMessages),
        };
      },
    );
    const service = new MessageFinalizationService(host as unknown as MessageFinalizationHost);

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage: jest.fn(),
    });

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      'send-finalization',
    );
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(previousMessages, nextMessages);
    expect(conversation.messages[0]).toMatchObject({
      id: 'assistant-1',
      content: 'Canonical tool answer',
      sourceMessageId: 'assistant-1',
      contentBlocks: expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_use',
          toolId: 'call-read-1',
          toolName: 'read',
        }),
      ]),
    });
    expect(conversation.messages[0]?.structured).toBeUndefined();
  });

  it('uses the sync result drift flag instead of stale visual cache fingerprints', async () => {
    const previousMessages = [
      createMessage({
        id: 'assistant-local',
        content: 'stale local body',
        timestamp: 10,
        sourceMessageId: 'assistant-1',
      }),
    ];
    const canonicalMessages = [
      createMessage({
        id: 'assistant-1',
        content: 'Canonical body',
        timestamp: 20,
        sourceMessageId: 'assistant-1',
      }),
    ];
    const conversation = createConversation(previousMessages);
    const host = createHost(conversation, { syncConversationMessagesFromServer: jest.fn() });
    host.syncConversationMessagesFromCanonicalState = jest.fn().mockImplementation(async (
      targetConversation: Conversation,
    ) => {
      targetConversation.messages = canonicalMessages;
      return {
        messages: canonicalMessages,
        changed: false,
        fingerprint: OpenCodeService.getCanonicalConversationFingerprint(canonicalMessages),
      };
    });
    const service = new MessageFinalizationService(host);

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: [],
      logStage: jest.fn(),
    });

    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
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

  it('falls back to server sync only when canonical convergence is unavailable', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-local', content: 'Local only', timestamp: 10 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-server', content: 'Server fallback', timestamp: 11 }),
    ];
    const conversation = createConversation(previousMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn().mockImplementation(async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: 'server-fingerprint-2',
        };
      }),
    }) as CanonicalAwareMessageFinalizationHost;
    host.syncConversationMessagesFromCanonicalState = jest.fn().mockResolvedValue(null);
    const service = new MessageFinalizationService(host as unknown as MessageFinalizationHost);

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: [],
      logStage: jest.fn(),
    });

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      'send-finalization',
    );
    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      'send-finalization',
    );
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(previousMessages, nextMessages);
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
    expect(host.transitionTabSessionLifecycle).toHaveBeenCalledWith(
      'tab-1',
      'idle',
      'send-finalization-complete',
    );
    expect(logStage).toHaveBeenCalledWith('conversation-sync-lock-cleared');
    expect(logStage).toHaveBeenCalledWith('tab-session-lifecycle-idle');
  });
});
