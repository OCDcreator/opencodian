/**
 * InlineEditPresetMenu — trigger detection, filtering, keyboard walk and row
 * rendering for the `#` preset prompt menu of the inline-edit input bar
 * (R-A2), plus the `InlineEditPresetMenuController` that orchestrates the
 * menu against the overlay's shared menu slot.
 *
 * The mechanics live here (not in `InlineEditInputOverlay`) so the overlay
 * stays a bar skeleton — the same extraction rule that produced
 * `InlineEditContextUi` (the overlay has a hard max-lines budget). The token
 * search and the filter are pure functions under test; the rows render into
 * a plain container the way `renderContextPickerInto` does, so jsdom can
 * exercise them without an editor. The overlay keeps the menu container's
 * place in its Escape/pointer-down ordering and delegates everything `#` to
 * the controller.
 *
 * Trigger contract (docs/requirements/flowtext-parity.md R-A2):
 *
 * - `#` opens the menu only when it sits at the start of the input or right
 *   after whitespace, AND nothing non-whitespace immediately follows it — a
 *   `#标签` typed in front of existing text stays a literal Obsidian tag.
 * - While the menu is open, everything up to the cursor that is not
 *   whitespace narrows the menu (`#扩展` filters by `扩展`); whitespace or
 *   deleting the `#` closes it.
 * - Selecting a preset replaces the `#…` token with the preset body and does
 *   NOT submit; Escape closes the menu and leaves the input untouched.
 */

import { setIcon } from 'obsidian';

import type { InlineEditPresetPrompt } from '../../core/types';
import { t } from '../../i18n';

/** The active `#…` token in the input, ending at the cursor. */
export interface PresetMenuToken {
  /** Offset of the `#` that owns the token. */
  readonly tokenStart: number;
  /** Text between the `#` and the cursor (the live filter query). */
  readonly query: string;
}

/**
 * Find the `#` token active at `cursor`: the closest `#` to the left that
 * sits at offset 0 or directly after whitespace, with no whitespace between
 * it and the cursor. Returns null when no such token exists.
 */
export function findPresetTokenAtCursor(value: string, cursor: number): PresetMenuToken | null {
  if (cursor < 0 || cursor > value.length) return null;
  const beforeCursor = value.slice(0, cursor);
  let hashIndex = -1;
  for (let index = beforeCursor.length - 1; index >= 0; index--) {
    const ch = beforeCursor[index];
    if (ch === '#') {
      hashIndex = index;
      break;
    }
    if (/\s/.test(ch)) break;
  }
  if (hashIndex < 0) return null;
  if (hashIndex > 0 && !/\s/.test(value[hashIndex - 1])) return null;
  const query = beforeCursor.slice(hashIndex + 1);
  if (/\s/.test(query)) return null;
  return { tokenStart: hashIndex, query };
}

/**
 * True when typing just produced a standalone `#` at the cursor: the previous
 * edit inserted exactly `#` at `cursor - 1` and the character after the cursor
 * is end-of-input or whitespace. This is the only moment a closed menu opens
 * — filtering while open uses `findPresetTokenAtCursor` instead.
 */
export function didTypeStandaloneHash(previousValue: string, value: string, cursor: number): boolean {
  if (cursor <= 0 || cursor > value.length) return false;
  if (value[cursor - 1] !== '#') return false;
  if (previousValue !== value.slice(0, cursor - 1) + value.slice(cursor)) return false;
  return cursor >= value.length || /\s/.test(value[cursor]);
}

/**
 * Case-insensitive substring filter over label and prompt body, preserving
 * the catalog order. An empty (or whitespace-only) query returns everything.
 */
export function filterInlineEditPresets(
  presets: readonly InlineEditPresetPrompt[],
  query: string,
): InlineEditPresetPrompt[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...presets];
  return presets.filter((preset) =>
    preset.label.toLowerCase().includes(needle)
    || preset.prompt.toLowerCase().includes(needle),
  );
}

/**
 * Replace the `#…` token around `cursorPos` with `replacement`, preserving
 * surrounding text. The token spans from its `#` to the next whitespace (or
 * end of input), so text after the cursor that belongs to the token is
 * replaced too. Falls back to replacing the whole input when no `#` exists.
 */
export function replacePresetTokenAtCursor(
  current: string,
  cursorPos: number,
  replacement: string,
): { value: string; cursorPos: number } {
  const token = findPresetTokenAtCursor(current, cursorPos);
  if (!token) {
    return { value: replacement, cursorPos: replacement.length };
  }
  let tokenEnd = token.tokenStart + 1;
  while (tokenEnd < current.length && !/\s/.test(current[tokenEnd])) {
    tokenEnd++;
  }
  const before = current.slice(0, token.tokenStart);
  const after = current.slice(tokenEnd);
  return {
    value: before + replacement + after,
    cursorPos: before.length + replacement.length,
  };
}

