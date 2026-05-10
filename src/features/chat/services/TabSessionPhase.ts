import type { SessionActivityStatus } from '../../../core/opencode';

export type TabSessionPhase =
  | 'idle'
  | 'streaming'
  | 'syncing'
  | 'compacting'
  | 'server-busy'
  | 'server-retrying';

export interface TabSessionPhaseSignals {
  readonly isStreaming?: boolean;
  readonly isSameSessionStreamingInAnotherTab?: boolean;
  readonly isConversationSyncInFlight?: boolean;
  readonly isContextCompacting?: boolean;
  readonly sessionStatus?: SessionActivityStatus | null;
}

export function deriveTabSessionPhase(signals: TabSessionPhaseSignals): TabSessionPhase {
  if (signals.isStreaming || signals.isSameSessionStreamingInAnotherTab) return 'streaming';
  if (signals.isConversationSyncInFlight) return 'syncing';
  if (signals.isContextCompacting) return 'compacting';
  if (signals.sessionStatus?.type === 'retry') return 'server-retrying';
  if (signals.sessionStatus?.type === 'busy') return 'server-busy';
  return 'idle';
}

export function isForegroundBusyTabSessionPhase(phase: TabSessionPhase): boolean {
  return phase === 'streaming'
    || phase === 'compacting'
    || phase === 'server-busy'
    || phase === 'server-retrying';
}
