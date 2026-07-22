/* eslint-disable max-lines, max-lines-per-function -- Event subscription tests keep shared stream/host fixtures and plugin-evidence state-machine scenarios in one suite. */

import type {
  OpenCodeEventListener,
  OpenCodeEventSubscriptionCoordinatorHost,
  OpenCodeEventUnsubscribe,
  OpenCodePluginEvidenceObserver,
  PluginEvidenceSnapshot,
} from '../../../../src/core/opencode/OpenCodeEventSubscriptionCoordinator';
import { OpenCodeEventSubscriptionCoordinator } from '../../../../src/core/opencode/OpenCodeEventSubscriptionCoordinator';

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

function createPushStream() {
  const queue: unknown[] = [];
  const waitingResolvers: Array<(value: IteratorResult<unknown>) => void> = [];
  let done = false;

  const push = (event: unknown): void => {
    if (done) {
      return;
    }
    if (waitingResolvers.length > 0) {
      const resolve = waitingResolvers.shift()!;
      resolve({ value: event, done: false });
      return;
    }
    queue.push(event);
  };

  const stream = (signal: AbortSignal): AsyncIterable<unknown> => ({
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (done || signal.aborted) {
            return { value: undefined, done: true };
          }
          if (queue.length > 0) {
            return { value: queue.shift(), done: false };
          }
          return new Promise<IteratorResult<unknown>>((resolve) => {
            const onAbort = (): void => {
              done = true;
              resolve({ value: undefined, done: true });
            };
            signal.addEventListener('abort', onAbort, { once: true });
            waitingResolvers.push((value) => {
              signal.removeEventListener('abort', onAbort);
              resolve(value);
            });
          });
        },
      };
    },
  });

  return { push, stream };
}

function createHost(
  overrides: Partial<OpenCodeEventSubscriptionCoordinatorHost> = {},
): jest.Mocked<OpenCodeEventSubscriptionCoordinatorHost> {
  return {
    subscribeToEvents: jest.fn((_, signal) => Promise.resolve(createSignalBoundStream(signal))),
    hasCatalogUpdateListeners: jest.fn(() => false),
    observeRuntimeToolNames: jest.fn(() => false),
    emitCatalogUpdate: jest.fn(),
    refreshMcpServerStatus: jest.fn().mockResolvedValue({}),
    logEventSubscriptionFailure: jest.fn(),
    delay: jest.fn().mockResolvedValue(undefined),
    getConnectionSignature: jest.fn(() => 'gen-1'),
    fetchPluginConfig: jest.fn().mockResolvedValue({ plugin: [] }),
    ...overrides,
  } as jest.Mocked<OpenCodeEventSubscriptionCoordinatorHost>;
}