/**
 * Move a menu selection by `delta`, wrapping around both ends — the full
 * keyboard walk is ↑/↓ + Enter, so reaching past the last row must come back
 * to the first, mirroring the context picker's walk.
 */
export function movePresetSelection(selectedIndex: number, itemCount: number, delta: number): number {
  if (itemCount <= 0) return -1;
  return (selectedIndex + delta + itemCount) % itemCount;
}

export interface PresetMenuRenderOptions {
  readonly items: readonly InlineEditPresetPrompt[];
  /** Keyboard-highlighted row; -1 renders no highlight. */
  readonly selectedIndex: number;
  readonly onHoverItem: (index: number) => void;
  readonly onSelectItem: (index: number) => void;
}

/**
 * (Re)render the menu rows into `container` (the overlay's menu element).
 * Rows are rebuilt per pass: the list is small and holds no caret state. The
 * prompt body rides on the row title so a hover reveals what will be filled
 * in without crowding the single-line rows.
 */
export function renderPresetMenuInto(
  container: HTMLElement,
  options: PresetMenuRenderOptions,
): void {
  container.empty();
  if (options.items.length === 0) {
    container.createDiv({ cls: 'opencodian-inline-edit-picker-empty', text: t('inlineEdit.presetMenu.empty') });
    return;
  }
  options.items.forEach((preset, index) => {
    const row = container.createDiv({
      cls: [
        'opencodian-inline-edit-menu-item',
        'opencodian-inline-edit-menu-item-preset',
        index === options.selectedIndex ? 'is-highlighted' : '',
      ].filter(Boolean).join(' '),
      attr: { role: 'option', 'aria-selected': index === options.selectedIndex ? 'true' : 'false' },
    });
    row.title = preset.prompt;
    const glyph = row.createSpan({ cls: 'opencodian-inline-edit-menu-item-glyph' });
    setIcon(glyph, 'hash');
    row.createSpan({ cls: 'opencodian-inline-edit-menu-item-label', text: preset.label });
    row.addEventListener('pointerenter', () => options.onHoverItem(index));
    row.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onSelectItem(index);
    });
  });
}

/**
 * The seam between the controller and the overlay. The overlay implements it
 * with thin closures over its own private state; the controller never reaches
 * past it, which keeps the overlay the single owner of the shared menu slot.
 */
export interface InlineEditPresetMenuHost {
  /** The bar's instruction field (the `#` trigger surface). */
  getField(): HTMLTextAreaElement | null;
  /** The bar root element; the menu container is created inside it. */
  getPanel(): HTMLElement | null;
  /** Effective presets (builtins + user-defined) of the current render pass. */
  getPresets(): readonly InlineEditPresetPrompt[];
  /** True when the overlay's shared menu slot currently holds the preset menu. */
  isOpen(): boolean;
  /** True when the shared menu slot is taken by ANY menu (model/effort/context). */
  isMenuSlotTaken(): boolean;
  /** Claim the shared menu slot with the preset menu's container element. */
  attachMenu(element: HTMLElement): void;
  /** Release the shared menu slot (the overlay's unified close path). */
  detachMenu(): void;
  /** After a preset fill: grow the field and reposition the bar. */
  afterFill(): void;
}

/**
 * Owns the preset menu's lifecycle against the overlay: open-on-`#`, live
 * filtering, the keyboard walk, mouse selection, and fill-without-submit.
 * The overlay forwards field/pointer/escape events into these methods and
 * calls `reset()` from its unified `closeMenu()` so every exit path (Escape,
 * outside pointer-down, chip menu opening, bar teardown) clears the menu the
 * same way.
 */
export class InlineEditPresetMenuController {
  private token: PresetMenuToken | null = null;
  private items: readonly InlineEditPresetPrompt[] = [];
  private selectedIndex = 0;
  private menuEl: HTMLElement | null = null;
  /** Field value seen by the last sync; distinguishes "typed #" from edits. */
  private lastFieldValue = '';
  /** True while an IME composition owns the field; triggers stay off. */
  private composing = false;
  private readonly boundFields = new WeakSet<HTMLTextAreaElement>();

  constructor(private readonly host: InlineEditPresetMenuHost) {}

