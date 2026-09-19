/**
 * InlineEditOverlayPrimitives — the small pure helpers behind the floating
 * input bar's menus and placement, extracted from `InlineEditInputOverlay`
 * so the overlay stays within its max-lines budget (the same budget rule
 * that produced `InlineEditContextUi` and `InlineEditPresetMenu`).
 *
 * Nothing here touches the CM6 view or the obsidian API. The geometry helpers
 * are number-in/number-out; the element helpers only fill, position or
 * measure the elements they are handed. All of it stays unit-testable
 * without an editor.
 */

import type { InlineEditChoice } from './InlineEditTypes';

/** Gap between the anchor line's bottom and the panel top; keep in sync with CSS. */
export const INLINE_EDIT_PANEL_GAP = 6;
/** Horizontal inset used when clamping the panel inside the editor DOM. */
export const INLINE_EDIT_PANEL_INSET = 8;
/** Grown height cap for the instruction field, in px; beyond it the field scrolls. */
export const INLINE_EDIT_FIELD_MAX_HEIGHT = 100;
/**
 * Horizontal offset of the anchor link from the panel's left edge: just past
 * the panel's 12px corner radius, on the spacing scale, so the hairline reads
 * as growing out of the panel's leading corner.
 */
export const INLINE_EDIT_ANCHOR_LINK_INSET = 12;

/** One dropdown entry; `id === null` is the "clear override" row. */
export interface InlineEditOverlayMenuItem {
  readonly id: string | null;
  readonly label: string;
  readonly active?: boolean;
  /** Provider id for the row icon; `null`/absent renders no icon. */
  readonly iconProvider?: string | null;
}

/**
 * A sibling panel's occupied vertical span, in editor-DOM coordinates (the
 * same space `resolvePanelTop` works in: offsets relative to `view.dom`).
 * Panels are wide enough that vertical bands are the collision space.
 */
export interface InlineEditPanelBand {
  readonly top: number;
  readonly bottom: number;
}

/** Convert host `InlineEditChoice[]` entries into menu items with ids. */
export function choicesToMenuItems(
  choices: readonly InlineEditChoice[],
  activeId: string | null,
): InlineEditOverlayMenuItem[] {
  return choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    active: activeId !== null && choice.id === activeId,
  }));
}

/** Menu row glyph for an effort level: signal bars echo "thinking intensity". */
export function effortMenuIcon(id: string | null): string {
  if (id === 'low') return 'signal-low';
  if (id === 'medium') return 'signal-medium';
  if (id === 'high') return 'signal-high';
  return 'rotate-ccw';
}

/**
 * Vertical placement of the bar relative to the anchor line, in editor DOM
 * coordinates.
 *
 * The bar sits below the anchor by default and flips above it when it no
 * longer fits underneath — a multi-line instruction makes the bar tall
 * enough that this happens well before the document ends. When it fits
 * neither way it stays below and clips, which keeps the caret-side reading
 * order intact.
 */
export function resolvePanelTop(input: {
  readonly anchorTop: number;
  readonly anchorBottom: number;
  readonly viewportHeight: number;
  readonly panelHeight: number;
}): number {
  const spaceBelow = input.viewportHeight - input.anchorBottom - INLINE_EDIT_PANEL_GAP - INLINE_EDIT_PANEL_INSET;
  const fitsBelow = input.panelHeight <= spaceBelow;
  const fitsAbove = input.anchorTop - INLINE_EDIT_PANEL_GAP - INLINE_EDIT_PANEL_INSET >= input.panelHeight;
  if (!fitsBelow && fitsAbove) {
    // `fitsAbove` already bounds this to at least the inset.
    return input.anchorTop - input.panelHeight - INLINE_EDIT_PANEL_GAP;
  }
  return Math.max(0, input.anchorBottom + INLINE_EDIT_PANEL_GAP);
}

