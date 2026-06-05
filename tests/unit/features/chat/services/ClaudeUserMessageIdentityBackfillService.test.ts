import { setAgentServiceRegistry } from '../../../../../src/core/agents/AgentCapability';
import type { AgentChatCapability } from '../../../../../src/core/agents/backend/AgentService';
import type { AgentServiceRegistry } from '../../../../../src/core/agents/backend/AgentServiceRegistry';
import type { Conversation } from '../../../../../src/core/types';
import { ClaudeUserMessageIdentityBackfillService, setBackfillPersistenceHost } from '../../../../../src/features/chat/services/ClaudeUserMessageIdentityBackfillService';

function makeMessage(role: 'user' | 'assistant', overrides: Partial<{ sourceMessageId: string | undefined; compactionDivider: boolean }> = {}) {
  return {
    role,
    sourceMessageId: overrides.sourceMessageId,
    compactionDivider: overrides.compactionDivider,
  } as unknown as Conversation['messages'][number];
}

function makeConversation(messages: Conversation['messages'], backendSessionId: string): Conversation {
  return {
    id: 'conv-1',
    backend: 'claude-code',
    backendSessionId,
    messages,
    updatedAt: 0,
  } as Conversation;
}

function makeRegistry(resolveResult: string[] | null): AgentServiceRegistry {
  const resolveFn = jest.fn().mockResolvedValue(resolveResult);
  const backend = {
    kind: 'claude-code',
    hasCapability: (cap: string) => cap === 'chat' || cap === 'sessions',
    resolveClaudeUserMessageIdentities: resolveFn,
  };
  return {
    get: () => backend as unknown as AgentChatCapability,
  } as unknown as AgentServiceRegistry;
}

function makeHost() {
  return {
    createConversationWriteTicket: jest.fn().mockReturnValue('ticket'),
    commitConversationWrite: jest.fn().mockImplementation((
      _conversation: Conversation,
      _ticket: unknown,
      _reason: string,
      write: () => void | Promise<void>,
    ) => {
      write();
      return Promise.resolve(true);
    }),
  };
}

