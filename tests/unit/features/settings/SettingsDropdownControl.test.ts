/* eslint-disable max-lines -- Dropdown portal, keyboard, accessibility, and style contracts share one focused fixture. */
import * as fs from 'fs';
import { Scope } from 'obsidian';
import * as path from 'path';

import { enhanceSettingsSelect } from '../../../../src/features/settings/SettingsDropdownControl';

type ScopeBinding = { key: string | null; func: (event: KeyboardEvent) => false | void };

interface FakeKeymapHarness {
  activeScopes: Scope[];
  dispose: () => void;
  keymap: {
    popScope: jest.Mock<void, [Scope]>;
    pushScope: jest.Mock<void, [Scope]>;
  };
}

function createFakeKeymap(): FakeKeymapHarness {
  const activeScopes: Scope[] = [];
  const handleKeydown = (event: KeyboardEvent) => {
    const activeScope = activeScopes[activeScopes.length - 1] as (Scope & { registeredHandlers?: ScopeBinding[] }) | undefined;
    const binding = activeScope?.registeredHandlers?.find(({ key }) => key === event.key);
    if (binding?.func(event) === false) {
      event.preventDefault();
    }
  };
  document.addEventListener('keydown', handleKeydown, true);
  const keymap = {
    pushScope: jest.fn((scope: Scope) => {
      activeScopes.push(scope);
    }),
    popScope: jest.fn((scope: Scope) => {
      const index = activeScopes.lastIndexOf(scope);
      if (index >= 0) activeScopes.splice(index, 1);
    }),
  };
  return {
    activeScopes,
    keymap,
    dispose: () => document.removeEventListener('keydown', handleKeydown, true),
  };
}

function readStyleFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function extractRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

function createSelect(): HTMLSelectElement {
  const selectEl = document.createElement('select');
  const presetEl = document.createElement('option');
  presetEl.value = 'preset';
  presetEl.textContent = 'Preset';
  selectEl.appendChild(presetEl);

  const refractionEl = document.createElement('option');
  refractionEl.value = 'glass-refraction';
  refractionEl.textContent = 'Glass Refraction';
  selectEl.appendChild(refractionEl);

  const liquidEl = document.createElement('option');
  liquidEl.value = 'liquid-glass';
  liquidEl.textContent = 'Liquid Glass';
  selectEl.appendChild(liquidEl);
  selectEl.value = 'preset';
  document.body.appendChild(selectEl);
  return selectEl;
}

const enhanceSettingsSelectWithKeymap = (
  selectEl: HTMLSelectElement,
  keymap: FakeKeymapHarness['keymap'],
) => enhanceSettingsSelect(selectEl, keymap);

