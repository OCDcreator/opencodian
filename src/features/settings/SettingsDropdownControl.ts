import { type DropdownComponent, setIcon, type Setting } from 'obsidian';

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

  const close = () => {
    isOpen = false;
    rootEl.removeClass('is-open');
    menuEl.addClass('is-hidden');
    triggerEl.setAttribute('aria-expanded', 'false');
  };

  const renderOptions = () => {
    menuEl.replaceChildren();
    const selectedIndex = getSelectedIndex();
    options.forEach((option, index) => {
      const optionEl = menuEl.createEl('button', {
        cls: `opencodian-settings-dropdown-option${option.disabled ? ' is-disabled' : ''}${index === highlightedIndex ? ' is-highlighted' : ''}`,
        text: option.label,
        attr: {
          type: 'button',
          role: 'option',
          'aria-selected': String(index === selectedIndex),
          'data-value': option.value,
        },
      });
      optionEl.disabled = option.disabled;
      const checkEl = optionEl.createSpan({ cls: 'opencodian-settings-dropdown-option-check' });
      if (index === selectedIndex) {
        setIcon(checkEl, 'check');
      }
      optionEl.addEventListener('click', () => {
        selectOption(index);
      });
    });
  };

  const open = () => {
    if (selectEl.disabled || options.length === 0) {
      return;
    }
    highlightedIndex = getSelectedIndex();
    if (highlightedIndex < 0 || options[highlightedIndex]?.disabled) {
      highlightedIndex = getFirstEnabledIndex();
    }
    isOpen = true;
    rootEl.addClass('is-open');
    menuEl.removeClass('is-hidden');
    triggerEl.setAttribute('aria-expanded', 'true');
    renderOptions();
  };

  const refresh = () => {
    options = Array.from(selectEl.options).map((optionEl) => ({
      disabled: optionEl.disabled,
      label: optionEl.textContent ?? optionEl.label,
      value: optionEl.value,
    }));
    if (isOpen) {
      renderOptions();
    }
    renderTrigger();
  };

  const moveHighlight = (delta: number) => {
    if (!isOpen) {
      open();
      return;
    }
    const enabledIndexes = options
      .map((option, index) => ({ index, option }))
      .filter(({ option }) => !option.disabled)
      .map(({ index }) => index);
    if (enabledIndexes.length === 0) {
      return;
    }
    const currentEnabledPosition = enabledIndexes.indexOf(highlightedIndex);
    const nextEnabledPosition = currentEnabledPosition < 0
      ? 0
      : (currentEnabledPosition + delta + enabledIndexes.length) % enabledIndexes.length;
    highlightedIndex = enabledIndexes[nextEnabledPosition] ?? enabledIndexes[0] ?? -1;
    renderOptions();
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) {
      return;
    }
    const changed = selectEl.value !== option.value;
    selectEl.value = option.value;
    refresh();
    close();
    triggerEl.focus();
    if (changed) {
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const handleTriggerKeydown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      moveHighlight(1);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp') {
      moveHighlight(-1);
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (isOpen && highlightedIndex >= 0) {
        selectOption(highlightedIndex);
      } else {
        open();
      }
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && isOpen) {
      close();
      event.preventDefault();
    }
  };

  const handleDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || rootEl.contains(target) || selectEl.contains(target)) {
      return;
    }
    close();
  };

  const mutationObserver = new MutationObserver(refresh);

  triggerEl.addEventListener('click', () => {
    if (isOpen) {
      close();
      return;
    }
    open();
  });
  triggerEl.addEventListener('keydown', handleTriggerKeydown);
  selectEl.addEventListener('change', refresh);
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  mutationObserver.observe(selectEl, {
    attributes: true,
    attributeFilter: ['disabled', 'label', 'value'],
    childList: true,
    subtree: true,
  });

  const handle: SettingsDropdownControlHandle = {
    close,
    destroy: () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
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
