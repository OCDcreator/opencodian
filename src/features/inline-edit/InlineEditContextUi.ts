/**
 * InlineEditContextUi — the attached-context surface of the floating bar.
 *
 * Two pieces, both about the same thing, both kept out of the overlay so it
 * stays a bar skeleton rather than growing a second feature:
 *
 * - the footer chips: the "add context" affordance and one removable chip per
 *   attached note (`syncAttachChip`, `renderContextChips`);
 * - the picker body: a search field pinned above a scrollable candidate list,
 *   the filtering rule, and the keyboard walk (`renderContextPickerInto`).
 *
 * The overlay still owns the picker's container, placement and Escape ordering
 * (it is a menu like the model/effort dropdowns). Candidates come from the host
 * (`InlineEditHost.listContextFiles`), so nothing here touches the vault.
 */

import { setIcon } from 'obsidian';

import { t } from '../../i18n';
import type { InlineEditContextFile } from './InlineEditTypes';

/** Rows rendered at once; the search field narrows beyond that. */
export const PICKER_MAX_ROWS = 50;

/** The "add context" chip itself; hidden when the host offers no candidates. */
export function syncAttachChip(attach: HTMLButtonElement, supported: boolean, busy: boolean): void {
  attach.style.display = supported ? '' : 'none';
  attach.disabled = !supported || busy;
}

export interface ContextFooterState {
  readonly chips: readonly { readonly path: string; readonly label: string }[];
  readonly supported: boolean;
  readonly busy: boolean;
  readonly onToggle: (path: string) => void;
}

/**
 * Bring the whole footer context surface in line with one render pass. Tolerates
 * missing elements so callers can pass refs that may not have been built yet.
 */
export function syncContextFooter(
  attach: HTMLButtonElement | null,
  row: HTMLElement | null,
  state: ContextFooterState,
): void {
  if (!attach || !row) return;
  syncAttachChip(attach, state.supported, state.busy);
  renderContextChips(row, state.chips, state.onToggle);
}

/**
 * Rebuild the attached-note chips in their own footer row, and hide that row
 * while nothing is attached so the footer does not reserve an empty line.
 *
 * Rebuilt rather than diffed: the list is at most
 * INLINE_EDIT_MAX_ATTACHED_NOTES long and holds no caret or focus state.
 */
export function renderContextChips(
  row: HTMLElement,
  chips: readonly { readonly path: string; readonly label: string }[],
  onToggle: (path: string) => void,
): void {
  row.empty();
  row.style.display = chips.length > 0 ? '' : 'none';
  for (const entry of chips) {
    const removeLabel = t('inlineEdit.context.remove', { name: entry.label });
    const chip = row.createEl('button', {
      cls: 'opencodian-inline-edit-chip opencodian-inline-edit-context-chip',
      attr: { type: 'button', title: removeLabel, 'aria-label': removeLabel },
    });
    const glyph = chip.createSpan({ cls: 'opencodian-inline-edit-chip-prefix' });
    setIcon(glyph, 'file-text');
    chip.createSpan({ cls: 'opencodian-inline-edit-chip-value', text: entry.label });
    const remove = chip.createSpan({ cls: 'opencodian-inline-edit-context-chip-remove' });
    setIcon(remove, 'x');
    chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggle(entry.path);
    });
  }
}

/**
 * Filter candidates by a case-insensitive substring of the path (which
 * contains the name), capped at PICKER_MAX_ROWS.
 */
export function filterContextFiles(
  files: readonly InlineEditContextFile[],
  query: string,
): readonly InlineEditContextFile[] {
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? files.filter((file) => file.path.toLowerCase().includes(needle))
    : files;
  return matched.slice(0, PICKER_MAX_ROWS);
}

export interface ContextPickerOptions {
  readonly files: readonly InlineEditContextFile[];
  /** Attach or detach one path (row click, or Enter on the highlighted row). */
  readonly onToggle: (path: string) => void;
}

/**
 * Render the picker body into `container` and return a re-render callback.
 *
 * The callback takes the current attached set: the picker stays open while the
 * user attaches and detaches, so the check marks are refreshed from fresh state
 * without rebuilding the container (which would drop the query and the focus).
 */
