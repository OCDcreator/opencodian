import { type DropdownComponent, setIcon, type Setting } from 'obsidian';

/** Gap between trigger and menu in pixels. */
const MENU_GAP = 5;
/** Minimum viewport margin on all sides. */
const VIEWPORT_MARGIN = 8;
/** Minimum usable menu height; close if less space is available. */
const MIN_MENU_HEIGHT = 40;

/** Portal positioning result returned by {@link computePortalPosition}. */
interface PortalPosition {
  placement: 'below' | 'above';
  top: string;
  bottom: string;
  left: string;
  width: string;
  maxHeight: string;
  /** True when available space is below MIN_MENU_HEIGHT — caller should close. */
  insufficientSpace: boolean;
}

/**
 * Pure computation for portal menu positioning.
 * Returns style values and placement decision without touching the DOM.
 */
function computePortalPosition(
  triggerRect: DOMRect,
  menuScrollHeight: number,
  viewportHeight: number,
  viewportWidth: number,
): PortalPosition {
  const clampedWidth = Math.max(1, Math.min(triggerRect.width, viewportWidth - VIEWPORT_MARGIN * 2));

  const cssMaxHeight = Math.min(280, Math.max(0, viewportHeight - 96));
  const naturalHeight = Math.min(menuScrollHeight, cssMaxHeight);

  const spaceBelow = viewportHeight - triggerRect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = triggerRect.top - VIEWPORT_MARGIN;

  let placement: 'below' | 'above';
  if (spaceBelow >= naturalHeight) {
    placement = 'below';
  } else if (spaceAbove >= naturalHeight) {
    placement = 'above';
  } else {
    placement = spaceBelow >= spaceAbove ? 'below' : 'above';
  }

  const availableHeight = placement === 'below' ? spaceBelow : spaceAbove;
  const usableHeight = availableHeight - MENU_GAP;

  if (usableHeight < MIN_MENU_HEIGHT) {
    return {
      placement,
      top: '',
      bottom: '',
      left: '',
      width: `${clampedWidth}px`,
      maxHeight: '',
      insufficientSpace: true,
    };
  }

  const clampedHeight = Math.max(MIN_MENU_HEIGHT, Math.min(naturalHeight, usableHeight));

  const top = placement === 'below' ? `${triggerRect.bottom + MENU_GAP}px` : '';
  const bottom = placement === 'above' ? `${viewportHeight - triggerRect.top + MENU_GAP}px` : '';

  let left = triggerRect.left;
  if (left + clampedWidth > viewportWidth - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - clampedWidth);
  }
  if (left < VIEWPORT_MARGIN) {
    left = VIEWPORT_MARGIN;
  }

  return {
    placement,
    top,
    bottom,
    left: `${left}px`,
    width: `${clampedWidth}px`,
    maxHeight: `${clampedHeight}px`,
    insufficientSpace: false,
  };
}

let nextDropdownId = 0;

const enhancedSelects = new WeakMap<HTMLSelectElement, SettingsDropdownControlHandle>();

interface SettingsDropdownOption {
  disabled: boolean;
  label: string;
  value: string;
}

export interface SettingsDropdownControlHandle {
  close: () => void;
  destroy: () => void;
  refresh: () => void;
}

export interface SettingsDropdownsEnhancerHandle {
  destroy: () => void;
  refresh: () => void;
}

export function enhanceSettingsDropdowns(containerEl: HTMLElement): SettingsDropdownsEnhancerHandle {
  const handles = new Set<SettingsDropdownControlHandle>();
  const mutationAddsSelect = (records: MutationRecord[]) => records.some((record) => (
    Array.from(record.addedNodes).some((node) => (
      node instanceof HTMLSelectElement
      || (node instanceof HTMLElement && Boolean(node.querySelector('select')))
    ))
  ));

  const refresh = () => {
    for (const selectEl of Array.from(containerEl.querySelectorAll<HTMLSelectElement>('select'))) {
      handles.add(enhanceSettingsSelect(selectEl));
    }
  };

  const mutationObserver = new MutationObserver((records) => {
    if (mutationAddsSelect(records)) {
      refresh();
    }
  });
  refresh();
  mutationObserver.observe(containerEl, {
    childList: true,
    subtree: true,
  });

  return {
    destroy: () => {
      mutationObserver.disconnect();
      for (const handle of handles) {
        handle.destroy();
      }
      handles.clear();
    },
    refresh,
  };
}

