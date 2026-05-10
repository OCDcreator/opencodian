import type { Conversation } from '../../../../src/core/types';
import {
  ConversationWriteSerializationService,
} from '../../../../src/features/chat/services/ConversationWriteSerializationService';

function createConversation(id = 'conversation-1'): Conversation {
  return {
    id,
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [],
  };
}

describe('ConversationWriteSerializationService', () => {
  it('runs writes for the same conversation in order', async () => {
    const service = new ConversationWriteSerializationService();
    const conversation = createConversation();
    const events: string[] = [];

    await Promise.all([
      service.commit({
        conversation,
        ticket: service.createTicket(conversation.id),
        reason: 'first',
        write: async () => {
          events.push('first-start');
          await Promise.resolve();
          events.push('first-end');
        },
      }),
      service.commit({
        conversation,
        ticket: service.createTicket(conversation.id),
        reason: 'second',
        write: () => {
          events.push('second');
        },
      }),
    ]);

    expect(events).toEqual(['first-start', 'first-end', 'second']);
    expect(service.getVersion(conversation.id)).toBe(2);
  });

  it('skips stale tickets after a newer write has committed', async () => {
    const service = new ConversationWriteSerializationService();
    const conversation = createConversation();
    const staleTicket = service.createTicket(conversation.id);

    const fresh = await service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'fresh',
      write: () => {
        conversation.updatedAt = 2;
      },
    });
    const stale = await service.commit({
      conversation,
      ticket: staleTicket,
      reason: 'stale-sync',
      write: () => {
        conversation.updatedAt = 3;
      },
    });

    expect(fresh.applied).toBe(true);
    expect(stale.applied).toBe(false);
    expect(conversation.updatedAt).toBe(2);
    expect(service.getVersion(conversation.id)).toBe(1);
  });

  it('does not block another conversation id', async () => {
    const service = new ConversationWriteSerializationService();
    const first = createConversation('conversation-1');
    const second = createConversation('conversation-2');
    const events: string[] = [];
    let releaseFirst: (() => void) | null = null;

    const firstWrite = service.commit({
      conversation: first,
      ticket: service.createTicket(first.id),
      reason: 'first',
      write: () => new Promise<void>((resolve) => {
        releaseFirst = () => {
          events.push('first');
          resolve();
        };
      }),
    });

    await service.commit({
      conversation: second,
      ticket: service.createTicket(second.id),
      reason: 'second',
      write: () => {
        events.push('second');
      },
    });
    releaseFirst?.();
    await firstWrite;

    expect(events).toEqual(['second', 'first']);
  });

  it('releases the queue and preserves the version after a failed write', async () => {
    const service = new ConversationWriteSerializationService();
    const conversation = createConversation();
    const events: string[] = [];

    await expect(service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'failed',
      write: () => {
        events.push('failed');
        throw new Error('write failed');
      },
    })).rejects.toThrow('write failed');

    const recovered = await service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'recovered',
      write: () => {
        events.push('recovered');
        conversation.updatedAt = 4;
      },
    });

    expect(recovered.applied).toBe(true);
    expect(events).toEqual(['failed', 'recovered']);
    expect(conversation.updatedAt).toBe(4);
    expect(service.getVersion(conversation.id)).toBe(1);
  });
});
