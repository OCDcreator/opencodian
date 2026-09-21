/* eslint-disable max-lines -- The sidebar suite keeps the diff list, revert round, linked-note binding and preview-modal contracts on one shared DOM harness. */
import { type App, Component } from 'obsidian';
import { Modal } from 'obsidian';

import type { ChatMessage, SessionDiffEntry } from '../../../../src/core/types/chat';
import { ModifiedFilesSidebarCoordinator } from '../../../../src/features/chat/services/ModifiedFilesSidebarCoordinator';
import { ModifiedFilesSidebar } from '../../../../src/features/chat/ui/ModifiedFilesSidebar';
import { t } from '../../../../src/i18n';
import type { EditRevertPreview } from '../../../../src/shared';

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

  it('shows an existing linked draft without inventing a diff entry or statistics', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const coordinator = new ModifiedFilesSidebarCoordinator();
    coordinator.mountSidebar(parentEl, { workspace: { openLinkText: jest.fn() } } as unknown as App);

    coordinator.refresh(null, jest.fn(), 'ready', [], { path: 'drafts/plan.md', exists: true });

    expect(document.body.textContent).toContain('drafts/plan.md');
    expect(document.body.textContent).toContain(t('modifiedFiles.linkedNoteDraft'));
    expect(document.querySelector('.opencodian-modified-files-sidebar-summary')?.textContent)
      .toBe(t('modifiedFiles.readyShort'));
  });

  it('keeps an unchanged linked draft visible beside other-file revert entries', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const sidebar = new ModifiedFilesSidebar(
      { workspace: { openLinkText: jest.fn() } } as unknown as App,
      parentEl,
    );
    sidebar.onload();
    sidebar.updateEntries([], 'ready', { path: 'drafts/plan.md', exists: true });
    sidebar.updateRevertState({
      enabled: true,
      roundId: 'round-1',
      roundOpen: false,
      degraded: false,
      entries: [{
        path: 'notes/other.md',
        status: 'modified',
        movedTo: null,
        state: 'active',
        revertible: true,
        restorable: false,
        excludedReason: null,
      }],
      revertibleCount: 1,
    }, {
      getRevertPreview: jest.fn().mockResolvedValue({ roundId: 'round-1', roundOpen: false, rows: [] } as EditRevertPreview),
      revertFile: jest.fn().mockResolvedValue(undefined),
      revertAll: jest.fn().mockResolvedValue(undefined),
      restoreFile: jest.fn().mockResolvedValue(undefined),
    });

    expect(document.querySelector('.opencodian-edit-revert-section')?.textContent)
      .not.toContain('drafts/plan.md');
    expect(document.querySelector('.opencodian-modified-files-linked-note-section')?.textContent)
      .toContain('drafts/plan.md');
    expect(document.querySelector('.opencodian-modified-files-linked-note-section')?.textContent)
      .toContain(t('modifiedFiles.linkedNoteExcludedHint'));
    expect(document.querySelectorAll('.opencodian-edit-revert-item')).toHaveLength(1);
  });

  it('requests a preview before one revert, opens one modal on double-click, and cancellation writes nothing', async () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const sidebar = new ModifiedFilesSidebar(
      { workspace: { openLinkText: jest.fn() } } as unknown as App,
      parentEl,
    );
    sidebar.onload();
    const getRevertPreview = jest.fn().mockResolvedValue({
      roundId: 'round-1',
      roundOpen: false,
      rows: [{
        path: 'notes/one.md', status: 'modified', beforeLines: 1, afterLines: 2,
        conflict: false, conflictReason: null,
      }],
    } as EditRevertPreview);
    const revertFile = jest.fn().mockResolvedValue(undefined);
    const opened: Modal[] = [];
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(function open(this: Modal) {
      opened.push(this);
    });
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => undefined);
    sidebar.updateRevertState({
      enabled: true, roundId: 'round-1', roundOpen: false, degraded: false,
      entries: [{
        path: 'notes/one.md', status: 'modified', movedTo: null, state: 'active',
        revertible: true, restorable: false, excludedReason: null,
      }], revertibleCount: 1,
    }, {
      getRevertPreview,
      revertFile,
      revertAll: jest.fn().mockResolvedValue(undefined),
      restoreFile: jest.fn().mockResolvedValue(undefined),
    });

    const button = document.querySelector<HTMLButtonElement>('.opencodian-edit-revert-action')!;
    button.click();
    button.click();
    await Promise.resolve();
    expect(getRevertPreview).toHaveBeenCalledTimes(1);
    expect(opened).toHaveLength(1);
    (opened[0] as unknown as { onClose(): void }).onClose();
    expect(revertFile).not.toHaveBeenCalled();
    openSpy.mockRestore();
    closeSpy.mockRestore();
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

