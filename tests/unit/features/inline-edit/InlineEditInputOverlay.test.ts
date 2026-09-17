/**
 * Placement of the floating instruction bar relative to its anchor line.
 *
 * This is the pure half of the overlay's positioning: the DOM readings happen
 * in the overlay itself, so the flip decision can be pinned down here without a
 * live editor (and without a foreground window, which the rAF-driven
 * positioning needs).
 */

import { resolvePanelTop } from '../../../../src/features/inline-edit/InlineEditOverlayPrimitives';

/** Editor viewport used by the cases below; gap 6 + inset 8 match the module. */
const VIEWPORT = 600;

function place(anchorTop: number, anchorBottom: number, panelHeight: number): number {
  return resolvePanelTop({ anchorTop, anchorBottom, viewportHeight: VIEWPORT, panelHeight });
}

describe('resolvePanelTop', () => {
  it('places a short bar directly below the anchor line', () => {
    expect(place(100, 120, 92)).toBe(126);
  });

  it('flips a tall bar above the anchor when it no longer fits below', () => {
    // Anchor near the bottom: 600 - 540 - 6 - 8 = 46px of room, panel is 194.
    expect(place(520, 540, 194)).toBe(520 - 194 - 6);
  });

  it('stays below when the bar fits neither way, so reading order is kept', () => {
    // A 500px bar with only 46px below and 220px above: neither side fits.
    expect(place(220, 240, 500)).toBe(246);
  });

  it('flips at the boundary where the bar only just stops fitting below', () => {
    // 600 - 500 - 6 - 8 = 86px below: a 200px bar cannot fit, and it flips.
    expect(place(480, 500, 200)).toBe(480 - 200 - 6);
  });

  it('never flips a bar that only fits below', () => {
    // 94px of room below fits a 92px bar, so the anchor stays above it.
    expect(place(100, 492, 92)).toBe(498);
  });

  it('clamps a bar pushed past the viewport bottom', () => {
    expect(place(-40, -20, 92)).toBe(0);
  });
});
