import { TextDecoder, TextEncoder } from 'node:util';

import type { PromptReference, PromptReferenceCandidate } from '../../../../src/core/types';
import {
  AgentMentionComposerController,
  type AgentMentionComposerControllerHost,
} from '../../../../src/features/chat/services/composer/AgentMentionComposerController';
import { encodePromptReference, parsePromptReferences } from '../../../../src/features/chat/services/context/PromptReferenceService';
import { t } from '../../../../src/i18n';

Object.assign(globalThis, { TextEncoder, TextDecoder });

function fileReference(label = '设计 文档.md'): PromptReference {
  return { version: 1, id: 'file:design.md', kind: 'file', path: 'notes/design.md', label, vaultPath: '/vault' };
}

function candidate(reference: PromptReference): PromptReferenceCandidate {
  return { id: reference.id, label: reference.label, kind: reference.kind, reference, description: reference.id };
}

function fixture() {
  const textarea = document.body.appendChild(document.createElement('textarea'));
  const menu = document.body.appendChild(document.createElement('div'));
  let context = 'codex:/vault:conversation-1';
  const host: jest.Mocked<AgentMentionComposerControllerHost> = {
    getComposerInputMode: jest.fn(() => 'prompt'),
    getTextarea: jest.fn(() => textarea),
    getPromptReferenceContextKey: jest.fn(() => context),
    loadAgentMentionCandidates: jest.fn().mockResolvedValue([]),
    loadPromptReferenceCandidates: jest.fn().mockResolvedValue([candidate(fileReference())]),
    scheduleLayoutSync: jest.fn(),
    onMentionInserted: jest.fn(),
    onLoadFailed: jest.fn(),
  };
  const controller = new AgentMentionComposerController(host);
  const query = (text: string) => {
    textarea.value = text;
    textarea.setSelectionRange(text.length, text.length);
    return controller.getQuery(textarea);
  };
  return { textarea, menu, host, controller, query, setContext: (value: string) => { context = value; } };
}