/**
 * Vertical placement of a panel when sibling panels already occupy space in
 * the same editor (R-A5 parallel edits).
 *
 * `preferredTop` is the anchor-preferred result of `resolvePanelTop`;
 * `siblings` are the other panels' `InlineEditPanelBand`s in the same editor
 * coordinate space. The result keeps at least `INLINE_EDIT_PANEL_GAP` of
 * clear air to every sibling:
 *
 * - no siblings, or no conflict at `preferredTop` → `preferredTop`
 *   unchanged (the single-panel path is never perturbed);
 * - else push down past the lowest conflicting stack (keeps today's
 *   below-the-anchor default), then push up above the highest stack, taking
 *   the first candidate that fits the viewport (`0 … viewportHeight - inset`);
 * - if neither fits, clamp both candidates into the viewport and keep the
 *   one that leaves the smaller sibling-covered area; ties prefer pushing
 *   down. Degenerate viewports (`viewportHeight - inset < panelHeight`)
 *   clamp to 0 rather than going negative.
 *
 * Deterministic and side-effect free; the sibling list is never mutated.
 */
export function resolvePanelTopAmongSiblings(input: {
  readonly preferredTop: number;
  readonly panelHeight: number;
  readonly viewportHeight: number;
  readonly siblings: readonly InlineEditPanelBand[];
}): number {
  const gap = INLINE_EDIT_PANEL_GAP;
  const height = input.panelHeight;
  const bands = input.siblings
    .filter((band) => Number.isFinite(band.top) && Number.isFinite(band.bottom) && band.bottom > band.top)
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  // Forbidden `top` range a band contributes: open interval, so both edges
  // themselves sit exactly `gap` clear of the sibling.
  const forbidden = bands
    .map((band) => ({ lo: band.top - gap - height, hi: band.bottom + gap }))
    .sort((a, b) => a.lo - b.lo);
  const merged: { lo: number; hi: number }[] = [];
  for (const segment of forbidden) {
    const last = merged[merged.length - 1];
    if (last && segment.lo <= last.hi) {
      last.hi = Math.max(last.hi, segment.hi);
    } else {
      merged.push({ lo: segment.lo, hi: segment.hi });
    }
  }
  const blocked = (top: number): boolean => merged.some((segment) => top > segment.lo && top < segment.hi);
  if (merged.length === 0 || !blocked(input.preferredTop)) return input.preferredTop;
  const lowestBottom = Math.max(0, input.viewportHeight - INLINE_EDIT_PANEL_INSET - height);
  // Sweep the merged segments outward from the preferred spot: ascending `lo`
  // for push-down, descending for push-up, one pass each (segments are
  // disjoint after the merge).
  let down = input.preferredTop;
  for (const segment of merged) {
    if (down > segment.lo && down < segment.hi) down = segment.hi;
  }
  let up = input.preferredTop;
  for (let i = merged.length - 1; i >= 0; i -= 1) {
    const segment = merged[i];
    if (up > segment.lo && up < segment.hi) up = segment.lo;
  }
  const fits = (top: number): boolean => top >= 0 && top <= lowestBottom;
  if (fits(down)) return down;
  if (fits(up)) return up;
  const clamp = (top: number): number => Math.min(Math.max(top, 0), lowestBottom);
  const covered = (top: number): number => bands.reduce(
    (area, band) => area + Math.max(0, Math.min(top + height, band.bottom) - Math.max(top, band.top)),
    0,
  );
  return covered(clamp(up)) < covered(clamp(down)) ? clamp(up) : clamp(down);
}

/** Where the anchor link must render, or `null` when it must stay hidden. */
export interface InlineEditAnchorLinkGeometry {
  /** Panel-relative x of the hairline. */
  readonly left: number;
  /** Hairline length in px (>= 1 when visible). */
  readonly length: number;
  /** True when the anchor sits below the panel (link grows downward). */
  readonly anchorBelow: boolean;
}

/**
 * Geometry for the anchor link — the hairline + anchor marker that keeps a
 * collision-displaced panel visually tied to its anchor line (R-A5).
 *
 * Returns `null` unless the panel was actually pushed away from its
 * anchor-preferred spot, so the single-panel case never renders the
 * adornment. Also `null` when the panel still overlaps its anchor's own band
 * (clamped placements): the panel then covers the anchor and a connector
 * would point at itself.
 */
export function anchorLinkGeometry(input: {
  readonly anchorTop: number;
  readonly anchorBottom: number;
  readonly panelTop: number;
  readonly panelHeight: number;
  readonly displaced: boolean;
}): InlineEditAnchorLinkGeometry | null {
  if (!input.displaced) return null;
  if (input.panelTop >= input.anchorBottom) {
    return {
      left: INLINE_EDIT_ANCHOR_LINK_INSET,
      length: input.panelTop - input.anchorBottom,
      anchorBelow: false,
    };
  }
  if (input.panelTop + input.panelHeight <= input.anchorTop) {
    return {
      left: INLINE_EDIT_ANCHOR_LINK_INSET,
      length: input.anchorTop - (input.panelTop + input.panelHeight),
      anchorBelow: true,
    };
  }
  return null;
}