  /**
   * Bind the preset-specific field listeners once per element: cursor moves
   * re-sync the open menu, and the composition flag gates triggers. (The
   * overlay keeps the input/keystroke-growing listeners; those concern the
   * field itself, not the menu.)
   */
  bindField(field: HTMLTextAreaElement): void {
    if (this.boundFields.has(field)) return;
    this.boundFields.add(field);
    field.addEventListener('click', () => { this.sync(); });
    field.addEventListener('keyup', (event) => {
      if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
        this.sync();
      }
    });
    field.addEventListener('compositionstart', () => { this.composing = true; });
    field.addEventListener('compositionend', () => { this.composing = false; });
  }

  /**
   * Reconcile the menu with the field's current state. Menu closed: open it
   * only when this very input typed a standalone `#`. Menu open: follow the
   * token at the cursor — same `#` narrows the filter; losing the `#`
   * (deletion, whitespace, cursor moved away) closes the menu.
   */
  sync(): void {
    const field = this.host.getField();
    if (!field || field.disabled || this.composing) return;
    const value = field.value;
    const cursor = field.selectionStart ?? value.length;
    const token = findPresetTokenAtCursor(value, cursor);
    if (!this.host.isOpen()) {
      if (this.host.isMenuSlotTaken()) return;
      const typedHash = didTypeStandaloneHash(this.lastFieldValue, value, cursor);
      this.lastFieldValue = value;
      if (!typedHash || !token) return;
      this.open(token);
      return;
    }
    this.lastFieldValue = value;
    if (!token || token.tokenStart !== this.token?.tokenStart) {
      this.closeSelf();
      this.lastFieldValue = value;
      return;
    }
    this.token = token;
    this.refresh();
  }

  /** Re-filter with the live query and rebuild the rows; clamps the walk. */
  refresh(): void {
    const menu = this.menuEl;
    if (!this.host.isOpen() || !this.token || !menu) return;
    this.items = filterInlineEditPresets(this.host.getPresets(), this.token.query);
    this.selectedIndex = Math.min(
      Math.max(this.selectedIndex, 0),
      Math.max(0, this.items.length - 1),
    );
    renderPresetMenuInto(menu, {
      items: this.items,
      selectedIndex: this.selectedIndex,
      onHoverItem: (index) => {
        if (this.selectedIndex === index) return;
        this.selectedIndex = index;
        this.refresh();
      },
      onSelectItem: (index) => { this.applyAt(index); },
    });
  }

  /**
   * Keyboard walk for an open menu; returns true when the event was consumed.
   * Enter fills the preset body in place of the `#…` token and never submits;
   * Escape is handled one level up by the overlay's document capture listener
   * (close the menu, keep the input), which runs before keydown reaches the
   * field.
   */
  handleKeydown(event: KeyboardEvent): boolean {
    if (!this.host.isOpen()) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex = movePresetSelection(
        this.selectedIndex,
        this.items.length,
        event.key === 'ArrowDown' ? 1 : -1,
      );
      this.refresh();
      this.scrollSelectionIntoView();
      return true;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.applyAt(this.selectedIndex);
      return true;
    }
    return false;
  }

  /** Clear menu state; the overlay calls this from its unified close path. */
  reset(): void {
    this.menuEl = null;
    this.clearState();
    this.lastFieldValue = '';
    this.composing = false;
  }

  private clearState(): void {
    this.token = null;
    this.items = [];
    this.selectedIndex = 0;
  }

  private closeSelf(): void {
    this.host.detachMenu();
    this.reset();
  }

  private open(token: PresetMenuToken): void {
    const panel = this.host.getPanel();
    if (!panel) return;
    this.clearState();
    this.token = token;
    const menu = panel.createDiv({
      cls: 'opencodian-inline-edit-menu opencodian-inline-edit-preset-menu',
    });
    menu.style.left = '0';
    this.menuEl = menu;
    this.host.attachMenu(menu);
    this.refresh();
  }

  private applyAt(index: number): void {
    const field = this.host.getField();
    const preset = this.items[index];
    if (!field || !preset) return;
    const cursor = field.selectionStart ?? field.value.length;
    const next = replacePresetTokenAtCursor(field.value, cursor, preset.prompt);
    field.value = next.value;
    field.focus();
    field.setSelectionRange(next.cursorPos, next.cursorPos);
    this.closeSelf();
    // reset() clears the remembered value; restore it so the very next `#`
    // typed after a fill still counts as a fresh trigger.
    this.lastFieldValue = field.value;
    this.host.afterFill();
  }

  private scrollSelectionIntoView(): void {
    const selected = this.menuEl?.querySelector<HTMLElement>(
      '.opencodian-inline-edit-menu-item.is-highlighted',
    );
    if (selected && typeof selected.scrollIntoView === 'function') {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }
}
