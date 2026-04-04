export const AUTO_SCROLL_NEAR_BOTTOM_THRESHOLD_PX = 100;
export const AUTO_SCROLL_GUARD_MS_INSTANT = 120;
export const AUTO_SCROLL_GUARD_MS_SMOOTH = 500;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface AutoScrollSnapshot {
  autoScrollEnabled: boolean;
  isNearBottom: boolean;
  programmaticScrollGuardUntil: number;
}

export function getDistanceFromBottom(metrics: ScrollMetrics): number {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
}

export function isNearBottom(
  metrics: ScrollMetrics,
  threshold = AUTO_SCROLL_NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  return getDistanceFromBottom(metrics) <= threshold;
}

export function applyUserScrollIntent(
  state: AutoScrollSnapshot,
  nearBottom: boolean,
): AutoScrollSnapshot {
  return {
    ...state,
    autoScrollEnabled: nearBottom,
    isNearBottom: nearBottom,
  };
}

export function applyPassiveScrollMeasurement(
  state: AutoScrollSnapshot,
  nearBottom: boolean,
): AutoScrollSnapshot {
  return {
    ...state,
    isNearBottom: nearBottom,
  };
}

export function getProgrammaticScrollGuardDelayMs(
  behavior: ScrollBehavior = 'auto',
): number {
  return behavior === 'smooth' ? AUTO_SCROLL_GUARD_MS_SMOOTH : AUTO_SCROLL_GUARD_MS_INSTANT;
}

export function hasProgrammaticScrollGuard(
  state: AutoScrollSnapshot,
  now = Date.now(),
): boolean {
  return state.programmaticScrollGuardUntil > now;
}