describe('unified @ reference composer', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it.each(['@设计', '请参考@设计', '请参考：@设计', 'see @"设计 文档'])('opens a query in %s', (text) => {
    const view = fixture();
    expect(view.query(text)).toEqual(expect.objectContaining({ query: text.includes('"') ? '设计 文档' : '设计' }));
  });

  it('does not trigger in an email, shell input, selection or completed reference', () => {
    const view = fixture();
    expect(view.query('team@example')).toBeNull();
    view.host.getComposerInputMode.mockReturnValue('shell');
    expect(view.query('@')).toBeNull();
    view.host.getComposerInputMode.mockReturnValue('prompt');
    view.query('@file');
    view.textarea.setSelectionRange(0, 2);
    expect(view.controller.getQuery(view.textarea)).toBeNull();
    expect(view.query(encodePromptReference(fileReference()))).toBeNull();
  });

  it('groups files, sessions, plugins and native agents with truthful names and dates', async () => {
    const view = fixture();
    const session: PromptReference = { version: 1, id: 'session:pi:one', kind: 'session', label: 'Review notes',
      vaultPath: '/vault', backend: 'pi', conversationId: 'one', sessionId: 'native-pi-session' };
    const plugin: PromptReference = { version: 1, id: 'plugin:design', kind: 'plugin', label: 'Design plugin',
      vaultPath: '/vault', backend: 'codex', nativePath: 'plugin://design' };
    view.host.loadPromptReferenceCandidates.mockResolvedValue([
      { ...candidate(session), updatedAt: Date.UTC(2026, 9, 28) }, candidate(plugin), candidate(fileReference()),
    ]);
    view.host.loadAgentMentionCandidates.mockResolvedValue([
      { id: 'reviewer', mode: 'subagent' }, { id: 'hidden', mode: 'subagent', hidden: true },
    ]);
    await view.controller.refresh(view.query('@')!, view.menu);
    const headings = Array.from(view.menu.querySelectorAll('.opencodian-reference-menu-group-label'), (el) => el.textContent);
    expect(headings).toEqual([
      t('referenceMention.group.files'), t('referenceMention.group.sessions'),
      t('referenceMention.group.plugins'), t('referenceMention.group.agents'),
    ]);
    expect(view.menu.textContent).toContain('Review notes');
    expect(view.menu.querySelector('.opencodian-reference-menu-date')?.getAttribute('title')).toBeTruthy();
    expect(view.menu.textContent).not.toContain('@hidden');
    expect(view.menu.querySelectorAll('[role="option"]')).toHaveLength(4);
  });

  it('collapses a category and selects the next visible group without changing the query', async () => {
    const view = fixture();
    const session: PromptReference = { version: 1, id: 'session:pi:one', kind: 'session', label: 'Review notes',
      vaultPath: '/vault', backend: 'pi', conversationId: 'one', sessionId: 'native-pi-session' };
    view.host.loadPromptReferenceCandidates.mockResolvedValue([candidate(fileReference()), candidate(session)]);
    await view.controller.refresh(view.query('@')!, view.menu);
    const toggle = view.menu.querySelector<HTMLButtonElement>('button[data-group="files"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.querySelector('.opencodian-reference-menu-count')?.textContent).toBe('1');
    toggle.click();
    const collapsed = view.menu.querySelector<HTMLButtonElement>('button[data-group="files"]')!;
    expect(collapsed.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(collapsed.getAttribute('aria-controls')!)?.hidden).toBe(true);
    expect(view.menu.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(view.menu.querySelector('[role="option"].is-selected')?.textContent).toContain('Review notes');
    expect(view.textarea.value).toBe('@');
    view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }), view.textarea, view.menu);
    expect(parsePromptReferences(view.textarea.value)[0].reference).toEqual(session);
    await view.controller.refresh(view.query('@')!, view.menu);
    expect(view.menu.querySelector('button[data-group="files"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('skips collapsed categories while navigating options with arrow keys', async () => {
    const view = fixture();
    const plugin: PromptReference = { version: 1, id: 'plugin:test', kind: 'plugin', label: 'Test plugin',
      vaultPath: '/vault', backend: 'codex', nativePath: 'plugin://test' };
    view.host.loadPromptReferenceCandidates.mockResolvedValue([candidate(fileReference()), candidate(plugin)]);
    view.host.loadAgentMentionCandidates.mockResolvedValue([{ id: 'reviewer', mode: 'subagent' }]);
    await view.controller.refresh(view.query('@')!, view.menu);
    view.menu.querySelector<HTMLButtonElement>('button[data-group="plugins"]')!.click();
    view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }), view.textarea, view.menu);
    expect(view.menu.querySelector('[role="option"].is-selected')?.textContent).toContain('@reviewer');
    view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }), view.textarea, view.menu);
    expect(view.menu.querySelector('[role="option"].is-selected')?.textContent).toContain('设计 文档.md');
    view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }), view.textarea, view.menu);
    expect(view.menu.querySelector('[role="option"].is-selected')?.textContent).toContain('@reviewer');
  });

  it('keeps fully collapsed groups available for reopening and never inserts a hidden option', async () => {
    const view = fixture();
    await view.controller.refresh(view.query('@')!, view.menu);
    view.menu.querySelector<HTMLButtonElement>('button[data-group="files"]')!.click();
    expect(view.menu.classList.contains('is-hidden')).toBe(false);
    expect(view.menu.querySelector('[role="option"]')).toBeNull();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    expect(view.controller.tryHandleKeydown(enter, view.textarea, view.menu)).toBe(true);
    expect(view.textarea.value).toBe('@');
    expect(view.host.onMentionInserted).not.toHaveBeenCalled();
    expect(view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }), view.textarea, view.menu)).toBe(true);
    const button = view.menu.querySelector<HTMLButtonElement>('button[data-group="files"]')!;
    expect(document.activeElement).toBe(button);
    button.click();
    const reopened = view.menu.querySelector<HTMLButtonElement>('button[data-group="files"]')!;
    expect(document.activeElement).toBe(reopened);
    expect(reopened.getAttribute('aria-expanded')).toBe('true');
    expect(view.menu.querySelectorAll('[role="option"]')).toHaveLength(1);
  });

  it('inserts a stable identity by pointer while CodeMirror owns focus and restores its visible label', async () => {
    const view = fixture();
    await view.controller.refresh(view.query('请参考@设计')!, view.menu);
    const focusOwner = document.body.appendChild(document.createElement('div'));
    focusOwner.tabIndex = 0;
    focusOwner.focus();
    view.menu.querySelector<HTMLElement>('[role="option"]')!.click();
    const token = encodePromptReference(fileReference());
    expect(view.textarea.value).toBe(`请参考${token} `);
    expect(view.host.onMentionInserted).toHaveBeenCalledTimes(1);
    expect(view.controller.resolveMentionIntents(view.textarea.value)).toEqual([]);
    expect(view.controller.resolveReferencePillSpans(view.textarea.value)).toEqual([
      expect.objectContaining({ start: 3, end: 3 + token.length, kind: 'file', label: '设计 文档.md' }),
    ]);
    const restored = fixture();
    expect(restored.controller.resolveReferencePillSpans(view.textarea.value)).toHaveLength(1);
  });

  it('protects a reference as one editable token and keeps native intent separate', async () => {
    const view = fixture();
    await view.controller.refresh(view.query('@')!, view.menu);
    view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }), view.textarea, view.menu);
    const token = parsePromptReferences(view.textarea.value)[0];
    view.textarea.setSelectionRange(token.end, token.end);
    const event = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
    expect(view.controller.tryHandleKeydown(event, view.textarea, view.menu)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect([view.textarea.selectionStart, view.textarea.selectionEnd]).toEqual([token.start, token.end]);
    expect(view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }), view.textarea, view.menu)).toBe(false);
  });

  it('ignores stale asynchronous candidates after a backend or conversation switch', async () => {
    const view = fixture();
    let resolve!: (items: PromptReferenceCandidate[]) => void;
    view.host.loadPromptReferenceCandidates.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = view.controller.refresh(view.query('@')!, view.menu);
    view.setContext('pi:/vault:conversation-2');
    view.controller.clear(view.menu);
    resolve([candidate(fileReference())]);
    await pending;
    expect(view.menu.querySelector('[role="option"]')).toBeNull();
    expect(view.textarea.value).toBe('@');
  });

  it('discards native agent tracking after a backend switch while retaining stable references', async () => {
    const view = fixture();
    view.host.loadPromptReferenceCandidates.mockResolvedValue([]);
    view.host.loadAgentMentionCandidates.mockResolvedValue([{ id: 'reviewer', mode: 'subagent' }]);
    await view.controller.refresh(view.query('@reviewer')!, view.menu);
    view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }), view.textarea, view.menu);
    expect(view.controller.resolveMentionIntents(view.textarea.value)).toHaveLength(1);
    view.setContext('pi:/vault:conversation-2');
    view.controller.syncContent(view.textarea.value);
    expect(view.controller.resolveMentionIntents(view.textarea.value)).toEqual([]);
    expect(view.controller.resolveReferencePillSpans(encodePromptReference(fileReference()))).toHaveLength(1);
  });

  it('retains native dispatch identity when a selected agent follows Chinese text', async () => {
    const view = fixture();
    view.host.loadPromptReferenceCandidates.mockResolvedValue([]);
    view.host.loadAgentMentionCandidates.mockResolvedValue([{ id: 'reviewer', mode: 'subagent' }]);
    await view.controller.refresh(view.query('请@review')!, view.menu);
    view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }), view.textarea, view.menu);
    expect(view.textarea.value).toBe('请@reviewer ');
    expect(view.controller.resolveMentionIntents(view.textarea.value)).toEqual([
      { agentId: 'reviewer', source: { value: '@reviewer', start: 1, end: 10 } },
    ]);
  });

  it('retains available references when the native agent catalog fails', async () => {
    const view = fixture();
    view.host.loadAgentMentionCandidates.mockRejectedValue(new Error('Agent capability unavailable'));
    await view.controller.refresh(view.query('@')!, view.menu);
    expect(view.menu.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(view.host.onLoadFailed).toHaveBeenCalledTimes(1);
  });

  it('uses reference loading, empty, no-match and failure copy', async () => {
    const view = fixture();
    view.host.loadPromptReferenceCandidates.mockResolvedValue([]);
    const pending = view.controller.refresh(view.query('@')!, view.menu);
    expect(view.menu.textContent).toBe(t('referenceMention.menu.loading'));
    await pending;
    expect(view.menu.textContent).toBe(t('referenceMention.menu.empty'));
    view.host.loadPromptReferenceCandidates.mockResolvedValue([candidate(fileReference())]);
    await view.controller.refresh(view.query('@absent')!, view.menu);
    expect(view.menu.textContent).toBe(t('referenceMention.menu.noMatches'));
    view.host.loadPromptReferenceCandidates.mockRejectedValue(new Error('Cannot load'));
    await view.controller.refresh(view.query('@')!, view.menu);
    expect(view.menu.textContent).toBe(t('referenceMention.menu.loadFailed'));
  });
});

