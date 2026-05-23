/* eslint-disable max-lines-per-function -- Barrier test fixtures are kept inline for coalescing readability. */
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
    applySessionSyncEvent: jest.fn(),
    isTransientConnectivityError: jest.fn(() => false),
    logSyncEventStreamFailure: jest.fn(),
    checkHealth: jest.fn().mockResolvedValue(true),
    delay: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<OpenCodeSyncEventRuntimeCoordinatorHost>;
}

describe('OpenCodeSyncEventRuntimeCoordinator message.part.removed barrier', () => {
  it('treats message part removal as a coalescing barrier for part updates', async () => {
    let releaseBatch: (() => void) | null = null;
    const host = createHost({
      subscribeToSyncEvents: jest.fn((signal) =>
        Promise.resolve(createSignalBoundStream(signal, [
          {
            type: 'message.part.updated',
            properties: {
              sessionID: 'session-1',
              part: {
                id: 'part-1',
                sessionID: 'session-1',
                type: 'text',
                messageID: 'msg-1',
              },
              time: 1,
            },
          },
          {
            type: 'message.part.removed',
            properties: {
              sessionID: 'session-1',
              messageID: 'msg-1',
              partID: 'part-1',
            },
          },
          {
            type: 'message.part.updated',
            properties: {
              sessionID: 'session-1',
              part: {
                id: 'part-1',
                sessionID: 'session-1',
                type: 'text',
                messageID: 'msg-1',
              },
              time: 2,
            },
          },
        ]))),
      delay: jest.fn((ms) => {
        if (ms === 16) {
          return new Promise<void>((resolve) => {
            releaseBatch = resolve;
          });
        }

        return Promise.resolve();
      }),
    });
    const coordinator = new OpenCodeSyncEventRuntimeCoordinator(host);
    const syncUpdates: SessionSyncEventUpdate[] = [];
    const dispose = coordinator.subscribeToSessionSyncEvents((update) => {
      syncUpdates.push(update);
    });

    await flushAsync();
    expect(syncUpdates).toEqual([]);
    releaseBatch?.();
    await flushAsync();

    // Both part-updated events survive because the removal barrier splits the
    // coalescing segment — the same part-id on opposite sides of a
    // message.part.removed must NOT be deduplicated.
    expect(syncUpdates).toEqual([
      {
        sessionId: 'session-1',
        type: 'message.part.updated',
        part: {
          id: 'part-1',
          sessionID: 'session-1',
          type: 'text',
          messageID: 'msg-1',
        },
        time: 1,
      },
      {
        sessionId: 'session-1',
        type: 'message.part.removed',
        messageId: 'msg-1',
        partId: 'part-1',
      },
      {
        sessionId: 'session-1',
        type: 'message.part.updated',
        part: {
          id: 'part-1',
          sessionID: 'session-1',
          type: 'text',
          messageID: 'msg-1',
        },
        time: 2,
      },
    ]);

    dispose();
  });

  it('normalizes message part removal payloads', async () => {
    let releaseBatch: (() => void) | null = null;
    const host = createHost({
      subscribeToSyncEvents: jest.fn((signal) =>
        Promise.resolve(createSignalBoundStream(signal, [
          {
            type: 'message.part.removed',
            properties: {
              sessionID: 'session-1',
              messageID: 'msg-1',
              partID: 'part-a',
            },
          },
        ]))),
      delay: jest.fn((ms) => {
        if (ms === 16) {
          return new Promise<void>((resolve) => {
            releaseBatch = resolve;
          });
        }

        return Promise.resolve();
      }),
    });
    const coordinator = new OpenCodeSyncEventRuntimeCoordinator(host);
    const syncUpdates: SessionSyncEventUpdate[] = [];
    const dispose = coordinator.subscribeToSessionSyncEvents((update) => {
      syncUpdates.push(update);
    });

    await flushAsync();
    expect(syncUpdates).toEqual([]);
    releaseBatch?.();
    await flushAsync();

    expect(syncUpdates).toEqual([
      {
        sessionId: 'session-1',
        type: 'message.part.removed',
        messageId: 'msg-1',
        partId: 'part-a',
      },
    ]);

    dispose();
  });

  it('drops message part removal payloads with missing fields', async () => {
    let releaseBatch: (() => void) | null = null;
    const host = createHost({
      subscribeToSyncEvents: jest.fn((signal) =>
        Promise.resolve(createSignalBoundStream(signal, [
          // Missing partID — createSessionSyncEventUpdate returns null.
          {
            type: 'message.part.removed',
            properties: {
              sessionID: 'session-1',
              messageID: 'msg-1',
            },
          },
          {
            type: 'message.part.updated',
            properties: {
              sessionID: 'session-1',
              part: {
                id: 'part-1',
                sessionID: 'session-1',
                type: 'text',
                messageID: 'msg-1',
              },
              time: 1,
            },
          },
        ]))),
      delay: jest.fn((ms) => {
        if (ms === 16) {
          return new Promise<void>((resolve) => {
            releaseBatch = resolve;
          });
        }

        return Promise.resolve();
      }),
    });
    const coordinator = new OpenCodeSyncEventRuntimeCoordinator(host);
    const syncUpdates: SessionSyncEventUpdate[] = [];
    const dispose = coordinator.subscribeToSessionSyncEvents((update) => {
      syncUpdates.push(update);
    });

    await flushAsync();
    expect(syncUpdates).toEqual([]);
    releaseBatch?.();
    await flushAsync();

    // The malformed message.part.removed is silently dropped; only the valid
    // part-updated survives the batch.
    expect(syncUpdates).toEqual([
      {
        sessionId: 'session-1',
        type: 'message.part.updated',
        part: {
          id: 'part-1',
          sessionID: 'session-1',
          type: 'text',
          messageID: 'msg-1',
        },
        time: 1,
      },
    ]);

    dispose();
  });
});
