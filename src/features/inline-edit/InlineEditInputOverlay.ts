/**
 * InlineEditInputOverlay — the floating instruction bar for inline edit.
 *
 * Replaces the original in-flow CM6 block widget input: the bar floats above
 * the editor content, anchored at the edit anchor, so it never pushes text
 * apart. It repositions on scroll and follows document edits (the anchor
 * offset is remapped through every transaction), and it dismisses on Escape,
 * outside pointer-down, or focus leaving the panel — the "focus out means
 * done" behaviour users expect from a floating affordance.
 *
 * Measurement rules mirror `InlineEditSelectionAffordance`: `coordsAtPos` and
 * `getBoundingClientRect` only run inside a scheduled animation frame, never
 * in the CM6 update cycle. Document-change observation rides a single global
 * `updateListener` extension (`inlineEditOverlayTrackerExtension`) registered
 * once via `registerEditorExtension`; the active overlay for a view is found
 * through a WeakMap, so per-edit lifecycles never accumulate CM6 config.
 *
 * The preview phase keeps its in-flow replace decoration (InlineEditWidgets);
 * only the instruction bar floats.
 */

import type { Extension } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import { setIcon } from 'obsidian';

import { t } from '../../i18n';
import type { InlineEditChoice } from './InlineEditTypes';

/** Gap between the anchor line's bottom and the panel top; keep in sync with CSS. */
const PANEL_GAP = 6;
/** Horizontal inset used when clamping the panel inside the editor DOM. */
const PANEL_INSET = 8;

/** One dropdown entry; `id === null` is the "clear override" row. */
export interface InlineEditOverlayMenuItem {
  readonly id: string | null;
  readonly label: string;
  readonly active?: boolean;
}

/** Chip (dropdown button) state; `null` hides the chip. */
export interface InlineEditOverlayChipState {
  readonly label: string;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly items: readonly InlineEditOverlayMenuItem[];
}

/** Everything the floating bar renders for one render pass. */
export interface InlineEditOverlayState {
  readonly reply: string;
  readonly error: string;
  readonly busy: boolean;
  readonly value: string;
  readonly placeholder: string;
  readonly model: InlineEditOverlayChipState | null;
  readonly effort: InlineEditOverlayChipState | null;
}

export interface InlineEditOverlayCallbacks {
  onSubmit(instruction: string): void;
  onReject(): void;
  onPickModel(id: string | null): void;
  onPickEffort(id: string | null): void;
}

const activeOverlays = new WeakMap<EditorView, InlineEditInputOverlay>();

/**
 * The single CM6 extension that remaps overlay anchors through document
 * changes. Register once with `registerEditorExtension`; it is a no-op for
 * editors without an active overlay.
 */
export function inlineEditOverlayTrackerExtension(): Extension {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (!update.docChanged) return;
    activeOverlays.get(update.view)?.handleDocUpdate(update);
  });
}

export class InlineEditInputOverlay {
  private panel: HTMLElement | null = null;
  private field: HTMLInputElement | null = null;
  private menu: HTMLElement | null = null;
  private menuKind: 'model' | 'effort' | null = null;
  private state: InlineEditOverlayState | null = null;
  private anchorPos = 0;
  private frame = 0;
  private lastLeft: number | null = null;
  private lastTop: number | null = null;
  private readonly handleDocKeydown: (event: KeyboardEvent) => void;
  private readonly handleDocPointerDown: (event: PointerEvent | MouseEvent) => void;
  private readonly handleFocusOut: (event: FocusEvent) => void;
  private readonly handleScroll = (): void => { this.scheduleSync(); };

