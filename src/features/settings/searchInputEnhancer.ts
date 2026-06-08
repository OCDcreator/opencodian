import { setIcon } from 'obsidian';

import { t } from '../../i18n';
import { SettingsPopoverController } from './SettingsPopoverController';

const SEARCH_HISTORY_PREFIX = 'opencodian:settings-search-history:';
const SEARCH_HISTORY_LIMIT = 8;
const pendingCommitTimeouts = new Map<string, number>();
const pendingCommitValues = new Map<string, string>();

interface SearchInputEnhancerOptions {
  historyKey: string;
  inputEl: HTMLInputElement;
  containerEl: HTMLElement;
  onClear?: () => void;
  /** Optional boundary element for popover positioning. When provided the
   *  search history popover is clamped within this element's visible rect
   *  instead of the full viewport. */
  boundaryEl?: HTMLElement;
}

export interface SearchInputEnhancerHandle {
  commitCurrentValue: () => void;
  destroy: () => void;
}

function readHistory(historyKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${SEARCH_HISTORY_PREFIX}${historyKey}`);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeHistory(historyKey: string, values: string[]): void {
  try {
    window.localStorage.setItem(`${SEARCH_HISTORY_PREFIX}${historyKey}`, JSON.stringify(values));
  } catch {
    // ignore storage failures
  }
}

function commitHistoryValue(historyKey: string, rawValue: string): void {
  const value = rawValue.trim();
  if (!value) {
    return;
  }

  const nextHistory = [
    value,
    ...readHistory(historyKey).filter((entry) => entry !== value),
  ].slice(0, SEARCH_HISTORY_LIMIT);

  writeHistory(historyKey, nextHistory);
}

const SETTINGS_BOUNDARY_SELECTORS = '.vertical-tab-content-container, .vertical-tab-content, .modal-content';

function resolveBoundary(el: HTMLElement, explicit?: HTMLElement): HTMLElement | undefined {
  if (explicit) {
    return explicit;
  }
  return el.closest<HTMLElement>(SETTINGS_BOUNDARY_SELECTORS) ?? undefined;
}

export function enhanceSearchInput(options: SearchInputEnhancerOptions): SearchInputEnhancerHandle {
  const { historyKey, inputEl, containerEl, onClear } = options;
  const resolvedBoundary = resolveBoundary(inputEl, options.boundaryEl);
  const ownerDocument = inputEl.ownerDocument;
  const popoverController = SettingsPopoverController.ensureForDocument(ownerDocument);

  const historyPopoverEl = ownerDocument.createElement('div');
  historyPopoverEl.className = 'opencodian-settings-search-history-popover is-hidden';
  historyPopoverEl.setAttribute('aria-label', t('settings.search.recent'));
  ownerDocument.body.appendChild(historyPopoverEl);

  const historyListEl = historyPopoverEl.createDiv({
    cls: 'opencodian-settings-search-history-list',
  });
  inputEl.setAttribute('autocomplete', 'off');

  const clearButtonEl = containerEl.createEl('button', {
    cls: 'opencodian-settings-search-clear is-disabled',
    attr: {
      type: 'button',
      'aria-label': t('settings.search.clear'),
      tabIndex: '-1',
      disabled: 'true',
    },
  });
  setIcon(clearButtonEl, 'x');

  let isFocused = false;

  const hideHistoryPopover = () => {
    historyPopoverEl.toggleClass('is-hidden', true);
    popoverController.hide(historyPopoverEl);
  };

  const showHistoryPopover = () => {
    historyPopoverEl.toggleClass('is-hidden', false);
    popoverController.show({
      anchorEl: inputEl,
      popoverEl: historyPopoverEl,
      matchAnchorWidth: true,
      preferredPlacement: 'bottom-start',
      boundaryEl: resolvedBoundary,
    });
  };

  const renderHistory = () => {
    historyListEl.empty();

    const normalizedQuery = inputEl.value.trim().toLowerCase();
    const history = readHistory(historyKey).filter((value) => {
      const normalizedValue = value.trim().toLowerCase();
      if (normalizedValue === normalizedQuery) {
        return false;
      }

      return normalizedQuery.length === 0 || normalizedValue.includes(normalizedQuery);
    });

    const shouldShow = isFocused && history.length > 0;
    if (!shouldShow) {
      hideHistoryPopover();
      return;
    }

    for (const value of history) {
      const optionEl = historyListEl.createEl('button', {
        cls: 'opencodian-settings-search-history-option',
        text: value,
        attr: {
          type: 'button',
        },
      });
      optionEl.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      optionEl.addEventListener('click', () => {
        inputEl.value = value;
        syncClearButton();
        renderHistory();
        inputEl.dispatchEvent(new Event('input'));
        inputEl.focus();
      });
    }

    showHistoryPopover();
  };

  const syncClearButton = () => {
    const isEmpty = inputEl.value.length === 0;
    clearButtonEl.disabled = isEmpty;
    clearButtonEl.toggleClass('is-disabled', isEmpty);
  };

  const flushPendingCommit = () => {
    const timeoutId = pendingCommitTimeouts.get(historyKey);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      pendingCommitTimeouts.delete(historyKey);
    }

    const pendingValue = pendingCommitValues.get(historyKey);
    if (pendingValue !== undefined) {
      pendingCommitValues.delete(historyKey);
      commitHistoryValue(historyKey, pendingValue);
      renderHistory();
    }
  };

  const scheduleCommit = (value: string) => {
    const timeoutId = pendingCommitTimeouts.get(historyKey);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }

    pendingCommitValues.set(historyKey, value);
    pendingCommitTimeouts.set(historyKey, window.setTimeout(() => {
      pendingCommitTimeouts.delete(historyKey);
      const pendingValue = pendingCommitValues.get(historyKey) ?? '';
      pendingCommitValues.delete(historyKey);
      commitHistoryValue(historyKey, pendingValue);
      renderHistory();
    }, 450));
  };

  const commitCurrentValue = () => {
    commitHistoryValue(historyKey, inputEl.value);
    const timeoutId = pendingCommitTimeouts.get(historyKey);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      pendingCommitTimeouts.delete(historyKey);
    }
    pendingCommitValues.delete(historyKey);
    renderHistory();
  };

  clearButtonEl.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  clearButtonEl.addEventListener('click', () => {
    if (clearButtonEl.disabled) {
      return;
    }

    inputEl.value = '';
    syncClearButton();
    renderHistory();
    onClear?.();
    inputEl.dispatchEvent(new Event('input'));
    inputEl.focus();
  });

  inputEl.addEventListener('input', () => {
    syncClearButton();
    scheduleCommit(inputEl.value);
    renderHistory();
  });
  inputEl.addEventListener('change', () => {
    flushPendingCommit();
  });
  inputEl.addEventListener('blur', () => {
    isFocused = false;
    flushPendingCommit();
    renderHistory();
  });
  inputEl.addEventListener('focus', () => {
    isFocused = true;
    renderHistory();
  });
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      flushPendingCommit();
    }
  });

  renderHistory();
  syncClearButton();

  return {
    commitCurrentValue,
    destroy: () => {
      popoverController.hide(historyPopoverEl);
      historyPopoverEl.remove();
      clearButtonEl.remove();
    },
  };
}
