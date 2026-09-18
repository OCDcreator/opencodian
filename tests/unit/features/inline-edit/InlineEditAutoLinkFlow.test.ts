/**
 * Controller-level flow tests for batch B
 * (docs/requirements/flowtext-parity.md R-B1 / R-B2):
 *
 * - R-B1: the auto-internal-link host pass runs on the strictly-parsed
 *   result *before* the preview payload is built — the inserted link is
 *   visible in the preview payload (`payload.after`) and lands in the single
 *   accept write; with no host seam the text is byte-identical (off 回归).
 * - R-B2: the context picker renders the persisted groups, one click
 *   attaches the whole group through the chip mechanism, the per-edit cap
 *   reports omitted entries, and missing paths are skipped with a notice.
 *
 * Harness mirrors InlineEditController.test.ts: a real CM6 EditorView in
 * jsdom plus a stubbed service; the vault is a plain map behind the host
 * seam, so existence validation is fully deterministic.
 */

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';

import type { AgentAuxQueryCapability } from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import type { ContextGroup } from '../../../../src/core/types';
import { InlineEditController } from '../../../../src/features/inline-edit/InlineEditController';
import type { InlineEditHost } from '../../../../src/features/inline-edit/InlineEditHost';
import type { InlineEditRequest } from '../../../../src/features/inline-edit/InlineEditPrompt';
import {
  INLINE_EDIT_MAX_ATTACHED_NOTES,
  type InlineEditRequest,
} from '../../../../src/features/inline-edit/InlineEditPrompt';
import type { InlineEditHostAdapter } from '../../../../src/features/inline-edit/InlineEditTypes';
import {
  inlineEditPreviewField,
  readInlineEditPreviewIds,
} from '../../../../src/features/inline-edit/InlineEditWidgets';
import { t } from '../../../../src/i18n';

const DOC = 'alpha 注意力机制 gamma';

interface HarnessOptions {
  readonly groups?: readonly ContextGroup[];
  /** Paths the vault "contains"; anything else fails existence validation. */
  readonly vaultPaths?: readonly string[];
  /** R-B1 host pass; absent disables the feature (byte-identical path). */
  readonly autoLink?: (text: string, notes: readonly { path: string; kind?: 'file' | 'folder' }[]) => string;
  readonly resultText?: string;
}

interface Harness {
  controller: InlineEditController;
  view: EditorView;
  editor: Editor;
  writes: { text: string; from: number; to: number }[];
  notices: string[];
  requests: InlineEditRequest[];
  linkCalls: { text: string; notes: readonly { path: string; kind?: 'file' | 'folder' }[] }[];
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
  const writes: Harness['writes'] = [];
  const notices: string[] = [];
  const requests: InlineEditRequest[] = [];
  const linkCalls: Harness['linkCalls'] = [];
  const vaultPaths = new Set(options.vaultPaths ?? []);

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
    getLocale: () => 'zh',
    resolveAdapter: () => adapter,
    listContextFiles: () => [...vaultPaths].map((path) => ({
      path,
      name: path.split('/').pop() ?? path,
      kind: 'file' as const,
    })),
    resolveContextFile: (path) => (vaultPaths.has(path)
      ? { path, name: path.split('/').pop() ?? path, kind: 'file' }
      : null),
    listContextGroups: () => options.groups ?? [],
    ...(options.autoLink
      ? {
        applyAutoInternalLinks: (text: string, notes: readonly { path: string; kind?: 'file' | 'folder' }[]) => {
          linkCalls.push({ text, notes });
          return options.autoLink?.(text, notes) ?? text;
        },
      }
      : {}),
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
    createService: () => ({
      get hasSession() { return false; },
      submit(request: InlineEditRequest) {
        requests.push(request);
        return request.kind === 'cursor-inline' || request.kind === 'cursor-inbetween'
          ? Promise.resolve({ status: 'preview', mode: 'insertion', text: options.resultText ?? 'INSERTED' })
          : Promise.resolve({ status: 'preview', mode: 'replacement', text: options.resultText ?? 'RESULT' });
      },
      clarify: () => Promise.resolve({ status: 'error', reason: 'turn-failed' }),
      cancel() { /* no-op */ },
      dispose() { return Promise.resolve(); },
    }) as never,
  });

  return { controller, view, editor, writes, notices, requests, linkCalls };
}

function bars(view: EditorView): HTMLElement[] {
  return [...view.dom.querySelectorAll<HTMLElement>(':scope > .opencodian-inline-edit-overlay')];
}

async function openCursorEdit(h: Harness, at: number): Promise<HTMLElement> {
  h.view.dispatch({ selection: { anchor: at, head: at } });
  expect(h.controller.open(h.editor, { file: { path: 'note.md' } })).toBe(true);
  await flush(2);
  return bars(h.view)[0]!;
}

