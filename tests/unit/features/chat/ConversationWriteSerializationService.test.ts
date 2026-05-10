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

function createIsolatedService(): ConversationWriteSerializationService {
  return new ConversationWriteSerializationService({ scope: 'instance' });
}

describe('ConversationWriteSerializationService', () => {
  it('runs writes for the same conversation in order', async () => {
    const service = createIsolatedService();
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
    const service = createIsolatedService();
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
    const service = createIsolatedService();
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
    const service = createIsolatedService();
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

describe('ConversationWriteSerializationService hardening', () => {
  it('reports a stuck same-conversation queue without letting later writes bypass ordering', async () => {
    jest.useFakeTimers();
    try {
      const onQueueTimeout = jest.fn();
      const service = new ConversationWriteSerializationService({
        scope: 'instance',
        queueTimeoutMs: 25,
        onQueueTimeout,
        now: () => Date.now(),
        setTimeout: (callback, delay) => setTimeout(callback, delay),
        clearTimeout: (handle) => clearTimeout(handle),
      });
      const conversation = createConversation();
      const events: string[] = [];
      let releaseFirst: (() => void) | null = null;

      const first = service.commit({
        conversation,
        ticket: service.createTicket(conversation.id),
        reason: 'first',
        write: () => new Promise<void>((resolve) => {
          events.push('first-start');
          releaseFirst = () => {
            events.push('first-end');
            resolve();
          };
        }),
      });
      const second = service.commit({
        conversation,
        ticket: service.createTicket(conversation.id),
        reason: 'second',
        write: () => {
          events.push('second');
        },
      });

      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(25);

      expect(onQueueTimeout).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: conversation.id,
        pendingWrites: 2,
        oldestReason: 'first',
        newestReason: 'second',
      }));
      expect(events).toEqual(['first-start']);

      releaseFirst?.();
      await Promise.all([first, second]);

      expect(events).toEqual(['first-start', 'first-end', 'second']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not report a queue timeout after the queue drains', async () => {
    jest.useFakeTimers();
    try {
      const onQueueTimeout = jest.fn();
      const service = new ConversationWriteSerializationService({
        scope: 'instance',
        queueTimeoutMs: 25,
        onQueueTimeout,
        now: () => Date.now(),
        setTimeout: (callback, delay) => setTimeout(callback, delay),
        clearTimeout: (handle) => clearTimeout(handle),
      });
      const conversation = createConversation();

      await service.commit({
        conversation,
        ticket: service.createTicket(conversation.id),
        reason: 'fast',
        write: () => {
          conversation.updatedAt = 2;
        },
      });
      await jest.advanceTimersByTimeAsync(25);

      expect(onQueueTimeout).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shares default per-conversation ordering across service instances', async () => {
    const viewAService = new ConversationWriteSerializationService();
    const viewBService = new ConversationWriteSerializationService();
    const conversation = createConversation('shared-default-service');
    const events: string[] = [];
    let releaseFirst: (() => void) | null = null;

    const first = viewAService.commit({
      conversation,
      ticket: viewAService.createTicket(conversation.id),
      reason: 'view-a',
      write: () => new Promise<void>((resolve) => {
        events.push('view-a-start');
        releaseFirst = () => {
          events.push('view-a-end');
          resolve();
        };
      }),
    });
    const second = viewBService.commit({
      conversation,
      ticket: viewBService.createTicket(conversation.id),
      reason: 'view-b',
      write: () => {
        events.push('view-b');
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(['view-a-start']);

    releaseFirst?.();
    await Promise.all([first, second]);

    expect(events).toEqual(['view-a-start', 'view-a-end', 'view-b']);
    expect(viewAService.getVersion(conversation.id)).toBe(2);
    expect(viewBService.getVersion(conversation.id)).toBe(2);
  });

  it('reports queue depth changes on enqueue and drain', async () => {
    const onQueueDepthChange = jest.fn();
    const service = new ConversationWriteSerializationService({
      scope: 'instance',
      onQueueDepthChange,
    });
    const conversation = createConversation('depth-conversation');
    let releaseFirst: (() => void) | null = null;

    const first = service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'first',
      write: () => new Promise<void>((resolve) => {
        releaseFirst = resolve;
      }),
    });
    const second = service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'second',
      write: () => undefined,
    });

    expect(onQueueDepthChange).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: conversation.id,
      pendingWrites: 1,
      newestReason: 'first',
    }));
    expect(onQueueDepthChange).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: conversation.id,
      pendingWrites: 2,
      newestReason: 'second',
    }));

    await Promise.resolve();
    await Promise.resolve();
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(onQueueDepthChange).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationId: conversation.id,
      pendingWrites: 0,
    }));
  });

  it('rejects new writes when max queue depth is reached without reordering existing writes', async () => {
    const onQueueRejected = jest.fn();
    const service = new ConversationWriteSerializationService({
      scope: 'instance',
      maxQueueDepth: 1,
      onQueueRejected,
    });
    const conversation = createConversation('breaker-conversation');
    const events: string[] = [];
    let releaseFirst: (() => void) | null = null;

    const first = service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'first',
      write: () => new Promise<void>((resolve) => {
        events.push('first-start');
        releaseFirst = () => {
          events.push('first-end');
          resolve();
        };
      }),
    });
    const rejectedPromise = service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'second',
      write: () => {
        events.push('second');
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    releaseFirst?.();
    const [rejected] = await Promise.all([rejectedPromise, first]);

    expect(rejected.applied).toBe(false);
    expect(rejected.rejected).toBe(true);
    expect(onQueueRejected).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: conversation.id,
      pendingWrites: 1,
      rejectedReason: 'second',
    }));
    expect(events).toEqual(['first-start', 'first-end']);
    expect(service.getVersion(conversation.id)).toBe(1);
  });
});
