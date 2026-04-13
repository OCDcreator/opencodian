import {
  OpenCodeEventSubscriptionCoordinator,
  type OpenCodeEventSubscriptionCoordinatorHost,
} from '../../../../src/core/opencode/OpenCodeEventSubscriptionCoordinator';
import type { OpenCodeCapabilitySnapshot } from '../../../../src/core/opencode/types';

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

function createCapabilitySnapshot(
  observedExternalTools: string[] = [],
  mcpServers: OpenCodeCapabilitySnapshot['mcp']['servers'] = {},
): OpenCodeCapabilitySnapshot {
  return {
    toolCatalog: {
      registryToolIds: [],
      toolSchemasByModel: {},
      observedExternalTools: [...observedExternalTools].sort(),
      updatedAt: null,
    },
    mcp: {
      servers: mcpServers,
      updatedAt: null,
    },
  };
}

function createHost(
  overrides: Partial<OpenCodeEventSubscriptionCoordinatorHost> = {},
): jest.Mocked<OpenCodeEventSubscriptionCoordinatorHost> {
  return {
    subscribeToEvents: jest.fn((_, signal) => Promise.resolve(createSignalBoundStream(signal))),
    observeRuntimeToolNames: jest.fn(),
    refreshMcpServerStatus: jest.fn().mockResolvedValue({}),
    getCapabilitySnapshot: jest.fn(() => createCapabilitySnapshot()),
    logEventSubscriptionFailure: jest.fn(),
    delay: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<OpenCodeEventSubscriptionCoordinatorHost>;
}

describe('OpenCodeEventSubscriptionCoordinator', () => {
  it('routes open-code events and emits catalog snapshots for catalog-relevant payloads', async () => {
    const observedToolNames = new Set<string>();
    let snapshot = createCapabilitySnapshot();
    let coordinator: OpenCodeEventSubscriptionCoordinator;
    const host = createHost({
      subscribeToEvents: jest.fn((source, signal) =>
        Promise.resolve(createSignalBoundStream(
          signal,
          source === 'event'
            ? [
              {
                type: 'message.part.updated',
                properties: {
                  part: {
                    type: 'tool',
                    tool: 'exa_search',
                  },
                },
              },
              {
                type: 'permission.asked',
                properties: {
                  permission: 'vault_write',
                },
              },
            ]
            : [
              {
                payload: {
                  type: 'message.updated',
                  properties: {
                    info: {
                      tools: {
                        brave_search: true,
                      },
                    },
                  },
                },
              },
              {
                payload: {
                  type: 'mcp.tools.changed',
                  properties: {
                    server: 'exa',
                  },
                },
              },
            ],
        ))),
      observeRuntimeToolNames: jest.fn((toolNames) => {
        for (const toolName of toolNames) {
          observedToolNames.add(toolName);
        }

        snapshot = createCapabilitySnapshot([...observedToolNames]);
      }),
      refreshMcpServerStatus: jest.fn(async () => {
        snapshot = createCapabilitySnapshot(
          [...observedToolNames],
          { exa: { status: 'connected' } },
        );
        coordinator.emitCatalogUpdate();
        return snapshot.mcp.servers;
      }),
      getCapabilitySnapshot: jest.fn(() => snapshot),
    });
    coordinator = new OpenCodeEventSubscriptionCoordinator(host);
    const receivedEvents: string[] = [];
    const catalogSnapshots: OpenCodeCapabilitySnapshot[] = [];

    const disposeEvents = coordinator.subscribeToOpenCodeEvents((event) => {
      const payload = event.payload as { type?: string; payload?: { type?: string } };
      const type = payload.type ?? payload.payload?.type ?? 'unknown';
      receivedEvents.push(type);
    });
    const disposeCatalog = coordinator.subscribeToCatalogUpdates((nextSnapshot) => {
      catalogSnapshots.push(nextSnapshot);
    });

    await flushAsync();
    await flushAsync();

    disposeEvents();
    disposeCatalog();

    expect(receivedEvents).toEqual(expect.arrayContaining([
      'message.part.updated',
      'permission.asked',
      'message.updated',
      'mcp.tools.changed',
    ]));
    expect(host.refreshMcpServerStatus).toHaveBeenCalledTimes(1);
    expect(catalogSnapshots[0]).toEqual(createCapabilitySnapshot());
    expect(catalogSnapshots.at(-1)).toEqual(createCapabilitySnapshot(
      ['exa_search', 'vault_write', 'brave_search'],
      { exa: { status: 'connected' } },
    ));
  });

  it('aborts both SDK streams when the last listener unsubscribes', async () => {
    const signals: Array<{ source: string; signal: AbortSignal }> = [];
    const host = createHost({
      subscribeToEvents: jest.fn((source, signal) => {
        signals.push({ source, signal });
        return Promise.resolve(createSignalBoundStream(signal));
      }),
    });
    const coordinator = new OpenCodeEventSubscriptionCoordinator(host);

    const dispose = coordinator.subscribeToOpenCodeEvents(jest.fn());
    await flushAsync();

    expect(signals).toHaveLength(2);
    expect(signals.every(({ signal }) => signal.aborted === false)).toBe(true);

    dispose();

    expect(signals.every(({ signal }) => signal.aborted)).toBe(true);
  });

  it('restarts both SDK streams when requested with active listeners', async () => {
    const signalsBySource = {
      event: [] as AbortSignal[],
      global: [] as AbortSignal[],
    };
    const host = createHost({
      subscribeToEvents: jest.fn((source, signal) => {
        signalsBySource[source].push(signal);
        return Promise.resolve(createSignalBoundStream(signal));
      }),
    });
    const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
    const dispose = coordinator.subscribeToCatalogUpdates(jest.fn());

    await flushAsync();
    coordinator.restartSubscriptions();
    await flushAsync();
    await flushAsync();

    expect(signalsBySource.event).toHaveLength(2);
    expect(signalsBySource.global).toHaveLength(2);
    expect(signalsBySource.event[0].aborted).toBe(true);
    expect(signalsBySource.global[0].aborted).toBe(true);
    expect(signalsBySource.event[1].aborted).toBe(false);
    expect(signalsBySource.global[1].aborted).toBe(false);

    dispose();
  });

  it('retries failed subscriptions without dropping active listeners', async () => {
    const subscriptionAttempts = {
      event: 0,
      global: 0,
    };
    const failure = new Error('subscribe failed');
    const host = createHost({
      subscribeToEvents: jest.fn((source, signal) => {
        subscriptionAttempts[source] += 1;
        if (source === 'global' && subscriptionAttempts.global === 1) {
          return Promise.reject(failure);
        }

        return Promise.resolve(createSignalBoundStream(signal));
      }),
    });
    const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
    const dispose = coordinator.subscribeToOpenCodeEvents(jest.fn());

    await flushAsync();
    await flushAsync();

    expect(host.logEventSubscriptionFailure).toHaveBeenCalledWith('global', failure);
    expect(subscriptionAttempts.event).toBe(1);
    expect(subscriptionAttempts.global).toBe(2);
    expect(host.delay).toHaveBeenCalledWith(1000, expect.any(AbortSignal));

    dispose();
  });
});
