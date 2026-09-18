/**
 * Deterministic canvas layout goldens (R-C5, design §3.2/§5): fixed constants,
 * reading order, no randomness — and a programmatic geometric proof that
 * generated nodes never overlap (acceptance 1).
 */

import {
  CANVAS_GRID_COLUMNS,
  CANVAS_GROUP_PADDING,
  CANVAS_NODE_GAP,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  layoutGrid,
  layoutGroupedColumns,
  rectsOverlap,
} from '../../../../src/core/canvas/CanvasLayout';

describe('layoutGrid', () => {
  it('uses the measured node size 360×160 with 60px gutters', () => {
    expect(CANVAS_NODE_WIDTH).toBe(360);
    expect(CANVAS_NODE_HEIGHT).toBe(160);
    expect(CANVAS_NODE_GAP).toBe(60);
    expect(CANVAS_GROUP_PADDING).toBe(40);
  });

  it('n=1 golden: a single node at the origin', () => {
    expect(layoutGrid(1)).toEqual([{ x: 0, y: 0, width: 360, height: 160 }]);
  });

  it('n=3 golden: one row, reading order left → right', () => {
    expect(layoutGrid(3)).toEqual([
      { x: 0, y: 0, width: 360, height: 160 },
      { x: 420, y: 0, width: 360, height: 160 },
      { x: 840, y: 0, width: 360, height: 160 },
    ]);
  });

  it('n=4 stays a single row (single-row limit)', () => {
    const rects = layoutGrid(4);
    expect(rects.every((rect) => rect.y === 0)).toBe(true);
    expect(rects).toHaveLength(4);
  });

  it('n=5 golden: wraps to the 3-column grid', () => {
    const rects = layoutGrid(5);
    expect(rects.map((rect) => [rect.x, rect.y])).toEqual([
      [0, 0], [420, 0], [840, 0],
      [0, 220], [420, 220],
    ]);
  });

  it('n=7 golden: three rows in reading order (last row starts over at column 0)', () => {
    const rects = layoutGrid(7);
    expect(rects[3]).toEqual({ x: 0, y: 220, width: 360, height: 160 });
    expect(rects[6]).toEqual({ x: 0, y: 440, width: 360, height: 160 });
  });

  it('n=20 golden: 3 columns, 7 rows, last node at (420, 1320)', () => {
    const rects = layoutGrid(20);
    expect(rects).toHaveLength(20);
    expect(rects[19]).toEqual({ x: 420, y: 6 * (160 + 60), width: 360, height: 160 });
    expect(CANVAS_GRID_COLUMNS).toBe(3);
  });

  it('is deterministic: same count → identical output', () => {
    expect(layoutGrid(9)).toEqual(layoutGrid(9));
  });
});

describe('layoutGroupedColumns', () => {
  it('places each group as a vertical column wrapped by a padded group rect', () => {
    const layout = layoutGroupedColumns([2, 1]);
    expect(layout.nodes).toEqual([
      { x: 0, y: 0, width: 360, height: 160 },
      { x: 0, y: 220, width: 360, height: 160 },
      { x: 500, y: 0, width: 360, height: 160 },
    ]);
    expect(layout.groups).toEqual([
      { x: -40, y: -40, width: 440, height: 460 },
      { x: 460, y: -40, width: 440, height: 240 },
    ]);
  });

  it('never overlaps nodes with nodes, groups with groups, or node with foreign group', () => {
    const layout = layoutGroupedColumns([3, 1, 2]);
    for (let a = 0; a < layout.nodes.length; a += 1) {
      for (let b = a + 1; b < layout.nodes.length; b += 1) {
        expect(rectsOverlap(layout.nodes[a], layout.nodes[b])).toBe(false);
      }
    }
    for (let a = 0; a < layout.groups.length; a += 1) {
      for (let b = a + 1; b < layout.groups.length; b += 1) {
        expect(rectsOverlap(layout.groups[a], layout.groups[b])).toBe(false);
      }
    }
  });

  it('keeps every node strictly inside its own group rect', () => {
    const layout = layoutGroupedColumns([2, 3, 1]);
    let nodeIndex = 0;
    layout.groups.forEach((group, groupIndex) => {
      const members = layout.nodes.slice(nodeIndex, nodeIndex + [2, 3, 1][groupIndex]);
      nodeIndex += members.length;
      for (const node of members) {
        expect(node.x).toBeGreaterThanOrEqual(group.x);
        expect(node.y).toBeGreaterThanOrEqual(group.y);
        expect(node.x + node.width).toBeLessThanOrEqual(group.x + group.width);
        expect(node.y + node.height).toBeLessThanOrEqual(group.y + group.height);
      }
    });
  });

  it('is deterministic for the same group sizes', () => {
    expect(layoutGroupedColumns([2, 2])).toEqual(layoutGroupedColumns([2, 2]));
  });
});

describe('rectsOverlap', () => {
  it('treats touching edges as non-overlapping', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 10, y: 0, width: 10, height: 10 },
    )).toBe(false);
  });

  it('detects interior intersection', () => {
    expect(rectsOverlap(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 5, y: 5, width: 10, height: 10 },
    )).toBe(true);
  });
});
