/**
 * Placement of the floating instruction bar relative to its anchor line.
 *
 * This is the pure half of the overlay's positioning plus the overlay-level
 * placement contracts: the DOM readings happen in the overlay itself, so the
 * flip and sibling-collision decisions can be pinned down here without a live
 * editor (and without a foreground window, which the rAF-driven positioning
 * needs).
 *
 * The two-panel cases use the exact geometry measured live in Obsidian
 * 1.13.7 (panel A top 288 / height 135, panel B preferred top 393) where
 * panel B covered the bottom 30px of panel A — the R-A5 defect that added
 * sibling collision resolution and focus elevation.
 */

import type { EditorView } from '@codemirror/view';
import * as fs from 'fs';
import * as path from 'path';

import {
  InlineEditInputOverlay,
  type InlineEditOverlayCallbacks,
} from '../../../../src/features/inline-edit/InlineEditInputOverlay';
import {
  anchorLinkGeometry,
  applyAnchorLink,
  claimPanelForeground,
  placeInlineEditPanel,
  resolvePanelTop,
  resolvePanelTopAmongSiblings,
  syncInstructionFieldHeight,
} from '../../../../src/features/inline-edit/InlineEditOverlayPrimitives';

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

describe('resolvePanelTopAmongSiblings', () => {
  const PANEL_HEIGHT = 135;

  function resolve(
    preferredTop: number,
    siblings: readonly { top: number; bottom: number }[],
    overrides: { panelHeight?: number; viewportHeight?: number } = {},
  ): number {
    return resolvePanelTopAmongSiblings({
      preferredTop,
      panelHeight: overrides.panelHeight ?? PANEL_HEIGHT,
      viewportHeight: overrides.viewportHeight ?? VIEWPORT,
      siblings,
    });
  }

  it('returns the preferred top unchanged when no siblings are mounted', () => {
    expect(resolve(288, [])).toBe(288);
  });

  it('pushes a panel below an intersecting sibling (live-measured R-A5 defect geometry)', () => {
    // Measured live in Obsidian 1.13.7: panel A at top 288 / height 135, panel
    // B preferred top 393 — B covered A's bottom 30px (its action row).
    const top = resolve(393, [{ top: 288, bottom: 423 }]);
    expect(top).toBe(429);
    // General property pinned with the concrete value: no intersection with
    // at least the gap, and fully inside the viewport.
    expect(top).toBeGreaterThanOrEqual(423 + 6);
    expect(top + PANEL_HEIGHT).toBeLessThanOrEqual(VIEWPORT - 8);
  });

  it('pushes a panel above a sibling sitting directly below its preferred spot', () => {
    // Down runs into the viewport bottom (585 + 6 + 135 > 592), so it goes up.
    expect(resolve(500, [{ top: 450, bottom: 585 }])).toBe(309);
  });

  it('clamps into the viewport with the smallest covered area when both directions are blocked', () => {
    // A sibling spanning the whole viewport blocks up (clamps to 0) and down
    // (clamps to 600-ish bottom): both leave the same 135px coverage, and the
    // tie must deterministically prefer the below-anchor (push-down) clamp.
    expect(resolve(150, [{ top: 0, bottom: 400 }], { viewportHeight: 400 })).toBe(257);
  });

  it('picks the clamped direction that leaves the smaller covered area', () => {
    // Sibling {60..400}: down clamps to 257 (covers 135px), up clamps to 0
    // (covers only 75px) — up wins even though down is the usual preference.
    expect(resolve(200, [{ top: 60, bottom: 400 }], { viewportHeight: 400 })).toBe(0);
  });

  it('clears a stacked run of several siblings in one decision', () => {
    // A {288..423} + B {429..564} merge into one forbidden band; down runs
    // past the viewport, so the panel goes above the whole stack.
    expect(resolve(350, [{ top: 288, bottom: 423 }, { top: 429, bottom: 564 }])).toBe(147);
  });

  it('ignores zero-height and inverted sibling entries (hidden / detached panels)', () => {
    const siblings = [{ top: 100, bottom: 100 }, { top: 200, bottom: 180 }];
    expect(resolve(150, siblings)).toBe(150);
    // The caller's list must come back untouched (pure function contract).
    expect(siblings).toEqual([{ top: 100, bottom: 100 }, { top: 200, bottom: 180 }]);
  });

  it('is deterministic across repeated calls with the same input', () => {
    const siblings = [{ top: 288, bottom: 423 }];
    const first = resolve(393, siblings);
    const second = resolve(393, siblings);
    expect(second).toBe(first);
  });
});

