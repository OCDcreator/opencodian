import type { SessionActivityStatus } from '../../../core/opencode';

export type WritableTabSessionPhase =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'finalizing'
  | 'syncing'
  | 'cancelled'
  | 'error';

export type TabSessionPhase =
  | WritableTabSessionPhase
  | 'compacting'
  | 'server-busy'
  | 'server-retrying';

export interface TabSessionLifecycleState {
  readonly phase: WritableTabSessionPhase;
  readonly sequence: number;
  readonly reason: string | null;
  readonly changedAt: number;
}

export interface TabSessionLifecycleSignals {
  readonly lifecycle: TabSessionLifecycleState;
  readonly isSameSessionStreamingInAnotherTab?: boolean;
  readonly isContextCompacting?: boolean;
  readonly sessionStatus?: SessionActivityStatus | null;
}

export function createInitialTabSessionLifecycleState(now = 0): TabSessionLifecycleState {
  return {
    phase: 'idle',
    sequence: 0,
    reason: null,
    changedAt: now,
  };
}

export function transitionTabSessionLifecycle(
  state: TabSessionLifecycleState,
  phase: WritableTabSessionPhase,
  reason: string,
  now = Date.now(),
): TabSessionLifecycleState {
  if (state.phase === phase && state.reason === reason) {
    return state;
  }

  return {
    phase,
    sequence: state.sequence + 1,
    reason,
    changedAt: now,
  };
}

export function deriveTabSessionPhaseFromLifecycle(
  signals: TabSessionLifecycleSignals,
): TabSessionPhase {
  if (
    signals.lifecycle.phase === 'preparing'
    || signals.lifecycle.phase === 'streaming'
    || signals.lifecycle.phase === 'finalizing'
    || signals.lifecycle.phase === 'syncing'
  ) {
    return signals.lifecycle.phase;
  }

  if (signals.isSameSessionStreamingInAnotherTab) {
    return 'streaming';
  }

  if (signals.isContextCompacting) {
    return 'compacting';
  }

  if (signals.sessionStatus?.type === 'retry') {
    return 'server-retrying';
  }

  if (signals.sessionStatus?.type === 'busy') {
    return 'server-busy';
  }

  return signals.lifecycle.phase;
}

export function isForegroundBusyTabSessionPhase(phase: TabSessionPhase): boolean {
  return phase === 'preparing'
    || phase === 'streaming'
    || phase === 'finalizing'
    || phase === 'syncing'
    || phase === 'compacting'
    || phase === 'server-busy'
    || phase === 'server-retrying';
}
