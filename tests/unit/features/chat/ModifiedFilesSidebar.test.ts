import type { App } from 'obsidian';

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
});
