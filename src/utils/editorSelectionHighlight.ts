import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { Decoration, EditorView } from '@codemirror/view';

const showHighlightEffect = StateEffect.define<{ from: number; to: number }>();
const hideHighlightEffect = StateEffect.define<null>();

const selectionHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(showHighlightEffect)) {
        const builder = new RangeSetBuilder<Decoration>();
        builder.add(effect.value.from, effect.value.to, Decoration.mark({
          class: 'opencodian-selection-highlight',
        }));
        return builder.finish();
      }

      if (effect.is(hideHighlightEffect)) {
        return Decoration.none;
      }
    }

    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function ensureSelectionHighlightField(editorView: EditorView): void {
  if (editorView.state.field(selectionHighlightField, false)) {
    return;
  }

  editorView.dispatch({
    effects: StateEffect.appendConfig.of(selectionHighlightField),
  });
}

export function showSelectionHighlight(editorView: EditorView, from: number, to: number): void {
  ensureSelectionHighlightField(editorView);
  const current = editorView.state.field(selectionHighlightField);
  const range = current.iter();
  if (current.size === 1 && range.from === from && range.to === to) return;
  editorView.dispatch({
    effects: showHighlightEffect.of({ from, to }),
  });
}

export function hideSelectionHighlight(editorView: EditorView): void {
  const current = editorView.state.field(selectionHighlightField, false);
  if (!current || current.size === 0) {
    return;
  }

  editorView.dispatch({
    effects: hideHighlightEffect.of(null),
  });
}