// eslint-disable-next-line max-lines-per-function -- Shared control tests keep keyboard, lifecycle, and accessibility contracts together.
describe('SettingsDropdownControl', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders a cross-platform menu below a persistent trigger', () => {
    const selectEl = createSelect();

    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');

    expect(selectEl.classList.contains('opencodian-settings-native-select')).toBe(true);
    expect(triggerEl?.textContent).toContain('Preset');
    expect(menuEl?.classList.contains('is-hidden')).toBe(true);

    triggerEl?.click();

    expect(triggerEl?.getAttribute('aria-expanded')).toBe('true');
    expect(triggerEl?.textContent).toContain('Preset');
    expect(menuEl?.classList.contains('is-hidden')).toBe(false);
    expect(menuEl?.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(menuEl?.querySelector('[aria-selected="true"]')?.textContent).toContain('Preset');
  });

  it('exposes combobox active-descendant semantics and closes before Tab leaves the field', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    if (!triggerEl || !menuEl) throw new Error('dropdown DOM missing');

    expect(triggerEl.getAttribute('role')).toBe('combobox');
    triggerEl.click();

    const activeId = triggerEl.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    expect(document.getElementById(activeId ?? '')?.getAttribute('role')).toBe('option');
    const options = Array.from(menuEl.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(options.every((option) => option.id.length > 0 && option.tabIndex === -1)).toBe(true);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    triggerEl.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);
    expect(menuEl.classList.contains('is-hidden')).toBe(true);
    expect(triggerEl.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('transfers the native select accessible name to the focusable trigger, preferring labelledby', () => {
    const selectEl = createSelect();
    const labelEl = document.createElement('span');
    labelEl.id = 'settings-field-label';
    labelEl.textContent = 'Theme';
    document.body.appendChild(labelEl);
    selectEl.setAttribute('aria-labelledby', labelEl.id);
    selectEl.setAttribute('aria-label', 'Fallback theme');

    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    expect(triggerEl?.getAttribute('aria-labelledby')).toBe(labelEl.id);
    expect(triggerEl?.hasAttribute('aria-label')).toBe(false);
  });

  it('inherits an aria-label and refreshes the trigger when the select name changes', async () => {
    const selectEl = createSelect();
    selectEl.setAttribute('aria-label', 'Initial theme');
    const handle = enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    expect(triggerEl?.getAttribute('aria-label')).toBe('Initial theme');

    selectEl.setAttribute('aria-label', 'Updated theme');
    await Promise.resolve();
    expect(triggerEl?.getAttribute('aria-label')).toBe('Updated theme');

    handle.destroy();
  });

  it('syncs selection back to the original select and dispatches change', () => {
    const selectEl = createSelect();
    const onChange = jest.fn();
    selectEl.addEventListener('change', onChange);

    enhanceSettingsSelect(selectEl);

    document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')?.click();
    const options = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.opencodian-settings-dropdown-option'),
    );
    options.find((optionEl) => optionEl.dataset.value === 'liquid-glass')?.click();

    expect(selectEl.value).toBe('liquid-glass');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('.opencodian-settings-dropdown-trigger')?.textContent).toContain('Liquid Glass');
    expect(document.body.querySelector('.opencodian-settings-dropdown-menu')?.classList.contains('is-hidden')).toBe(true);
  });

  it('supports keyboard navigation and skips disabled options', () => {
    const selectEl = createSelect();
    selectEl.options[1].disabled = true;
    const onChange = jest.fn();
    selectEl.addEventListener('change', onChange);

    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    triggerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    triggerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(selectEl.value).toBe('liquid-glass');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('consumes handled keyboard events at the trigger and closes on Escape without bubbling', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    if (!triggerEl || !menuEl) throw new Error('dropdown trigger/menu missing');
    const hostKeydown = jest.fn();
    document.addEventListener('keydown', hostKeydown);

    const dispatchHandled = (key: string): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      triggerEl.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(hostKeydown).not.toHaveBeenCalled();
      return event;
    };
    try {
      dispatchHandled('ArrowDown');
      expect(menuEl.classList.contains('is-hidden')).toBe(false);
      dispatchHandled('ArrowUp');
      expect(menuEl.classList.contains('is-hidden')).toBe(false);
      dispatchHandled('Escape');
      expect(menuEl.classList.contains('is-hidden')).toBe(true);
      expect(triggerEl.getAttribute('aria-expanded')).toBe('false');

      dispatchHandled('Enter');
      expect(menuEl.classList.contains('is-hidden')).toBe(false);
      dispatchHandled(' ');
      expect(menuEl.classList.contains('is-hidden')).toBe(true);
    } finally {
      document.removeEventListener('keydown', hostKeydown);
    }
  });

  it('allows unrelated keyboard events to bubble to the host', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    if (!triggerEl) throw new Error('dropdown trigger missing');
    const hostKeydown = jest.fn();
    document.addEventListener('keydown', hostKeydown);
    try {
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      triggerEl.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(hostKeydown).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', hostKeydown);
    }
  });

  it('pushes a native scope only while open and lets closed Escape pass through', () => {
    const keymapHarness = createFakeKeymap();
    const selectEl = createSelect();
    const handle = enhanceSettingsSelectWithKeymap(selectEl, keymapHarness.keymap);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    if (!triggerEl || !menuEl) throw new Error('dropdown DOM missing');
    try {
      expect(keymapHarness.keymap.pushScope).not.toHaveBeenCalled();
      triggerEl.click();
      expect(keymapHarness.keymap.pushScope).toHaveBeenCalledTimes(1);
      expect(keymapHarness.activeScopes).toHaveLength(1);

      const openTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      triggerEl.dispatchEvent(openTab);
      expect(openTab.defaultPrevented).toBe(false);
      expect(menuEl.classList.contains('is-hidden')).toBe(true);

      triggerEl.click();
      expect(menuEl.classList.contains('is-hidden')).toBe(false);

      const openEscape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      triggerEl.dispatchEvent(openEscape);

      expect(openEscape.defaultPrevented).toBe(true);
      expect(menuEl.classList.contains('is-hidden')).toBe(true);
      expect(keymapHarness.keymap.popScope).toHaveBeenCalledTimes(2);
      expect(keymapHarness.activeScopes).toHaveLength(0);

      const closedEscape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      triggerEl.dispatchEvent(closedEscape);
      expect(closedEscape.defaultPrevented).toBe(false);
      expect(keymapHarness.keymap.pushScope).toHaveBeenCalledTimes(2);
      expect(keymapHarness.keymap.popScope).toHaveBeenCalledTimes(2);
    } finally {
      handle.destroy();
      keymapHarness.dispose();
    }
  });

  it('does not consume Escape from a non-trigger target while open', () => {
    const keymapHarness = createFakeKeymap();
    const selectEl = createSelect();
    const handle = enhanceSettingsSelectWithKeymap(selectEl, keymapHarness.keymap);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    if (!triggerEl || !menuEl) throw new Error('dropdown DOM missing');
    try {
      triggerEl.click();
      const optionEl = menuEl.querySelector<HTMLElement>('[role="option"]');
      if (!optionEl) throw new Error('dropdown option missing');
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      optionEl.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(menuEl.classList.contains('is-hidden')).toBe(false);
      expect(keymapHarness.keymap.popScope).not.toHaveBeenCalled();
    } finally {
      handle.destroy();
      keymapHarness.dispose();
    }
  });

  it('does not leak scope pushes across repeated open, close, or destroy calls', () => {
    const keymapHarness = createFakeKeymap();
    const selectEl = createSelect();
    const handle = enhanceSettingsSelectWithKeymap(selectEl, keymapHarness.keymap);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    if (!triggerEl) throw new Error('dropdown trigger missing');
    try {
      triggerEl.click();
      triggerEl.click();
      triggerEl.click();
      handle.close();
      handle.close();
      triggerEl.click();
      handle.destroy();
      handle.destroy();

      expect(keymapHarness.keymap.pushScope).toHaveBeenCalledTimes(3);
      expect(keymapHarness.keymap.popScope).toHaveBeenCalledTimes(3);
      expect(keymapHarness.activeScopes).toHaveLength(0);
    } finally {
      keymapHarness.dispose();
    }
  });
});

