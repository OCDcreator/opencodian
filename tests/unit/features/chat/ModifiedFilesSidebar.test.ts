import { type App, Component } from 'obsidian';

import type { ChatMessage, SessionDiffEntry } from '../../../../src/core/types/chat';
import { ModifiedFilesSidebarCoordinator } from '../../../../src/features/chat/services/ModifiedFilesSidebarCoordinator';
import { ModifiedFilesSidebar } from '../../../../src/features/chat/ui/ModifiedFilesSidebar';
import { t } from '../../../../src/i18n';

type ObsidianLikeElement = HTMLElement & {
  createDiv: (options?: { cls?: string; text?: string; attr?: Record<string, string> }) => HTMLDivElement;
  createEl: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: { cls?: string; text?: string; attr?: Record<string, string> }
  ) => HTMLElementTagNameMap[K];
  createSpan: (options?: { cls?: string; text?: string; attr?: Record<string, string> }) => HTMLSpanElement;
};

const originalComponentLoad = Component.prototype.load;

function installObsidianElementHelpers(): void {
  const prototype = HTMLElement.prototype as ObsidianLikeElement;

  Component.prototype.load = function load() {
    (this as Component & { onload?: () => void }).onload?.();
  };

  if (!prototype.createDiv) {
    prototype.createDiv = function createDiv(options = {}) {
      return appendChildElement(this, 'div', options);
    };
  }

  if (!prototype.createEl) {
    prototype.createEl = function createEl(tag, options = {}) {
      return appendChildElement(this, tag, options);
    };
  }

  if (!prototype.createSpan) {
    prototype.createSpan = function createSpan(options = {}) {
      return appendChildElement(this, 'span', options);
    };
  }
}

function appendChildElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  options: { cls?: string; text?: string; attr?: Record<string, string> } = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (options.cls) {
    element.className = options.cls;
  }

  if (options.text) {
    element.textContent = options.text;
  }

  if (options.attr) {
    for (const [key, value] of Object.entries(options.attr)) {
      element.setAttribute(key, value);
    }
  }

  parent.appendChild(element);
  return element;
}

