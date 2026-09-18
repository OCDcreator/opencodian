/**
 * Contract tests for the R-C3 ghost-text CM6 layer
 * (docs/requirements/flowtext-c3-design.md §3.3, §5 case 3):
 *
 * - effect set/clear semantics of the ghost state field;
 * - the displayed decoration set contains ONLY a widget decoration — a
 *   `Decoration.replace` is structurally absent (source-level assertion,
 *   matching the repo's static design-contract precedent);
 * - `EditorView.atomicRanges` covers the suggestion extent so the cursor
 *   skips the suggestion without the ghost ever entering the document;
 * - any document change or explicit selection update clears the ghost.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
  applyInlineCompletionGhostEffect,
  INLINE_COMPLETION_GHOST_CLASS,
  inlineCompletionGhostFieldForTests,
  readInlineCompletionGhost,
  setInlineCompletionGhost,
} from '../../../../src/features/inline-edit/InlineCompletionGhost';

const WT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function stateWithField(doc: string, extensions: unknown[] = []): EditorState {
  return EditorState.create({ doc, extensions: [inlineCompletionGhostFieldForTests, ...extensions] as never[] });
}

function setGhost(state: EditorState, pos: number, text: string, prefixTail = 'tail'): EditorState {
  return state.update({
    effects: setInlineCompletionGhost.of({ pos, text, prefixTail }),
  }).state;
}

function displayedRanges(state: EditorState): { from: number; to: number; spec: Record<string, unknown> }[] {
  const set = state.facet(EditorView.decorations);
  const out: { from: number; to: number; spec: Record<string, unknown> }[] = [];
  for (const rangeSet of set) {
    const iter = rangeSet.iter();
    while (iter.value !== null) {
      out.push({ from: iter.from, to: iter.to, spec: iter.value.spec as Record<string, unknown> });
      iter.next();
    }
  }
  return out;
}

function atomicRanges(state: EditorState): { from: number; to: number }[] {
  const providers = state.facet(EditorView.atomicRanges);
  const out: { from: number; to: number }[] = [];
  for (const provider of providers) {
    const set = provider({} as EditorView);
    const iter = set.iter();
    while (iter.value !== null) {
      out.push({ from: iter.from, to: iter.to });
      iter.next();
    }
  }
  return out;
}

describe('inline completion ghost state field', () => {
  it('starts empty', () => {
    const state = stateWithField('one two three');
    expect(readInlineCompletionGhost(state)).toBeNull();
    expect(displayedRanges(state)).toHaveLength(0);
    expect(atomicRanges(state)).toHaveLength(0);
  });

  it('sets one suggestion via the effect and replaces it wholesale', () => {
    let state = setGhost(stateWithField('one two three'), 3, ' suggestion');
    expect(readInlineCompletionGhost(state)?.text).toBe(' suggestion');
    state = state.update({
      effects: setInlineCompletionGhost.of({ pos: 3, text: ' other', prefixTail: 'tail' }),
    }).state;
    expect(readInlineCompletionGhost(state)?.text).toBe(' other');
  });

  it('clears via a null effect', () => {
    let state = setGhost(stateWithField('one two three'), 3, ' suggestion');
    state = state.update({ effects: setInlineCompletionGhost.of(null) }).state;
    expect(readInlineCompletionGhost(state)).toBeNull();
  });

  it('clears on any document change (typing race, state-level guard)', () => {
    const state = setGhost(stateWithField('one two three'), 3, ' suggestion');
    const updated = state.update({ changes: { from: 0, to: 0, insert: 'X' } }).state;
    expect(readInlineCompletionGhost(updated)).toBeNull();
  });

  it('clears on an explicit selection update (cursor moved away)', () => {
    const state = setGhost(stateWithField('one two three'), 3, ' suggestion');
    const updated = state.update({ selection: { anchor: 13 } }).state;
    expect(readInlineCompletionGhost(updated)).toBeNull();
  });

  it('drops a suggestion whose position fell outside the document', () => {
    const state = setGhost(stateWithField('one two three'), 99, ' beyond');
    expect(readInlineCompletionGhost(state)).toBeNull();
  });
});

describe('ghost decorations', () => {
  it('renders exactly one widget decoration at the position (side 1)', () => {
    const state = setGhost(stateWithField('one two three'), 3, ' suggestion');
    const ranges = displayedRanges(state);
    expect(ranges).toHaveLength(1);
    const range = ranges[0]!;
    expect(range.from).toBe(3);
    expect(range.to).toBe(3);
    expect(range.spec.side).toBe(1);
    expect(typeof (range.spec.widget as { toDOM?: unknown })?.toDOM).toBe('function');
  });

  it('exposes atomic ranges covering the suggestion extent', () => {
    const state = setGhost(stateWithField('one two three'), 3, ' suggestion');
    const ranges = atomicRanges(state).filter((range) => range.from === 3);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.to).toBe(3 + ' suggestion'.length);
  });

  it('the ghost widget DOM carries the muted ghost class and is aria-hidden', () => {
    const state = setGhost(stateWithField('one two three'), 3, ' suggestion');
    const range = displayedRanges(state)[0]!;
    const dom = (range.spec.widget as { toDOM(): HTMLElement }).toDOM();
    expect(dom.className).toBe(INLINE_COMPLETION_GHOST_CLASS);
    expect(dom.getAttribute('aria-hidden')).toBe('true');
    expect(dom.textContent).toBe(' suggestion');
  });

  it('two suggestions with equal text compare equal (widget reuse)', () => {
    const state = setGhost(stateWithField('one two three'), 3, ' suggestion');
    const range = displayedRanges(state)[0]!;
    const widget = range.spec.widget as { eq(other: { text: string }): boolean };
    expect(widget.eq({ text: ' suggestion' })).toBe(true);
    expect(widget.eq({ text: ' other' })).toBe(false);
  });
});

describe('no Decoration.replace anywhere in the ghost layer', () => {
  // Static assertion, same discipline as tests/unit/uiCssDesignContract.test.ts:
  // a replace decoration would corrupt the undo stack and document
  // consistency (R-C3 hard constraint), so it must never appear in the
  // ghost module — not for display and not as an atomic-range marker.
  it('the ghost module source contains no Decoration.replace call', () => {
    const source = fs.readFileSync(
      path.resolve(WT_ROOT, 'src/features/inline-edit/InlineCompletionGhost.ts'),
      'utf8',
    );
    // Call syntax only: prose mentions in comments carry no behaviour.
    expect(source).not.toMatch(/Decoration\s*\.\s*replace\s*\(/);
    expect(source).toMatch(/Decoration\s*\.\s*widget\s*\(/);
    expect(source).toMatch(/EditorView\.atomicRanges/);
  });

  it('a dispatch through a real view stays decoration-only (doc untouched)', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({ state: stateWithField('one two three'), parent });
    const before = view.state.doc.toString();
    applyInlineCompletionGhostEffect(view, setInlineCompletionGhost.of({
      pos: 3,
      text: ' suggestion',
      prefixTail: 'tail',
    }));
    expect(view.state.doc.toString()).toBe(before);
    expect(readInlineCompletionGhost(view.state)?.text).toBe(' suggestion');
    view.destroy();
    parent.remove();
  });
});

describe('applyInlineCompletionGhostEffect guards', () => {
  it('is a no-op on a view without the field', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: 'plain' }),
      parent,
    });
    expect(readInlineCompletionGhost(view.state)).toBeNull();
    // Must not throw even though the field is absent.
    applyInlineCompletionGhostEffect(view, setInlineCompletionGhost.of({
      pos: 0,
      text: 'x',
      prefixTail: '',
    }));
    expect(readInlineCompletionGhost(view.state)).toBeNull();
    view.destroy();
    parent.remove();
  });
});