/** Open (or reuse) the context picker through the attach chip. */
function openPicker(bar: HTMLElement): HTMLElement {
  const existing = bar.querySelector<HTMLElement>(':scope .opencodian-inline-edit-menu.opencodian-inline-edit-picker');
  if (existing) return existing;
  const attach = bar.querySelector<HTMLButtonElement>('.opencodian-inline-edit-chip-attach');
  expect(attach).not.toBeNull();
  attach!.click();
  const menu = bar.querySelector<HTMLElement>(':scope .opencodian-inline-edit-menu.opencodian-inline-edit-picker');
  expect(menu).not.toBeNull();
  return menu!;
}

function groupRows(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>('.opencodian-inline-edit-picker-group')];
}

function fileRows(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>('.opencodian-inline-edit-menu-item')]
    .filter((row) => !row.classList.contains('opencodian-inline-edit-picker-group'));
}

function contextChips(bar: HTMLElement): HTMLElement[] {
  const row = bar.querySelector<HTMLElement>('.opencodian-inline-edit-context-row');
  if (!row) return [];
  return [...row.querySelectorAll<HTMLElement>('.opencodian-inline-edit-context-chip')];
}

function previewPayload(h: Harness): { after: string; insertion: boolean } {
  const ids = readInlineEditPreviewIds(h.view.state);
  expect(ids).toHaveLength(1);
  const entry = h.view.state.field(inlineEditPreviewField).entries.get(ids[0]!);
  expect(entry).toBeDefined();
  return { after: entry!.payload.after, insertion: entry!.payload.insertion };
}

async function submitBar(bar: HTMLElement): Promise<void> {
  const field = bar.querySelector<HTMLTextAreaElement>('.opencodian-inline-edit-field');
  expect(field).not.toBeNull();
  field!.value = 'go';
  field!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await flush();
}

function clickAcceptPreview(view: EditorView): void {
  const button = view.dom.querySelector<HTMLButtonElement>('.opencodian-inline-edit-action.is-accept');
  expect(button).not.toBeNull();
  button!.click();
}

describe('InlineEditController R-B1 auto internal links', () => {
  it('inserts links into the preview payload before the diff (验收 1/5)', async () => {
    const h = makeHarness({
      vaultPaths: ['notes/参考.md'],
      resultText: '关于注意力机制的讨论',
      autoLink: (text, notes) => (notes.length > 0
        ? text.replace('注意力机制', '[[notes/参考.md#注意力机制]]')
        : text),
    });
    const bar = await openCursorEdit(h, DOC.length);

    // Attach the reference note through the picker (same chips as R-A7).
    const menu = openPicker(bar);
    expect(fileRows(menu)).toHaveLength(1);
    fileRows(menu)[0]!.click();
    await flush(2);
    expect(contextChips(bar)).toHaveLength(1);

    await submitBar(bar);
    const payload = previewPayload(h);
    expect(payload.after).toBe('关于[[notes/参考.md#注意力机制]]的讨论');
    expect(h.linkCalls).toHaveLength(1);
    expect(h.linkCalls[0]!.notes).toEqual([{ path: 'notes/参考.md', kind: 'file' }]);

    // Accepting writes exactly the payload — the link is applied through the
    // single replaceRange write, so it was visible and rejectable in the diff.
    clickAcceptPreview(h.view);
    await flush(12);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]!.text).toBe('关于[[notes/参考.md#注意力机制]]的讨论');
    expect(h.controller.hasActiveEdits()).toBe(false);
  });

  it('leaves the preview byte-identical when the host has no auto-link seam (关闭回归)', async () => {
    const h = makeHarness({ vaultPaths: ['notes/参考.md'], resultText: '关于注意力机制的讨论' });
    const bar = await openCursorEdit(h, DOC.length);
    const menu = openPicker(bar);
    fileRows(menu)[0]!.click();
    await flush(2);

    await submitBar(bar);
    expect(previewPayload(h).after).toBe('关于注意力机制的讨论');
    expect(h.linkCalls).toHaveLength(0);

    clickAcceptPreview(h.view);
    await flush(12);
    expect(h.writes[0]!.text).toBe('关于注意力机制的讨论');
  });

  it('leaves the preview byte-identical when nothing is attached', async () => {
    const linkSpy = jest.fn((text: string) => text);
    const h = makeHarness({ resultText: '关于注意力机制的讨论', autoLink: linkSpy });
    const bar = await openCursorEdit(h, DOC.length);
    await submitBar(bar);
    expect(previewPayload(h).after).toBe('关于注意力机制的讨论');
    // The host pass still ran (setting on) but received no reference notes.
    expect(linkSpy).toHaveBeenCalledWith('关于注意力机制的讨论', []);
  });
});