  constructor(
    private readonly view: EditorView,
    private readonly callbacks: InlineEditOverlayCallbacks,
  ) {
    const doc = view.dom.ownerDocument;
    this.handleDocKeydown = (event) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      if (this.menu) {
        event.preventDefault();
        this.closeMenu();
        return;
      }
      event.preventDefault();
      this.callbacks.onReject();
    };
    this.handleDocPointerDown = (event) => {
      const target = event.target;
      if (target instanceof Node && this.panel?.contains(target)) {
        // Inside the panel but outside the open menu: close just the menu.
        if (this.menu && !this.menu.contains(target)) this.closeMenu();
        return;
      }
      this.callbacks.onReject();
    };
    this.handleFocusOut = (event) => {
      // "Focus left the panel" dismissal. `relatedTarget == null` (window
      // deactivation, alt-tab) intentionally keeps the edit alive.
      const next = event.relatedTarget;
      if (!next) return;
      if (next instanceof Node && this.panel?.contains(next)) return;
      this.callbacks.onReject();
    };
    doc.addEventListener('keydown', this.handleDocKeydown, true);
    doc.addEventListener('pointerdown', this.handleDocPointerDown, true);
    view.scrollDOM.addEventListener('scroll', this.handleScroll, { passive: true });
    view.dom.addEventListener('focusout', this.handleFocusOut);
    activeOverlays.set(view, this);
  }

  /** Show (or keep showing) the bar anchored at `pos`. */
  show(pos: number): void {
    this.anchorPos = pos;
    if (!this.panel) {
      this.buildDom();
    }
    this.scheduleSync();
  }

  /** Refresh rendered content without recreating the input (keeps focus). */
  update(state: InlineEditOverlayState): void {
    this.state = state;
    if (!this.panel) this.buildDom();
    const panel = this.panel;
    if (!panel) return;

    const replyEl = panel.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-reply');
    this.syncTextBlock(replyEl, 'opencodian-inline-edit-reply', state.reply, true);
    const errorEl = panel.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-error');
    this.syncTextBlock(errorEl, 'opencodian-inline-edit-error', state.error, true);

    panel.classList.toggle('opencodian-inline-edit-busy', state.busy);

    if (this.field) {
      if (this.field.placeholder !== state.placeholder) {
        this.field.placeholder = state.placeholder;
      }
      // Only write the value when it actually differs — never steal keystrokes.
      if (state.value !== this.field.value) {
        this.field.value = state.value;
      }
      this.field.disabled = state.busy;
    }

    this.syncChip('model', state.model);
    this.syncChip('effort', state.effort);
    if (this.menu && this.menuKind) {
      const chip = state[this.menuKind];
      if (!chip) {
        this.closeMenu();
      } else {
        this.renderMenu(this.menuKind, chip);
      }
    }
    this.scheduleSync();
  }

  /** Tear the panel down and release every listener. */
  hide(): void {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    const doc = this.view.dom.ownerDocument;
    doc.removeEventListener('keydown', this.handleDocKeydown, true);
    doc.removeEventListener('pointerdown', this.handleDocPointerDown, true);
    this.view.scrollDOM.removeEventListener('scroll', this.handleScroll);
    this.view.dom.removeEventListener('focusout', this.handleFocusOut);
    if (activeOverlays.get(this.view) === this) {
      activeOverlays.delete(this.view);
    }
    this.closeMenu();
    this.panel?.remove();
    this.panel = null;
    this.field = null;
    this.state = null;
  }

  /** Focus the instruction input, deferred until layout settles. */
  focusInput(): void {
    const field = this.field;
    if (!field) return;
    this.view.dom.ownerDocument.defaultView?.setTimeout(() => {
      if (field.isConnected) field.focus();
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private buildDom(): void {
    const root = this.view.dom.createEl('div', { cls: 'opencodian-inline-edit-overlay' });

    const bar = root.createDiv({ cls: 'opencodian-inline-edit-chipbar' });
    this.buildChip(bar, 'model');
    this.buildChip(bar, 'effort');

    const close = bar.createEl('button', {
      cls: 'opencodian-inline-edit-overlay-close',
      attr: { type: 'button', 'aria-label': t('inlineEdit.action.cancel'), title: t('inlineEdit.action.cancel') },
    });
    setIcon(close, 'x');
    close.addEventListener('click', (event) => {
      event.preventDefault();
      this.callbacks.onReject();
    });

    const field = root.createEl('input', {
      type: 'text',
      cls: 'opencodian-inline-edit-field',
      attr: { 'aria-label': t('inlineEdit.command.name') },
    });
    field.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.callbacks.onSubmit(field.value);
      }
      // Escape bubbles to the document capture handler, which owns dismissal.
    });

    const submit = root.createEl('button', {
      cls: 'opencodian-inline-edit-overlay-submit',
      attr: { type: 'button', 'aria-label': t('inlineEdit.action.submit'), title: t('inlineEdit.action.submit') },
    });
    setIcon(submit, 'corner-down-left');
    submit.addEventListener('click', (event) => {
      event.preventDefault();
      this.callbacks.onSubmit(field.value);
    });

    this.view.dom.appendChild(root);
    this.panel = root;
    this.field = field;
  }

  private buildChip(bar: HTMLElement, kind: 'model' | 'effort'): void {
    const chip = bar.createEl('button', {
      cls: `opencodian-inline-edit-chip opencodian-inline-edit-chip-${kind}`,
      attr: { type: 'button' },
    });
    chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMenu(kind);
    });
  }

  private syncChip(kind: 'model' | 'effort', state: InlineEditOverlayChipState | null): void {
    const chip = this.panel?.querySelector<HTMLButtonElement>(`:scope .opencodian-inline-edit-chip-${kind}`);
    if (!chip) return;
    if (!state) {
      chip.style.display = 'none';
      chip.disabled = true;
      return;
    }
    chip.style.display = '';
    chip.disabled = state.disabled === true;
    const label = state.loading
      ? t('inlineEdit.bar.loading')
      : state.label || t('inlineEdit.bar.default');
    const text = `${t(kind === 'model' ? 'inlineEdit.bar.model' : 'inlineEdit.bar.effort')}: ${label}`;
    if (chip.textContent !== text) chip.textContent = text;
  }

  private syncTextBlock(
    existing: HTMLElement | null,
    cls: string,
    text: string,
    prepend: boolean,
  ): void {
    const panel = this.panel;
    if (!panel) return;
    if (!text) {
      existing?.remove();
      return;
    }
    if (existing) {
      if (existing.textContent !== text) existing.textContent = text;
      return;
    }
    const el = panel.createDiv({ cls, text });
    if (prepend) panel.prepend(el);
  }

  private toggleMenu(kind: 'model' | 'effort'): void {
    if (this.menuKind === kind && this.menu) {
      this.closeMenu();
      return;
    }
    this.closeMenu();
    const state = this.state?.[kind];
    if (!state || !this.panel) return;
    this.menuKind = kind;
    const menu = this.panel.createDiv({ cls: 'opencodian-inline-edit-menu' });
    this.menu = menu;
    this.renderMenu(kind, state);
  }

  private renderMenu(kind: 'model' | 'effort', chip: InlineEditOverlayChipState): void {
    const menu = this.menu;
    if (!menu) return;
    const anchorChip = this.panel?.querySelector<HTMLElement>(`:scope .opencodian-inline-edit-chip-${kind}`);
    menu.empty();
    const clearLabel = kind === 'model' ? t('inlineEdit.bar.followChat') : t('inlineEdit.bar.effortDefault');
    const entries: InlineEditOverlayMenuItem[] = [
      { id: null, label: clearLabel, active: chip.label === '' || chip.label === t('inlineEdit.bar.default') },
      ...chip.items,
    ];
    for (const entry of entries) {
      const item = menu.createDiv({
        cls: `opencodian-inline-edit-menu-item${entry.active ? ' is-active' : ''}`,
        text: entry.label,
      });
      item.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = entry.id;
        this.closeMenu();
        if (kind === 'model') this.callbacks.onPickModel(id);
        else this.callbacks.onPickEffort(id);
      });
    }
    // Anchor the menu under its chip, clamped inside the panel.
    if (anchorChip && this.panel) {
      const chipRect = anchorChip.getBoundingClientRect();
      const panelRect = this.panel.getBoundingClientRect();
      const localLeft = chipRect.left - panelRect.left;
      menu.style.left = `${Math.max(0, localLeft)}px`;
    }
  }

  private closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
    this.menuKind = null;
  }

  handleDocUpdate(update: ViewUpdate): void {
    this.anchorPos = update.changes.mapPos(this.anchorPos);
    this.scheduleSync();
  }

  private scheduleSync(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.sync();
    });
  }

  private sync(): void {
    const panel = this.panel;
    if (!panel || !panel.isConnected) return;
    const coords = this.view.coordsAtPos(this.anchorPos);
    if (!coords) {
      // Anchor scrolled out of the render window: keep the last position so
      // the bar never disappears while the user is typing into it.
      if (this.lastLeft !== null) panel.style.left = `${this.lastLeft}px`;
      if (this.lastTop !== null) panel.style.top = `${this.lastTop}px`;
      return;
    }
    const domRect = this.view.dom.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const maxLeft = Math.max(PANEL_INSET, this.view.dom.clientWidth - panelWidth - PANEL_INSET);
    const rawLeft = coords.left - domRect.left;
    const left = Math.min(Math.max(rawLeft, PANEL_INSET), maxLeft);
    const top = Math.max(0, coords.bottom - domRect.top + PANEL_GAP);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    this.lastLeft = left;
    this.lastTop = top;
  }
}

/** Convert host `InlineEditChoice[]` entries into menu items with ids. */
export function choicesToMenuItems(
  choices: readonly InlineEditChoice[],
  activeId: string | null,
): InlineEditOverlayMenuItem[] {
  return choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    active: activeId !== null && choice.id === activeId,
  }));
}
