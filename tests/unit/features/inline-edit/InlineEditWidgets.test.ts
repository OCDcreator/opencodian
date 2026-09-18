/**
 * Contract tests for the editId-keyed preview decoration layer
 * (docs/requirements/flowtext-parity.md R-A5 §8.2):
 *
 * - upsert/remove/clear semantics of the keyed effect set;
 * - both load-bearing decoration forms preserved: insertions render as
 *   `block: true` widgets, replacements as *inline* replace decorations;
 * - cross-edit anchor mapping: a document edit that applies edit A's write
 *   maps edit B's decoration to the new offsets, and B's own snapshot compare
 *   still passes — the dirty check cannot be corrupted by a sibling edit.
 */

import { EditorState, StateEffect } from '@codemirror/state';

import { canApplyEdit } from '../../../../src/features/inline-edit/InlineEditService';
import {
  applyInlineEditEffect,
  clearAllInlineEditPreviews,
  inlineEditPreviewField,
  type InlineEditPreviewPayload,
  readInlineEditPreviewIds,
  readInlineEditRange,
  removeInlineEditPreview,
  upsertInlineEditPreview,
} from '../../../../src/features/inline-edit/InlineEditWidgets';

const DOC = 'one two three four five six seven eight nine ten';

function payload(overrides: Partial<InlineEditPreviewPayload> & { editId: string }): InlineEditPreviewPayload {
  return {
    token: `${overrides.editId}:token`,
    from: 0,
    to: 0,
    before: '',
    after: '',
    insertion: false,
    busy: false,
    callbacks: { onSubmit: () => {}, onAccept: () => {}, onReject: () => {} },
    acceptLabel: 'accept',
    rejectLabel: 'reject',
    ...overrides,
  };
}

function stateWithField(doc: string = DOC): EditorState {
  return EditorState.create({ doc, extensions: [inlineEditPreviewField] });
}

/** Decoration specs by walking the live set (spec.block marks the widget form). */
function decorationSpecs(state: EditorState): { from: number; to: number; block?: boolean }[] {
  const set = state.field(inlineEditPreviewField).decorations;
  const out: { from: number; to: number; block?: boolean }[] = [];
  const iter = set.iter();
  while (iter.value !== null) {
    out.push({ from: iter.from, to: iter.to, block: (iter.value.spec as { block?: boolean }).block });
    iter.next();
  }
  return out;
}

