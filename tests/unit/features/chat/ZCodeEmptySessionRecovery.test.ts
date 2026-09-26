import type { Conversation } from '../../../../src/core/types';
import { recoverEmptyZCodeConversationSession } from '../../../../src/features/chat/services/ZCodeEmptySessionRecovery';

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'zcode-empty',
    title: 'New ZCode chat',
    createdAt: 1,
    updatedAt: 1,
    backend: 'zcode',
    backendSessionId: 'deferred-session',
    messages: [],
    ...overrides,
  };
}

function createUsageSnapshot(sessionId = 'deferred-session') {
  return {
    sessionId,
    sessionTitle: 'New ZCode chat',
    createdAt: 1,
    updatedAt: 1,
    providerId: 'krill',
    providerName: 'Krill',
    modelId: 'gpt-6-sol',
    modelName: 'GPT-6 Sol',
    contextWindow: 1000,
    totalTokens: 100,
    inputTokens: 90,
    outputTokens: 10,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: null,
    totalCost: null,
  };
}

describe('recoverEmptyZCodeConversationSession', () => {
  it('rebinds only an empty ZCode conversation and clears stale context usage after persistence', async () => {
    const conversation = createConversation({
      lastContextUsage: createUsageSnapshot(),
    });
    const adapter = {
      recreateDeferredSessionIfMissing: jest.fn().mockResolvedValue('recreated-session'),
    };
    const saveConversation = jest.fn().mockResolvedValue(undefined);

    await expect(recoverEmptyZCodeConversationSession({
      conversation,
      getCurrentConversation: () => conversation,
      getAdapter: () => adapter,
      saveConversation,
      now: () => 99,
    })).resolves.toBe('rebound');

    expect(conversation.backendSessionId).toBe('recreated-session');
    expect(conversation.lastContextUsage).toBeUndefined();
    expect(conversation.updatedAt).toBe(99);
    expect(saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('never calls the adapter for a ZCode conversation that has history', async () => {
    const conversation = createConversation({ messages: [{ id: 'message', role: 'user', content: 'Keep this', timestamp: 1 }] });
    const adapter = {
      recreateDeferredSessionIfMissing: jest.fn(),
    };

    await expect(recoverEmptyZCodeConversationSession({
      conversation,
      getCurrentConversation: () => conversation,
      getAdapter: () => adapter,
      saveConversation: jest.fn(),
    })).resolves.toBe('not-applicable');

    expect(adapter.recreateDeferredSessionIfMissing).not.toHaveBeenCalled();
  });

  it('does not persist a replacement after the active conversation changed while awaiting native recovery', async () => {
    const conversation = createConversation();
    const otherConversation = createConversation({ id: 'other-zcode-empty', backendSessionId: 'other-session' });
    const adapter = {
      recreateDeferredSessionIfMissing: jest.fn().mockResolvedValue('recreated-session'),
    };
    const saveConversation = jest.fn().mockResolvedValue(undefined);

    await expect(recoverEmptyZCodeConversationSession({
      conversation,
      getCurrentConversation: () => otherConversation,
      getAdapter: () => adapter,
      saveConversation,
    })).resolves.toBe('stale');

    expect(conversation.backendSessionId).toBe('deferred-session');
    expect(saveConversation).not.toHaveBeenCalled();
  });

  it('restores the in-memory conversation when persistence rejects', async () => {
    const conversation = createConversation({
      lastContextUsage: createUsageSnapshot(),
    });

    await expect(recoverEmptyZCodeConversationSession({
      conversation,
      getCurrentConversation: () => conversation,
      getAdapter: () => ({ recreateDeferredSessionIfMissing: async () => 'recreated-session' }),
      saveConversation: async () => { throw new Error('storage unavailable'); },
      now: () => 99,
    })).rejects.toThrow('storage unavailable');

    expect(conversation.backendSessionId).toBe('deferred-session');
    expect(conversation.lastContextUsage?.sessionId).toBe('deferred-session');
    expect(conversation.updatedAt).toBe(1);
  });
});
