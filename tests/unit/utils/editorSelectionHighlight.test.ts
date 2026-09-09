import { EditorState, StateEffect, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { hideSelectionHighlight, showSelectionHighlight } from '../../../src/utils/editorSelectionHighlight';

function createEditor() {
  let state = EditorState.create({ doc: 'This selection should stay stable across refreshes.' });
  const dispatch = jest.fn((spec: TransactionSpec) => { state = state.update(spec).state; });
  const view = { get state() { return state; }, dispatch } as unknown as EditorView;
  return { view, dispatch };
}

describe('editor selection highlight transactions', () => {
  it('does not dispatch updates when the visible range has not changed', () => {
    const { view, dispatch } = createEditor();
    showSelectionHighlight(view, 5, 14);
    dispatch.mockClear();
    for (let i = 0; i < 20; i++) showSelectionHighlight(view, 5, 14);
    expect(dispatch).not.toHaveBeenCalled();
    showSelectionHighlight(view, 5, 20);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('clears once, then leaves an already empty highlight alone', () => {
    const { view, dispatch } = createEditor();
    hideSelectionHighlight(view);
    expect(dispatch).not.toHaveBeenCalled();
    showSelectionHighlight(view, 5, 14);
    dispatch.mockClear();
    hideSelectionHighlight(view);
    hideSelectionHighlight(view);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('compares with the mapped editor state after document edits', () => {
    const { view, dispatch } = createEditor();
    showSelectionHighlight(view, 5, 14);
    dispatch({ changes: { from: 0, insert: 'abc' } });
    dispatch.mockClear();
    showSelectionHighlight(view, 8, 17);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('reinstalls its field after editor reconfiguration', () => {
    const { view, dispatch } = createEditor();
    showSelectionHighlight(view, 5, 14);
    dispatch({ effects: StateEffect.reconfigure.of([]) });
    dispatch.mockClear();
    showSelectionHighlight(view, 5, 14);
    expect(dispatch).toHaveBeenCalledTimes(2);
    dispatch.mockClear();
    showSelectionHighlight(view, 5, 14);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