describe('InlineEditWidgets editId-keyed decoration set (R-A5)', () => {
  it('upserts two previews and reads each range by id', () => {
    let state = stateWithField();
    state = state.update({
      effects: [
        upsertInlineEditPreview.of(payload({ editId: 'a', from: 4, to: 7, before: 'two', after: 'TWO' })),
        upsertInlineEditPreview.of(payload({ editId: 'b', from: 20, to: 24, before: 'five', after: 'FIVE' })),
      ],
    }).state;

    expect(readInlineEditPreviewIds(state).sort()).toEqual(['a', 'b']);
    expect(readInlineEditRange(state, 'a')).toEqual({ from: 4, to: 7 });
    expect(readInlineEditRange(state, 'b')).toEqual({ from: 20, to: 24 });
    expect(readInlineEditRange(state, 'missing')).toBeNull();
  });

  it('keeps the two load-bearing decoration forms: block widget for insertions, inline replace for replacements', () => {
    let state = stateWithField();
    state = state.update({
      effects: [
        upsertInlineEditPreview.of(payload({ editId: 'ins', from: 10, to: 10, insertion: true, after: 'NEW' })),
        upsertInlineEditPreview.of(payload({ editId: 'rep', from: 0, to: 3, before: 'one', after: 'ONE' })),
      ],
    }).state;

    const specs = decorationSpecs(state);
    expect(specs).toHaveLength(2);
    const insert = specs.find((spec) => spec.from === 10 && spec.to === 10);
    const replace = specs.find((spec) => spec.from === 0 && spec.to === 3);
    // An insertion must stay a block widget…
    expect(insert?.block).toBe(true);
    // …and a replacement must stay an inline (non-block) replace: a block
    // replace would be expanded to whole-line boundaries by CodeMirror and
    // break the dirty-check / write range.
    expect(replace?.block).toBeUndefined();
  });

  it('upsert replaces only its own edit; remove drops one; clear empties the set', () => {
    let state = stateWithField();
    state = state.update({
      effects: [
        upsertInlineEditPreview.of(payload({ editId: 'a', from: 4, to: 7 })),
        upsertInlineEditPreview.of(payload({ editId: 'b', from: 20, to: 24 })),
      ],
    }).state;

    // Re-upsert A at a new range: B must be untouched.
    state = state.update({
      effects: upsertInlineEditPreview.of(payload({ editId: 'a', from: 0, to: 3 })),
    }).state;
    expect(readInlineEditRange(state, 'a')).toEqual({ from: 0, to: 3 });
    expect(readInlineEditRange(state, 'b')).toEqual({ from: 20, to: 24 });

    state = state.update({ effects: removeInlineEditPreview.of('a') }).state;
    expect(readInlineEditRange(state, 'a')).toBeNull();
    expect(readInlineEditRange(state, 'b')).toEqual({ from: 20, to: 24 });

    state = state.update({ effects: clearAllInlineEditPreviews.of(null) }).state;
    expect(readInlineEditPreviewIds(state)).toEqual([]);
  });

  it('maps every edit through a foreign document change (cross-accept anchor follow)', () => {
    let state = stateWithField();
    // Edit A replaces [4,7) ('two'), edit B inserts at 30 (inside 'eight').
    state = state.update({
      effects: [
        upsertInlineEditPreview.of(payload({ editId: 'a', from: 4, to: 7, before: 'two', after: 'TWO!' })),
        upsertInlineEditPreview.of(payload({ editId: 'b', from: 30, to: 30, insertion: true, before: '', after: 'INS' })),
      ],
    }).state;

    // Accepting A = one replaceRange write: 'two' (3) -> 'TWO!' (4), net +1.
    const acceptA = state.update({ changes: { from: 4, to: 7, insert: 'TWO!' } });
    state = acceptA.state;

    // A is gone from the model (the controller removes it on accept); B must
    // have followed the change by +1.
    expect(readInlineEditRange(state, 'b')).toEqual({ from: 31, to: 31 });

    // And B's dirty check still compares only its own (empty) snapshot: the
    // sibling accept did not corrupt it. An untouched B range stays apply-able…
    const bRange = readInlineEditRange(state, 'b')!;
    expect(canApplyEdit('', state.doc.sliceString(bRange.from, bRange.to))).toBe(true);

    // A *replacement* edit's snapshot compare still catches a user edit inside
    // its own range after the sibling apply: re-anchor C on 'seven', then edit
    // inside it.
    state = state.update({
      effects: upsertInlineEditPreview.of(
        payload({ editId: 'c', from: 28, to: 33, before: 'seven', after: 'SEVEN' }),
      ),
    }).state;
    const conflicted = state.update({ changes: { from: 29, to: 30, insert: 'X' } }).state;
    const cRange = readInlineEditRange(conflicted, 'c')!;
    expect(canApplyEdit('seven', conflicted.doc.sliceString(cRange.from, cRange.to))).toBe(false);
  });

  it('collapses a replace decoration whose anchored text was deleted (dirty check will reject)', () => {
    let state = stateWithField();
    state = state.update({
      effects: upsertInlineEditPreview.of(payload({ editId: 'a', from: 4, to: 7, before: 'two', after: 'TWO' })),
    }).state;
    state = state.update({ changes: { from: 4, to: 7, insert: '' } }).state;
    // The entry tracks the collapsed range; the decoration renders nothing,
    // and the accept-time snapshot compare rejects the write.
    expect(readInlineEditRange(state, 'a')).toEqual({ from: 4, to: 4 });
    expect(decorationSpecs(state)).toEqual([]);
  });

  it('ignores unknown effects and stays stable without effects', () => {
    const other = StateEffect.define<null>();
    let state = stateWithField();
    state = state.update({ effects: upsertInlineEditPreview.of(payload({ editId: 'a', from: 4, to: 7 })) }).state;
    const before = state.field(inlineEditPreviewField);
    state = state.update({ effects: other.of(null) }).state;
    expect(state.field(inlineEditPreviewField)).toBe(before);
  });
});

describe('applyInlineEditEffect guard', () => {
  it('no-ops when the field is not installed', () => {
    const viewLike = {
      state: stateWithField(),
      dispatch: jest.fn(),
    };
    // Field IS installed here, so the effect dispatches.
    applyInlineEditEffect(viewLike as never, removeInlineEditPreview.of('a'));
    expect(viewLike.dispatch).toHaveBeenCalledTimes(1);

    const bare = {
      state: EditorState.create({ doc: DOC }),
      dispatch: jest.fn(),
    };
    applyInlineEditEffect(bare as never, removeInlineEditPreview.of('a'));
    expect(bare.dispatch).not.toHaveBeenCalled();
  });
});
