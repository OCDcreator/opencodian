import {
  applyPassiveScrollMeasurement,
  applyUserScrollIntent,
  AUTO_SCROLL_GUARD_MS_INSTANT,
  AUTO_SCROLL_GUARD_MS_SMOOTH,
  AUTO_SCROLL_NEAR_BOTTOM_THRESHOLD_PX,
  type AutoScrollSnapshot,
  getDistanceFromBottom,
  getProgrammaticScrollGuardDelayMs,
  hasProgrammaticScrollGuard,
  isNearBottom,
} from '../../../../src/features/chat/autoScrollState';

describe('autoScrollState', () => {
  const baseState: AutoScrollSnapshot = {
    autoScrollEnabled: true,
    isNearBottom: true,
    programmaticScrollGuardUntil: 0,
  };

  it('treats positions within the threshold as near bottom', () => {
    expect(isNearBottom({
      scrollTop: 700,
      scrollHeight: 1300,
      clientHeight: 520,
    })).toBe(true);

    expect(isNearBottom({
      scrollTop: 679,
      scrollHeight: 1300,
      clientHeight: 520,
    })).toBe(false);
  });

  it('turns auto-scroll off when the user leaves the bottom zone', () => {
    expect(applyUserScrollIntent(baseState, false)).toEqual({
      ...baseState,
      autoScrollEnabled: false,
      isNearBottom: false,
    });
  });

  it('restores auto-scroll when the user comes back near the bottom', () => {
    expect(applyUserScrollIntent({
      ...baseState,
      autoScrollEnabled: false,
      isNearBottom: false,
    }, true)).toEqual(baseState);
  });

  it('keeps the current auto-scroll intent on passive layout changes', () => {
    expect(applyPassiveScrollMeasurement({
      ...baseState,
      autoScrollEnabled: false,
    }, false)).toEqual({
      ...baseState,
      autoScrollEnabled: false,
      isNearBottom: false,
    });
  });

  it('reports distance from bottom using scroll metrics', () => {
    expect(getDistanceFromBottom({
      scrollTop: 480,
      scrollHeight: 1200,
      clientHeight: 620,
    })).toBe(100);
  });

  it('exposes guard durations for instant and smooth programmatic scrolls', () => {
    expect(getProgrammaticScrollGuardDelayMs()).toBe(AUTO_SCROLL_GUARD_MS_INSTANT);
    expect(getProgrammaticScrollGuardDelayMs('smooth')).toBe(AUTO_SCROLL_GUARD_MS_SMOOTH);
    expect(AUTO_SCROLL_NEAR_BOTTOM_THRESHOLD_PX).toBe(100);
  });

  it('detects whether a programmatic scroll guard is still active', () => {
    expect(hasProgrammaticScrollGuard({
      ...baseState,
      programmaticScrollGuardUntil: 250,
    }, 200)).toBe(true);

    expect(hasProgrammaticScrollGuard({
      ...baseState,
      programmaticScrollGuardUntil: 250,
    }, 250)).toBe(false);
  });
});