describe('SettingsDropdownControl portal behavior', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('portals menu to document.body on open', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click();

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl?.classList.contains('is-portal')).toBe(true);
    expect(menuEl?.parentElement).toBe(document.body);
  });

  it('returns menu to rootEl on close', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click(); // open
    triggerEl?.click(); // close (toggle)

    const rootEl = document.body.querySelector('.opencodian-settings-dropdown');
    const menuEl = rootEl?.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl).toBeTruthy();
    expect(menuEl?.classList.contains('is-portal')).toBe(false);
    expect(menuEl?.classList.contains('is-hidden')).toBe(true);
  });

  it('sets inline width and left on open', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click();

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl?.style.width).toBeTruthy();
    expect(menuEl?.style.left).toBeTruthy();
  });

  it('widens narrow menus enough to show compact permission labels', () => {
    const selectEl = document.createElement('select');
    for (const label of ['允许', '询问', '拒绝']) {
      const optionEl = document.createElement('option');
      optionEl.value = label;
      optionEl.textContent = label;
      selectEl.appendChild(optionEl);
    }
    document.body.appendChild(selectEl);
    enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')!;
    jest.spyOn(triggerEl, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({
      x: 20,
      y: 20,
      width: 72,
      height: 32,
    }));

    triggerEl.click();

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu')!;
    expect(parseInt(menuEl.style.width, 10)).toBeGreaterThanOrEqual(128);
  });

  it('resets inline styles on close', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click(); // open
    triggerEl?.click(); // close

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl?.style.width).toBe('');
    expect(menuEl?.style.left).toBe('');
    expect(menuEl?.style.top).toBe('');
    expect(menuEl?.style.maxHeight).toBe('');
  });

  it('cleans up portal on destroy while closed', () => {
    const selectEl = createSelect();
    const handle = enhanceSettingsSelect(selectEl);

    handle.destroy();

    expect(document.body.querySelectorAll('.opencodian-settings-dropdown-menu')).toHaveLength(0);
    expect(document.body.querySelectorAll('.opencodian-settings-dropdown')).toHaveLength(0);
  });

  it('cleans up portal on destroy while open', () => {
    const selectEl = createSelect();
    const handle = enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click();

    expect(document.body.querySelectorAll('.opencodian-settings-dropdown-menu')).toHaveLength(1);

    handle.destroy();

    expect(document.body.querySelectorAll('.opencodian-settings-dropdown-menu')).toHaveLength(0);
    expect(document.body.querySelectorAll('.opencodian-settings-dropdown')).toHaveLength(0);
  });

  it('close is idempotent', () => {
    const selectEl = createSelect();
    const handle = enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click();

    handle.close();
    handle.close();
    handle.close();

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl?.classList.contains('is-hidden')).toBe(true);
  });

  it('reopen does not accumulate listeners', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');

    const addSpy = jest.spyOn(document, 'addEventListener');
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    // Open/close cycle
    triggerEl?.click();
    const scrollAddsAfterOpen1 = addSpy.mock.calls.filter(([evt]) => evt === 'scroll').length;
    const scrollRemovesAfterClose = (() => {
      triggerEl?.click(); // close
      return removeSpy.mock.calls.filter(([evt]) => evt === 'scroll').length;
    })();

    // Open again
    triggerEl?.click();
    const scrollAddsAfterOpen2 = addSpy.mock.calls.filter(([evt]) => evt === 'scroll').length;

    // Net active scroll listeners should stay constant:
    // (adds_after_open1) + (adds_since) - (removes_since) should equal the net active count
    const netActive = scrollAddsAfterOpen2 - scrollRemovesAfterClose;
    expect(netActive).toBe(scrollAddsAfterOpen1);

    addSpy.mockRestore();
    removeSpy.mockRestore();

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl?.classList.contains('is-hidden')).toBe(false);
    expect(menuEl?.classList.contains('is-portal')).toBe(true);
  });

  it('closes on outside pointer down when portaled', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click();

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl?.classList.contains('is-hidden')).toBe(false);

    // Click somewhere else (jsdom may not have PointerEvent, use MouseEvent)
    const outsideEl = document.createElement('div');
    document.body.appendChild(outsideEl);
    outsideEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(menuEl?.classList.contains('is-hidden')).toBe(true);
  });

  it('does not close when clicking inside portaled menu', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click();

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl?.classList.contains('is-hidden')).toBe(false);

    // Click inside the menu
    menuEl?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(menuEl?.classList.contains('is-hidden')).toBe(false);
  });

  it('repositions after refresh while open', () => {
    const selectEl = createSelect();
    const handle = enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click();

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    const widthBefore = menuEl?.style.width;

    // Add an option and refresh
    const newOption = document.createElement('option');
    newOption.value = 'new-option';
    newOption.textContent = 'New Option';
    selectEl.appendChild(newOption);
    handle.refresh();

    // Menu should still be open and portaled
    expect(menuEl?.classList.contains('is-hidden')).toBe(false);
    expect(menuEl?.classList.contains('is-portal')).toBe(true);
    // Width should still be set (repositioned)
    expect(menuEl?.style.width).toBeTruthy();
    expect(widthBefore).toBeTruthy();
  });

  it('closes when options are emptied while open', () => {
    const selectEl = createSelect();
    const handle = enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.click();

    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl?.classList.contains('is-hidden')).toBe(false);

    // Remove all options
    selectEl.replaceChildren();
    handle.refresh();

    expect(menuEl?.classList.contains('is-hidden')).toBe(true);
  });
});

