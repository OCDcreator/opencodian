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
 * once via `registerEditorExtension`; active overlays for a view are tracked
 * in a WeakMap of sets, so parallel edits in one editor (R-A5) each get their
 * own bar without accumulating CM6 config.
 *
 * Dismissal scoping (R-A5): the document-level Escape / outside-pointerdown /
 * focusout handlers are built by `InlineEditOverlayDismissal` on top of the
 * pure `resolveDismissOwner`, so exactly the anchored bar answers an event
 * and passive paths only dismiss pristine bars (typed input is never lost to
 * a stray click; focus moving between bars keeps both alive).
 *
 * Parallel placement (R-A5): the geometry math lives in
 * `InlineEditOverlayPrimitives` — `placeInlineEditPanel` composes the
 * anchor-preferred top with sibling-collision resolution and writes the
 * styles; this file only measures and forwards numbers. A collision-displaced
 * panel gets a hairline anchor link (`--ocie-anchor-link-length`) back to its
 * anchor line, and focus/pointer ownership (`is-focused`) raises a panel
 * above its siblings so the one being typed into never paints under a
 * later-mounted neighbour.
 *
 * The preview phase keeps its in-flow replace decoration (InlineEditWidgets);
 * only the instruction bar floats. A mode row at the top switches between
 * 选区 / 光标 / 整篇 forms before the first turn (R-A6).
 */

import type { Extension } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import { setIcon } from 'obsidian';

import type { InlineEditPresetPrompt } from '../../core/types';
import { t } from '../../i18n';
import { OPENCODIAN_APP_ICON_ID } from '../../shared/brandingWordmark';
import { installInlineEditContextDrop, openContextPicker, syncContextFooter } from './InlineEditContextUi';
import {
  attachInlineEditImageSurface,
  type InlineEditImageChipModel,
  type InlineEditImageSurface,
} from './InlineEditImageChip';
import { buildInlineEditModeRow, type InlineEditModeRow } from './InlineEditModeSwitch';
import {
  buildInlineEditConfigChip,
  buildInlineEditImageGenChip,
  type InlineEditImageGenChipState,
  renderInlineEditConfigMenu,
  syncInlineEditConfigChip,
  syncInlineEditImageGenChip,
} from './InlineEditOverlayChips';
import {
  bindInlineEditOverlayDismissal,
  type InlineEditDismissalHost,
} from './InlineEditOverlayDismissal';
import {
  claimPanelForeground,
  focusInstructionField,
  type InlineEditOverlayMenuItem,
  type InlineEditPanelBand,
  placeInlineEditPanel,
  syncInstructionFieldHeight,
} from './InlineEditOverlayPrimitives';
import { InlineEditPresetMenuController } from './InlineEditPresetMenu';
import type {
  InlineEditContextFile,
  InlineEditContextGroupRow,
  InlineEditMode,
} from './InlineEditTypes';

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
  /** Attached context entries, in pick order; `[]` renders no chips. */
  readonly context: readonly InlineEditOverlayContextChip[];
  /** Persisted context groups for the picker's topic section (R-B2). */
  readonly groups: readonly InlineEditContextGroupRow[];
  /** False hides the "add context" affordance (host has no vault to offer). */
  readonly contextSupported: boolean;
  /**
   * Effective `#` preset list (builtins + user-defined) for the preset menu.
   * Always non-empty in practice: builtins are always composed on top.
   */
  readonly presets: readonly InlineEditPresetPrompt[];
  /** The image attached to this edit, if any (R-A4, at most one). */
  readonly image: InlineEditImageChipModel | null;
  /** False when the backend cannot transport images; hides the surface. */
  readonly imageSupported: boolean;
  /** Current request form (R-A6). */
  readonly mode: InlineEditMode;
  /** Modes the bar may offer for this edit (e.g. no 选区 on an empty selection). */
  readonly modeOptions: readonly InlineEditMode[];
  /** False disables the mode row (busy, or the session already started). */
  readonly modeSwitchable: boolean;
  /** R-C2 image-generation chip; `null` or `available: false` hides it. */
  readonly imageGen: InlineEditImageGenChipState | null;
}

/** One attached entry as the bar renders it. */
export interface InlineEditOverlayContextChip {
  readonly path: string;
  readonly label: string;
  /** File or directory entry (R-A7); drives the chip glyph. */
  readonly kind: 'file' | 'folder';
}