describe('ClaudeUserMessageIdentityBackfillService', () => {
  afterEach(() => {
    setAgentServiceRegistry(null);
    setBackfillPersistenceHost(null);
  });

  it('calls the backend resolver with the adapter instance bound', async () => {
    class BackendWithBoundResolver {
      readonly kind = 'claude-code' as const;
      readonly resolveResult = ['uuid-A'];

      hasCapability(cap: string): boolean {
        return cap === 'sessions';
      }

      async resolveClaudeUserMessageIdentities(_sessionId: string): Promise<string[]> {
        if (this.kind !== 'claude-code') {
          throw new Error('resolver lost adapter binding');
        }
        return this.resolveResult;
      }
    }

    const host = makeHost();
    setAgentServiceRegistry({
      get: () => new BackendWithBoundResolver(),
    } as unknown as AgentServiceRegistry);
    const svc = new ClaudeUserMessageIdentityBackfillService(host);

    const conv = makeConversation([makeMessage('user')], 'session-1');

    await expect(svc.backfill(conv)).resolves.toBe(true);
    expect(conv.messages[0].sourceMessageId).toBe('uuid-A');
  });

  it('skips non-Claude conversations', async () => {
    setAgentServiceRegistry(makeRegistry(null));
    const svc = new ClaudeUserMessageIdentityBackfillService(makeHost());
    const conv = { backend: 'opencode', messages: [], id: 'x', updatedAt: 0 } as unknown as Conversation;
    expect(await svc.backfill(conv)).toBe(false);
  });

  it('skips when backendSessionId is missing', async () => {
    setAgentServiceRegistry(makeRegistry(null));
    const svc = new ClaudeUserMessageIdentityBackfillService(makeHost());
    const conv = makeConversation([makeMessage('user')], '');
    expect(await svc.backfill(conv)).toBe(false);
  });

  it('backfills only missing sourceMessageId with correct positional mapping', async () => {
    const uuids = ['uuid-A', 'uuid-B', 'uuid-C'];
    setAgentServiceRegistry(makeRegistry(uuids));
    const host = makeHost();
    const svc = new ClaudeUserMessageIdentityBackfillService(host);

    const conv = makeConversation([
      makeMessage('user', { sourceMessageId: 'uuid-A' }),
      makeMessage('user', { sourceMessageId: 'uuid-B' }),
      makeMessage('user'),
    ], 'session-1');

    const result = await svc.backfill(conv);

    expect(result).toBe(true);
    expect(conv.messages[0].sourceMessageId).toBe('uuid-A');
    expect(conv.messages[1].sourceMessageId).toBe('uuid-B');
    expect(conv.messages[2].sourceMessageId).toBe('uuid-C');
  });

  it('is idempotent — second call does not change existing values', async () => {
    const uuids = ['uuid-A', 'uuid-B'];
    setAgentServiceRegistry(makeRegistry(uuids));
    const host = makeHost();
    const svc = new ClaudeUserMessageIdentityBackfillService(host);

    const conv = makeConversation([
      makeMessage('user'),
      makeMessage('user'),
    ], 'session-1');

    await svc.backfill(conv);
    expect(conv.messages[0].sourceMessageId).toBe('uuid-A');
    expect(conv.messages[1].sourceMessageId).toBe('uuid-B');

    setAgentServiceRegistry(makeRegistry(['uuid-X', 'uuid-Y']));
    const svc2 = new ClaudeUserMessageIdentityBackfillService(host);
    const result = await svc2.backfill(conv);

    expect(result).toBe(false);
    expect(conv.messages[0].sourceMessageId).toBe('uuid-A');
    expect(conv.messages[1].sourceMessageId).toBe('uuid-B');
  });

  it('skips backfill when local and remote user message counts mismatch', async () => {
    const uuids = ['uuid-A', 'uuid-B'];
    setAgentServiceRegistry(makeRegistry(uuids));
    const host = makeHost();
    const svc = new ClaudeUserMessageIdentityBackfillService(host);

    const conv = makeConversation([
      makeMessage('user'),
      makeMessage('user'),
      makeMessage('user'),
    ], 'session-1');

    const result = await svc.backfill(conv);

    expect(result).toBe(false);
    expect(conv.messages[0].sourceMessageId).toBeUndefined();
    expect(conv.messages[1].sourceMessageId).toBeUndefined();
    expect(conv.messages[2].sourceMessageId).toBeUndefined();
  });

  it('skips compactionDivider messages in alignment', async () => {
    const uuids = ['uuid-A', 'uuid-B'];
    setAgentServiceRegistry(makeRegistry(uuids));
    const host = makeHost();
    const svc = new ClaudeUserMessageIdentityBackfillService(host);

    const conv = makeConversation([
      makeMessage('user'),
      makeMessage('user', { compactionDivider: true }),
      makeMessage('user'),
    ], 'session-1');

    const result = await svc.backfill(conv);

    expect(result).toBe(true);
    expect(conv.messages[0].sourceMessageId).toBe('uuid-A');
    expect(conv.messages[1].sourceMessageId).toBeUndefined();
    expect(conv.messages[2].sourceMessageId).toBe('uuid-B');
  });

  it('returns false when all user messages already have sourceMessageId', async () => {
    const uuids = ['uuid-A'];
    setAgentServiceRegistry(makeRegistry(uuids));
    const host = makeHost();
    const svc = new ClaudeUserMessageIdentityBackfillService(host);

    const conv = makeConversation([
      makeMessage('user', { sourceMessageId: 'uuid-A' }),
    ], 'session-1');

    expect(await svc.backfill(conv)).toBe(false);
  });

  it('uses global persistence host when no instance host is provided', async () => {
    const uuids = ['uuid-A'];
    setAgentServiceRegistry(makeRegistry(uuids));
    const globalHost = makeHost();
    setBackfillPersistenceHost(globalHost);

    const svc = new ClaudeUserMessageIdentityBackfillService();
    const conv = makeConversation([makeMessage('user')], 'session-1');

    const result = await svc.backfill(conv);

    expect(result).toBe(true);
    expect(conv.messages[0].sourceMessageId).toBe('uuid-A');
    expect(globalHost.createConversationWriteTicket).toHaveBeenCalledWith('conv-1');
    expect(globalHost.commitConversationWrite).toHaveBeenCalled();
  });

  it('prefers instance host over global persistence host', async () => {
    const uuids = ['uuid-A'];
    setAgentServiceRegistry(makeRegistry(uuids));
    const globalHost = makeHost();
    const instanceHost = makeHost();
    setBackfillPersistenceHost(globalHost);

    const svc = new ClaudeUserMessageIdentityBackfillService(instanceHost);
    const conv = makeConversation([makeMessage('user')], 'session-1');

    await svc.backfill(conv);

    expect(instanceHost.createConversationWriteTicket).toHaveBeenCalled();
    expect(globalHost.createConversationWriteTicket).not.toHaveBeenCalled();
  });
});