// eslint-disable-next-line max-lines-per-function -- sidebar and fallback scenarios share one realistic Obsidian component lifecycle harness.
describe('ModifiedFilesSidebar', () => {
  beforeAll(() => {
    installObsidianElementHelpers();
  });

  afterAll(() => {
    Component.prototype.load = originalComponentLoad;
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses an accessible hidden tooltip label instead of aria-label on the collapse button', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);

    const sidebar = new ModifiedFilesSidebar({
      workspace: {
        openLinkText: jest.fn(),
      },
    } as unknown as App, parentEl);
    sidebar.onload();

    const buttonEl = document.body.querySelector<HTMLButtonElement>('.opencodian-modified-files-sidebar-collapse');
    const hiddenLabel = buttonEl?.querySelector<HTMLElement>('.opencodian-visually-hidden[data-tooltip-label="true"]');

    expect(buttonEl).not.toBeNull();
    expect(buttonEl?.hasAttribute('aria-label')).toBe(false);
    expect(buttonEl?.getAttribute('data-tooltip')).toBe(t('modifiedFiles.toggleTooltip'));
    expect(hiddenLabel?.textContent).toBe(t('modifiedFiles.toggleTooltip'));
    expect(buttonEl?.getAttribute('aria-labelledby')).toBe(hiddenLabel?.id);
  });

  it('mounts inside the Chat container when the caller provides the wider workspace leaf', () => {
    const workspaceLeafEl = document.createElement('div') as ObsidianLikeElement;
    const chatContainerEl = workspaceLeafEl.createDiv({ cls: 'opencodian-container' });
    document.body.appendChild(workspaceLeafEl);
    const coordinator = new ModifiedFilesSidebarCoordinator();

    coordinator.mountSidebar(workspaceLeafEl, {
      workspace: {
        openLinkText: jest.fn(),
      },
    } as unknown as App);

    expect(chatContainerEl.querySelector('.opencodian-modified-files-sidebar-host')).not.toBeNull();
    expect(Array.from(workspaceLeafEl.children).some((child) => (
      child.classList.contains('opencodian-modified-files-sidebar-host')
    ))).toBe(false);
  });

  it('does not read session diff entries while the sidebar is unavailable', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const coordinator = new ModifiedFilesSidebarCoordinator();
    const getEntries = jest.fn().mockReturnValue([]);

    coordinator.mountSidebar(parentEl, {
      workspace: { openLinkText: jest.fn() },
    } as unknown as App);
    coordinator.refresh('session-1', getEntries, 'unavailable', [{
      id: 'persisted-turn-diff',
      role: 'assistant',
      content: '',
      timestamp: 1,
      displayStyle: 'notice',
      noticeMeta: {
        kind: 'turn-diff',
        sourceMessageId: 'user-1',
        entries: [{ file: 'must-not-leak.md', additions: 1, deletions: 0 }],
      },
    }]);

    expect(getEntries).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLButtonElement>('.opencodian-modified-files-trigger-strip')?.dataset.state)
      .toBe('unavailable');
    expect(document.body.textContent).not.toContain('must-not-leak.md');
  });

  it('does not expose persisted Turn Change Records without an OpenCode session', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const coordinator = new ModifiedFilesSidebarCoordinator();
    const getEntries = jest.fn().mockReturnValue([]);

    coordinator.mountSidebar(parentEl, {
      workspace: { openLinkText: jest.fn() },
    } as unknown as App);
    coordinator.refresh(null, getEntries, 'ready', [{
      id: 'stale-turn-diff',
      role: 'assistant',
      content: '',
      timestamp: 1,
      displayStyle: 'notice',
      noticeMeta: {
        kind: 'turn-diff',
        sourceMessageId: 'user-1',
        entries: [{ file: 'stale.md', additions: 1, deletions: 0 }],
      },
    }]);

    expect(getEntries).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLButtonElement>('.opencodian-modified-files-trigger-strip')?.dataset.state)
      .toBe('ready');
    expect(document.body.textContent).not.toContain('stale.md');
  });

  it('falls back to unique persisted Turn Change Records when the canonical session diff is empty', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const coordinator = new ModifiedFilesSidebarCoordinator();
    const persistedMessages: ChatMessage[] = [
      {
        id: 'turn-diff-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        displayStyle: 'notice',
        noticeMeta: {
          kind: 'turn-diff',
          sourceMessageId: 'user-1',
          entries: [
            { file: 'notes/repeated.md', additions: 1, deletions: 0, status: 'modified' },
            { file: 'notes/unique.md', additions: 2, deletions: 1, status: 'added' },
          ],
        },
      },
      {
        id: 'turn-diff-2',
        role: 'assistant',
        content: '',
        timestamp: 2,
        displayStyle: 'notice',
        noticeMeta: {
          kind: 'turn-diff',
          sourceMessageId: 'user-2',
          entries: [
            { file: 'notes/repeated.md', additions: 7, deletions: 2, status: 'modified' },
          ],
        },
      },
    ];

    coordinator.mountSidebar(parentEl, {
      workspace: { openLinkText: jest.fn() },
    } as unknown as App);
    coordinator.refresh('session-1', () => [], 'ready', persistedMessages);

    const trigger = document.querySelector<HTMLButtonElement>('.opencodian-modified-files-trigger-strip');
    const paths = Array.from(
      document.querySelectorAll<HTMLElement>('.opencodian-modified-files-sidebar-path'),
      (element) => element.textContent,
    );
    expect(trigger?.dataset.state).toBe('changed');
    expect(paths).toEqual(['notes/repeated.md', 'notes/unique.md']);
    expect(paths.filter((path) => path === 'notes/repeated.md')).toHaveLength(1);
    expect(document.querySelector('.opencodian-modified-files-sidebar-summary')?.textContent)
      .toBe('2 · +9 -3');
  });

  it('keeps a non-empty canonical session diff ahead of persisted Turn Change Records', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const coordinator = new ModifiedFilesSidebarCoordinator();
    coordinator.mountSidebar(parentEl, {
      workspace: { openLinkText: jest.fn() },
    } as unknown as App);

    coordinator.refresh(
      'session-1',
      () => [{ file: 'canonical.md', additions: 3, deletions: 1, status: 'modified' }],
      'ready',
      [{
        id: 'persisted-turn-diff',
        role: 'assistant',
        content: '',
        timestamp: 1,
        displayStyle: 'notice',
        noticeMeta: {
          kind: 'turn-diff',
          sourceMessageId: 'user-1',
          entries: [{ file: 'fallback.md', additions: 8, deletions: 2 }],
        },
      }],
    );

    expect(document.querySelector('.opencodian-modified-files-sidebar-path')?.textContent)
      .toBe('canonical.md');
    expect(document.body.textContent).not.toContain('fallback.md');
  });

  it('shows a compact session summary and toggles explicitly from the trigger', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const sidebar = new ModifiedFilesSidebar({ workspace: { openLinkText: jest.fn() } } as unknown as App, parentEl);
    sidebar.onload();

    const entries: SessionDiffEntry[] = [
      { file: 'notes/one.md', additions: 4, deletions: 1, status: 'modified' },
      { file: 'notes/two.md', additions: 2, deletions: 3, status: 'added' },
    ];
    sidebar.updateEntries(entries);

    const trigger = document.querySelector<HTMLButtonElement>('.opencodian-modified-files-trigger-strip');
    const hoverZone = document.querySelector<HTMLElement>('.opencodian-modified-files-hover-zone');
    expect(trigger?.classList.contains('is-empty')).toBe(false);
    expect(document.querySelector('.opencodian-modified-files-strip-badge')?.textContent).toBe('2');
    expect(document.querySelector('.opencodian-modified-files-strip-badge')?.classList.contains('is-hidden')).toBe(false);
    expect(hoverZone?.classList.contains('is-expanded')).toBe(false);

    trigger?.click();
    expect(hoverZone?.classList.contains('is-expanded')).toBe(true);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.opencodian-modified-files-sidebar-summary')?.textContent).toBe('2 · +6 -4');

    trigger?.click();
    expect(hoverZone?.classList.contains('is-expanded')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('.opencodian-modified-files-sidebar-item')).toHaveLength(2);
    expect(Array.from(document.querySelectorAll<HTMLDetailsElement>('.opencodian-modified-files-sidebar-item'))
      .every((item) => item.open)).toBe(true);

    const firstSummary = document.querySelector<HTMLElement>('.opencodian-modified-files-sidebar-item > summary')!;
    firstSummary.click();
    expect((firstSummary.parentElement as HTMLDetailsElement).open).toBe(false);
    firstSummary.click();
    expect((firstSummary.parentElement as HTMLDetailsElement).open).toBe(true);
  });

  it('closes immediately from the header button and keeps new entries collapsed', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const sidebar = new ModifiedFilesSidebar({ workspace: { openLinkText: jest.fn() } } as unknown as App, parentEl);
    sidebar.onload();
    sidebar.updateEntries([{ file: 'note.md', additions: 1, deletions: 0 }]);

    const trigger = document.querySelector<HTMLButtonElement>('.opencodian-modified-files-trigger-strip')!;
    const close = document.querySelector<HTMLButtonElement>('.opencodian-modified-files-sidebar-collapse')!;
    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    close.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);

    sidebar.updateEntries([{ file: 'next.md', additions: 3, deletions: 2 }]);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the selected session file and keeps a discoverable ready-empty trigger', () => {
    const openLinkText = jest.fn();
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const sidebar = new ModifiedFilesSidebar({ workspace: { openLinkText } } as unknown as App, parentEl);
    sidebar.onload();
    sidebar.updateEntries([{ file: 'folder/note.md', additions: 1, deletions: 2 }]);
    document.querySelector<HTMLButtonElement>('.opencodian-modified-files-trigger-strip')?.click();

    document.querySelector<HTMLElement>('.opencodian-modified-files-sidebar-path')?.click();
    expect(openLinkText).toHaveBeenCalledWith('folder/note.md', '', false);

    document.querySelector<HTMLButtonElement>('.opencodian-modified-files-trigger-strip')?.click();
    sidebar.updateEntries([]);
    expect(document.querySelector('.opencodian-modified-files-sidebar-empty')?.textContent).toBe(t('modifiedFiles.empty'));
    expect(document.querySelector('.opencodian-modified-files-trigger-strip')).not.toBeNull();
    expect(document.querySelector('.opencodian-modified-files-trigger-strip')?.classList.contains('is-empty')).toBe(true);
    expect(document.querySelector('.opencodian-modified-files-strip-badge')?.classList.contains('is-hidden')).toBe(true);
    document.querySelector<HTMLButtonElement>('.opencodian-modified-files-trigger-strip')?.click();
    expect(document.querySelector('.opencodian-modified-files-sidebar')?.classList.contains('is-expanded')).toBe(true);
  });

  it('shows an accurate unavailable state and closes only through explicit controls or Escape', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const sidebar = new ModifiedFilesSidebar({ workspace: { openLinkText: jest.fn() } } as unknown as App, parentEl);
    sidebar.onload();

    sidebar.updateEntries([], 'unavailable');
    const trigger = document.querySelector<HTMLButtonElement>('.opencodian-modified-files-trigger-strip')!;
    expect(trigger.dataset.state).toBe('unavailable');
    expect(document.querySelector('.opencodian-modified-files-sidebar-empty')?.textContent)
      .toBe(t('modifiedFiles.unavailable'));
    expect(document.querySelector('.opencodian-modified-files-sidebar-summary')?.textContent)
      .toBe(t('modifiedFiles.unavailableShort'));

    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.click();
    const close = document.querySelector<HTMLButtonElement>('.opencodian-modified-files-sidebar-collapse')!;
    const parentClick = jest.fn();
    document.querySelector('.opencodian-modified-files-sidebar')?.addEventListener('click', parentClick);
    close.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(parentClick).not.toHaveBeenCalled();

    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const removeListenerSpy = jest.spyOn(window, 'removeEventListener');
    sidebar.unload();
    expect(removeListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeListenerSpy.mockRestore();
  });

  it('resolves vault-internal absolute entries through the shared vault-relative path helper', () => {
    const openLinkText = jest.fn();
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const vaultBase = '/Volumes/SDD2T/obsidian-vault-write/testvault';
    const sidebar = new ModifiedFilesSidebar({
      vault: { adapter: { getBasePath: () => vaultBase } },
      workspace: { openLinkText },
    } as unknown as App, parentEl);
    sidebar.onload();
    sidebar.updateEntries([
      { file: `${vaultBase}/notes/today.md`, additions: 1, deletions: 2, status: 'modified' },
      { file: `${vaultBase}/custom/deep/nested/导数模型.md`, additions: 3, deletions: 0, status: 'added' },
    ]);

    const paths = Array.from(
      document.querySelectorAll<HTMLElement>('.opencodian-modified-files-sidebar-path'),
      (element) => element.textContent,
    );
    expect(paths).toEqual(['notes/today.md', 'custom/deep/nested/导数模型.md']);

    document.querySelector<HTMLElement>('.opencodian-modified-files-sidebar-path')?.click();
    expect(openLinkText).toHaveBeenCalledWith('notes/today.md', '', false);
    expect(document.querySelector<HTMLElement>('.opencodian-modified-files-sidebar-path')?.title)
      .toBe('notes/today.md');
  });

  it('fails closed to non-interactive basenames for unprovable absolute paths', () => {
    const openLinkText = jest.fn();
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const sidebar = new ModifiedFilesSidebar({
      vault: { adapter: { getBasePath: () => '/vault' } },
      workspace: { openLinkText },
    } as unknown as App, parentEl);
    sidebar.onload();
    sidebar.updateEntries([
      { file: '/vault-two/notes/today.md', additions: 1, deletions: 0 },
      { file: '/etc/passwd', additions: 0, deletions: 1 },
    ]);

    const paths = Array.from(
      document.querySelectorAll<HTMLElement>('.opencodian-modified-files-sidebar-path'),
      (element) => element.textContent,
    );
    expect(paths).toEqual(['today.md', 'passwd']);
    const pathEls = Array.from(
      document.querySelectorAll<HTMLElement>('.opencodian-modified-files-sidebar-path'),
    );
    expect(pathEls.every((element) => element.classList.contains('is-unresolved'))).toBe(true);
    expect(pathEls.map((element) => element.title)).toEqual(['today.md', 'passwd']);
    pathEls.forEach((element) => element.click());
    expect(openLinkText).not.toHaveBeenCalled();
  });

  it('assigns unique panel ids to separate sidebar instances', () => {
    const firstParent = document.createElement('div') as ObsidianLikeElement;
    const secondParent = document.createElement('div') as ObsidianLikeElement;
    document.body.append(firstParent, secondParent);
    const app = { workspace: { openLinkText: jest.fn() } } as unknown as App;
    const first = new ModifiedFilesSidebar(app, firstParent);
    const second = new ModifiedFilesSidebar(app, secondParent);
    first.onload();
    second.onload();

    const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>('.opencodian-modified-files-trigger-strip'));
    const panels = Array.from(document.querySelectorAll<HTMLElement>('.opencodian-modified-files-sidebar'));
    expect(triggers).toHaveLength(2);
    expect(panels).toHaveLength(2);
    expect(triggers[0].getAttribute('aria-controls')).not.toBe(triggers[1].getAttribute('aria-controls'));
    expect(triggers.map((trigger) => trigger.getAttribute('aria-controls'))).toEqual(
      panels.map((panel) => panel.id),
    );
  });
});
