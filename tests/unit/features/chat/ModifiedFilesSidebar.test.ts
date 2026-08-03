import type { App } from 'obsidian';

import type { SessionDiffEntry } from '../../../../src/core/types/chat';
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

function installObsidianElementHelpers(): void {
  const prototype = HTMLElement.prototype as ObsidianLikeElement;

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

describe('ModifiedFilesSidebar', () => {
  beforeAll(() => {
    installObsidianElementHelpers();
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
    coordinator.refresh('session-1', getEntries, 'unavailable');

    expect(getEntries).not.toHaveBeenCalled();
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
