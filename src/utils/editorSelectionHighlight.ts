import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { Decoration, EditorView } from '@codemirror/view';

/**
 * Keyed highlight regions for the inline-edit feature.
 *
 * Each active edit owns one highlight keyed by its `editId`, so parallel edits
 * in the same editor (docs/requirements/flowtext-parity.md R-A5) keep their own
 * region: opening edit B no longer replaces edit A's highlight, and closing A
 * leaves B's intact. Callers that do not pass a key share the `'default'` slot,
 * which keeps the original single-highlight behaviour.
 *
 * The field keeps both the region map (for keyed show/hide) and the derived
 * decoration set; every document change maps both, so highlights follow edits
 * exactly like the single-region version did.
 */

interface HighlightRegion {
  from: number;
  to: number;
}

const showHighlightEffect = StateEffect.define<{ key: string; from: number; to: number }>();
const hideHighlightEffect = StateEffect.define<{ key: string }>();

interface SelectionHighlightState {
  readonly regions: ReadonlyMap<string, HighlightRegion>;
  readonly decorations: DecorationSet;
}

function buildHighlightSet(regions: ReadonlyMap<string, HighlightRegion>): DecorationSet {
  if (regions.size === 0) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const sorted = [...regions.entries()].sort((left, right) => left[1].from - right[1].from);
  for (const [, region] of sorted) {
    builder.add(region.from, region.to, Decoration.mark({
      class: 'opencodian-selection-highlight',
    }));
  }
  return builder.finish();
}

function mapRegions(
  regions: ReadonlyMap<string, HighlightRegion>,
  changes: { mapPos(pos: number, assoc?: number): number },
): Map<string, HighlightRegion> {
  let mapped: Map<string, HighlightRegion> | null = null;
  for (const [key, region] of regions) {
    const from = changes.mapPos(region.from, 1);
    const to = changes.mapPos(region.to, -1);
    if (from === region.from && to === region.to) continue;
    if (mapped === null) mapped = new Map(regions);
    mapped.set(key, { from, to });
  }
  // The cast is safe: when nothing moved the input IS the stored Map instance.
  return mapped ?? (regions as Map<string, HighlightRegion>);
}

const EMPTY_HIGHLIGHTS: SelectionHighlightState = {
  regions: new Map(),
  decorations: Decoration.none,
};

const selectionHighlightField = StateField.define<SelectionHighlightState>({
  create: () => EMPTY_HIGHLIGHTS,
  update: (state, transaction) => {
    // Mutations always copy-on-write first (see below); the cast only widens.
    let regions = state.regions as Map<string, HighlightRegion>;

    for (const effect of transaction.effects) {
      if (effect.is(showHighlightEffect)) {
        const { key, from, to } = effect.value;
        const existing = regions.get(key);
        if (existing && existing.from === from && existing.to === to) continue;
        if (regions === state.regions) regions = new Map(regions);
        regions.set(key, { from, to });
        continue;
      }
      if (effect.is(hideHighlightEffect)) {
        if (!regions.has(effect.value.key)) continue;
        if (regions === state.regions) regions = new Map(regions);
        regions.delete(effect.value.key);
      }
    }

    if (transaction.docChanged) {
      regions = mapRegions(regions, transaction.changes);
    }

    if (regions === state.regions) return state;
    return { regions, decorations: buildHighlightSet(regions) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

function ensureSelectionHighlightField(editorView: EditorView): void {
  if (editorView.state.field(selectionHighlightField, false)) {
    return;
  }

  editorView.dispatch({
    effects: StateEffect.appendConfig.of(selectionHighlightField),
  });
}

export function showSelectionHighlight(editorView: EditorView, from: number, to: number, key = 'default'): void {
  ensureSelectionHighlightField(editorView);
  const current = editorView.state.field(selectionHighlightField).regions.get(key);
  if (current && current.from === from && current.to === to) return;
  editorView.dispatch({
    effects: showHighlightEffect.of({ key, from, to }),
  });
}

export function hideSelectionHighlight(editorView: EditorView, key = 'default'): void {
  const current = editorView.state.field(selectionHighlightField, false);
  if (!current || !current.regions.has(key)) {
    return;
  }

  editorView.dispatch({
    effects: hideHighlightEffect.of({ key }),
  });
}
