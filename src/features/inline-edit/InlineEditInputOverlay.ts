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
  /** Provider id for the row icon; `null`/absent renders no icon. */
  readonly iconProvider?: string | null;
}

/** Chip (dropdown button) state; `null` hides the chip. */
export interface InlineEditOverlayChipState {
  readonly label: string;
  /** Provider id for the chip icon (model chip only); falls back to a lucide glyph. */
  readonly iconProvider?: string | null;
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
  /** Provider icon factory (same pipeline as the composer model selector). */
  createProviderIcon?(providerId: string, size: number): HTMLElement | null;
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
  private submitEl: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private menuKind: 'model' | 'effort' | null = null;
  private state: InlineEditOverlayState | null = null;
  private anchorPos = 0;
  private frame = 0;
  private spinOn = false;
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

    if (this.submitEl && this.spinOn !== state.busy) {
      this.spinOn = state.busy;
      setIcon(this.submitEl, state.busy ? 'loader-circle' : 'corner-down-left');
      this.submitEl.classList.toggle('opencodian-inline-edit-spinning', state.busy);
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
    this.submitEl = null;
    this.spinOn = false;
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
    const root = this.view.dom.createEl('div', { cls: 'opencodian-inline-edit opencodian-inline-edit-overlay' });

    // Input first: the instruction is the primary task, so it owns the
    // top row; model/effort configuration lives in the meta footer below.
    const row = root.createDiv({ cls: 'opencodian-inline-edit-inputrow' });
    const lead = row.createSpan({ cls: 'opencodian-inline-edit-inputlead' });
    setIcon(lead, 'sparkles');
    const field = row.createEl('input', {
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

    const submit = row.createEl('button', {
      cls: 'opencodian-inline-edit-overlay-submit',
      attr: { type: 'button', 'aria-label': t('inlineEdit.action.submit'), title: t('inlineEdit.action.submit') },
    });
    setIcon(submit, 'corner-down-left');
    submit.addEventListener('click', (event) => {
      event.preventDefault();
      this.callbacks.onSubmit(field.value);
    });

    const close = row.createEl('button', {
      cls: 'opencodian-inline-edit-overlay-close',
      attr: { type: 'button', 'aria-label': t('inlineEdit.action.cancel'), title: t('inlineEdit.action.cancel') },
    });
    setIcon(close, 'x');
    close.addEventListener('click', (event) => {
      event.preventDefault();
      this.callbacks.onReject();
    });

    const bar = root.createDiv({ cls: 'opencodian-inline-edit-chipbar' });
    this.buildChip(bar, 'model');
    this.buildChip(bar, 'effort');

    this.view.dom.appendChild(root);
    this.panel = root;
    this.field = field;
    this.submitEl = submit;
  }

  private buildChip(bar: HTMLElement, kind: 'model' | 'effort'): void {
    const chip = bar.createEl('button', {
      cls: `opencodian-inline-edit-chip opencodian-inline-edit-chip-${kind}`,
      attr: { type: 'button' },
    });
    // Icon slot is filled by syncChip: provider icon for the model chip,
    // a lucide glyph for effort. The full name lives on the tooltip.
    chip.createSpan({ cls: 'opencodian-inline-edit-chip-prefix' });
    chip.createSpan({ cls: 'opencodian-inline-edit-chip-value' });
    const chevron = chip.createSpan({ cls: 'opencodian-inline-edit-chip-chevron' });
    setIcon(chevron, 'chevron-down');
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
    const prefixText = t(kind === 'model' ? 'inlineEdit.bar.model' : 'inlineEdit.bar.effort');
    const valueText = state.loading
      ? t('inlineEdit.bar.loading')
      : state.label || t('inlineEdit.bar.default');

    const prefix = chip.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-chip-prefix');
    if (prefix) {
      const provider = kind === 'model' ? state.iconProvider ?? null : null;
      const iconKey = provider ? `provider:${provider}` : `lucide:${kind}`;
      if (prefix.dataset.iconKey !== iconKey) {
        prefix.dataset.iconKey = iconKey;
        prefix.empty();
        const iconEl = provider ? this.callbacks.createProviderIcon?.(provider, 13) : null;
        if (iconEl) {
          iconEl.setAttribute('aria-hidden', 'true');
          prefix.appendChild(iconEl);
        } else {
          setIcon(prefix, kind === 'model' ? 'cpu' : 'brain');
        }
      }
    }

    // The effort chip keeps its label word visible — a bare "high" does not
    // read as a thinking-effort selector. The model chip stays icon + name.
    const value = chip.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-chip-value');
    const displayText = kind === 'effort' ? `${prefixText} ${valueText}` : valueText;
    if (value && value.textContent !== displayText) value.textContent = displayText;

    const label = `${prefixText}: ${valueText}`;
    if (chip.title !== label) chip.title = label;
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
      const textEl = existing.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-alert-text');
      if (textEl && textEl.textContent !== text) textEl.textContent = text;
      return;
    }
    const el = panel.createDiv({ cls });
    const icon = el.createSpan({ cls: 'opencodian-inline-edit-alert-icon' });
    setIcon(icon, cls === 'opencodian-inline-edit-error' ? 'alert-circle' : 'message-circle');
    el.createDiv({ cls: 'opencodian-inline-edit-alert-text', text });
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
    const clearActive = !chip.label || chip.label === t('inlineEdit.bar.default');
    const renderEntry = (entry: InlineEditOverlayMenuItem): void => {
      const item = menu.createDiv({
        cls: `opencodian-inline-edit-menu-item${entry.active ? ' is-active' : ''}`,
      });
      const check = item.createSpan({ cls: 'opencodian-inline-edit-menu-item-check' });
      setIcon(check, 'check');
      // Every row carries a 13px icon slot so labels stay aligned: provider
      // brand icons for models, signal bars for effort levels, a glyph for
      // the "clear override" row.
      if (kind === 'model') {
        const iconEl = entry.id !== null && entry.iconProvider
          ? this.callbacks.createProviderIcon?.(entry.iconProvider, 13)
          : null;
        if (iconEl) {
          iconEl.classList.add('opencodian-inline-edit-menu-item-icon');
          iconEl.setAttribute('aria-hidden', 'true');
          item.appendChild(iconEl);
        } else {
          const glyph = item.createSpan({ cls: 'opencodian-inline-edit-menu-item-glyph' });
          setIcon(glyph, entry.id === null ? 'messages-square' : 'cpu');
        }
      } else {
        const glyph = item.createSpan({ cls: 'opencodian-inline-edit-menu-item-glyph' });
        setIcon(glyph, effortMenuIcon(entry.id));
      }
      item.createSpan({ cls: 'opencodian-inline-edit-menu-item-label', text: entry.label });
      item.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = entry.id;
        this.closeMenu();
        if (kind === 'model') this.callbacks.onPickModel(id);
        else this.callbacks.onPickEffort(id);
      });
    };
    renderEntry({ id: null, label: clearLabel, active: clearActive });
    if (chip.items.length > 0) {
      menu.createDiv({ cls: 'opencodian-inline-edit-menu-separator' });
      for (const entry of chip.items) {
        renderEntry(entry);
      }
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

/** Menu row glyph for an effort level: signal bars echo "thinking intensity". */
function effortMenuIcon(id: string | null): string {
  if (id === 'low') return 'signal-low';
  if (id === 'medium') return 'signal-medium';
  if (id === 'high') return 'signal-high';
  return 'rotate-ccw';
}