describe('OpenCodeEventSubscriptionCoordinator', () => {
  it('routes open-code events and triggers catalog host actions for catalog-relevant payloads', async () => {
    const observedToolNames = new Set<string>();
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
        let changed = false;
        for (const toolName of toolNames) {
          if (!observedToolNames.has(toolName)) {
            observedToolNames.add(toolName);
            changed = true;
          }
        }

        return changed;
      }),
    });
    const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
    const receivedEvents: string[] = [];

    const dispose = coordinator.subscribeToOpenCodeEvents((event) => {
      const payload = event.payload as { type?: string; payload?: { type?: string } };
      const type = payload.type ?? payload.payload?.type ?? 'unknown';
      receivedEvents.push(type);
    });

    await flushAsync();
    await flushAsync();

    dispose();

    expect(receivedEvents).toEqual(expect.arrayContaining([
      'message.part.updated',
      'permission.asked',
      'message.updated',
      'mcp.tools.changed',
    ]));
    expect([...observedToolNames].sort()).toEqual(['brave_search', 'exa_search', 'vault_write']);
    expect(host.emitCatalogUpdate).toHaveBeenCalledTimes(3);
    expect(host.refreshMcpServerStatus).toHaveBeenCalledTimes(1);
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

  it('restarts both SDK streams when active catalog listeners still need subscriptions', async () => {
    const signalsBySource = {
      event: [] as AbortSignal[],
      global: [] as AbortSignal[],
    };
    const host = createHost({
      hasCatalogUpdateListeners: jest.fn(() => true),
      subscribeToEvents: jest.fn((source, signal) => {
        signalsBySource[source].push(signal);
        return Promise.resolve(createSignalBoundStream(signal));
      }),
    });
    const coordinator = new OpenCodeEventSubscriptionCoordinator(host);

    coordinator.ensureSubscriptions();
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

  describe('plugin evidence', () => {
    function createPluginHost(
      options: {
        eventStream?: unknown[];
        globalStream?: unknown[];
        connectionSignature?: string;
        pluginConfig?: unknown;
      } = {},
    ): jest.Mocked<OpenCodeEventSubscriptionCoordinatorHost> {
      const {
        eventStream = [],
        globalStream = [],
        connectionSignature = 'gen-1',
        pluginConfig = { plugin: [] },
      } = options;

      return createHost({
        getConnectionSignature: jest.fn(() => connectionSignature),
        fetchPluginConfig: jest.fn().mockResolvedValue(pluginConfig),
        subscribeToEvents: jest.fn((source, signal) =>
          Promise.resolve(createSignalBoundStream(signal, source === 'event' ? eventStream : globalStream))),
      });
    }

    it('captures plugin.added events from both direct and nested payloads', async () => {
      const host = createPluginHost({
        eventStream: [{ type: 'plugin.added', properties: { id: 'event-plugin' } }],
        globalStream: [{ payload: { type: 'plugin.added', properties: { id: 'global-plugin' } } }],
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      coordinator.subscribeToOpenCodeEvents(jest.fn());

      await flushAsync();
      await flushAsync();

      const snapshot = coordinator.getPluginEvidenceSnapshot();
      const runtimeIds = snapshot.runtime.map((evidence) => evidence.runtimeId).sort();
      expect(runtimeIds).toEqual(['event-plugin', 'global-plugin']);
    });

    it('ignores plugin.removed, plugin.load-error, malformed payloads, and unrelated events', async () => {
      const host = createPluginHost({
        eventStream: [
          { type: 'plugin.removed', properties: { id: 'removed' } },
          { type: 'plugin.load-error', properties: { id: 'error' } },
          { type: 'plugin.added', properties: { id: '' } },
          { type: 'plugin.added' },
          { type: 'unrelated.event', properties: { id: 'ignored' } },
        ],
        globalStream: [
          { payload: { type: 'plugin.added', properties: { id: 123 } } },
        ],
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      coordinator.subscribeToOpenCodeEvents(jest.fn());

      await flushAsync();
      await flushAsync();

      const snapshot = coordinator.getPluginEvidenceSnapshot();
      expect(snapshot.runtime).toHaveLength(0);
      expect(snapshot.staleRuntime).toHaveLength(0);
    });

    it('deduplicates the same runtime id within one generation and accumulates sources/timestamps', async () => {
      const host = createPluginHost({
        eventStream: [
          { type: 'plugin.added', properties: { id: 'shared' } },
          { type: 'plugin.added', properties: { id: 'shared' } },
        ],
        globalStream: [
          { payload: { type: 'plugin.added', properties: { id: 'shared' } } },
        ],
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      coordinator.subscribeToOpenCodeEvents(jest.fn());

      await flushAsync();
      await flushAsync();

      const snapshot = coordinator.getPluginEvidenceSnapshot();
      expect(snapshot.runtime).toHaveLength(1);
      const evidence = snapshot.runtime[0];
      expect(evidence.runtimeId).toBe('shared');
      expect(evidence.sources.sort()).toEqual(['event', 'global']);
      expect(evidence.firstObservedAt).toBeLessThanOrEqual(evidence.lastObservedAt);
    });

    it('keeps both streams alive while a plugin-evidence listener is subscribed', async () => {
      const host = createPluginHost();
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      const signals: Array<{ source: string; signal: AbortSignal }> = [];
      host.subscribeToEvents.mockImplementation((source, signal) => {
        signals.push({ source, signal });
        return Promise.resolve(createSignalBoundStream(signal));
      });

      const dispose = coordinator.subscribeToPluginEvidence(jest.fn());
      await flushAsync();

      expect(signals).toHaveLength(2);
      expect(signals.every(({ signal }) => signal.aborted === false)).toBe(true);

      dispose();

      expect(signals.every(({ signal }) => signal.aborted)).toBe(true);
    });

    it('supports object observer alongside legacy raw listener with isolated channels', async () => {
      const eventPush = createPushStream();
      const globalPush = createPushStream();
      const observerFetch = jest.fn().mockResolvedValue({ plugin: ['observer-plugin'] });
      const host = createHost({
        getConnectionSignature: jest.fn().mockReturnValue('gen-1'),
        subscribeToEvents: jest.fn((source, signal) =>
          Promise.resolve(source === 'event' ? eventPush.stream(signal) : globalPush.stream(signal))),
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);

      const rawEvents: Array<{ source: string; payload: unknown }> = [];
      const rawListener: OpenCodeEventListener = (envelope) => {
        rawEvents.push({ source: envelope.source, payload: envelope.payload });
      };

      const evidenceSnapshots: PluginEvidenceSnapshot[] = [];
      const observer: OpenCodePluginEvidenceObserver = {
        onPluginEvidence: (snapshot) => evidenceSnapshots.push(snapshot),
        getConnectionSignature: jest.fn().mockReturnValue('gen-1'),
        fetchPluginConfig: observerFetch,
      };

      const rawDispose = coordinator.subscribeToOpenCodeEvents(rawListener);
      const observerDispose = coordinator.subscribeToOpenCodeEvents(observer);
      await flushAsync();

      expect(typeof (observerDispose as OpenCodeEventUnsubscribe).getPluginEvidenceSnapshot).toBe('function');
      expect(typeof (observerDispose as OpenCodeEventUnsubscribe).refreshPluginConfigEvidence).toBe('function');

      await (observerDispose as OpenCodeEventUnsubscribe).refreshPluginConfigEvidence();
      expect(observerFetch).toHaveBeenCalledTimes(1);
      expect(host.fetchPluginConfig).not.toHaveBeenCalled();

      eventPush.push({ type: 'plugin.added', properties: { id: 'event-plugin' } });
      await flushAsync();
      await flushAsync();

      const lastEvidence = evidenceSnapshots[evidenceSnapshots.length - 1];
      expect(lastEvidence.runtime.map((evidence) => evidence.runtimeId)).toContain('event-plugin');

      const lastRaw = rawEvents[rawEvents.length - 1];
      expect(lastRaw.source).toBe('event');
      expect((lastRaw.payload as { type: string }).type).toBe('plugin.added');

      const rawCountBeforeObserverDispose = rawEvents.length;
      observerDispose();

      eventPush.push({ type: 'plugin.added', properties: { id: 'after-observer-dispose' } });
      await flushAsync();
      await flushAsync();

      expect(rawEvents.length).toBe(rawCountBeforeObserverDispose + 1);
      expect(evidenceSnapshots[evidenceSnapshots.length - 1].runtime.map((evidence) => evidence.runtimeId))
        .not.toContain('after-observer-dispose');

      rawDispose();
      const rawCountBeforeRawDispose = rawEvents.length;
      eventPush.push({ type: 'plugin.added', properties: { id: 'after-raw-dispose' } });
      await flushAsync();
      await flushAsync();

      expect(rawEvents.length).toBe(rawCountBeforeRawDispose);
    });

    it('marks prior runtime evidence stale when the connection generation changes', async () => {
      let signature = 'gen-1';
      const host = createPluginHost({
        connectionSignature: signature,
        eventStream: [{ type: 'plugin.added', properties: { id: 'old' } }],
      });
      host.getConnectionSignature.mockImplementation(() => signature);
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      coordinator.subscribeToOpenCodeEvents(jest.fn());

      await flushAsync();
      await flushAsync();

      signature = 'gen-2';
      host.subscribeToEvents.mockImplementation((source, signal) =>
        Promise.resolve(createSignalBoundStream(signal, [])));
      coordinator.restartSubscriptions();
      await flushAsync();

      const snapshot = coordinator.getPluginEvidenceSnapshot();
      expect(snapshot.runtime).toHaveLength(0);
      expect(snapshot.staleRuntime).toHaveLength(1);
      expect(snapshot.staleRuntime[0].runtimeId).toBe('old');
      expect(snapshot.staleRuntime[0].stale).toBe(true);
    });

    it('treats the same runtime id observed in a new generation as a distinct current evidence record', async () => {
      let signature = 'gen-1';
      const host = createPluginHost({
        connectionSignature: signature,
        eventStream: [{ type: 'plugin.added', properties: { id: 'shared' } }],
      });
      host.getConnectionSignature.mockImplementation(() => signature);
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      coordinator.subscribeToOpenCodeEvents(jest.fn());

      await flushAsync();
      await flushAsync();

      signature = 'gen-2';
      host.subscribeToEvents.mockImplementation((source, signal) =>
        Promise.resolve(createSignalBoundStream(signal, source === 'event'
          ? [{ type: 'plugin.added', properties: { id: 'shared' } }]
          : [])));
      coordinator.restartSubscriptions();
      await flushAsync();
      await flushAsync();

      const snapshot = coordinator.getPluginEvidenceSnapshot();
      expect(snapshot.runtime).toHaveLength(1);
      expect(snapshot.runtime[0].generation).toBe('gen-2');
      expect(snapshot.staleRuntime).toHaveLength(1);
      expect(snapshot.staleRuntime[0].generation).toBe('gen-1');
    });

    it('normalizes valid sdk config specs and ignores invalid members', async () => {
      const host = createPluginHost({
        pluginConfig: {
          plugin: [
            '@scope/plugin',
            ['local', { path: './p' }],
            ['tuple-too-long', { a: 1 }, 'extra'],
            123,
            { not: 'valid' },
          ],
        },
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);

      const snapshot = await coordinator.refreshPluginConfigEvidence();

      expect(snapshot.effective?.plugin).toEqual([
        '@scope/plugin',
        ['local', { path: './p' }],
      ]);
      expect(snapshot.fetch.status).toBe('ready');
      expect(snapshot.fetch.error).toBeNull();
    });

    it('preserves stale successful evidence when the connection changes during a refresh', async () => {
      let signature = 'gen-1';
      const host = createPluginHost({
        connectionSignature: signature,
        pluginConfig: { plugin: ['stable-plugin'] },
      });
      host.fetchPluginConfig.mockImplementation(async () => {
        signature = 'gen-2';
        return { plugin: ['stable-plugin'] };
      });
      host.getConnectionSignature.mockImplementation(() => signature);
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);

      const snapshot = await coordinator.refreshPluginConfigEvidence();

      expect(snapshot.effective).toBeNull();
      expect(snapshot.previousEffective?.plugin).toEqual(['stable-plugin']);
      expect(snapshot.previousEffective?.stale).toBe(true);
      expect(snapshot.fetch.status).toBe('error');
      expect(snapshot.fetch.error).toBe('Connection changed during config fetch');
    });

    it('represents a config fetch failure separately without mislabeling old success as current', async () => {
      const host = createPluginHost({
        pluginConfig: { plugin: ['initial-plugin'] },
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      await coordinator.refreshPluginConfigEvidence();

      host.fetchPluginConfig.mockRejectedValue(new Error('network down'));
      const snapshot = await coordinator.refreshPluginConfigEvidence();

      expect(snapshot.effective).toBeNull();
      expect(snapshot.previousEffective?.plugin).toEqual(['initial-plugin']);
      expect(snapshot.previousEffective?.stale).toBe(true);
      expect(snapshot.fetch.status).toBe('error');
      expect(snapshot.fetch.error).toBe('network down');
    });

    it('returns defensive snapshots that cannot mutate coordinator state', async () => {
      const host = createPluginHost({
        pluginConfig: { plugin: ['plugin-a'] },
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      const snapshot = await coordinator.refreshPluginConfigEvidence();

      snapshot.effective?.plugin.push('injected');
      if (snapshot.effective && typeof snapshot.effective.plugin[1] !== 'string') {
        (snapshot.effective.plugin[1] as [string, Record<string, unknown>])[1].path = 'mutated';
      }

      const next = coordinator.getPluginEvidenceSnapshot();
      expect(next.effective?.plugin).toEqual(['plugin-a']);
    });

    it('reports no runtime evidence when no plugin.added events were observed', () => {
      const coordinator = new OpenCodeEventSubscriptionCoordinator(createPluginHost());
      const snapshot = coordinator.getPluginEvidenceSnapshot();
      expect(snapshot.runtime).toHaveLength(0);
      expect(snapshot.staleRuntime).toHaveLength(0);
    });

    it('observes generation on snapshot read and exposes connectionGeneration', () => {
      let signature = 'gen-1';
      const host = createPluginHost({ connectionSignature: signature });
      host.getConnectionSignature.mockImplementation(() => signature);
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      coordinator.subscribeToPluginEvidence(jest.fn());

      const before = coordinator.getPluginEvidenceSnapshot();
      expect(before.connectionGeneration).toBe('gen-1');
      expect(before.transport.captureGeneration).toBe('gen-1');

      signature = 'gen-2';
      const after = coordinator.getPluginEvidenceSnapshot();
      expect(after.connectionGeneration).toBe('gen-2');
      expect(after.transport.captureGeneration).toBeNull();
    });

    it('marks old effective/runtime evidence stale on a snapshot read after generation change', async () => {
      let signature = 'gen-1';
      const host = createPluginHost({
        connectionSignature: signature,
        pluginConfig: { plugin: ['plugin-a'] },
      });
      host.getConnectionSignature.mockImplementation(() => signature);
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      coordinator.subscribeToPluginEvidence(jest.fn());
      await coordinator.refreshPluginConfigEvidence();

      signature = 'gen-2';
      const snapshot = coordinator.getPluginEvidenceSnapshot();

      expect(snapshot.connectionGeneration).toBe('gen-2');
      expect(snapshot.effective).toBeNull();
      expect(snapshot.previousEffective?.plugin).toEqual(['plugin-a']);
      expect(snapshot.previousEffective?.stale).toBe(true);
      expect(snapshot.runtime).toHaveLength(0);
      expect(snapshot.staleRuntime).toHaveLength(0);
    });

    it('restores capture generation and start timestamp when an event arrives after rotation', async () => {
      let signature = 'gen-1';
      const eventPush = createPushStream();
      const globalPush = createPushStream();
      const host = createHost({
        getConnectionSignature: jest.fn(() => signature),
        subscribeToEvents: jest.fn((source, signal) =>
          Promise.resolve(source === 'event' ? eventPush.stream(signal) : globalPush.stream(signal))),
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      coordinator.subscribeToPluginEvidence(jest.fn());
      await flushAsync();

      signature = 'gen-2';
      const beforeRotation = coordinator.getPluginEvidenceSnapshot();
      expect(beforeRotation.transport.captureGeneration).toBeNull();
      const afterRotationTime = Date.now();

      eventPush.push({ type: 'plugin.added', properties: { id: 'after-rotation' } });
      await flushAsync();
      await flushAsync();

      const snapshot = coordinator.getPluginEvidenceSnapshot();
      expect(snapshot.connectionGeneration).toBe('gen-2');
      expect(snapshot.transport.captureGeneration).toBe('gen-2');
      expect(snapshot.transport.captureStartedAt).toBeGreaterThanOrEqual(afterRotationTime);
      expect(snapshot.runtime).toHaveLength(1);
      expect(snapshot.runtime[0].runtimeId).toBe('after-rotation');
    });

    it('deep-clones nested plugin options and isolates snapshots per listener', async () => {
      const host = createPluginHost({
        pluginConfig: {
          plugin: [
            ['local', { path: './p', nested: { array: [1, 2] } }],
          ],
        },
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      const received: Array<PluginEvidenceSnapshot | undefined> = [];
      coordinator.subscribeToPluginEvidence((snapshot) => {
        received.push(snapshot);
      });
      await coordinator.refreshPluginConfigEvidence();

      expect(received.length).toBe(2);
      const idle = received[0];
      const ready = received[1];
      expect(ready?.effective?.plugin).toEqual([
        ['local', { path: './p', nested: { array: [1, 2] } }],
      ]);

      const optionRecord = (ready?.effective?.plugin[0] as [string, Record<string, unknown>])[1];
      optionRecord.nested.array.push(3);

      const next = coordinator.getPluginEvidenceSnapshot();
      const nextOption = (next.effective?.plugin[0] as [string, Record<string, unknown>])[1];
      expect(nextOption.nested.array).toEqual([1, 2]);

      expect(idle?.fetch.status).toBe('idle');
    });

    it('emits independent snapshots to multiple listeners', async () => {
      const host = createPluginHost({
        pluginConfig: { plugin: ['plugin-a'] },
      });
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      const listenerA: PluginEvidenceSnapshot[] = [];
      const listenerB: PluginEvidenceSnapshot[] = [];
      coordinator.subscribeToPluginEvidence((snapshot) => listenerA.push(snapshot));
      coordinator.subscribeToPluginEvidence((snapshot) => listenerB.push(snapshot));

      await coordinator.refreshPluginConfigEvidence();

      expect(listenerA.length).toBe(2);
      expect(listenerB.length).toBe(2);
      listenerA[1].effective?.plugin.push('mutated-in-a');
      expect(listenerB[1].effective?.plugin).toEqual(['plugin-a']);
    });

    it('only the latest refresh attempt commits effective/fetch state', async () => {
      const signature = 'gen-1';
      const host = createPluginHost({
        connectionSignature: signature,
        pluginConfig: { plugin: ['first'] },
      });
      host.getConnectionSignature.mockImplementation(() => signature);
      const coordinator = new OpenCodeEventSubscriptionCoordinator(host);
      coordinator.subscribeToPluginEvidence(jest.fn());

      let resolveSlow: (value: unknown) => void = () => {};
      host.fetchPluginConfig.mockImplementation(async () => {
        return new Promise((resolve) => { resolveSlow = resolve; });
      });

      const slowPromise = coordinator.refreshPluginConfigEvidence();

      host.fetchPluginConfig.mockResolvedValue({ plugin: ['second'] });
      const fastPromise = coordinator.refreshPluginConfigEvidence();

      const fast = await fastPromise;
      expect(fast.effective?.plugin).toEqual(['second']);

      resolveSlow({ plugin: ['first'] });
      const slow = await slowPromise;

      expect(slow.effective?.plugin).toEqual(['second']);
      const final = coordinator.getPluginEvidenceSnapshot();
      expect(final.effective?.plugin).toEqual(['second']);
      expect(final.previousEffective).toBeNull();
    });
  });
});
