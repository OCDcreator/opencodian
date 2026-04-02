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

const installedEditors = new WeakSet<EditorView>();

function ensureSelectionHighlightField(editorView: EditorView): void {
  if (installedEditors.has(editorView)) {
    return;
  }

  editorView.dispatch({
    effects: StateEffect.appendConfig.of(selectionHighlightField),
  });
  installedEditors.add(editorView);
}

export function showSelectionHighlight(editorView: EditorView, from: number, to: number): void {
  ensureSelectionHighlightField(editorView);
  editorView.dispatch({
    effects: showHighlightEffect.of({ from, to }),
  });
}

export function hideSelectionHighlight(editorView: EditorView): void {
  if (!installedEditors.has(editorView)) {
    return;
  }

  editorView.dispatch({
    effects: hideHighlightEffect.of(null),
  });
}
