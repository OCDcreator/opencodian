/**
 * CanvasLayout — the deterministic canvas layout (R-C5, flowtext-c5-design
 * §3.2). The decision is settled: grid / layered only, NO force-directed
 * layout, no randomness, no clock — the same input always produces the same
 * rectangles, so layout output is golden-testable and acceptance criterion 1
 * (nodes do not overlap) can be asserted geometrically in unit tests.
 *
 * Constants match the real canvas files measured in this vault (design §2-3):
 * file nodes are 360×160 with 60px gutters; groups wrap their children with
 * 40px padding.
 */

/** Generated node size (matches the vault's measured canvas files). */
export const CANVAS_NODE_WIDTH = 360;
export const CANVAS_NODE_HEIGHT = 160;
/** Gutter between nodes in the grid. */
export const CANVAS_NODE_GAP = 60;
/** Group padding around the nodes it wraps. */
export const CANVAS_GROUP_PADDING = 40;
/** Nodes per row once the grid wraps (design §3.2: ≥5 nodes → 3 per row). */
export const CANVAS_GRID_COLUMNS = 3;
/** Up to this many nodes the layout stays a single row. */
export const CANVAS_SINGLE_ROW_LIMIT = 4;

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasGroupedLayout {
  /** One rect per input group member, in input order. */
  nodes: CanvasRect[];
  /** One wrapping rect per input group, in input order. */
  groups: CanvasRect[];
}

/**
 * Grid layout for ungrouped nodes (reading order: left → right, top → bottom).
 * ≤ `CANVAS_SINGLE_ROW_LIMIT` nodes form a single row; more wrap at
 * `CANVAS_GRID_COLUMNS` columns.
 */
export function layoutGrid(count: number): CanvasRect[] {
  const columns = count <= CANVAS_SINGLE_ROW_LIMIT ? Math.max(count, 1) : CANVAS_GRID_COLUMNS;
  const rects: CanvasRect[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    rects.push({
      x: column * (CANVAS_NODE_WIDTH + CANVAS_NODE_GAP),
      y: row * (CANVAS_NODE_HEIGHT + CANVAS_NODE_GAP),
      width: CANVAS_NODE_WIDTH,
      height: CANVAS_NODE_HEIGHT,
    });
  }
  return rects;
}

/**
 * Grouped layout (the AI-split mode): every group is one vertical column of
 * nodes; columns sit side by side, each wrapped by a group node with
 * `CANVAS_GROUP_PADDING` on every side. All columns start at the same top so
 * the reading order matches the input order (group 1 leftmost).
 */
export function layoutGroupedColumns(groupSizes: readonly number[]): CanvasGroupedLayout {
  const nodes: CanvasRect[] = [];
  const groups: CanvasRect[] = [];
  let columnX = 0;
  for (const size of groupSizes) {
    const count = Math.max(size, 0);
    let columnHeight = 0;
    for (let index = 0; index < count; index += 1) {
      nodes.push({
        x: columnX,
        y: index * (CANVAS_NODE_HEIGHT + CANVAS_NODE_GAP),
        width: CANVAS_NODE_WIDTH,
        height: CANVAS_NODE_HEIGHT,
      });
    }
    columnHeight = count > 0
      ? count * CANVAS_NODE_HEIGHT + (count - 1) * CANVAS_NODE_GAP
      : 0;
    const groupWidth = count > 0
      ? CANVAS_NODE_WIDTH + 2 * CANVAS_GROUP_PADDING
      : 0;
    const groupHeight = count > 0
      ? columnHeight + 2 * CANVAS_GROUP_PADDING
      : 0;
    groups.push({
      x: columnX - CANVAS_GROUP_PADDING,
      y: -CANVAS_GROUP_PADDING,
      width: groupWidth,
      height: groupHeight,
    });
    columnX += groupWidth > 0
      ? groupWidth + CANVAS_NODE_GAP
      : 0;
  }
  return { nodes, groups };
}

/** True when two rects share any interior area (used by the overlap tests). */
export function rectsOverlap(a: CanvasRect, b: CanvasRect): boolean {
  const separated = a.x + a.width <= b.x
    || b.x + b.width <= a.x
    || a.y + a.height <= b.y
    || b.y + b.height <= a.y;
  return !separated;
}