export function addSettingsDropdown(
  setting: Setting,
  configure: (dropdown: DropdownComponent) => void,
): Setting {
  return setting.addDropdown((dropdown) => {
    const handle = enhanceSettingsDropdownComponent(dropdown);
    configure(dropdown);
    handle.refresh();
  });
}

export function enhanceSettingsDropdownComponent(dropdown: DropdownComponent): SettingsDropdownControlHandle {
  const handle = enhanceSettingsSelect(dropdown.selectEl);
  const originalAddOption = dropdown.addOption.bind(dropdown);
  const originalSetValue = dropdown.setValue.bind(dropdown);

  dropdown.addOption = ((value: string, display: string) => {
    const result = originalAddOption(value, display);
    handle.refresh();
    return result;
  }) as typeof dropdown.addOption;

  dropdown.setValue = ((value: string) => {
    const result = originalSetValue(value);
    handle.refresh();
    return result;
  }) as typeof dropdown.setValue;

  return handle;
}

interface MenuRenderContext {
  options: SettingsDropdownOption[];
  highlightedIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Renders option elements into the menu listbox.
 * Extracted from {@link enhanceSettingsSelect} to reduce closure size.
 */
function renderMenuOptions(menuEl: HTMLElement, ctx: MenuRenderContext): void {
  menuEl.replaceChildren();
  ctx.options.forEach((option, index) => {
    const isCategoryHeader = option.disabled && option.value.startsWith('__cat__');
    const cls = [
      'opencodian-settings-dropdown-option',
      option.disabled && !isCategoryHeader ? ' is-disabled' : '',
      isCategoryHeader ? ' is-category-header' : '',
      index === ctx.highlightedIndex ? ' is-highlighted' : '',
    ].join('');
    const optionEl = menuEl.createEl('button', {
      cls,
      attr: {
        type: 'button',
        role: isCategoryHeader ? 'presentation' : 'option',
        'aria-selected': String(index === ctx.selectedIndex),
        'data-value': option.value,
      },
    });
    // Wrap label in a span so text-overflow: ellipsis works correctly
    optionEl.createSpan({ cls: 'opencodian-settings-dropdown-option-label', text: option.label });
    optionEl.disabled = option.disabled;
    if (!isCategoryHeader) {
      const checkEl = optionEl.createSpan({ cls: 'opencodian-settings-dropdown-option-check' });
      if (index === ctx.selectedIndex) {
        setIcon(checkEl, 'check');
      }
    }
    optionEl.addEventListener('click', () => {
      ctx.onSelect(index);
    });
  });
}

/**
 * Attaches capture-phase scroll and window resize listeners for portal repositioning.
 * Returns a cleanup function that removes all listeners and cancels pending RAF.
 */
function attachPortalListeners(
  triggerEl: HTMLElement,
  isOpenRef: () => boolean,
  closeFn: () => void,
  positionMenuFn: () => void,
): () => void {
  let rafId = 0;

  const schedulePosition = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!isOpenRef()) return;
      if (!triggerEl.isConnected) {
        closeFn();
        return;
      }
      const triggerRect = triggerEl.getBoundingClientRect();
      if (triggerRect.bottom < 0 || triggerRect.top > window.innerHeight) {
        closeFn();
        return;
      }
      positionMenuFn();
    });
  };

  document.addEventListener('scroll', schedulePosition, { capture: true, passive: true });
  window.addEventListener('resize', schedulePosition, { passive: true });

  return () => {
    cancelAnimationFrame(rafId);
    document.removeEventListener('scroll', schedulePosition, { capture: true });
    window.removeEventListener('resize', schedulePosition);
  };
}

interface DropdownKeydownContext {
  isOpen: boolean;
  highlightedIndex: number;
  options: SettingsDropdownOption[];
  onOpen: () => void;
  onClose: () => void;
  onSelectOption: (index: number) => void;
  setHighlightedIndex: (index: number) => void;
  renderOptions: () => void;
}

/**
 * Handles keyboard navigation for the dropdown trigger.
 * Extracted from {@link enhanceSettingsSelect} to reduce closure size.
 */