describe('unified @ search expansion', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it.each([
    ['files', '@设计', '设计 文档.md'],
    ['sessions', '@Review', 'Review notes'],
    ['plugins', '@Blueprint', 'Blueprint plugin'],
    ['agents', '@reviewer', '@reviewer'],
  ])('expands the matching folded %s category when a search arrives', async (group, text, label) => {
    const view = fixture();
    const session: PromptReference = { version: 1, id: 'session:pi:one', kind: 'session', label: 'Review notes',
      vaultPath: '/vault', backend: 'pi', conversationId: 'one', sessionId: 'native-pi-session' };
    const plugin: PromptReference = { version: 1, id: 'plugin:blueprint', kind: 'plugin', label: 'Blueprint plugin',
      vaultPath: '/vault', backend: 'codex', nativePath: 'plugin://blueprint' };
    view.host.loadPromptReferenceCandidates.mockResolvedValue([candidate(fileReference()), candidate(session), candidate(plugin)]);
    view.host.loadAgentMentionCandidates.mockResolvedValue([{ id: 'reviewer', mode: 'subagent' }]);
    await view.controller.refresh(view.query('@')!, view.menu);
    for (const button of view.menu.querySelectorAll<HTMLButtonElement>('button[data-group]')) button.click();
    expect(view.menu.querySelector('[role="option"]')).toBeNull();
    await view.controller.refresh(view.query(text)!, view.menu);
    expect(view.menu.querySelector(`button[data-group="${group}"]`)?.getAttribute('aria-expanded')).toBe('true');
    expect(view.menu.querySelector('[role="option"].is-selected')?.textContent).toContain(label);
    view.controller.tryHandleKeydown(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }), view.textarea, view.menu);
    expect(view.host.onMentionInserted).toHaveBeenCalledTimes(1);
    await view.controller.refresh(view.query('@')!, view.menu);
    const unrelatedGroup = group === 'files' ? 'plugins' : 'files';
    expect(view.menu.querySelector(`button[data-group="${unrelatedGroup}"]`)?.getAttribute('aria-expanded')).toBe('false');
  });

});
