/**
 * InlineEditOverlayPrimitives — the small pure helpers behind the floating
 * input bar's menus and placement, extracted from `InlineEditInputOverlay`
 * so the overlay stays within its max-lines budget (the same budget rule
 * that produced `InlineEditContextUi` and `InlineEditPresetMenu`).
 *
 * Nothing here touches the DOM beyond receiving elements to fill or numbers
 * to combine; all three are unit-tested without an editor.
 */

import type { InlineEditChoice } from './InlineEditTypes';

/** Gap between the anchor line's bottom and the panel top; keep in sync with CSS. */
export const INLINE_EDIT_PANEL_GAP = 6;
/** Horizontal inset used when clamping the panel inside the editor DOM. */
export const INLINE_EDIT_PANEL_INSET = 8;

/** One dropdown entry; `id === null` is the "clear override" row. */
export interface InlineEditOverlayMenuItem {
  readonly id: string | null;
  readonly label: string;
  readonly active?: boolean;
  /** Provider id for the row icon; `null`/absent renders no icon. */
  readonly iconProvider?: string | null;
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
