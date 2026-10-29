import { TextDecoder, TextEncoder } from 'node:util';

import { redo, undo, undoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

import { AgentMentionComposerController } from '../../../../src/features/chat/services/composer/AgentMentionComposerController';
import { ComposerInvocationEditor } from '../../../../src/features/chat/services/composer/ComposerInvocationEditor';
import { encodePromptReference, parsePromptReferences } from '../../../../src/features/chat/services/context/PromptReferenceService';

Object.assign(globalThis, { TextEncoder, TextDecoder });

describe('composer inline invocation editor', () => {
  const rangeRects = Range.prototype.getClientRects;
  let editor: ComposerInvocationEditor;
  let input: HTMLTextAreaElement;

  beforeEach(() => {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const parent = document.body.appendChild(document.createElement('div'));
    input = parent.appendChild(document.createElement('textarea'));
    editor = new ComposerInvocationEditor(input);
  });
  afterEach(() => {
    editor.destroy();
    document.body.replaceChildren();
    Range.prototype.getClientRects = rangeRects;
    jest.restoreAllMocks();
  });

  it.each([
    ['$design', 'skill', 'design'],
    ['/skill:design', 'skill', 'design'],
    ['/skills design', 'skill', 'design'],
    ['/review', 'command', 'review'],
  ] as const)('shows an icon/name token while retaining %s for transport and copy', (value, kind, label) => {
    input.value = `before ${value} after`;
    editor.setTokens([{ start: 7, end: 7 + value.length, kind }]);
    const token = document.querySelector<HTMLElement>('.opencodian-invocation-token');
    expect(token?.querySelector('.opencodian-invocation-token-label')?.textContent).toBe(label);
    expect(token?.querySelector('.opencodian-invocation-token-icon')).not.toBeNull();
    expect(token?.dataset.value).toBe(value);
    expect(input.value).toBe(`before ${value} after`);
    expect(document.querySelector('.cm-content')?.textContent).toBe(`before ${label} after`);
  });

  it('retains selection and draft updates through the established textarea port', () => {
    input.value = '请处理 /skill:设计 然后继续';
    input.setSelectionRange(4, 13);
    const view = (editor as unknown as { view: EditorView }).view;
    expect(view.state.doc.toString()).toBe(input.value);
    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(13);
    input.disabled = true;
    editor.sync();
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false');
    expect(view.state.readOnly).toBe(true);
  });

  it.each(['file', 'folder', 'session', 'plugin', 'app', 'mcp-resource'] as const)(
    'renders a %s reference label while preserving its stable draft identity', (kind) => {
      const value = '[@Design notes](opencodian-ref:encoded_identity)';
      input.value = value;
      editor.setTokens([{ start: 0, end: value.length, kind, label: '设计笔记' }]);
      const token = document.querySelector<HTMLElement>('.opencodian-invocation-token');
      expect(token?.dataset.type).toBe(kind);
      expect(token?.dataset.value).toBe(value);
      expect(token?.textContent).toBe('设计笔记');
      expect(token?.title).toBe('设计笔记');
      expect(input.value).toBe(value);
      editor.setTokens([{ start: 0, end: value.length, kind, label: 'Renamed notes' }]);
      expect(document.querySelector('.opencodian-invocation-token')?.textContent).toBe('Renamed notes');
    },
  );

  it('preserves editor undo and redo without replacing editable DOM on each input', async () => {
    input.value = '$design ';
    input.setSelectionRange(8, 8);
    editor.setTokens([{ start: 0, end: 7, kind: 'skill' }]);
    const view = (editor as unknown as { view: EditorView }).view;
    const changed = jest.fn();
    input.addEventListener('input', changed);
    expect(undoDepth(view.state)).toBeGreaterThan(0);
    view.dispatch({ changes: { from: 8, insert: '正文' }, selection: { anchor: 10 } });
    await Promise.resolve();
    expect(input.value).toBe('$design 正文');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(undoDepth(view.state)).toBeGreaterThan(0);
    expect(undo(view)).toBe(true);
    expect(input.value).toBe('$design ');
    expect(redo(view)).toBe(true);
    expect(input.value).toBe('$design 正文');
  });

  it('removes a selected reference with whole-token protection after a rejected submission', async () => {
    const token = encodePromptReference({ version: 1, id: 'session:pi:one', kind: 'session', label: '设计会话',
      vaultPath: '/vault', backend: 'pi', conversationId: 'one', sessionId: 'native-session' });
    const controller = new AgentMentionComposerController({
      getComposerInputMode: () => 'prompt', scheduleLayoutSync: jest.fn(),
      onMentionInserted: jest.fn(), onLoadFailed: jest.fn(),
    });
    const syncTokens = () => editor.setTokens(controller.resolveReferencePillSpans(input.value));
    input.addEventListener('input', syncTokens);
    const submitted = jest.fn();
    input.addEventListener('keydown', (event) => {
      if (controller.tryHandleKeydown(event, input, null)) return;
      if (event.key === 'Enter') { event.preventDefault(); submitted(input.value); }
    });
    input.value = `${token} `;
    input.setSelectionRange(input.value.length, input.value.length);
    syncTokens();
    const view = (editor as unknown as { view: EditorView }).view;
    const press = async (key: string) => {
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
      await Promise.resolve();
    };
    await press('Enter');
    expect(submitted).toHaveBeenCalledWith(`${token} `);
    expect(input.value).toBe(`${token} `);
    await press('Backspace');
    expect(input.value).toBe(token);
    expect(parsePromptReferences(input.value)).toHaveLength(1);
    await press('Backspace');
    expect(input.value).toBe(token);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, token.length]);
    await press('Backspace');
    expect(input.value).toBe('');
    expect(document.querySelector('.opencodian-invocation-token')).toBeNull();
  });

  it('releases the editor when the composer is detached and restores its native textarea port', async () => {
    input.parentElement!.remove();
    await Promise.resolve();
    expect(editor.owns(input)).toBe(false);
    expect(Object.getOwnPropertyDescriptor(input, 'value')).toBeUndefined();
  });
});
