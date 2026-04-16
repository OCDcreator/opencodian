import {
  OpenCodeSyncEventRuntimeCoordinator,
  type OpenCodeSyncEventRuntimeCoordinatorHost,
  type SessionActivityStatus,
  type SessionSyncEventUpdate,
} from '../../../../src/core/opencode/OpenCodeSyncEventRuntimeCoordinator';
import type { SessionTodo } from '../../../../src/core/types';

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function* createSignalBoundStream(
  signal: AbortSignal,
  events: unknown[] = [],
): AsyncIterable<unknown> {
  for (const event of events) {
    yield event;
  }

  if (!signal.aborted) {
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  }
}

function createHost(
  overrides: Partial<OpenCodeSyncEventRuntimeCoordinatorHost> = {},
): jest.Mocked<OpenCodeSyncEventRuntimeCoordinatorHost> {
  return {
    shouldUseSdkSync: jest.fn(() => true),
    subscribeToSyncEvents: jest.fn((signal) => Promise.resolve(createSignalBoundStream(signal))),
    normalizeSessionTodos: jest.fn((response) => response as SessionTodo[]),
    normalizeSessionStatus: jest.fn((status) => status as SessionActivityStatus),
    isTransientConnectivityError: jest.fn(() => false),
    logSyncEventStreamFailure: jest.fn(),
    checkHealth: jest.fn().mockResolvedValue(true),
    delay: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<OpenCodeSyncEventRuntimeCoordinatorHost>;
}

describe('OpenCodeSyncEventRuntimeCoordinator', () => {
  it('routes todo, status, and message sync events through registered listeners', async () => {
    const host = createHost({
      subscribeToSyncEvents: jest.fn((signal) =>
        Promise.resolve(createSignalBoundStream(signal, [
          {
            type: 'todo.updated',
            properties: {
              sessionID: 'session-1',
              todos: [{ content: 'Ship coordinator', status: 'in_progress' }],
            },
          },
          {
            type: 'session.status',
            properties: {
              sessionID: 'session-1',
              status: { type: 'busy' },
            },
          },
          {
            type: 'message.updated',
            properties: {
              sessionID: 'session-1',
              info: { id: 'msg-1' },
            },
          },
          {
            type: 'message.part.updated',
            properties: {
              sessionID: 'session-1',
              part: {
                id: 'part-1',
                type: 'tool',
                messageID: 'msg-1',
              },
              time: 42,
            },
          },
          {
            type: 'session.diff',
            properties: {
              sessionID: 'session-1',
            },
          },
        ]))),
    });
    const coordinator = new OpenCodeSyncEventRuntimeCoordinator(host);
    const todoUpdates: Array<{ sessionId: string; todos: SessionTodo[] }> = [];
    const statusUpdates: Array<{ sessionId: string; status: SessionActivityStatus }> = [];
    const syncUpdates: SessionSyncEventUpdate[] = [];

    const disposeTodo = coordinator.subscribeToSessionTodoUpdates((update) => {
      todoUpdates.push(update);
    });
    const disposeStatus = coordinator.subscribeToSessionStatusUpdates((update) => {
      statusUpdates.push(update);
    });
    const disposeSync = coordinator.subscribeToSessionSyncEvents((update) => {
      syncUpdates.push(update);
    });

    await flushAsync();
    disposeTodo();
    disposeStatus();
    disposeSync();

    expect(host.subscribeToSyncEvents).toHaveBeenCalledTimes(1);
    expect(todoUpdates).toEqual([
      {
        sessionId: 'session-1',
        todos: [{ content: 'Ship coordinator', status: 'in_progress' }],
      },
    ]);
    expect(statusUpdates).toEqual([
      {
        sessionId: 'session-1',
        status: { type: 'busy' },
      },
    ]);
    expect(syncUpdates).toEqual([
      {
        sessionId: 'session-1',
        type: 'message.updated',
        messageId: 'msg-1',
      },
      {
        sessionId: 'session-1',
        type: 'message.part.updated',
        messageId: 'msg-1',
        partId: 'part-1',
        partType: 'tool',
        time: 42,
      },
      {
        sessionId: 'session-1',
        type: 'session.diff',
      },
    ]);
  });

  it('aborts the SDK stream when the last listener unsubscribes', async () => {
    let activeSignal: AbortSignal | null = null;
    const host = createHost({
      subscribeToSyncEvents: jest.fn((signal) => {
        activeSignal = signal;
        return Promise.resolve(createSignalBoundStream(signal));
      }),
    });
    const coordinator = new OpenCodeSyncEventRuntimeCoordinator(host);

    const dispose = coordinator.subscribeToSessionTodoUpdates(jest.fn());
    await flushAsync();

    expect(activeSignal?.aborted).toBe(false);
    dispose();

    expect(activeSignal?.aborted).toBe(true);
  });

  it('restarts the SDK stream when requested while listeners are active', async () => {
    const signals: AbortSignal[] = [];
    const host = createHost({
      subscribeToSyncEvents: jest.fn((signal) => {
        signals.push(signal);
        return Promise.resolve(createSignalBoundStream(signal));
      }),
    });
    const coordinator = new OpenCodeSyncEventRuntimeCoordinator(host);
    const dispose = coordinator.subscribeToSessionTodoUpdates(jest.fn());

    await flushAsync();
    coordinator.restartSubscription();
    await flushAsync();

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    dispose();
  });

  it('waits for transient connectivity recovery before resubscribing', async () => {
    const offlineError = new Error('ECONNREFUSED');
    const signals: AbortSignal[] = [];
    const host = createHost({
      subscribeToSyncEvents: jest.fn((signal) => {
        signals.push(signal);
        return signals.length === 1
          ? Promise.reject(offlineError)
          : Promise.resolve(createSignalBoundStream(signal));
      }),
      isTransientConnectivityError: jest.fn(() => true),
      checkHealth: jest.fn().mockResolvedValue(true),
    });
    const coordinator = new OpenCodeSyncEventRuntimeCoordinator(host);
    const dispose = coordinator.subscribeToSessionTodoUpdates(jest.fn());

    await flushAsync();
    await flushAsync();

    expect(host.logSyncEventStreamFailure).toHaveBeenCalledWith(offlineError);
    expect(host.checkHealth).toHaveBeenCalledTimes(1);
    expect(host.subscribeToSyncEvents).toHaveBeenCalledTimes(2);

    dispose();
  });
});
