import {
  createInitialTabSessionLifecycleState,
  deriveTabSessionPhaseFromLifecycle,
  isForegroundBusyTabSessionPhase,
  type TabSessionLifecycleSignals,
  type TabSessionLifecycleState,
  type TabSessionPhase,
  transitionTabSessionLifecycle,
  type WritableTabSessionPhase,
} from './TabSessionLifecycleState';

export type {
  TabSessionLifecycleSignals,
  TabSessionLifecycleState,
  TabSessionPhase,
  WritableTabSessionPhase,
};

export {
  createInitialTabSessionLifecycleState,
  deriveTabSessionPhaseFromLifecycle,
  isForegroundBusyTabSessionPhase,
  transitionTabSessionLifecycle,
};

export interface TabSessionPhaseSignals extends Omit<TabSessionLifecycleSignals, 'lifecycle'> {
  readonly lifecycle?: TabSessionLifecycleState;
  readonly isStreaming?: boolean;
  readonly isConversationSyncInFlight?: boolean;
}

export function deriveTabSessionPhase(signals: TabSessionPhaseSignals): TabSessionPhase {
  const fallbackLifecycle = createInitialTabSessionLifecycleState();
  const phase = signals.lifecycle?.phase
    ?? (signals.isStreaming ? 'streaming' : null)
    ?? (signals.isConversationSyncInFlight ? 'syncing' : null)
    ?? fallbackLifecycle.phase;

  return deriveTabSessionPhaseFromLifecycle({
    lifecycle: {
      ...(signals.lifecycle ?? fallbackLifecycle),
      phase,
    },
    isSameSessionStreamingInAnotherTab: signals.isSameSessionStreamingInAnotherTab,
    isContextCompacting: signals.isContextCompacting,
    sessionStatus: signals.sessionStatus,
  });
}