export interface InlineEditOverlayCallbacks {
  /** Owning edit id (R-A5): focus registration and per-edit callbacks use it. */
  readonly editId: string;
  onSubmit(instruction: string): void;
  onReject(): void;
  onPickModel(id: string | null): void;
  onPickEffort(id: string | null): void;
  /** Provider icon factory (same pipeline as the composer model selector). */
  createProviderIcon?(providerId: string, size: number): HTMLElement | null;
  /** The user opened the attached-entries picker; the host supplies candidates. */
  onRequestContextFiles?(): void;
  /** Attach or detach one entry path. */
  onToggleContext?(path: string): void;
  /** Attach every resolvable entry of one persisted context group (R-B2). */
  onAttachGroup?(groupId: string): void;
  /** Attach one entry resolved from a vault drop (R-A7). */
  onAttachContextEntry?(entry: InlineEditContextFile): void;
  /**
   * Resolve a raw `text/plain` drop payload into a context entry, or `null`
   * when it is not a vault text file / folder (R-A7). Absent disables drops.
   */
  resolveContextPath?(rawPath: string): InlineEditContextFile | null;
  /** Image files pasted or dropped onto the bar (R-A4). */
  onAttachImage?(files: readonly File[]): void;
  /** Remove the attached image. */
  onRemoveImage?(): void;
  /** Switch the request form before the first turn (R-A6). */
  onModeChange?(mode: InlineEditMode): void;
  /** Cycle the R-C2 image-generation chip (off → line → inline). */
  onToggleImageGen?(): void;
  /** The panel gained focus; registers this edit as the current one (R-A5). */
  onFocus?(): void;
}

const activeOverlays = new WeakMap<EditorView, Set<InlineEditInputOverlay>>();

/**
 * The single CM6 extension that remaps overlay anchors through document
 * changes. Register once with `registerEditorExtension`; it is a no-op for
 * editors without an active overlay.
 */
export function inlineEditOverlayTrackerExtension(): Extension {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (!update.docChanged) return;
    const overlays = activeOverlays.get(update.view);
    if (!overlays) return;
    for (const overlay of overlays) overlay.handleDocUpdate(update);
  });
}

export class InlineEditInputOverlay {
  private panel: HTMLElement | null = null;
  /** Hairline + anchor marker shown only while collision resolution displaced the panel. */
  private anchorLink: HTMLElement | null = null;
  private field: HTMLTextAreaElement | null = null;
  private submitEl: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private menuKind: 'model' | 'effort' | 'context' | 'preset' | null = null;
  /** Re-renders the open picker's rows after the attached set changes. */
  private refreshPickerRows: ((attachedPaths: ReadonlySet<string>) => void) | null = null;
  /** Owns everything `#`: trigger, filtering, walk, fill-without-submit. */
  private readonly presetMenu = new InlineEditPresetMenuController({
    getField: () => this.field,
    getPanel: () => this.panel,
    getPresets: () => this.state?.presets ?? [],
    isOpen: () => this.menuKind === 'preset',
    isMenuSlotTaken: () => this.menu != null,
    attachMenu: (element) => {
      this.menu = element;
      this.menuKind = 'preset';
    },
    detachMenu: () => { this.closeMenu(); },
    afterFill: () => {
      syncInstructionFieldHeight(this.field);
      this.scheduleSync();
    },
  });
  /** Footer elements kept by reference: queries would have to track nesting. */
  private attachEl: HTMLButtonElement | null = null;
  private imageGenEl: HTMLButtonElement | null = null;
  private contextRowEl: HTMLElement | null = null;
  private modeRow: InlineEditModeRow | null = null;
  private imageSurface: InlineEditImageSurface | null = null;
  private teardownContextDrop: (() => void) | null = null;
  private readonly handleContextToggle = (path: string): void => { this.callbacks.onToggleContext?.(path); };
  private readonly handleFocusIn = (): void => { this.claimForeground(); this.callbacks.onFocus?.(); };
  private readonly handlePanelPointerDown = (): void => { this.claimForeground(); };
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
    // R-A5: Escape / outside-pointerdown / focusout are scoped by the shared
    // dismissal wiring — exactly the anchored bar answers, and passive paths
    // only dismiss pristine bars (see InlineEditOverlayDismissal).
    const dismissal = bindInlineEditOverlayDismissal(doc, this.dismissalHost(), () => this.dismissalBars());
    this.handleDocKeydown = dismissal.onDocKeydown;
    this.handleDocPointerDown = dismissal.onDocPointerDown;
    this.handleFocusOut = dismissal.onFocusOut;
    doc.addEventListener('keydown', this.handleDocKeydown, true);
    doc.addEventListener('pointerdown', this.handleDocPointerDown, true);
    view.scrollDOM.addEventListener('scroll', this.handleScroll, { passive: true });
    view.dom.addEventListener('focusout', this.handleFocusOut);
    let overlays = activeOverlays.get(view);
    if (!overlays) {
      overlays = new Set();
      activeOverlays.set(view, overlays);
    }
    overlays.add(this);
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
    this.syncTextBlock(replyEl, 'opencodian-inline-edit-reply', state.reply);
    const errorEl = panel.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-error');
    this.syncTextBlock(errorEl, 'opencodian-inline-edit-error', state.error);

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

