/**
 * Controller-level contract tests for milestone A3
 * (docs/requirements/flowtext-parity.md R-A5 / R-A6):
 *
 * - two edits coexist in one note (selection rewrite + cursor insertion) and
 *   accepting the first maps the second's anchor without corrupting its dirty
 *   check (交叉接受锚点映射 + 脏检查互不误伤);
 * - a manual edit inside edit A's range rejects only A ("生成期间笔记已被修改");
 * - the concurrency cap refuses extras with a notice and destroys nothing;
 * - Enter dispatches by focus ownership (per-edit widget buttons covered by
 *   the coexist test);
 * - close() disposes every edit, preview and session;
 * - whole-document mode: request shape, second confirmation, single write.
 *
 * The tests run a real CodeMirror 6 EditorView in jsdom and a tiny Editor
 * facade whose replaceRange dispatches the change through the view — the same
 * routing Obsidian performs — so decoration mapping matches production.
 *
 * Focus semantics mirror real usage: an edit in the input phase dismisses
 * when another bar takes focus, so the multi-edit flows here move the first
 * edit to its preview phase before opening the second.
 */

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';

import type { AgentAuxQueryCapability } from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import { InlineEditController } from '../../../../src/features/inline-edit/InlineEditController';
import type { InlineEditHost } from '../../../../src/features/inline-edit/InlineEditHost';
import type { InlineEditRequest } from '../../../../src/features/inline-edit/InlineEditPrompt';
import { canApplyEdit } from '../../../../src/features/inline-edit/InlineEditService';
import type { InlineEditHostAdapter } from '../../../../src/features/inline-edit/InlineEditTypes';
import {
  readInlineEditPreviewIds,
  readInlineEditRange,
} from '../../../../src/features/inline-edit/InlineEditWidgets';
import { t } from '../../../../src/i18n';

interface RecordedWrite {
  readonly text: string;
  readonly from: number;
  readonly to: number;
}

interface HarnessOptions {
  readonly maxConcurrentEdits?: number;
  readonly documentModeEnabled?: boolean;
  readonly confirmResult?: boolean;
}

interface Harness {
  controller: InlineEditController;
  view: EditorView;
  editor: Editor;
  writes: RecordedWrite[];
  notices: string[];
  disposed: string[];
  requests: InlineEditRequest[];
  confirmCalls: { notePath: string; charCount: number }[];
}

const DOC = 'alpha beta gamma delta epsilon zeta eta theta';

function posOf(doc: string, needle: string, from = 0): number {
  const at = doc.indexOf(needle, from);
  if (at < 0) throw new Error(`not found: ${needle}`);
  return at;
}

async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create({ doc: DOC }), parent });
  const writes: RecordedWrite[] = [];
  const notices: string[] = [];
  const disposed: string[] = [];
  const requests: InlineEditRequest[] = [];
  const confirmCalls: { notePath: string; charCount: number }[] = [];

  const capability = {} as AgentAuxQueryCapability;
  const adapter: InlineEditHostAdapter = {
    kind: 'opencode',
    displayName: 'OpenCode',
    getAuxQuery: () => capability,
    resolveModel: () => ({ ok: true, model: null }),
    describeModelSelection: () => ({ label: '', source: 'default' }),
    getEffort: () => null,
  };
  const host: InlineEditHost = {
    getWorkingDirectory: () => '/vault',
    getLocale: () => 'en',
    resolveAdapter: () => adapter,
    getMaxConcurrentEdits: () => options.maxConcurrentEdits ?? 3,
    isDocumentModeEnabled: () => options.documentModeEnabled ?? true,
  };

  const editor = {
    cm: view,
    offsetToPos: (offset: number) => {
      const line = view.state.doc.lineAt(offset);
      return { line: line.number - 1, ch: offset - line.from };
    },
    posToOffset: (pos: { line: number; ch: number }) => view.state.doc.line(pos.line + 1).from + pos.ch,
    replaceRange: (text: string, start: { line: number; ch: number }, end: { line: number; ch: number }) => {
      const from = view.state.doc.line(start.line + 1).from + start.ch;
      const to = view.state.doc.line(end.line + 1).from + end.ch;
      writes.push({ text, from, to });
      view.dispatch({ changes: { from, to, insert: text } });
    },
  } as unknown as Editor;

  const controller = new InlineEditController({
    host,
    notify: (message) => { notices.push(message); },
    confirmDocumentReplace: (info) => {
      confirmCalls.push(info);
      return Promise.resolve(options.confirmResult ?? true);
    },
    createService: () => ({
      get hasSession() { return false; },
      submit(request: InlineEditRequest) {
        requests.push(request);
        // Cursor forms answer with an insertion; selection/document with a
        // replacement, mirroring how the model answers each anchor shape.
        return request.kind === 'cursor-inline' || request.kind === 'cursor-inbetween'
          ? Promise.resolve({ status: 'preview', mode: 'insertion', text: 'INSERTED' })
          : Promise.resolve({ status: 'preview', mode: 'replacement', text: 'RESULT' });
      },
      clarify: () => Promise.resolve({ status: 'error', reason: 'turn-failed' }),
      cancel() { /* no-op */ },
      dispose() { disposed.push('service'); return Promise.resolve(); },
    }) as never,
  });

  return { controller, view, editor, writes, notices, disposed, requests, confirmCalls };
}