function handleDropdownKeydown(event: KeyboardEvent, ctx: DropdownKeydownContext): void {
  if (event.key === 'ArrowDown') {
    if (!ctx.isOpen) {
      ctx.onOpen();
    } else {
      advanceHighlight({ options: ctx.options, current: ctx.highlightedIndex, delta: 1, setIndex: ctx.setHighlightedIndex, renderOptions: ctx.renderOptions });
    }
    event.preventDefault();
    return;
  }
  if (event.key === 'ArrowUp') {
    if (!ctx.isOpen) {
      ctx.onOpen();
    } else {
      advanceHighlight({ options: ctx.options, current: ctx.highlightedIndex, delta: -1, setIndex: ctx.setHighlightedIndex, renderOptions: ctx.renderOptions });
    }
    event.preventDefault();
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    if (ctx.isOpen && ctx.highlightedIndex >= 0) {
      ctx.onSelectOption(ctx.highlightedIndex);
    } else {
      ctx.onOpen();
    }
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && ctx.isOpen) {
    ctx.onClose();
    event.preventDefault();
  }
}

interface HighlightAdvanceContext {
  options: SettingsDropdownOption[];
  current: number;
  delta: number;
  setIndex: (index: number) => void;
  renderOptions: () => void;
}

function advanceHighlight(ctx: HighlightAdvanceContext): void {
  const enabledIndexes = ctx.options
    .map((option, index) => ({ index, option }))
    .filter(({ option }) => !option.disabled)
    .map(({ index }) => index);
  if (enabledIndexes.length === 0) return;
  const pos = enabledIndexes.indexOf(ctx.current);
  const next = pos < 0 ? 0 : (pos + ctx.delta + enabledIndexes.length) % enabledIndexes.length;
  ctx.setIndex(enabledIndexes[next] ?? enabledIndexes[0] ?? -1);
  ctx.renderOptions();
}