export function renderContextPickerInto(
  container: HTMLElement,
  options: ContextPickerOptions,
): (attachedPaths: ReadonlySet<string>) => void {
  const search = container.createEl('input', {
    type: 'text',
    cls: 'opencodian-inline-edit-picker-search',
    attr: {
      placeholder: t('inlineEdit.context.searchPlaceholder'),
      'aria-label': t('inlineEdit.context.searchPlaceholder'),
    },
  });
  const list = container.createDiv({ cls: 'opencodian-inline-edit-picker-list' });
  let highlighted = 0;
  let visible: readonly InlineEditContextFile[] = [];

  const renderRows = (attachedPaths: ReadonlySet<string>): void => {
    list.empty();
    visible = filterContextFiles(options.files, search.value);
    if (visible.length === 0) {
      list.createDiv({ cls: 'opencodian-inline-edit-picker-empty', text: t('inlineEdit.context.empty') });
      highlighted = -1;
      return;
    }
    highlighted = Math.min(Math.max(highlighted, 0), visible.length - 1);
    visible.forEach((file, index) => {
      const classes = [
        'opencodian-inline-edit-menu-item',
        attachedPaths.has(file.path) ? 'is-checked' : '',
        index === highlighted ? 'is-highlighted' : '',
      ].filter(Boolean).join(' ');
      const row = list.createDiv({ cls: classes });
      const check = row.createSpan({ cls: 'opencodian-inline-edit-menu-item-check' });
      setIcon(check, 'check');
      const glyph = row.createSpan({ cls: 'opencodian-inline-edit-menu-item-glyph' });
      setIcon(glyph, 'file-text');
      row.createSpan({ cls: 'opencodian-inline-edit-menu-item-label', text: file.name });
      // Folder shown as a muted suffix; the label is the basename without the
      // extension, so it cannot be used to slice the path.
      const slash = file.path.lastIndexOf('/');
      if (slash > 0) {
        row.createSpan({ cls: 'opencodian-inline-edit-picker-folder', text: file.path.slice(0, slash) });
      }
      row.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onToggle(file.path);
      });
    });
    if (options.files.length > visible.length) {
      list.createDiv({
        cls: 'opencodian-inline-edit-picker-hint',
        text: t('inlineEdit.context.truncated', { count: PICKER_MAX_ROWS }),
      });
    }
  };

  search.addEventListener('input', () => {
    highlighted = 0;
    renderRows(currentAttached);
  });
  search.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (visible.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlighted = (highlighted + step + visible.length) % visible.length;
      renderRows(currentAttached);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const picked = visible[highlighted];
      if (picked) options.onToggle(picked.path);
    }
    // Escape bubbles to the overlay's document capture handler, which closes
    // the menu before it considers cancelling the edit.
  });

  let currentAttached: ReadonlySet<string> = new Set();
  return (attachedPaths: ReadonlySet<string>) => {
    currentAttached = attachedPaths;
    renderRows(currentAttached);
  };
}

/** Focus the picker's search field once it is in the document. */
export function focusContextPickerSearch(container: HTMLElement, view: { setTimeout(cb: () => void, ms: number): unknown }): void {
  view.setTimeout(() => {
    const search = container.querySelector<HTMLInputElement>('.opencodian-inline-edit-picker-search');
    if (search?.isConnected) search.focus();
  }, 0);
}

export interface OpenContextPickerOptions extends ContextPickerOptions {
  /** Paths already attached, for the initial check marks. */
  readonly attachedPaths: ReadonlySet<string>;
  /** Used to focus the search field after layout settles. */
  readonly view: { setTimeout(cb: () => void, ms: number): unknown };
}

/**
 * Create the picker inside the panel: container, placement under the attach
 * chip, body, and focus. Returns the element (the overlay tracks it as its
 * open menu) and the re-render callback for attached-set changes.
 */
export function openContextPicker(
  panel: HTMLElement,
  options: OpenContextPickerOptions,
): { readonly element: HTMLElement; readonly refresh: (attachedPaths: ReadonlySet<string>) => void } {
  const menu = panel.createDiv({ cls: 'opencodian-inline-edit-menu opencodian-inline-edit-picker' });
  const bar = panel.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-chipbar');
  if (bar) {
    // Line the picker up with the footer's content inset, not with any one
    // chip: the attach chip is the first item of the config row today, and this
    // stays correct if the footer is rearranged again.
    const inset = Number.parseFloat(getComputedStyle(bar).paddingLeft) || 0;
    const panelRect = panel.getBoundingClientRect();
    menu.style.left = `${Math.max(0, bar.getBoundingClientRect().left + inset - panelRect.left)}px`;
  }
  const refresh = renderContextPickerInto(menu, options);
  refresh(options.attachedPaths);
  focusContextPickerSearch(menu, options.view);
  return { element: menu, refresh };
}
