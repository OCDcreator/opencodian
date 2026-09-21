/**
 * R-F1 queue semantics tests: the per-tab FIFO queue (multi-message,
 * individually retractable, cancel-surviving by construction — the queue
 * lives in tab runtime state, not the stream), and the pi steer seam.
 */

import { PiAdapter } from '../../../../../src/core/agents/backend/pi/PiAdapter';

type RuntimeState = {
  isStreaming: boolean;
  queuedFollowUpSends?: Array<{ content: string }> | undefined;
};

function coordinatorWith(state: RuntimeState) {
  const states = new Map([['tab-1', state]]);
  return {
    queueFollowUpSend: (tabId: string, request: { content: string }) => {
      const runtime = states.get(tabId);
      if (!runtime?.isStreaming) return false;
      runtime.queuedFollowUpSends ??= [];
      runtime.queuedFollowUpSends.push({ ...request });
      return true;
    },
    consumeQueuedFollowUpSend: (tabId: string) => {
      const queue = states.get(tabId)?.queuedFollowUpSends;
      if (!queue || queue.length === 0) return null;
      return queue.shift() ?? null;
    },
    getQueuedFollowUpSends: (tabId: string) => [...(states.get(tabId)?.queuedFollowUpSends ?? [])],
    removeQueuedFollowUpSend: (tabId: string, index: number) => {
      const queue = states.get(tabId)?.queuedFollowUpSends;
      if (!queue || index < 0 || index >= queue.length) return null;
      return queue.splice(index, 1)[0] ?? null;
    },
  };
}

describe('R-F1 per-tab FIFO queue (runtime coordinator semantics)', () => {
  it('queues multiple messages while streaming and drains FIFO', () => {
    const coordinator = coordinatorWith({ isStreaming: true });
    expect(coordinator.queueFollowUpSend('tab-1', { content: 'first' })).toBe(true);
    expect(coordinator.queueFollowUpSend('tab-1', { content: 'second' })).toBe(true);
    expect(coordinator.queueFollowUpSend('tab-1', { content: 'third' })).toBe(true);
    expect(coordinator.getQueuedFollowUpSends('tab-1').map((q) => q.content))
      .toEqual(['first', 'second', 'third']);
    expect(coordinator.consumeQueuedFollowUpSend('tab-1')?.content).toBe('first');
    expect(coordinator.consumeQueuedFollowUpSend('tab-1')?.content).toBe('second');
    expect(coordinator.getQueuedFollowUpSends('tab-1').map((q) => q.content)).toEqual(['third']);
  });

  it('retracts individual items by index and tolerates bad indices', () => {
    const coordinator = coordinatorWith({ isStreaming: true });
    coordinator.queueFollowUpSend('tab-1', { content: 'a' });
    coordinator.queueFollowUpSend('tab-1', { content: 'b' });
    coordinator.queueFollowUpSend('tab-1', { content: 'c' });
    expect(coordinator.removeQueuedFollowUpSend('tab-1', 1)?.content).toBe('b');
    expect(coordinator.getQueuedFollowUpSends('tab-1').map((q) => q.content)).toEqual(['a', 'c']);
    expect(coordinator.removeQueuedFollowUpSend('tab-1', 9)).toBeNull();
    expect(coordinator.removeQueuedFollowUpSend('tab-1', -1)).toBeNull();
  });

  it('refuses queueing while not streaming and the queue survives stream end', () => {
    const state: RuntimeState = { isStreaming: true };
    const coordinator = coordinatorWith(state);
    coordinator.queueFollowUpSend('tab-1', { content: 'kept' });
    state.isStreaming = false; // stream ended / was cancelled
    expect(coordinator.queueFollowUpSend('tab-1', { content: 'no' })).toBe(false);
    expect(coordinator.getQueuedFollowUpSends('tab-1').map((q) => q.content)).toEqual(['kept']);
    // Retraction still works after the turn ended.
    expect(coordinator.removeQueuedFollowUpSend('tab-1', 0)?.content).toBe('kept');
  });
});

describe('PiAdapter.steerTurn (native RPC streamingBehavior seam)', () => {
  function adapterWithActiveRun(requestImpl: (command: unknown) => Promise<unknown>) {
    const adapter = new PiAdapter({ workingDirectory: "/tmp" } as never);
    const runs = (adapter as unknown as {
      runs: Map<string, { cancelled: boolean; client?: { request: typeof requestImpl } }>;
    }).runs;
    runs.set('session-1', { cancelled: false, client: { request: requestImpl } });
    return adapter;
  }

  it('sends prompt with streamingBehavior steer over the ACTIVE run client', async () => {
    const sent: unknown[] = [];
    const adapter = adapterWithActiveRun(async (command) => {
      sent.push(command);
      return { success: true };
    });
    await expect(adapter.steerTurn('session-1', 'stop, do this instead')).resolves.toBe(true);
    expect(sent).toEqual([
      { type: 'prompt', message: 'stop, do this instead', streamingBehavior: 'steer' },
    ]);
  });

  it('resolves false when the backend refuses or there is no active run', async () => {
    const refused = adapterWithActiveRun(async () => ({ success: false, error: 'nope' }));
    await expect(refused.steerTurn('session-1', 'x')).resolves.toBe(false);

    const threw = adapterWithActiveRun(async () => {
      throw new Error('rpc down');
    });
    await expect(threw.steerTurn('session-1', 'x')).resolves.toBe(false);

    const idle = new PiAdapter({ workingDirectory: "/tmp" } as never);
    await expect(idle.steerTurn('no-such-session', 'x')).resolves.toBe(false);
  });
});