/** Submit one edit through its own floating bar. */
async function submitBar(view: EditorView, bar: HTMLElement, instruction: string): Promise<void> {
  const field = bar.querySelector<HTMLTextAreaElement>('.opencodian-inline-edit-field');
  if (!field) throw new Error('overlay field missing');
  field.value = instruction;
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await flush();
}

function bars(view: EditorView): HTMLElement[] {
  return [...view.dom.querySelectorAll<HTMLElement>(':scope > .opencodian-inline-edit-overlay')];
}

function previewEls(view: EditorView): HTMLElement[] {
  return [...view.dom.querySelectorAll<HTMLElement>('.opencodian-inline-edit-preview')];
}

function clickAccept(previewEl: HTMLElement): void {
  const button = previewEl.querySelector<HTMLButtonElement>('.opencodian-inline-edit-action.is-accept');
  if (!button) throw new Error('accept button missing');
  button.click();
}

function pressKey(documentRef: Document, key: string): void {
  documentRef.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** Open a selection edit, submit it, and leave it in the preview phase. */
async function openSelectionPreview(h: Harness, from: number, to: number): Promise<void> {
  h.view.dispatch({ selection: { anchor: from, head: to } });
  expect(h.controller.open(h.editor, { file: { path: 'note.md' } })).toBe(true);
  await flush(2);
  await submitBar(h.view, bars(h.view)[0]!, 'rewrite');
}

/** Open a cursor edit, submit it, and leave it in the preview phase. */
async function openCursorPreview(h: Harness, at: number): Promise<void> {
  h.view.dispatch({ selection: { anchor: at, head: at } });
  expect(h.controller.open(h.editor, { file: { path: 'note.md' } })).toBe(true);
  await flush(2);
  await submitBar(h.view, bars(h.view)[0]!, 'insert');
}

describe('InlineEditController parallel edits (R-A5)', () => {
  it('keeps a selection rewrite and a cursor insertion coexisting; accepting the first maps the second', async () => {
    const h = makeHarness();
    const betaFrom = posOf(DOC, 'beta');
    const betaTo = betaFrom + 'beta'.length;
    await openSelectionPreview(h, betaFrom, betaTo);
    expect(h.controller.activeEditCountForView(h.view)).toBe(1);
    expect(previewEls(h.view)).toHaveLength(1);

    // Second edit: cursor insertion right after 'epsilon'. The first edit is
    // in preview (its bar is gone), so no focus conflict.
    const cursorAt = posOf(DOC, 'epsilon') + 'epsilon'.length;
    await openCursorPreview(h, cursorAt);
    expect(h.controller.activeEditCountForView(h.view)).toBe(2);
    expect(previewEls(h.view)).toHaveLength(2);
    expect(h.notices).toEqual([]);

    // Per-edit widget buttons: accept the *first* preview (the selection
    // rewrite) directly — 'beta' -> 'RESULT'.
    clickAccept(previewEls(h.view)[0]!);
    await flush(12);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toEqual({ text: 'RESULT', from: betaFrom, to: betaTo });
    expect(h.controller.activeEditCountForView(h.view)).toBe(1);

    // The remaining edit followed the write: its anchor moved from cursorAt
    // by (len('RESULT') - len('beta')) = +2, and its own snapshot compare is
    // untouched, so it still applies at the mapped position.
    const remainingId = readInlineEditPreviewIds(h.view.state)[0]!;
    expect(readInlineEditRange(h.view.state, remainingId)).toEqual({ from: cursorAt + 2, to: cursorAt + 2 });

    // Accept the remaining edit via the keyboard (focus falls back to it):
    // the insertion writes at the mapped position.
    pressKey(document, 'Enter');
    await flush(12);
    expect(h.writes).toHaveLength(2);
    expect(h.writes[1]).toEqual({ text: 'INSERTED', from: cursorAt + 2, to: cursorAt + 2 });
    expect(h.controller.hasActiveEdits()).toBe(false);
    expect(h.disposed).toHaveLength(2);
  });

  it('rejects only the conflicting edit when its range was edited manually', async () => {
    const h = makeHarness();
    const betaFrom = posOf(DOC, 'beta');
    const betaTo = betaFrom + 'beta'.length;
    await openSelectionPreview(h, betaFrom, betaTo);
    const cursorAt = posOf(DOC, 'epsilon') + 'epsilon'.length;
    await openCursorPreview(h, cursorAt);
    expect(readInlineEditPreviewIds(h.view.state)).toHaveLength(2);

    // Identify the edits by shape: replacement (from < to) vs insertion.
    const ids = readInlineEditPreviewIds(h.view.state);
    const selectionEdit = ids.find((id) => {
      const range = readInlineEditRange(h.view.state, id)!;
      return range.to > range.from;
    })!;
    const insertionEdit = ids.find((id) => id !== selectionEdit)!;

    // Manual edit strictly inside the selection edit's range.
    h.view.dispatch({ changes: { from: betaFrom + 3, to: betaFrom + 4, insert: 'XX' } });

    // Enter must reach only the focused edit: focus the selection edit and
    // accept — the dirty check refuses and rejects exactly that edit.
    const noticesBefore = h.notices.length;
    h.controller.focusEdit(selectionEdit);
    pressKey(document, 'Enter');
    await flush(12);

    expect(h.writes).toHaveLength(0);
    expect(h.notices.length).toBeGreaterThan(noticesBefore);
    expect(h.notices.some((m) => m.includes(t('inlineEdit.error.staleSelection')))).toBe(true);
    expect(readInlineEditPreviewIds(h.view.state)).toEqual([insertionEdit]);

    // The sibling still applies: its snapshot region is untouched, and the
    // keyboard now reaches it (focus fell back on the reject).
    const range = readInlineEditRange(h.view.state, insertionEdit)!;
    expect(canApplyEdit('', h.view.state.doc.sliceString(range.from, range.to))).toBe(true);
    pressKey(document, 'Enter');
    await flush(12);
    expect(h.writes).toHaveLength(1);
    // The manual edit (+1 char before the anchor) shifted the sibling too.
    expect(h.writes[0]).toEqual({ text: 'INSERTED', from: cursorAt + 1, to: cursorAt + 1 });
    expect(h.controller.hasActiveEdits()).toBe(false);
  });

  it('Enter accepts only the focused edit when two previews are up', async () => {
    const h = makeHarness();
    const betaFrom = posOf(DOC, 'beta');
    await openSelectionPreview(h, betaFrom, betaFrom + 4);
    const cursorAt = posOf(DOC, 'epsilon') + 'epsilon'.length;
    await openCursorPreview(h, cursorAt);
    const ids = readInlineEditPreviewIds(h.view.state);
    const selectionEdit = ids.find((id) => {
      const range = readInlineEditRange(h.view.state, id)!;
      return range.to > range.from;
    })!;

    // Focus the selection edit even though the insertion rendered last.
    h.controller.focusEdit(selectionEdit);
    pressKey(document, 'Enter');
    await flush(12);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toEqual({ text: 'RESULT', from: betaFrom, to: betaFrom + 4 });
    expect(readInlineEditPreviewIds(h.view.state)).toHaveLength(1);
  });

  it('Escape rejects only the focused edit', async () => {
    const h = makeHarness();
    const betaFrom = posOf(DOC, 'beta');
    await openSelectionPreview(h, betaFrom, betaFrom + 4);
    const cursorAt = posOf(DOC, 'epsilon') + 'epsilon'.length;
    await openCursorPreview(h, cursorAt);
    const ids = readInlineEditPreviewIds(h.view.state);
    const selectionEdit = ids.find((id) => {
      const range = readInlineEditRange(h.view.state, id)!;
      return range.to > range.from;
    })!;

    h.controller.focusEdit(selectionEdit);
    pressKey(document, 'Escape');
    await flush(12);
    expect(h.controller.activeEditCountForView(h.view)).toBe(1);
    expect(readInlineEditPreviewIds(h.view.state)).toHaveLength(1);
    expect(h.writes).toHaveLength(0);
  });

  it('refuses a fourth edit at the cap without destroying existing ones', () => {
    const h = makeHarness({ maxConcurrentEdits: 3 });
    h.view.dispatch({ selection: { anchor: 0, head: 5 } });
    expect(h.controller.open(h.editor, { file: { path: 'note.md' } })).toBe(true);
    h.view.dispatch({ selection: { anchor: 6, head: 6 } });
    expect(h.controller.open(h.editor, { file: { path: 'note.md' } })).toBe(true);
    h.view.dispatch({ selection: { anchor: 12, head: 17 } });
    expect(h.controller.open(h.editor, { file: { path: 'note.md' } })).toBe(true);
    expect(h.controller.activeEditCountForView(h.view)).toBe(3);

    h.view.dispatch({ selection: { anchor: 20, head: 20 } });
    expect(h.controller.open(h.editor, { file: { path: 'note.md' } })).toBe(false);
    expect(h.controller.activeEditCountForView(h.view)).toBe(3);
    expect(h.notices.some((m) => m.includes('3'))).toBe(true);
  });

  it('close() without an id disposes every edit, preview and session', async () => {
    const h = makeHarness();
    const betaFrom = posOf(DOC, 'beta');
    await openSelectionPreview(h, betaFrom, betaFrom + 4);
    const cursorAt = posOf(DOC, 'epsilon') + 'epsilon'.length;
    await openCursorPreview(h, cursorAt);
    expect(readInlineEditPreviewIds(h.view.state)).toHaveLength(2);

    await h.controller.close();
    expect(h.controller.hasActiveEdits()).toBe(false);
    expect(h.controller.activeEditCountForView(h.view)).toBe(0);
    expect(readInlineEditPreviewIds(h.view.state)).toEqual([]);
    expect(h.disposed.length).toBe(2);
    expect(h.view.dom.querySelectorAll('.opencodian-inline-edit-overlay')).toHaveLength(0);
  });
});

describe('InlineEditController whole-document mode (R-A6)', () => {
  it('builds a document request and asks for a second confirmation before the single write', async () => {
    const h = makeHarness({ confirmResult: true });
    expect(h.controller.open(h.editor, { file: { path: 'note.md' } }, { mode: 'document' })).toBe(true);
    await flush(2);
    await submitBar(h.view, bars(h.view)[0]!, 'rewrite everything');
    await flush();

    expect(h.requests).toHaveLength(1);
    const request = h.requests[0]!;
    expect(request.kind).toBe('document');
    if (request.kind !== 'document') return;
    expect(request.documentText).toBe(DOC);
    expect(request.endLine).toBe(1);

    // Accept → confirmation → one write covering the whole note.
    pressKey(document, 'Enter');
    await flush(12);
    expect(h.confirmCalls).toEqual([{ notePath: 'note.md', charCount: 'RESULT'.length }]);
    expect(h.writes).toEqual([{ text: 'RESULT', from: 0, to: DOC.length }]);
    expect(h.controller.hasActiveEdits()).toBe(false);
  });

  it('cancelling the confirmation writes nothing and keeps the preview', async () => {
    const h = makeHarness({ confirmResult: false });
    h.controller.open(h.editor, { file: { path: 'note.md' } }, { mode: 'document' });
    await flush(2);
    await submitBar(h.view, bars(h.view)[0]!, 'rewrite everything');
    await flush();

    pressKey(document, 'Enter');
    await flush(12);
    expect(h.confirmCalls).toHaveLength(1);
    expect(h.writes).toHaveLength(0);
    // Still open: the user can reject or retry the accept.
    expect(h.controller.activeEditCountForView(h.view)).toBe(1);
  });

  it('refuses to open when the mode is disabled or the note exceeds the cap', () => {
    const disabled = makeHarness({ documentModeEnabled: false });
    expect(disabled.controller.open(disabled.editor, { file: { path: 'note.md' } }, { mode: 'document' })).toBe(false);
    expect(disabled.notices.length).toBe(1);

    const longDoc = makeHarness();
    const longParent = document.createElement('div');
    document.body.appendChild(longParent);
    const longView = new EditorView({
      state: EditorState.create({ doc: 'x'.repeat(200_001) }),
      parent: longParent,
    });
    const longEditor = { cm: longView } as unknown as Editor;
    expect(longDoc.controller.open(longEditor, { file: { path: 'big.md' } }, { mode: 'document' })).toBe(false);
    expect(longDoc.notices.length).toBe(1);
    longView.destroy();
  });

  it('switches an edit to document mode via setEditMode and builds the document request', async () => {
    const h = makeHarness();
    const betaFrom = posOf(DOC, 'beta');
    h.view.dispatch({ selection: { anchor: betaFrom, head: betaFrom + 4 } });
    h.controller.open(h.editor, { file: { path: 'note.md' } });
    await flush(2);

    // Drive the mode row: three segments, 整篇 last.
    const documentButton = bars(h.view)[0]!
      .querySelector<HTMLButtonElement>('[data-inline-edit-mode="document"]');
    expect(documentButton).toBeTruthy();
    documentButton!.click();
    await flush(2);

    await submitBar(h.view, bars(h.view)[0]!, 'rewrite everything');
    await flush();
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]!.kind).toBe('document');
  });
});