describe('anchorLinkGeometry', () => {
  it('is hidden while the panel sits at its anchor-preferred position', () => {
    expect(anchorLinkGeometry({
      anchorTop: 262,
      anchorBottom: 282,
      panelTop: 288,
      panelHeight: 135,
      displaced: false,
    })).toBeNull();
  });

  it('spans from the anchor line to a panel displaced below it', () => {
    expect(anchorLinkGeometry({
      anchorTop: 262,
      anchorBottom: 282,
      panelTop: 429,
      panelHeight: 135,
      displaced: true,
    })).toEqual({ left: 12, length: 147, anchorBelow: false });
  });

  it('spans from a panel displaced above its anchor back down to the line', () => {
    expect(anchorLinkGeometry({
      anchorTop: 520,
      anchorBottom: 540,
      panelTop: 309,
      panelHeight: 135,
      displaced: true,
    })).toEqual({ left: 12, length: 76, anchorBelow: true });
  });

  it('stays hidden when a clamped panel still overlaps its own anchor band', () => {
    expect(anchorLinkGeometry({
      anchorTop: 300,
      anchorBottom: 320,
      panelTop: 310,
      panelHeight: 135,
      displaced: true,
    })).toBeNull();
  });
});

describe('applyAnchorLink', () => {
  function makeLink(): HTMLDivElement {
    const link = document.createElement('div');
    document.body.appendChild(link);
    return link;
  }

  it('hides the element when the geometry is null', () => {
    const link = makeLink();
    applyAnchorLink(link, null);
    expect(link.style.display).toBe('none');
  });

  it('positions the visible hairline and keeps the panel-below direction unclassed', () => {
    const link = makeLink();
    applyAnchorLink(link, { left: 12, length: 147, anchorBelow: false });
    expect(link.style.display).toBe('block');
    expect(link.style.left).toBe('12px');
    expect(link.style.getPropertyValue('--ocie-anchor-link-length')).toBe('147px');
    expect(link.classList.contains('is-anchor-below')).toBe(false);
  });

  it('flips the direction class when the anchor sits below the panel', () => {
    const link = makeLink();
    applyAnchorLink(link, { left: 12, length: 76, anchorBelow: true });
    expect(link.classList.contains('is-anchor-below')).toBe(true);
  });

  it('hides on a zero-length geometry', () => {
    const link = makeLink();
    applyAnchorLink(link, { left: 12, length: 0, anchorBelow: false });
    expect(link.style.display).toBe('none');
  });
});

describe('syncInstructionFieldHeight', () => {
  function makeField(): HTMLTextAreaElement {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    return field;
  }

  it('grows the field to its content below the cap', () => {
    const field = makeField();
    jest.spyOn(field, 'scrollHeight', 'get').mockReturnValue(50);
    syncInstructionFieldHeight(field);
    expect(field.style.height).toBe('50px');
    expect(field.style.overflowY).toBe('hidden');
  });

  it('caps growth at 100px and scrolls instead', () => {
    const field = makeField();
    jest.spyOn(field, 'scrollHeight', 'get').mockReturnValue(260);
    syncInstructionFieldHeight(field);
    expect(field.style.height).toBe('100px');
    expect(field.style.overflowY).toBe('auto');
  });
});

describe('claimPanelForeground', () => {
  it('elevates the claiming panel and demotes every sibling', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const c = document.createElement('div');
    b.classList.add('is-focused');
    claimPanelForeground(a, [a, b, c]);
    expect(a.classList.contains('is-focused')).toBe(true);
    expect(b.classList.contains('is-focused')).toBe(false);
    expect(c.classList.contains('is-focused')).toBe(false);
  });

  it('tolerates a torn-down (null) panel', () => {
    const b = document.createElement('div');
    b.classList.add('is-focused');
    expect(() => claimPanelForeground(null, [null, b])).not.toThrow();
    expect(b.classList.contains('is-focused')).toBe(false);
  });
});