describe('SettingsDropdownControl styles', () => {
  it('keeps hidden native selects from extending settings scroll geometry', () => {
    const css = readStyleFile('src/style/components/settings-dropdown.css');
    const nativeSelectRule = extractRule(css, '.opencodian-settings-native-select');

    expect(nativeSelectRule).toContain('position: fixed !important;');
    expect(nativeSelectRule).toContain('inset: 0 auto auto 0 !important;');
    expect(nativeSelectRule).toContain('overflow: hidden !important;');
  });

  it('lets menus expand for readable labels while option rows fill the menu track', () => {
    const css = readStyleFile('src/style/components/settings-dropdown.css');
    const menuRule = extractRule(css, '.opencodian-settings-dropdown-menu');
    const scrollableRule = extractRule(css, '.opencodian-settings-dropdown-menu.is-scrollable');
    const optionRule = extractRule(css, '.opencodian-settings-dropdown-option');
    const labelRule = extractRule(css, '.opencodian-settings-dropdown-option-label');

    expect(menuRule).toContain('display: grid;');
    expect(menuRule).toContain('grid-auto-rows: min-content;');
    expect(menuRule).toContain('gap: 2px;');
    expect(menuRule).toContain('padding: 5px;');
    expect(menuRule).toContain('overflow-y: hidden;');
    expect(scrollableRule).toContain('overflow-y: auto;');
    expect(optionRule).toContain('width: 100%;');
    expect(optionRule).toContain('justify-self: stretch;');
    expect(labelRule).toContain('overflow: visible;');
    expect(labelRule).toContain('white-space: normal;');
    expect(labelRule).toContain('overflow-wrap: anywhere;');
  });
});