describe('ModifiedFilesSidebar linked-note section placement (R-F2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function mountSidebar(): ModifiedFilesSidebar {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    document.body.appendChild(parentEl);
    const sidebar = new ModifiedFilesSidebar(
      { workspace: { openLinkText: jest.fn() } } as unknown as App,
      parentEl,
    );
    sidebar.onload();
    return sidebar;
  }

  const diffEntry = (file: string, additions = 1, deletions = 0): SessionDiffEntry => ({
    file,
    additions,
    deletions,
    status: 'modified',
  });

  it('renders an unmatched binding in its own section with the exclusion hint when no revert entries exist', () => {
    const sidebar = mountSidebar();
    sidebar.updateEntries([diffEntry('notes/other.md')], 'ready', { path: 'drafts/plan.md', exists: true });
    // The review's exact case: no revert round at all, only a session diff.
    sidebar.updateRevertState(null, null);

    const section = document.querySelector('.opencodian-modified-files-linked-note-section');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain(t('modifiedFiles.linkedNoteSection'));
    expect(section?.textContent).toContain('drafts/plan.md');
    expect(section?.textContent).toContain(t('modifiedFiles.linkedNoteExcludedHint'));

    // The binding is not a change: it never becomes a change row and never
    // contributes to the row count or the statistics.
    const changeRowPaths = Array.from(document.querySelectorAll('.opencodian-modified-files-sidebar-item'))
      .map((row) => row.querySelector('.opencodian-modified-files-sidebar-path')?.textContent);
    expect(changeRowPaths).toEqual(['notes/other.md']);
    expect(section?.querySelector('.opencodian-modified-files-sidebar-item')).toBeNull();
  });

  it('scrolls the binding section with the change list so the rows keep the panel height', () => {
    const sidebar = mountSidebar();
    sidebar.updateEntries([diffEntry('notes/other.md'), diffEntry('notes/second.md', 1, 0)], 'ready', {
      path: 'drafts/plan.md',
      exists: true,
    });
    sidebar.updateRevertState(null, null);

    // A fixed sibling section used to squeeze the scrolling list until a change
    // row was clipped mid-statistic; in diff mode the section belongs to the
    // list so the rows keep the whole available height.
    const list = document.querySelector('.opencodian-modified-files-sidebar-list');
    const section = document.querySelector('.opencodian-modified-files-linked-note-section');
    expect(list?.contains(section)).toBe(true);
    expect(document.querySelectorAll('.opencodian-modified-files-sidebar-item')).toHaveLength(2);
  });

  it('keeps the binding section a sibling of the revert list in revert mode', () => {
    const sidebar = mountSidebar();
    sidebar.updateEntries([diffEntry('notes/other.md')], 'ready', { path: 'drafts/plan.md', exists: true });
    sidebar.updateRevertState({
      enabled: true,
      roundId: 'round-1',
      roundOpen: false,
      degraded: false,
      entries: [{
        path: 'notes/other.md',
        status: 'modified',
        movedTo: null,
        state: 'active',
        revertible: true,
        restorable: false,
        excludedReason: null,
      }],
      revertibleCount: 1,
    }, {
      getRevertPreview: jest.fn().mockResolvedValue({ roundId: 'round-1', roundOpen: false, rows: [] } as EditRevertPreview),
      revertFile: jest.fn().mockResolvedValue(undefined),
      revertAll: jest.fn().mockResolvedValue(undefined),
      restoreFile: jest.fn().mockResolvedValue(undefined),
    });

    const section = document.querySelector('.opencodian-modified-files-linked-note-section');
    expect(section).not.toBeNull();
    expect(document.querySelector('.opencodian-modified-files-sidebar-list')?.contains(section)).toBe(false);
    expect(document.querySelector('.opencodian-edit-revert-section')?.contains(section)).toBe(false);
  });

  it('keeps the binding out of the diff count, line statistics and badge', () => {
    const sidebar = mountSidebar();
    sidebar.updateEntries([diffEntry('notes/other.md', 3, 1)], 'ready', { path: 'drafts/plan.md', exists: true });
    sidebar.updateRevertState(null, null);

    expect(document.querySelector('.opencodian-modified-files-sidebar-summary')?.textContent)
      .toBe('1 · +3 -1');
    expect(document.querySelector('.opencodian-modified-files-strip-badge')?.textContent).toBe('1');
    expect(document.querySelectorAll('.opencodian-modified-files-sidebar-item')).toHaveLength(1);
  });

  it('uses the draft badge on the diff row instead of a second standalone row when the binding itself changed', () => {
    const sidebar = mountSidebar();
    sidebar.updateEntries([diffEntry('drafts/plan.md'), diffEntry('notes/other.md')], 'ready', {
      path: 'drafts/plan.md',
      exists: true,
    });
    sidebar.updateRevertState(null, null);

    expect(document.querySelector('.opencodian-modified-files-linked-note-section')).toBeNull();
    const rows = Array.from(document.querySelectorAll('.opencodian-modified-files-sidebar-item'));
    expect(rows).toHaveLength(2);
    const linkedRow = rows.find((row) => row.textContent?.includes('drafts/plan.md'));
    expect(linkedRow?.querySelector('.opencodian-modified-files-linked-note-badge')?.textContent)
      .toBe(t('modifiedFiles.linkedNoteDraft'));
  });

  it('still gives a locked (missing) binding its own section with the exclusion hint', () => {
    const sidebar = mountSidebar();
    sidebar.updateEntries([diffEntry('notes/other.md')], 'ready', { path: 'missing.md', exists: false });
    sidebar.updateRevertState(null, null);

    const section = document.querySelector('.opencodian-modified-files-linked-note-section');
    expect(section?.textContent).toContain('missing.md');
    expect(section?.textContent).toContain(t('modifiedFiles.linkedNoteLocked'));
    expect(section?.textContent).toContain(t('modifiedFiles.linkedNoteExcludedHint'));
    expect(section?.querySelector('[data-linked-note-state="locked"]')).not.toBeNull();
  });

  it('keeps the full binding path reachable when the panel ellipsises it', () => {
    const longPath = 'opencodian-conversations/2026-09-20_a-very-long-note-name.md';
    const sidebar = mountSidebar();
    sidebar.updateEntries([diffEntry('notes/other.md')], 'ready', { path: longPath, exists: true });
    sidebar.updateRevertState(null, null);

    const sectionPath = document.querySelector(
      '.opencodian-modified-files-linked-note-section .opencodian-modified-files-sidebar-path',
    );
    expect(sectionPath?.textContent).toBe(longPath);
    // The sibling change rows expose the full path through `title`; the
    // ellipsised binding row must not be the one that loses it.
    expect(sectionPath?.getAttribute('title')).toBe(longPath);
  });

  it('renders exactly one binding section in both modes', () => {
    const sidebar = mountSidebar();
    sidebar.updateEntries([diffEntry('notes/other.md')], 'ready', { path: 'drafts/plan.md', exists: true });
    sidebar.updateRevertState(null, null);
    expect(document.querySelectorAll('.opencodian-modified-files-linked-note-section')).toHaveLength(1);

    // Entering revert mode keeps exactly one section, now under the revert list.
    sidebar.updateRevertState({
      enabled: true,
      roundId: 'round-1',
      roundOpen: false,
      degraded: false,
      entries: [{
        path: 'notes/other.md',
        status: 'modified',
        movedTo: null,
        state: 'active',
        revertible: true,
        restorable: false,
        excludedReason: null,
      }],
      revertibleCount: 1,
    }, {
      getRevertPreview: jest.fn().mockResolvedValue({ roundId: 'round-1', roundOpen: false, rows: [] } as EditRevertPreview),
      revertFile: jest.fn().mockResolvedValue(undefined),
      revertAll: jest.fn().mockResolvedValue(undefined),
      restoreFile: jest.fn().mockResolvedValue(undefined),
    });
    expect(document.querySelectorAll('.opencodian-modified-files-linked-note-section')).toHaveLength(1);
    expect(document.querySelector('.opencodian-modified-files-linked-note-section')?.textContent)
      .toContain(t('modifiedFiles.linkedNoteExcludedHint'));
  });
});