    this.modeRow?.sync(state);
    syncInlineEditImageGenChip(this.imageGenEl, state.imageGen);

    const chipCallbacks = { createProviderIcon: this.callbacks.createProviderIcon };
    syncInlineEditConfigChip(panel, 'model', state.model, chipCallbacks);
    syncInlineEditConfigChip(panel, 'effort', state.effort, chipCallbacks);
    this.imageSurface?.sync(state.imageSupported ? state.image : null);
    syncContextFooter(this.attachEl, this.contextRowEl, {
      chips: state.context,
      supported: state.contextSupported,
      busy: state.busy,
      onToggle: this.handleContextToggle,
    });
    if (this.menu && (this.menuKind === 'model' || this.menuKind === 'effort')) {
      const chip = state[this.menuKind];
      if (!chip) {
        this.closeMenu();
      } else {
        this.renderMenu(this.menuKind, chip);
      }
    } else if (this.menu && this.menuKind === 'context') {
      this.refreshContextPicker();
    } else if (this.menuKind === 'preset') {
      // The preset list may have changed underneath an open menu (settings
      // edited mid-edit): re-filter with the live query and keep the walk.
      this.presetMenu.refresh();
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
    const overlays = activeOverlays.get(this.view);
    if (overlays) {
      overlays.delete(this);
      if (overlays.size === 0) activeOverlays.delete(this.view);
    }
    this.closeMenu();
    this.imageSurface?.teardown();
    this.imageSurface = null;
    this.teardownContextDrop?.();
    this.teardownContextDrop = null;
    this.panel?.removeEventListener('focusin', this.handleFocusIn);
    this.panel?.remove();
    this.panel = null;
    this.anchorLink = null;
    this.field = null;
    this.submitEl = null;
    this.attachEl = null;
    this.imageGenEl = null;
    this.contextRowEl = null;
    this.modeRow = null;
    this.spinOn = false;
    this.state = null;
  }