describe('SettingsDropdownControl positioning', () => {
  const originalInnerHeight = window.innerHeight;
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    document.body.replaceChildren();
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true });
  });

  function mockTriggerRect(triggerEl: HTMLElement, rect: DOMRectInit) {
    jest.spyOn(triggerEl, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect(rect));
  }

  it('positions menu below trigger by default', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')!;

    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true });
    mockTriggerRect(triggerEl, { x: 100, y: 200, width: 180, height: 32 });

    triggerEl.click();
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu')!;

    expect(menuEl.style.top).toBe('237px'); // 200 + 32 + 5
    expect(menuEl.style.bottom).toBe('');
    expect(menuEl.classList.contains('is-flipped')).toBe(false);
  });

  it('flips menu above trigger when below space is insufficient', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')!;

    Object.defineProperty(window, 'innerHeight', { value: 200, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true });
    // Trigger near bottom: only 20px below, 150px above
    mockTriggerRect(triggerEl, { x: 100, y: 180, width: 180, height: 32 });

    triggerEl.click();
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu')!;

    expect(menuEl.style.bottom).toBeTruthy();
    expect(menuEl.style.top).toBe('');
    expect(menuEl.classList.contains('is-flipped')).toBe(true);
  });

  it('clamps horizontal position within viewport', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')!;

    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 200, writable: true });
    // Trigger extends past right edge
    mockTriggerRect(triggerEl, { x: 150, y: 200, width: 180, height: 32 });

    triggerEl.click();
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu')!;

    // Left should be clamped: viewport(200) - margin(8) - clampedWidth
    const left = parseInt(menuEl.style.left, 10);
    expect(left).toBeLessThan(150);
  });

  it('clamps maxHeight to available space', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')!;

    // Tight viewport: only 60px below trigger
    Object.defineProperty(window, 'innerHeight', { value: 300, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true });
    mockTriggerRect(triggerEl, { x: 100, y: 200, width: 180, height: 32 });

    triggerEl.click();
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu')!;

    const maxH = parseInt(menuEl.style.maxHeight, 10);
    expect(maxH).toBeLessThanOrEqual(60);
  });

  it('closes when viewport space is below minimum', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')!;

    // Extremely tiny viewport
    Object.defineProperty(window, 'innerHeight', { value: 50, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 100, writable: true });
    mockTriggerRect(triggerEl, { x: 10, y: 20, width: 80, height: 20 });

    triggerEl.click();
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu')!;

    expect(menuEl.classList.contains('is-hidden')).toBe(true);
  });

  it('does not open when trigger is disconnected', () => {
    const selectEl = createSelect();
    enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')!;

    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true });

    // Remove from DOM
    triggerEl.parentElement?.remove();

    triggerEl.click();
    // Menu should remain hidden or not be found
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');
    expect(menuEl?.classList.contains('is-hidden') ?? true).toBe(true);
  });

  it('does not attach listeners when positionMenu closes during open', () => {
    const selectEl = createSelect();
    const handle = enhanceSettingsSelect(selectEl);
    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')!;

    // Tiny viewport forces close during positioning
    Object.defineProperty(window, 'innerHeight', { value: 30, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 50, writable: true });
    mockTriggerRect(triggerEl, { x: 10, y: 10, width: 30, height: 10 });

    const addSpy = jest.spyOn(document, 'addEventListener');
    const origCount = addSpy.mock.calls.length;

    triggerEl.click();

    // No new scroll/resize listeners should have been added after positionMenu closed
    const newCalls = addSpy.mock.calls.length - origCount;
    expect(newCalls).toBe(0);

    addSpy.mockRestore();
    handle.destroy();
  });
});
