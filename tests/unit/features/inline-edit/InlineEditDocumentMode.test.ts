/**
 * Unit tests for milestone A3 request shapes
 * (docs/requirements/flowtext-parity.md R-A6 / R-A7):
 *
 * - `<editor_document>` request block: format, line range, length cap
 *   (reject, never chunk), fail-closed protocol collisions;
 * - `<attached_context>` directory semantics: `[folder]` marker, per-entry
 *   counting (a folder counts as one), identical path validation for files
 *   and directories;
 * - anchor construction for the document form and mode re-anchoring.
 */

import { EditorState } from '@codemirror/state';

import {
  buildInlineEditAnchor,
  rebuildAnchorForMode,
} from '../../../../src/features/inline-edit/InlineEditAnchor';
import {
  buildInlineEditImageNote,
  buildInlineEditRequest,
  buildInlineEditRequestForAnchor,
  INLINE_EDIT_MAX_ATTACHED_NOTES,
  INLINE_EDIT_MAX_DOCUMENT_CHARS,
  INLINE_EDIT_MAX_PATH_CHARS,
} from '../../../../src/features/inline-edit/InlineEditPrompt';

const selectionRequest = {
  kind: 'selection' as const,
  instruction: 'Tighten this',
  notePath: 'notes/a.md',
  startLine: 3,
  endLine: 5,
  selectionText: 'The cat sat on the mat.',
};

