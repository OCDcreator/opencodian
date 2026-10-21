import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';

import { executeInlineEditAccept, type InlineEditAcceptEdit } from '../../../../src/features/inline-edit/InlineEditAccept';
import { applyInlineEditEffect, ensureInlineEditField, upsertInlineEditPreview } from '../../../../src/features/inline-edit/InlineEditWidgets';

function harness(mode: 'selection' | 'document' = 'selection') {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create({ doc: 'alpha beta gamma' }), parent });
  ensureInlineEditField(view);
  const from = mode === 'document' ? 0 : 6;
  const to = mode === 'document' ? view.state.doc.length : 10;
  const writes: string[] = [];
  const editor = {
    offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
    replaceRange: (text: string, start: { ch: number }, end: { ch: number }) => {
      writes.push(text);
      view.dispatch({ changes: { from: start.ch, to: end.ch, insert: text } });
    },
  } as unknown as Editor;
  applyInlineEditEffect(view, upsertInlineEditPreview.of({
    editId: 'owned', token: 'owned', from, to,
    before: view.state.doc.sliceString(from, to), after: 'RESULT', insertion: false, busy: false,
    acceptLabel: 'Accept', rejectLabel: 'Reject',
    callbacks: { onSubmit() {}, onAccept() {}, onReject() {} },
  }));
  const edit: InlineEditAcceptEdit = {
    editId: 'owned', editorView: view, editor,
    anchor: { mode, notePath: 'owned.md', from, to, snapshot: view.state.doc.sliceString(from, to), startLine: 1, endLine: 1, before: '', after: '' },
    preview: { mode: 'replacement', text: 'RESULT' },
  };
  const notify = jest.fn();
  const rejectEdit = jest.fn();
  return { view, edit, writes, notify, rejectEdit };
}

it('writes in the same turn as the snapshot check before waiting for native cleanup', async () => {
  const h = harness();
  let finishCleanup!: () => void;
  const cleanup = new Promise<void>((resolve) => { finishCleanup = resolve; });
  const closeEdit = jest.fn(() => cleanup);
  try {
    await executeInlineEditAccept(h.edit, { notify: h.notify, rejectEdit: h.rejectEdit, isCurrent: () => true, closeEdit });
    expect(h.writes).toEqual(['RESULT']);
    expect(h.view.state.doc.toString()).toBe('alpha RESULT gamma');
    expect(closeEdit).toHaveBeenCalledTimes(1);
  } finally {
    finishCleanup();
    await cleanup;
    await Promise.resolve();
    h.view.destroy();
  }
});

it('rechecks the document after an asynchronous whole-note confirmation', async () => {
  const h = harness('document');
  let confirm!: (ok: boolean) => void;
  const confirmation = new Promise<boolean>((resolve) => { confirm = resolve; });
  const closeEdit = jest.fn(async () => {});
  try {
    const pending = executeInlineEditAccept(h.edit, { notify: h.notify, rejectEdit: h.rejectEdit, isCurrent: () => true, closeEdit, confirmDocumentReplace: () => confirmation });
    h.view.dispatch({ changes: { from: 6, to: 10, insert: 'MANUAL' } });
    confirm(true);
    await pending;
    await Promise.resolve();
    expect(h.writes).toEqual([]);
    expect(h.view.state.doc.toString()).toBe('alpha MANUAL gamma');
    expect(h.rejectEdit).toHaveBeenCalledWith('owned');
    expect(h.notify).toHaveBeenCalledTimes(1);
  } finally { h.view.destroy(); }
});