describe('placeInlineEditPanel', () => {
  it('writes the single-panel placement unchanged (below the anchor, left clamp)', () => {
    const panel = document.createElement('div');
    const link = document.createElement('div');
    const { left, top } = placeInlineEditPanel({
      panel,
      anchorLink: link,
      anchor: { top: 262, bottom: 282, left: 24 },
      panelSize: { width: 420, height: 135 },
      viewportHeight: 600,
      viewportWidth: 800,
      siblings: [],
    });
    expect(left).toBe(24);
    expect(top).toBe(288);
    expect(panel.style.left).toBe('24px');
    expect(panel.style.top).toBe('288px');
    // Single-panel case: the anchor link must stay hidden (no visual noise).
    expect(link.style.display).toBe('none');
  });

  it('resolves a conflicting sibling and shows the anchor link for the displaced panel', () => {
    const panel = document.createElement('div');
    const link = document.createElement('div');
    const { top } = placeInlineEditPanel({
      panel,
      anchorLink: link,
      anchor: { top: 367, bottom: 387, left: 24 },
      panelSize: { width: 420, height: 135 },
      viewportHeight: 600,
      viewportWidth: 800,
      siblings: [{ top: 288, bottom: 423 }],
    });
    expect(top).toBe(429);
    expect(link.style.display).toBe('block');
  });
});

// ---------------------------------------------------------------------------
// Overlay-level two-panel contracts (R-A5)
// ---------------------------------------------------------------------------

/** Live-measured panel size in Obsidian 1.13.7 (see the file header). */
const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 135;
const EDITOR_HEIGHT = 600;
const EDITOR_WIDTH = 800;

interface PairHarness {
  dom: HTMLElement;
  panelA: HTMLElement;
  panelB: HTMLElement;
  overlayA: InlineEditInputOverlay;
  overlayB: InlineEditInputOverlay;
  flush(): void;
}

/**
 * Two overlays on one fake editor view, anchored one "line group" apart with
 * the live-measured defect geometry: A's bar prefers top 288, B's bar 393 —
 * 30px of overlap before collision resolution existed.
 */