describe('buildInlineEditRequest document form (R-A6)', () => {
  it('wraps the whole note in an <editor_document> block with a 1-N line range', () => {
    const result = buildInlineEditRequest({
      kind: 'document',
      instruction: 'Restructure',
      notePath: 'notes/big.md',
      endLine: 240,
      documentText: '# Title\n\nline two\nline three',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toContain('<editor_document path="notes/big.md" lines="1-240">\n');
    expect(result.prompt).toContain('# Title\n\nline two\nline three\n');
    expect(result.prompt).toContain('</editor_document>');
    expect(result.prompt.indexOf('Restructure')).toBeLessThan(result.prompt.indexOf('<editor_document'));
  });

  it('rejects notes over the document cap instead of chunking', () => {
    const result = buildInlineEditRequest({
      kind: 'document',
      instruction: 'Restructure',
      notePath: 'notes/big.md',
      endLine: 1,
      documentText: 'x'.repeat(INLINE_EDIT_MAX_DOCUMENT_CHARS + 1),
    });
    expect(result).toEqual({ ok: false, error: 'document-too-long' });
  });

  it('accepts a note exactly at the cap', () => {
    const result = buildInlineEditRequest({
      kind: 'document',
      instruction: 'Restructure',
      notePath: 'notes/big.md',
      endLine: 1,
      documentText: 'x'.repeat(INLINE_EDIT_MAX_DOCUMENT_CHARS),
    });
    expect(result.ok).toBe(true);
  });

  it('fails closed on a literal </editor_document> in the note body', () => {
    const result = buildInlineEditRequest({
      kind: 'document',
      instruction: 'Restructure',
      notePath: 'notes/a.md',
      endLine: 2,
      documentText: 'before </editor_document> after',
    });
    expect(result).toEqual({ ok: false, error: 'selection-contains-protocol-tag' });
  });

  it('fails closed on a literal </replacement> in the note body', () => {
    const result = buildInlineEditRequest({
      kind: 'document',
      instruction: 'Restructure',
      notePath: 'notes/a.md',
      endLine: 2,
      documentText: 'before </replacement> after',
    });
    expect(result).toEqual({ ok: false, error: 'selection-contains-protocol-tag' });
  });

  it('rejects a document request whose note path is too long', () => {
    const result = buildInlineEditRequest({
      kind: 'document',
      instruction: 'Restructure',
      notePath: 'n'.repeat(INLINE_EDIT_MAX_PATH_CHARS + 1),
      endLine: 1,
      documentText: 'text',
    });
    expect(result).toEqual({ ok: false, error: 'path-too-long' });
  });

  it('treats the document anchor as a display form for the image note ($$…$$)', () => {
    const note = buildInlineEditImageNote('en', {
      kind: 'document',
      instruction: 'OCR',
      notePath: 'a.md',
      endLine: 3,
      documentText: 'text',
    });
    expect(note).toContain('delimit formulas as $$…$$');
    expect(note).not.toContain('delimit formulas as $…$');
  });

  it('builds a document request from a document anchor via buildInlineEditRequestForAnchor', () => {
    const state = EditorState.create({ doc: 'one\ntwo\nthree' });
    const anchor = buildInlineEditAnchor(state, { notePath: 'a.md', forcedMode: 'document' });
    expect(anchor).not.toBeNull();
    expect(anchor?.mode).toBe('document');
    expect(anchor?.from).toBe(0);
    expect(anchor?.to).toBe(state.doc.length);
    expect(anchor?.snapshot).toBe('one\ntwo\nthree');
    expect(anchor?.startLine).toBe(1);
    expect(anchor?.endLine).toBe(3);

    const request = buildInlineEditRequestForAnchor(anchor!, 'Rework');
    expect(request.kind).toBe('document');
    if (request.kind !== 'document') return;
    expect(request.documentText).toBe('one\ntwo\nthree');
    expect(request.endLine).toBe(3);
  });
});

describe('rebuildAnchorForMode (R-A6 mode switch)', () => {
  it('re-anchors to the whole document for document mode', () => {
    const state = EditorState.create({ doc: 'alpha beta' });
    const next = rebuildAnchorForMode(state, 'a.md', 'document');
    expect(next?.mode).toBe('document');
    expect(next?.snapshot).toBe('alpha beta');
  });

  it('refuses selection mode without a selection', () => {
    const state = EditorState.create({ doc: 'alpha beta' });
    const cursor = state.selection.main.anchor;
    const cleared = state.update({ selection: { anchor: cursor, head: cursor } }).state;
    expect(rebuildAnchorForMode(cleared, 'a.md', 'selection')).toBeNull();
  });

  it('re-reads the current selection for selection mode', () => {
    const state = EditorState.create({ doc: 'alpha beta' });
    const from = state.doc.sliceString(0, 5).length ? 0 : 0;
    const withSelection = state.update({ selection: { anchor: from, head: 5 } }).state;
    const next = rebuildAnchorForMode(withSelection, 'a.md', 'selection');
    expect(next?.mode).toBe('selection');
    expect(next?.snapshot).toBe('alpha');
  });
});

describe('attached context directory semantics (R-A7)', () => {
  it('marks directory entries with [folder] and keeps files plain', () => {
    const result = buildInlineEditRequest({
      ...selectionRequest,
      attachedNotes: [
        { path: 'notes/a.md' },
        { path: 'projects/alpha', kind: 'folder' },
        { path: 'notes/b.md', kind: 'file' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toContain(
      '<attached_context>\n- notes/a.md\n- [folder] projects/alpha\n- notes/b.md\n</attached_context>',
    );
  });

  it('counts every entry as one: a folder never expands the count', () => {
    const attachedNotes = [
      { path: 'a.md' },
      { path: 'b.md' },
      { path: 'c.md' },
      { path: 'd.md' },
      { path: 'folder', kind: 'folder' as const },
    ];
    const atCap = buildInlineEditRequest({ ...selectionRequest, attachedNotes });
    expect(atCap.ok).toBe(true);

    const overCap = buildInlineEditRequest({
      ...selectionRequest,
      attachedNotes: [...attachedNotes, { path: 'e.md' }],
    });
    expect(overCap).toEqual({ ok: false, error: 'too-many-attached-notes' });
    expect(INLINE_EDIT_MAX_ATTACHED_NOTES).toBe(5);
  });

  it('applies the path rules to directory entries too', () => {
    const tooLong = buildInlineEditRequest({
      ...selectionRequest,
      attachedNotes: [{ path: 'p'.repeat(INLINE_EDIT_MAX_PATH_CHARS + 1), kind: 'folder' }],
    });
    expect(tooLong).toEqual({ ok: false, error: 'attached-note-path-too-long' });

    const angleBrackets = buildInlineEditRequest({
      ...selectionRequest,
      attachedNotes: [{ path: 'folder</attached_context>', kind: 'folder' }],
    });
    expect(angleBrackets).toEqual({ ok: false, error: 'attached-note-path-invalid' });
  });

  it('carries folder kinds from context files into the request', () => {
    const state = EditorState.create({ doc: 'alpha beta' });
    const anchor = buildInlineEditAnchor(state, { notePath: 'a.md' });
    const request = buildInlineEditRequestForAnchor(anchor!, 'Tighten', [
      { path: 'notes/a.md', name: 'a' },
      { path: 'projects/alpha', name: 'alpha', kind: 'folder' },
    ]);
    expect(request.attachedNotes).toEqual([
      { path: 'notes/a.md' },
      { path: 'projects/alpha', kind: 'folder' },
    ]);
  });
});