export function enhanceSettingsSelect(selectEl: HTMLSelectElement): SettingsDropdownControlHandle {
  const existingHandle = enhancedSelects.get(selectEl);
  if (existingHandle) {
    existingHandle.refresh();
    return existingHandle;
  }

  const rootEl = document.createElement('div');
  rootEl.className = 'opencodian-settings-dropdown';
  const triggerEl = rootEl.createEl('button', {
    cls: 'opencodian-settings-dropdown-trigger',
    attr: {
      type: 'button',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
    },
  });
  const labelEl = triggerEl.createSpan({ cls: 'opencodian-settings-dropdown-label' });
  const chevronEl = triggerEl.createSpan({ cls: 'opencodian-settings-dropdown-chevron' });
  setIcon(chevronEl, 'chevron-down');

  const menuId = `opencodian-settings-dropdown-menu-${nextDropdownId++}`;
  const menuEl = rootEl.createDiv({
    cls: 'opencodian-settings-dropdown-menu is-hidden',
    attr: {
      id: menuId,
      role: 'listbox',
    },
  });
  triggerEl.setAttribute('aria-controls', menuId);

  selectEl.classList.add('opencodian-settings-native-select');
  selectEl.setAttribute('aria-hidden', 'true');
  selectEl.tabIndex = -1;
  selectEl.insertAdjacentElement('afterend', rootEl);

  let options: SettingsDropdownOption[] = [];
  let highlightedIndex = -1;
  let isOpen = false;
  let portalCleanup: (() => void) | null = null;

  const getSelectedIndex = () => options.findIndex((option) => option.value === selectEl.value);
  const getFirstEnabledIndex = () => options.findIndex((option) => !option.disabled);

  const syncDisabledState = () => {
    triggerEl.disabled = selectEl.disabled;
    rootEl.toggleClass('is-disabled', selectEl.disabled);
  };

  const renderTrigger = () => {
    const selectedOption = options[getSelectedIndex()];
    labelEl.setText(selectedOption?.label ?? selectEl.value);
    syncDisabledState();
  };

  const resetPortalStyles = () => {
    menuEl.style.top = '';
    menuEl.style.bottom = '';
    menuEl.style.left = '';
    menuEl.style.width = '';
    menuEl.style.maxHeight = '';
  };

  const positionMenu = (): boolean => {
    const pos = computePortalPosition(
      triggerEl.getBoundingClientRect(),
      menuEl.scrollHeight,
      window.innerHeight,
      window.innerWidth,
    );
    menuEl.style.width = pos.width;
    if (pos.insufficientSpace) {
      close();
      return true;
    }
    menuEl.style.top = pos.top;
    menuEl.style.bottom = pos.bottom;
    menuEl.style.left = pos.left;
    menuEl.style.maxHeight = pos.maxHeight;
    menuEl.toggleClass('is-flipped', pos.placement === 'above');
    return false;
  };

  const close = () => {
    if (!isOpen && menuEl.parentElement === rootEl) return;
    isOpen = false;
    rootEl.removeClass('is-open');
    menuEl.addClass('is-hidden');
    menuEl.removeClass('is-portal');
    menuEl.removeClass('is-flipped');
    triggerEl.setAttribute('aria-expanded', 'false');
    resetPortalStyles();
    portalCleanup?.();
    portalCleanup = null;
    rootEl.appendChild(menuEl);
  };

  const renderOptions = () => {
    renderMenuOptions(menuEl, {
      options,
      highlightedIndex,
      selectedIndex: getSelectedIndex(),
      onSelect: selectOption,
    });
  };

  const open = () => {
    if (selectEl.disabled || options.length === 0 || getFirstEnabledIndex() < 0 || !triggerEl.isConnected) {
      return;
    }
    portalCleanup?.();
    portalCleanup = null;
    highlightedIndex = getSelectedIndex();
    if (highlightedIndex < 0 || options[highlightedIndex]?.disabled) {
      highlightedIndex = getFirstEnabledIndex();
    }
    isOpen = true;
    rootEl.addClass('is-open');
    menuEl.removeClass('is-hidden');
    triggerEl.setAttribute('aria-expanded', 'true');
    renderOptions();
    document.body.appendChild(menuEl);
    menuEl.addClass('is-portal');
    const didClose = positionMenu();
    if (didClose || !isOpen) return;
    portalCleanup = attachPortalListeners(
      triggerEl,
      () => isOpen,
      close,
      positionMenu,
    );
  };

  const refresh = () => {
    options = Array.from(selectEl.options).map((optionEl) => ({
      disabled: optionEl.disabled,
      label: optionEl.textContent ?? optionEl.label,
      value: optionEl.value,
    }));
    if (isOpen && (options.length === 0 || options.every((o) => o.disabled))) {
      close();
      return;
    }
    if (isOpen) {
      renderOptions();
      positionMenu();
    }
    renderTrigger();
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    const changed = selectEl.value !== option.value;
    selectEl.value = option.value;
    refresh();
    close();
    triggerEl.focus();
    if (changed) selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const handleTriggerKeydown = (event: KeyboardEvent) => {
    handleDropdownKeydown(event, {
      isOpen,
      highlightedIndex,
      options,
      onOpen: open,
      onClose: close,
      onSelectOption: selectOption,
      setHighlightedIndex: (i) => { highlightedIndex = i; },
      renderOptions,
    });
  };

  const handleDocumentPointerDown = (event: PointerEvent | MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || rootEl.contains(target) || selectEl.contains(target) || menuEl.contains(target)) return;
    close();
  };

  const mutationObserver = new MutationObserver(refresh);

  triggerEl.addEventListener('click', () => { if (isOpen) { close(); } else { open(); } });
  triggerEl.addEventListener('keydown', handleTriggerKeydown);
  selectEl.addEventListener('change', refresh);
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  mutationObserver.observe(selectEl, { attributes: true, attributeFilter: ['disabled', 'label', 'value'], childList: true, subtree: true });

  const handle: SettingsDropdownControlHandle = {
    close,
    destroy: () => {
      isOpen = false;
      portalCleanup?.();
      portalCleanup = null;
      if (menuEl.parentElement === document.body) menuEl.remove();
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      selectEl.removeEventListener('change', refresh);
      mutationObserver.disconnect();
      rootEl.remove();
      selectEl.classList.remove('opencodian-settings-native-select');
      selectEl.removeAttribute('aria-hidden');
      selectEl.removeAttribute('tabindex');
      enhancedSelects.delete(selectEl);
    },
    refresh,
  };

  refresh();
  enhancedSelects.set(selectEl, handle);
  return handle;
}
