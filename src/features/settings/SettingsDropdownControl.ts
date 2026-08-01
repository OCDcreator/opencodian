/* eslint-disable max-lines -- The dropdown owner keeps portal, keyboard, mutation, and accessibility synchronization together. */
import { type DropdownComponent, type Keymap, Scope, setIcon, type Setting } from 'obsidian';

/** Gap between trigger and menu in pixels. */
const MENU_GAP = 5;
/** Minimum viewport margin on all sides. */
const VIEWPORT_MARGIN = 8;
/** Minimum usable menu height; close if less space is available. */
const MIN_MENU_HEIGHT = 40;
/** Small menus still need enough width for labels plus the selected checkmark. */
const MIN_MENU_WIDTH = 128;
/** Prevent long option labels from making the menu feel detached from the settings row. */
const MAX_MENU_WIDTH = 520;

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

interface PortalPositionInput {
  desiredMenuWidth: number;
  menuScrollHeight: number;
  triggerRect: DOMRect;
  viewportHeight: number;
  viewportWidth: number;
}

/**
 * Pure computation for portal menu positioning.
 * Returns style values and placement decision without touching the DOM.
 */
function computePortalPosition(input: PortalPositionInput): PortalPosition {
  const viewportMaxWidth = Math.max(1, input.viewportWidth - VIEWPORT_MARGIN * 2);
  const clampedWidth = Math.max(
    1,
    Math.min(
      Math.max(input.triggerRect.width, input.desiredMenuWidth),
      viewportMaxWidth,
    ),
  );

  const cssMaxHeight = Math.min(280, Math.max(0, input.viewportHeight - 96));
  const naturalHeight = Math.min(input.menuScrollHeight, cssMaxHeight);

  const spaceBelow = input.viewportHeight - input.triggerRect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = input.triggerRect.top - VIEWPORT_MARGIN;

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

  const top = placement === 'below' ? `${input.triggerRect.bottom + MENU_GAP}px` : '';
  const bottom = placement === 'above' ? `${input.viewportHeight - input.triggerRect.top + MENU_GAP}px` : '';

  let left = input.triggerRect.left;
  if (left + clampedWidth > input.viewportWidth - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, input.viewportWidth - VIEWPORT_MARGIN - clampedWidth);
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

function estimateMenuWidth(options: SettingsDropdownOption[]): number {
  const longestLabelUnits = options.reduce((max, option) => {
    const units = Array.from(option.label).reduce((total, char) =>
      total + (/[\u3000-\u9fff\uff00-\uffef]/u.test(char) ? 2 : 1), 0);
    return Math.max(max, units);
  }, 0);
  const estimatedLabelWidth = longestLabelUnits * 7;
  return Math.max(MIN_MENU_WIDTH, Math.min(MAX_MENU_WIDTH, estimatedLabelWidth + 54));
}

let nextDropdownId = 0;

const enhancedSelects = new WeakMap<HTMLSelectElement, SettingsDropdownControlHandle>();

/**
 * CSS class Obsidian 1.13+ adds to the hidden `select` it inserts per
 * `DropdownComponent` to measure the dropdown's natural width. These probes are
 * not real state sources: they carry no options, never fire change events, and
 * are removed once measuring is done. Enhancing them produced a second visible
 * dropdown per settings row (the 1.13 regression), so both the initial scan and
 * the MutationObserver increment must skip them.
 */
const HOST_MEASURING_SELECT_CLASS = 'is-measuring';

/**
 * Decides whether a `<select>` is a real, enhanceable state source — i.e. one
 * OpenCodian should render a custom trigger for. Exposed for unit testing.
 *
 * Rejects:
 * - Obsidian 1.13 width-measuring probes (`select.dropdown.is-measuring`);
 * - selects already enhanced (idempotent — `enhanceSettingsSelect` also guards,
 *   but skipping here avoids needless MutationObserver churn);
 * - detached selects (no measurable trigger geometry).
 */
export function isEnhanceableRealSelect(selectEl: unknown): selectEl is HTMLSelectElement {
  if (!(selectEl instanceof HTMLSelectElement)) return false;
  if (!selectEl.isConnected) return false;
  if (enhancedSelects.has(selectEl)) return false;
  // `.dropdown` is the class Obsidian's DropdownComponent puts on its select;
  // `.is-measuring` is the transient width probe added in 1.13. A real plugin
  // dropdown select carries `.dropdown` (or no class) but never `.is-measuring`.
  if (selectEl.classList.contains(HOST_MEASURING_SELECT_CLASS)) return false;
  return true;
}

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

export function enhanceSettingsDropdowns(containerEl: HTMLElement, keymap?: Keymap): SettingsDropdownsEnhancerHandle {
  const handles = new Set<SettingsDropdownControlHandle>();

  // A mutation is relevant if it adds a real enhanceable select OR mutates the
  // `class` attribute of a select (a real select that the host later turns into a
  // `.is-measuring` probe, or vice-versa). This keeps Obsidian 1.13's transient
  // `select.dropdown.is-measuring` width probes from being rendered as duplicate
  // dropdowns, while still catching the rare class-flip case.
  const mutationRelevant = (records: MutationRecord[]) => records.some((record) => {
    if (record.type === 'attributes' && record.attributeName === 'class') {
      return record.target instanceof HTMLSelectElement;
    }
    return Array.from(record.addedNodes).some((node) => (
      isEnhanceableRealSelect(node)
      || (node instanceof HTMLElement && Array.from(node.querySelectorAll('select')).some(isEnhanceableRealSelect))
    ));
  });

  const refresh = () => {
    const candidateSelects = Array.from(containerEl.querySelectorAll<HTMLSelectElement>('select'));
    for (const selectEl of candidateSelects) {
      const wasEnhanced = enhancedSelects.has(selectEl);
      // "still a real state source" is independent of the already-enhanced check:
      // a select is still real iff it is connected and NOT a measuring probe.
      const stillReal = selectEl.isConnected && !selectEl.classList.contains(HOST_MEASURING_SELECT_CLASS);
      if (wasEnhanced && !stillReal) {
        // The select was enhanced but is no longer a real state source (e.g. the
        // host flipped its class to `.is-measuring`). Destroy its handle to remove
        // the stale trigger so it cannot linger as a duplicate visible dropdown.
        const handle = enhancedSelects.get(selectEl);
        if (handle) {
          handle.destroy();
          handles.delete(handle);
        }
        continue;
      }
      // Skip non-real selects and selects already enhanced.
      if (!stillReal || wasEnhanced) continue;
      // isEnhanceableRealSelect also rejects detached + already-enhanced, but we
      // have decomposed those above; the remaining gate is the type/instance check.
      if (!isEnhanceableRealSelect(selectEl)) continue;
      handles.add(enhanceSettingsSelect(selectEl, keymap));
    }
  };

  const mutationObserver = new MutationObserver((records) => {
    if (mutationRelevant(records)) {
      refresh();
    }
  });
  refresh();
  mutationObserver.observe(containerEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
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

export function enhanceSettingsDropdownComponent(
  dropdown: DropdownComponent,
  keymap?: Keymap,
): SettingsDropdownControlHandle {
  const handle = enhanceSettingsSelect(dropdown.selectEl, keymap);
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
  optionIdPrefix: string;
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
    const optionEl = menuEl.createEl('button', { cls });
    optionEl.id = `${ctx.optionIdPrefix}-${index}`;
    optionEl.type = 'button';
    optionEl.tabIndex = -1;
    optionEl.setAttribute('role', isCategoryHeader ? 'presentation' : 'option');
    optionEl.setAttribute('data-value', option.value);
    if (!isCategoryHeader) {
      optionEl.setAttribute('aria-selected', String(index === ctx.selectedIndex));
      optionEl.setAttribute('aria-disabled', String(option.disabled));
    }
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
    event.stopPropagation();
    return;
  }
  if (event.key === 'ArrowUp') {
    if (!ctx.isOpen) {
      ctx.onOpen();
    } else {
      advanceHighlight({ options: ctx.options, current: ctx.highlightedIndex, delta: -1, setIndex: ctx.setHighlightedIndex, renderOptions: ctx.renderOptions });
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    if (ctx.isOpen && ctx.highlightedIndex >= 0) {
      ctx.onSelectOption(ctx.highlightedIndex);
    } else {
      ctx.onOpen();
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    if (!ctx.isOpen) {
      ctx.onOpen();
    } else {
      const enabledIndexes = ctx.options
        .map((option, index) => ({ index, option }))
        .filter(({ option }) => !option.disabled)
        .map(({ index }) => index);
      const nextIndex = event.key === 'Home'
        ? enabledIndexes[0]
        : enabledIndexes[enabledIndexes.length - 1];
      if (nextIndex !== undefined) {
        ctx.setHighlightedIndex(nextIndex);
        ctx.renderOptions();
      }
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === 'Tab' && ctx.isOpen) {
    ctx.onClose();
    return;
  }
  if (event.key === 'Escape' && ctx.isOpen) {
    ctx.onClose();
    event.preventDefault();
    event.stopPropagation();
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

// eslint-disable-next-line max-lines-per-function -- The enhancer owns one cohesive trigger/listbox lifecycle, including portal and accessibility synchronization.
export function enhanceSettingsSelect(
  selectEl: HTMLSelectElement,
  keymap?: Keymap,
): SettingsDropdownControlHandle {
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
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-autocomplete': 'none',
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
  const dropdownScope = keymap ? new Scope() : null;
  let isScopePushed = false;

  const getSelectedIndex = () => options.findIndex((option) => option.value === selectEl.value);
  const getFirstEnabledIndex = () => options.findIndex((option) => !option.disabled);
  const getOptionId = (index: number) => `${menuId}-${index}`;

  const syncDisabledState = () => {
    triggerEl.disabled = selectEl.disabled;
    rootEl.toggleClass('is-disabled', selectEl.disabled);
  };

  const syncActiveDescendant = () => {
    if (isOpen && highlightedIndex >= 0 && !options[highlightedIndex]?.disabled) {
      triggerEl.setAttribute('aria-activedescendant', getOptionId(highlightedIndex));
    } else {
      triggerEl.removeAttribute('aria-activedescendant');
    }
  };

  const syncAccessibleName = () => {
    const labelledBy = selectEl.getAttribute('aria-labelledby');
    if (labelledBy?.trim()) {
      // Keep the reference-based name when both attributes exist; it preserves
      // the visible field label instead of replacing it with fallback text.
      triggerEl.setAttribute('aria-labelledby', labelledBy);
      triggerEl.removeAttribute('aria-label');
      return;
    }
    const ariaLabel = selectEl.getAttribute('aria-label');
    if (ariaLabel !== null) {
      triggerEl.setAttribute('aria-label', ariaLabel);
    } else {
      triggerEl.removeAttribute('aria-label');
    }
    triggerEl.removeAttribute('aria-labelledby');
  };

  const renderTrigger = () => {
    const selectedOption = options[getSelectedIndex()];
    labelEl.setText(selectedOption?.label ?? selectEl.value);
    syncAccessibleName();
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
    menuEl.removeClass('is-scrollable');
    const pos = computePortalPosition({
      desiredMenuWidth: estimateMenuWidth(options),
      menuScrollHeight: menuEl.scrollHeight,
      triggerRect: triggerEl.getBoundingClientRect(),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    });
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
    const maxHeight = parseFloat(pos.maxHeight);
    menuEl.toggleClass('is-scrollable', Number.isFinite(maxHeight) && menuEl.scrollHeight > maxHeight);
    return false;
  };

  const popDropdownScope = () => {
    if (!keymap || !dropdownScope || !isScopePushed) return;
    keymap.popScope(dropdownScope);
    isScopePushed = false;
  };

  const close = () => {
    popDropdownScope();
    if (!isOpen && menuEl.parentElement === rootEl) return;
    isOpen = false;
    rootEl.removeClass('is-open');
    menuEl.addClass('is-hidden');
    menuEl.removeClass('is-portal');
    menuEl.removeClass('is-flipped');
    menuEl.removeClass('is-scrollable');
    triggerEl.setAttribute('aria-expanded', 'false');
    triggerEl.removeAttribute('aria-activedescendant');
    resetPortalStyles();
    portalCleanup?.();
    portalCleanup = null;
    rootEl.appendChild(menuEl);
  };

  dropdownScope?.register([], 'Escape', (event) => {
    if (!isOpen || event.target !== triggerEl) return;
    close();
    return false;
  });

  const renderOptions = () => {
    renderMenuOptions(menuEl, {
      options,
      highlightedIndex,
      selectedIndex: getSelectedIndex(),
      optionIdPrefix: menuId,
      onSelect: selectOption,
    });
    syncActiveDescendant();
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
    if (keymap && dropdownScope && !isScopePushed) {
      keymap.pushScope(dropdownScope);
      isScopePushed = true;
    }
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
      if (highlightedIndex < 0 || options[highlightedIndex]?.disabled) {
        highlightedIndex = getSelectedIndex();
        if (highlightedIndex < 0 || options[highlightedIndex]?.disabled) {
          highlightedIndex = getFirstEnabledIndex();
        }
      }
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
  mutationObserver.observe(selectEl, { attributes: true, attributeFilter: ['aria-label', 'aria-labelledby', 'disabled', 'label', 'value'], childList: true, subtree: true });

  const handle: SettingsDropdownControlHandle = {
    close,
    destroy: () => {
      close();
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