  /** Focus the instruction input, deferred until layout settles. */
  focusInput(): void {
    focusInstructionField(this.field, this.view.dom.ownerDocument);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * R-A5 dismissal facet: what the shared dismissal wiring needs to know
   * about THIS bar. `dismissalBars()` feeds the same facet for every open
   * bar of the editor, so all of them derive identical verdicts from one
   * per-event snapshot.
   */
  private dismissalHost(): InlineEditDismissalHost {
    return {
      editId: this.callbacks.editId,
      panel: () => this.panel,
      menu: () => this.menu,
      pristine: () => this.isPristine,
      closeMenu: () => { this.closeMenu(); },
      reject: () => { this.callbacks.onReject(); },
    };
  }

  private dismissalBars(): InlineEditDismissalHost[] {
    return [...(activeOverlays.get(this.view) ?? [])].map((overlay) => overlay.dismissalHost());
  }

  /**
   * Pristine = nothing to lose: empty instruction, input phase (not busy),
   * nothing generated (no clarification reply, no error). Only pristine
   * bars self-dismiss on the passive paths (outside pointerdown, focus
   * leaving the bars); a bar with content survives them so a stray click
   * never discards typed input. Explicit exits always work regardless.
   */
  private get isPristine(): boolean {
    const state = this.state;
    return (this.field?.value.trim().length ?? 0) === 0
      && state?.busy !== true
      && !state?.reply
      && !state?.error;
  }

  /**
   * R-A5: focus/pointer ownership elevates this panel above its siblings,
   * so the panel the user is working in never paints under a later-mounted
   * neighbour even while both stay fully editable.
   */
  private claimForeground(): void {
    claimPanelForeground(this.panel, [...(activeOverlays.get(this.view) ?? [])].map((overlay) => overlay.panel));
  }

  private buildDom(): void {
    const root = this.view.dom.createEl('div', { cls: 'opencodian-inline-edit opencodian-inline-edit-overlay' });
    const anchorLink = root.createDiv({ cls: 'opencodian-inline-edit-anchor-link' });
    root.addEventListener('pointerdown', this.handlePanelPointerDown);
    root.addEventListener('focusin', this.handleFocusIn);

    this.modeRow = buildInlineEditModeRow(root, {
      onModeChange: (mode) => {
        if (this.state?.modeSwitchable !== true) return;
        if (!this.state.modeOptions.includes(mode)) return;
        this.callbacks.onModeChange?.(mode);
      },
    });

    // Input first: the instruction is the primary task, so it owns the
    // top row; model/effort configuration lives in the meta footer below.
    const row = root.createDiv({ cls: 'opencodian-inline-edit-inputrow' });
    // The app mark is the bar's avatar: outside the field box, pinned to the
    // first line, so a growing instruction never competes with it for space.
    const lead = row.createSpan({ cls: 'opencodian-inline-edit-inputlead' });
    setIcon(lead, OPENCODIAN_APP_ICON_ID);
    // The field box carries the frame, fill and inner padding (the host theme
    // styles bare form controls on its own terms, see the style module doc).
    const fieldBox = row.createDiv({ cls: 'opencodian-inline-edit-inputfield' });
    const field = fieldBox.createEl('textarea', {
      cls: 'opencodian-inline-edit-field',
      attr: { rows: '1', 'aria-label': t('inlineEdit.command.name') },
    });
    field.addEventListener('input', () => {
      // Grow immediately: the browser pauses rAF entirely while the window is
      // hidden, and reading our own textarea's scrollHeight is safe in any
      // handler (the rAF discipline covers CM6 geometry reads, not this).
      syncInstructionFieldHeight(this.field);
      this.scheduleSync();
      this.presetMenu.sync();
    });
    field.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      // While the preset menu is open it owns Enter (fill, never submit) and
      // the arrow walk; both must be consumed before the submit path below.
      if (this.presetMenu.handleKeydown(event)) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.callbacks.onSubmit(field.value);
      }
      // Shift+Enter inserts a newline; Escape bubbles to the document capture
      // handler, which owns dismissal.
    });
    this.presetMenu.bindField(field);

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
    // Two footer rows: attached entries get their own line (hidden while
    // empty), then the configuration row. Keeping attachments out of the
    // config row is what stops "add context" + model + effort from crowding
    // one line.
    const contextRow = bar.createDiv({ cls: 'opencodian-inline-edit-context-row' });
    contextRow.style.display = 'none';
    const configRow = bar.createDiv({ cls: 'opencodian-inline-edit-config-row' });
    const attach = configRow.createEl('button', {
      cls: 'opencodian-inline-edit-chip opencodian-inline-edit-chip-attach',
      attr: { type: 'button', 'aria-label': t('inlineEdit.context.add'), title: t('inlineEdit.context.add') },
    });
    const attachIcon = attach.createSpan({ cls: 'opencodian-inline-edit-chip-prefix' });
    setIcon(attachIcon, 'paperclip');
    attach.createSpan({ cls: 'opencodian-inline-edit-chip-value', text: t('inlineEdit.context.add') });
    attach.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.menuKind === 'context') {
        this.closeMenu();
        return;
      }
      this.callbacks.onRequestContextFiles?.();
    });
    this.attachEl = attach;
    this.contextRowEl = contextRow;
    this.imageGenEl = buildInlineEditImageGenChip(
      configRow,
      () => { this.callbacks.onToggleImageGen?.(); },
    );
    buildInlineEditConfigChip(configRow, 'model', () => { this.toggleMenu('model'); });
    buildInlineEditConfigChip(configRow, 'effort', () => { this.toggleMenu('effort'); });
    this.imageSurface = attachInlineEditImageSurface({
      field,
      panel: root,
      anchor: configRow,
      enabled: () => this.state?.busy !== true && this.state?.imageSupported === true,
      onFiles: (files) => { this.callbacks.onAttachImage?.(files); },
      onRemove: () => { this.callbacks.onRemoveImage?.(); },
    });
    this.teardownContextDrop = installInlineEditContextDrop(root, {
      enabled: () => this.state?.busy !== true && this.state?.contextSupported === true,
      resolve: (rawPath) => this.callbacks.resolveContextPath?.(rawPath) ?? null,
      onAttach: (entry) => { this.callbacks.onAttachContextEntry?.(entry); },
    });

    this.view.dom.appendChild(root);
    this.panel = root;
    this.anchorLink = anchorLink;
    this.field = field;
    this.submitEl = submit;
  }

  private syncTextBlock(
    existing: HTMLElement | null,
    cls: string,
    text: string,
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
    panel.prepend(el);
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
    renderInlineEditConfigMenu({ menu, kind, chip, anchorChip: anchorChip ?? null, panel: this.panel }, {
      createProviderIcon: this.callbacks.createProviderIcon,
      onPickModel: (id) => { this.callbacks.onPickModel(id); },
      onPickEffort: (id) => { this.callbacks.onPickEffort(id); },
      onClose: () => { this.closeMenu(); },
    });
  }

  /** Open the attached-entries picker with the host's candidate list. */
  showContextPicker(files: readonly InlineEditContextFile[]): void {
    const panel = this.panel;
    const window = this.view.dom.ownerDocument.defaultView;
    if (!panel || !window) return;
    this.closeMenu();
    this.menuKind = 'context';
    const opened = openContextPicker(panel, {
      files,
      groups: this.state?.groups ?? [],
      onAttachGroup: (groupId) => { this.callbacks.onAttachGroup?.(groupId); },
      attachedPaths: new Set((this.state?.context ?? []).map((entry) => entry.path)),
      onToggle: this.handleContextToggle,
      view: window,
    });
    this.menu = opened.element;
    this.refreshPickerRows = opened.refresh;
  }

  /** Re-render the open picker (the attached set changes without reopening). */
  refreshContextPicker(): void {
    if (this.menuKind !== 'context') return;
    this.refreshPickerRows?.(new Set((this.state?.context ?? []).map((entry) => entry.path)));
  }


  private closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
    this.menuKind = null;
    this.refreshPickerRows = null;
    // Single close path for every menu kind: the preset controller drops its
    // state here too, so Escape, outside pointer-down and teardown all agree.
    this.presetMenu.reset();
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

  /**
   * Other mounted panels' occupied bands in this editor, editor-relative.
   *
   * Runs inside the rAF pass like every other measurement; zero-height,
   * hidden or detached siblings are dropped so they can never displace a
   * live panel.
   */
  private siblingBands(domRect: DOMRect): InlineEditPanelBand[] {
    return [...(activeOverlays.get(this.view) ?? [])].flatMap((overlay) => {
      const sibling = overlay.panel;
      if (!sibling || sibling === this.panel || !sibling.isConnected || sibling.offsetHeight <= 0) return [];
      const rect = sibling.getBoundingClientRect();
      return [{ top: rect.top - domRect.top, bottom: rect.bottom - domRect.top }];
    });
  }

  private sync(): void {
    const panel = this.panel;
    if (!panel || !panel.isConnected) return;
    syncInstructionFieldHeight(this.field);
    let coords: { top: number; bottom: number; left: number } | null = null;
    try {
      coords = this.view.coordsAtPos(this.anchorPos);
    } catch {
      // No layout backend (tests) or detached view: behave like the anchor is
      // out of view and keep the last known position.
      coords = null;
    }
    if (!coords) {
      // Anchor scrolled out of the render window: keep the last position so
      // the bar never disappears while the user is typing into it.
      if (this.lastLeft !== null) panel.style.left = `${this.lastLeft}px`;
      if (this.lastTop !== null) panel.style.top = `${this.lastTop}px`;
      return;
    }
    const domRect = this.view.dom.getBoundingClientRect();
    const { left, top } = placeInlineEditPanel({
      panel,
      anchorLink: this.anchorLink,
      anchor: { top: coords.top - domRect.top, bottom: coords.bottom - domRect.top, left: coords.left - domRect.left },
      panelSize: { width: panel.offsetWidth, height: panel.offsetHeight },
      viewportHeight: this.view.dom.clientHeight,
      viewportWidth: this.view.dom.clientWidth,
      siblings: this.siblingBands(domRect),
    });
    this.lastLeft = left;
    this.lastTop = top;
  }
}