/** Render (or hide) the anchor link element from its computed geometry. */
export function applyAnchorLink(
  link: HTMLElement | null,
  geometry: InlineEditAnchorLinkGeometry | null,
): void {
  if (!link) return;
  if (!geometry || geometry.length <= 0) {
    link.style.display = 'none';
    return;
  }
  link.style.display = 'block';
  link.style.left = `${geometry.left}px`;
  link.style.setProperty('--ocie-anchor-link-length', `${Math.round(geometry.length)}px`);
  link.classList.toggle('is-anchor-below', geometry.anchorBelow);
}

/**
 * Full placement pass for one panel: horizontal clamp, anchor-preferred top,
 * sibling-collision resolution, style writes and the anchor-link adornment.
 *
 * Composes the pure helpers so the overlay only measures and forwards
 * numbers — every placement style write lives here. Callers must already be
 * inside a scheduled animation frame (the overlay's measurement rule).
 */
export function placeInlineEditPanel(input: {
  readonly panel: HTMLElement;
  readonly anchorLink: HTMLElement | null;
  /** Anchor line in editor-DOM coordinates (already offset by `view.dom`). */
  readonly anchor: { readonly top: number; readonly bottom: number; readonly left: number };
  readonly panelSize: { readonly width: number; readonly height: number };
  readonly viewportHeight: number;
  readonly viewportWidth: number;
  readonly siblings: readonly InlineEditPanelBand[];
}): { readonly left: number; readonly top: number } {
  const maxLeft = Math.max(
    INLINE_EDIT_PANEL_INSET,
    input.viewportWidth - input.panelSize.width - INLINE_EDIT_PANEL_INSET,
  );
  const left = Math.min(Math.max(input.anchor.left, INLINE_EDIT_PANEL_INSET), maxLeft);
  const preferredTop = resolvePanelTop({
    anchorTop: input.anchor.top,
    anchorBottom: input.anchor.bottom,
    viewportHeight: input.viewportHeight,
    panelHeight: input.panelSize.height,
  });
  const top = resolvePanelTopAmongSiblings({
    preferredTop,
    panelHeight: input.panelSize.height,
    viewportHeight: input.viewportHeight,
    siblings: input.siblings,
  });
  input.panel.style.left = `${left}px`;
  input.panel.style.top = `${top}px`;
  applyAnchorLink(input.anchorLink, anchorLinkGeometry({
    anchorTop: input.anchor.top,
    anchorBottom: input.anchor.bottom,
    panelTop: top,
    panelHeight: input.panelSize.height,
    displaced: top !== preferredTop,
  }));
  return { left, top };
}

/**
 * Grow the instruction field to its content, up to `INLINE_EDIT_FIELD_MAX_HEIGHT`.
 *
 * The overlay calls this straight from the input handler (never depend on
 * rAF for this: a hidden window pauses rAF completely) and again in the rAF
 * pass so programmatic value changes (clarification retries) grow too.
 * Writing `height: auto` and reading `scrollHeight` is a reflow on our own
 * element, safe in any handler.
 */
export function syncInstructionFieldHeight(field: HTMLTextAreaElement | null): void {
  if (!field) return;
  field.style.height = 'auto';
  const contentHeight = field.scrollHeight;
  field.style.height = `${Math.min(contentHeight, INLINE_EDIT_FIELD_MAX_HEIGHT)}px`;
  field.style.overflowY = contentHeight > INLINE_EDIT_FIELD_MAX_HEIGHT ? 'auto' : 'hidden';
}

/** Focus the instruction input, deferred until layout settles. */
export function focusInstructionField(field: HTMLTextAreaElement | null, doc: Document): void {
  if (!field) return;
  doc.defaultView?.setTimeout(() => {
    if (field.isConnected) field.focus();
  }, 0);
}

/**
 * Focus/interaction elevation (R-A5): the panel that owns focus — or, when
 * nothing is focused, the one last interacted with — must paint above its
 * siblings regardless of DOM insertion order. Elevation is one CSS state
 * class; the base `z-index: 30` token stays the floor.
 */
