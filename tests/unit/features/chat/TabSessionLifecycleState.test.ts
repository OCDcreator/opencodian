import {
  createInitialTabSessionLifecycleState,
  deriveTabSessionPhaseFromLifecycle,
  isForegroundBusyTabSessionPhase,
  transitionTabSessionLifecycle,
} from '../../../../src/features/chat/services/TabSessionLifecycleState';

describe('TabSessionLifecycleState', () => {
  it('starts idle and treats idle as not foreground busy', () => {
    const state = createInitialTabSessionLifecycleState();

    expect(state.phase).toBe('idle');
    expect(state.sequence).toBe(0);
    expect(isForegroundBusyTabSessionPhase(state.phase)).toBe(false);
  });

  it('increments a monotonic sequence for every accepted transition', () => {
    const idle = createInitialTabSessionLifecycleState();
    const preparing = transitionTabSessionLifecycle(idle, 'preparing', 'send-preflight');
    const streaming = transitionTabSessionLifecycle(preparing, 'streaming', 'stream-started');
    const finalizing = transitionTabSessionLifecycle(streaming, 'finalizing', 'stream-finally');
    const syncing = transitionTabSessionLifecycle(finalizing, 'syncing', 'server-sync');
    const done = transitionTabSessionLifecycle(syncing, 'idle', 'final-save');

    expect([preparing.phase, streaming.phase, finalizing.phase, syncing.phase, done.phase]).toEqual([
      'preparing',
      'streaming',
      'finalizing',
      'syncing',
      'idle',
    ]);
    expect(done.sequence).toBe(5);
    expect(done.reason).toBe('final-save');
  });

  it('keeps all active local phases foreground busy', () => {
    expect(isForegroundBusyTabSessionPhase('preparing')).toBe(true);
    expect(isForegroundBusyTabSessionPhase('streaming')).toBe(true);
    expect(isForegroundBusyTabSessionPhase('finalizing')).toBe(true);
    expect(isForegroundBusyTabSessionPhase('syncing')).toBe(true);
    expect(isForegroundBusyTabSessionPhase('cancelled')).toBe(false);
    expect(isForegroundBusyTabSessionPhase('error')).toBe(false);
  });

  it('keeps server and context overlays lower priority than local lifecycle phases', () => {
    expect(deriveTabSessionPhaseFromLifecycle({
      lifecycle: transitionTabSessionLifecycle(createInitialTabSessionLifecycleState(), 'syncing', 'sync'),
      isContextCompacting: true,
      sessionStatus: { type: 'busy' },
    })).toBe('syncing');

    expect(deriveTabSessionPhaseFromLifecycle({
      lifecycle: createInitialTabSessionLifecycleState(),
      isContextCompacting: true,
      sessionStatus: { type: 'retry', attempt: 1, message: 'retrying', next: 1 },
    })).toBe('compacting');

    expect(deriveTabSessionPhaseFromLifecycle({
      lifecycle: createInitialTabSessionLifecycleState(),
      sessionStatus: { type: 'busy' },
    })).toBe('server-busy');
  });
});