describe('InlineEditController R-B2 context groups', () => {
  const GROUP_OF_EIGHT: ContextGroup = {
    id: 'g8',
    name: '注意力主题',
    entries: Array.from({ length: 8 }, (_v, i) => ({ path: `notes/n${i + 1}.md`, kind: 'file' as const })),
  };

  it('renders groups in the picker and attaches the whole group as chips (验收 1)', async () => {
    const paths = GROUP_OF_EIGHT.entries.map((entry) => entry.path);
    const h = makeHarness({ groups: [GROUP_OF_EIGHT], vaultPaths: paths });
    const bar = await openCursorEdit(h, DOC.length);

    const menu = openPicker(bar);
    const rows = groupRows(menu);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('注意力主题');
    rows[0]!.click();
    await flush(2);

    // Cap 5: five chips, and the notice names the omitted count (验收 3).
    expect(contextChips(bar)).toHaveLength(INLINE_EDIT_MAX_ATTACHED_NOTES);
    expect(h.notices.some((m) => m.includes(t('inlineEdit.context.groupAttached', { name: '注意力主题', count: 5 })))).toBe(true);
    expect(h.notices.some((m) => m.includes(t('inlineEdit.context.groupOmitted', { count: 3, max: 5 })))).toBe(true);

    // The request carries exactly the attached paths (chip mechanism, R-A7).
    await submitBar(bar);
    const attached = h.requests[0]!.attachedNotes ?? [];
    expect(attached).toHaveLength(5);
    expect(attached.map((note) => note.path)).toEqual(paths.slice(0, 5));
  });

  it('skips missing entries with a notice instead of failing (验收 2)', async () => {
    const h = makeHarness({
      groups: [{
        id: 'gm',
        name: '混合主题',
        entries: [
          { path: 'notes/a.md', kind: 'file' },
          { path: 'notes/deleted.md', kind: 'file' },
          { path: 'notes/b.md', kind: 'file' },
        ],
      }],
      vaultPaths: ['notes/a.md', 'notes/b.md'],
    });
    const bar = await openCursorEdit(h, DOC.length);

    const menu = openPicker(bar);
    groupRows(menu)[0]!.click();
    await flush(2);

    expect(contextChips(bar)).toHaveLength(2);
    expect(h.notices.some((m) => m.includes('notes/deleted.md'))).toBe(true);

    await submitBar(bar);
    const attached = h.requests[0]!.attachedNotes ?? [];
    expect(attached.map((note) => note.path)).toEqual(['notes/a.md', 'notes/b.md']);
  });

  it('counts entries past a full attach list as omitted without attaching', async () => {
    const paths = ['notes/a.md', 'notes/b.md', 'notes/c.md', 'notes/d.md', 'notes/e.md'];
    const h = makeHarness({
      groups: [
        { id: 'full', name: '满员主题', entries: paths.map((path) => ({ path, kind: 'file' as const })) },
        { id: 'extra', name: '第二主题', entries: [{ path: 'notes/x.md', kind: 'file' }] },
      ],
      vaultPaths: [...paths, 'notes/x.md'],
    });
    const bar = await openCursorEdit(h, DOC.length);

    const menu = openPicker(bar);
    const rows = groupRows(menu);
    expect(rows).toHaveLength(2);
    rows[0]!.click();
    await flush(2);
    expect(contextChips(bar)).toHaveLength(5);

    // Second group with no room left: nothing attaches, the entry is omitted.
    const noticesBefore = h.notices.length;
    groupRows(openPicker(bar))[1]!.click();
    await flush(2);
    expect(contextChips(bar)).toHaveLength(5);
    const newNotices = h.notices.slice(noticesBefore);
    expect(newNotices.some((m) => m.includes(t('inlineEdit.context.groupOmitted', { count: 1, max: 5 })))).toBe(true);
  });

  it('dedupes group entries against paths already attached by hand', async () => {
    const paths = ['notes/a.md', 'notes/b.md'];
    const h = makeHarness({
      groups: [{ id: 'g', name: '主题', entries: paths.map((path) => ({ path, kind: 'file' as const })) }],
      vaultPaths: paths,
    });
    const bar = await openCursorEdit(h, DOC.length);

    // Attach a.md manually first.
    const menu = openPicker(bar);
    fileRows(menu).find((row) => row.textContent?.includes('a.md'))!.click();
    await flush(2);
    expect(contextChips(bar)).toHaveLength(1);

    // The group now contributes only b.md; attached notice says 1, and
    // neither an omitted nor a missing notice appears.
    groupRows(openPicker(bar))[0]!.click();
    await flush(2);
    expect(contextChips(bar)).toHaveLength(2);
    expect(h.notices.some((m) => m.includes(t('inlineEdit.context.groupAttached', { name: '主题', count: 1 })))).toBe(true);
    expect(h.notices.some((m) => m.includes(t('inlineEdit.context.groupMissing', { count: 1, paths: 'notes/a.md' })))).toBe(false);

    await submitBar(bar);
    const attached = h.requests[0]!.attachedNotes ?? [];
    expect(attached.map((note) => note.path)).toEqual(paths);
  });
});