export function claimPanelForeground(
  panel: HTMLElement | null,
  siblingPanels: Iterable<HTMLElement | null>,
): void {
  if (panel) panel.classList.add('is-focused');
  for (const sibling of siblingPanels) {
    if (sibling !== panel) sibling?.classList.remove('is-focused');
  }
}

// ---------------------------------------------------------------------------
// R-A5 dismissal ownership (parallel bars on one document)
// ---------------------------------------------------------------------------

/** Which interaction asks `resolveDismissOwner` for a verdict. */
export type InlineEditDismissKind = 'escape' | 'pointerdown' | 'focusout';

/** What a bar may do once its dismissal verdict resolves. */
export type InlineEditDismissAction = 'none' | 'reject' | 'close-menu';

/** One open bar as the dismissal decision sees it (per-event snapshot). */
export interface InlineEditDismissCandidate {
  /** Stable identity (the edit id); keys the returned verdicts. */
  readonly id: string;
  /**
   * True when this bar anchors the event: it held the captured document
   * focus (escape), contains the pointerdown target (pointerdown), or is
   * the panel the focus left (focusout).
   */
  readonly isAnchor: boolean;
  /** True when the bar has an open dropdown menu. */
  readonly hasMenu: boolean;
  /**
   * True when the bar has nothing to lose: empty instruction, input phase
   * (not busy), nothing generated. Only pristine bars self-dismiss on the
   * passive paths (outside pointerdown, focus-out); a bar with content
   * survives them so a stray interaction never discards typed input.
   */
  readonly pristine: boolean;
}

/**
 * Decide once per event which of the parallel open bars may answer a
 * dismissal path (R-A5). Every overlay of the editor resolves the same
 * candidate snapshot and acts only on its own verdict, so listener order
 * and mid-event teardown (which blur the removed panel's field to body)
 * cannot flip a sibling's decision — the defect that let one Escape
 * reject every open bar.
 *
 * Per kind:
 * - `escape` — the keydown belongs to the anchor bar: it rejects (an
 *   explicit exit works regardless of content), or just closes its open
 *   menu. Anchor in a bar outside this candidate set → nobody acts. Focus
 *   in no bar at all keeps today's semantics for the lone-bar case (the
 *   single bar answers, so the busy-phase Esc cancel survives); with
 *   several open bars nobody acts and the keydown passes through.
 * - `pointerdown` — a pointerdown inside any bar never dismisses anything
 *   (the anchored bar closes its own menu locally). Outside every bar the
 *   passive path applies: pristine bars self-dismiss (the accidental
 *   invocation still cleans itself up), survivors keep their content but
 *   close open menus.
 * - `focusout` — only the panel the focus left may act, and only when the
 *   focus did not land in some (other) bar; a pristine source dismisses, a
 *   bar with content survives.
 *
 * Pure: reads only the given snapshot, returns per-bar verdicts.
 */
export function resolveDismissOwner(input: {
  readonly kind: InlineEditDismissKind;
  readonly candidates: readonly InlineEditDismissCandidate[];
  /**
   * True when the event's anchor — the held focus (escape), the pointer
   * target (pointerdown), the focus destination (focusout) — lies inside
   * some open bar, possibly outside this candidate set (a second editor).
   */
  readonly anchorWithinSomeBar: boolean;
}): ReadonlyMap<string, InlineEditDismissAction> {
  const verdicts = new Map<string, InlineEditDismissAction>();
  for (const candidate of input.candidates) {
    let action: InlineEditDismissAction = 'none';
    if (candidate.isAnchor) {
      if (input.kind === 'escape') {
        action = candidate.hasMenu ? 'close-menu' : 'reject';
      } else if (input.kind === 'focusout') {
        action = !input.anchorWithinSomeBar && candidate.pristine ? 'reject' : 'none';
      }
      // pointerdown: a bar is never dismissed by a pointer inside a bar.
    } else if (input.kind === 'pointerdown' && !input.anchorWithinSomeBar) {
      action = candidate.pristine ? 'reject' : candidate.hasMenu ? 'close-menu' : 'none';
    } else if (
      input.kind === 'escape'
      && !input.anchorWithinSomeBar
      && input.candidates.length === 1
    ) {
      action = candidate.hasMenu ? 'close-menu' : 'reject';
    }
    verdicts.set(candidate.id, action);
  }
  return verdicts;
}