function makePairHarness(firstCallbacks: Partial<InlineEditOverlayCallbacks> = {}): PairHarness {
  const dom = document.createElement('div');
  document.body.appendChild(dom);
  // rAF must be captured before show(): sync() may only run when flushed.
  const frames: FrameRequestCallback[] = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  dom.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    bottom: EDITOR_HEIGHT,
    right: EDITOR_WIDTH,
    width: EDITOR_WIDTH,
    height: EDITOR_HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(dom, 'clientHeight', { configurable: true, value: EDITOR_HEIGHT });
  Object.defineProperty(dom, 'clientWidth', { configurable: true, value: EDITOR_WIDTH });
  // Anchor bottom 282 → preferred top 288; anchor bottom 387 → preferred 393.
  const coordsByPos = new Map([
    [10, { top: 262, bottom: 282, left: 24 }],
    [20, { top: 367, bottom: 387, left: 24 }],
  ]);
  const view = {
    dom,
    scrollDOM: document.createElement('div'),
    coordsAtPos: (pos: number) => coordsByPos.get(pos) ?? null,
    state: { readOnly: false },
  } as unknown as EditorView;
  const callbacks: InlineEditOverlayCallbacks = {
    onSubmit: jest.fn(),
    onReject: jest.fn(),
    ...firstCallbacks,
  };

  function pinGeometry(panel: HTMLElement): void {
    Object.defineProperty(panel, 'offsetHeight', { configurable: true, get: () => PANEL_HEIGHT });
    Object.defineProperty(panel, 'offsetWidth', { configurable: true, get: () => PANEL_WIDTH });
    // The rect must reflect the just-written style.top, like a browser reflow.
    panel.getBoundingClientRect = () => {
      const top = Number.parseFloat(panel.style.top);
      return {
        top,
        bottom: top + PANEL_HEIGHT,
        left: 0,
        right: PANEL_WIDTH,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    };
  }

  const overlayA = new InlineEditInputOverlay(view, callbacks);
  overlayA.show(10);
  const overlayB = new InlineEditInputOverlay(view, callbacks);
  overlayB.show(20);
  const panelA = dom.querySelector<HTMLElement>('.opencodian-inline-edit-overlay:nth-of-type(1)');
  const panelB = dom.querySelector<HTMLElement>('.opencodian-inline-edit-overlay:nth-of-type(2)');
  if (!panelA || !panelB) throw new Error('panels missing');
  pinGeometry(panelA);
  pinGeometry(panelB);

  return {
    dom,
    panelA,
    panelB,
    overlayA,
    overlayB,
    flush(): void {
      const pending = frames.splice(0);
      pending.forEach((callback) => callback(0));
    },
  };
}

function topOf(panel: HTMLElement): number {
  return Number.parseFloat(panel.style.top);
}

function anchorLinkOf(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-anchor-link');
}

describe('InlineEditInputOverlay two-panel placement (R-A5 regression)', () => {
  let harness: PairHarness;

  beforeEach(() => {
    harness = makePairHarness();
  });

  afterEach(() => {
    harness.overlayA.hide();
    harness.overlayB.hide();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('keeps panels anchored one line apart from intersecting after sync', () => {
    harness.flush();
    harness.flush();
    // Panel A keeps its untouched anchor-preferred spot; panel B moves.
    expect(topOf(harness.panelA)).toBe(288);
    expect(topOf(harness.panelB)).toBe(429);
    // The original defect: B at 393 covered A's bottom 30px. General property:
    expect(topOf(harness.panelB)).toBeGreaterThanOrEqual(topOf(harness.panelA) + PANEL_HEIGHT + 6);
    expect(topOf(harness.panelB) + PANEL_HEIGHT).toBeLessThanOrEqual(EDITOR_HEIGHT - 8);
  });

  it('shows the anchor link only on the displaced panel', () => {
    harness.flush();
    expect(anchorLinkOf(harness.panelA)?.style.display).toBe('none');
    expect(anchorLinkOf(harness.panelB)?.style.display).toBe('block');
    // 429 (panel top) - 387 (anchor bottom) of hairline, at the panel inset.
    expect(anchorLinkOf(harness.panelB)?.style.getPropertyValue('--ocie-anchor-link-length')).toBe('42px');
  });

  it('is stable when the displaced panel re-syncs', () => {
    harness.flush();
    harness.overlayB.show(20);
    harness.flush();
    expect(topOf(harness.panelA)).toBe(288);
    expect(topOf(harness.panelB)).toBe(429);
  });
});

describe('InlineEditInputOverlay focus elevation (R-A5)', () => {
  let harness: PairHarness;

  beforeEach(() => {
    harness = makePairHarness();
  });

  afterEach(() => {
    harness.overlayA.hide();
    harness.overlayB.hide();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('keeps z-index 30 as the panel floor and puts the focused panel one step above', () => {
    // Static CSS contract backing the class-based assertions below: elevation
    // rides `is-focused` (jsdom cannot compute real styles), so this pins the
    // stylesheet and the base token against silent drift.
    const css = fs.readFileSync(
      path.resolve(__dirname, '../../../..', 'src/style/features/inline-edit.css'),
      'utf8',
    );
    expect(css).toMatch(/\.opencodian-inline-edit-overlay\s*\{[^}]*z-index:\s*30;/);
    expect(css).toMatch(/\.opencodian-inline-edit-overlay\.is-focused\s*\{[^}]*z-index:\s*31;/);
  });

  it('raises the panel that owns focus above a later-mounted sibling', () => {
    // The later panel (B, last in DOM) takes focus first.
    harness.panelB.dispatchEvent(new FocusEvent('focusin'));
    expect(harness.panelB.classList.contains('is-focused')).toBe(true);
    expect(harness.panelA.classList.contains('is-focused')).toBe(false);
    // Focus moves back to the earlier panel: it must win the paint race even
    // though B still sits later in the DOM.
    harness.panelA.dispatchEvent(new FocusEvent('focusin'));
    expect(harness.panelA.classList.contains('is-focused')).toBe(true);
    expect(harness.panelB.classList.contains('is-focused')).toBe(false);
  });

  it('keeps elevation with the last-interacted panel when nothing holds focus', () => {
    harness.panelB.dispatchEvent(new FocusEvent('focusin'));
    // A pointer interaction claims foreground without requiring focus
    // (disabled busy fields never receive focusin).
    harness.panelA.dispatchEvent(new Event('pointerdown'));
    expect(harness.panelA.classList.contains('is-focused')).toBe(true);
    expect(harness.panelB.classList.contains('is-focused')).toBe(false);
  });

  it('notifies the host when a panel gains focus', () => {
    const onFocus = jest.fn();
    const harnessWithFocus = makePairHarness({ onFocus });
    try {
      harnessWithFocus.panelA.dispatchEvent(new FocusEvent('focusin'));
      expect(onFocus).toHaveBeenCalledTimes(1);
    } finally {
      harnessWithFocus.overlayA.hide();
      harnessWithFocus.overlayB.hide();
    }
  });
});
