/**
 * EffortSelector - Thinking variant selector.
 *
 * Reads variant names from the model catalog (returned by the backend
 * config.providers API) and presents them as a dropdown. The selected
 * variant name is sent to the backend as-is via the `variant` field —
 * the backend resolves it to provider-specific options.
 *
 * This matches the OpenCode Desktop implementation which reads variants
 * from `sync.data.provider.find(...).models[modelID].variants`.
 */

import { t } from '../../../i18n';
import { TooltipLayerController } from '../../../shared/TooltipLayerController';
import { AnchoredOverlayLayoutController } from './AnchoredOverlayLayoutController';

const EFFORT_DROPDOWN_MINIMUM_WIDTH = 60;
const EFFORT_DROPDOWN_SAFE_INSET = 8;
let accessibleLabelId = 0;
let effortMenuId = 0;

export interface EffortSelectorCallbacks {
  /** Available variant names for the current model */
  getVariants: () => string[];
  /** Currently selected variant, or undefined for default */
  getVariant: () => string | undefined;
  /** Called when user selects a variant (undefined = default) */
  onVariantChange: (variant: string | undefined) => Promise<void>;
  /** Current model reference string (provider/model) */
  getCurrentModel: () => string;
  /** Whether the menu should offer the backend default / disabled option. */
  allowDefaultOption?: () => boolean;
  /** Label used when no explicit variant is selected. */
  getDefaultOptionLabel?: () => string;
  /**
   * Returns a short boundary hint explaining when the selected effort
   * takes effect (e.g. "Applies to next turn"). Returning undefined or
   * an empty string hides the hint.
   */
  getBoundaryHint?: () => string | undefined;
}

export class EffortSelector {
  private container: HTMLElement;
  private gearsEl: HTMLElement | null = null;
  private groupEl: HTMLElement | null = null;
  private callbacks: EffortSelectorCallbacks;
  private isMenuOpen = false;
  private isSaving = false;
  private readonly menuId = `opencodian-effort-menu-${++effortMenuId}`;
  private dropdownLayoutController: AnchoredOverlayLayoutController | null = null;
  private readonly handleDocumentMouseDown: (event: MouseEvent) => void;
  private readonly handleDocumentKeyDown: (event: KeyboardEvent) => void;

  constructor(parentEl: HTMLElement, callbacks: EffortSelectorCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'opencodian-effort-selector' });
    TooltipLayerController.ensureForElement(this.container);
    const doc = this.container.ownerDocument;
    this.handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target && this.container.contains(target as Node)) {
        return;
      }
      this.closeMenu();
    };
    this.handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (!this.isMenuOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.closeMenu(true);
      } else if (event.key === 'Tab') {
        this.closeMenu(true);
      }
    };
    doc.addEventListener('mousedown', this.handleDocumentMouseDown, true);
    doc.addEventListener('keydown', this.handleDocumentKeyDown, true);
    this.render();
  }

  private render(): void {
    this.container.empty();

    this.groupEl = this.container.createDiv({ cls: 'opencodian-effort-group' });

    this.gearsEl = this.groupEl.createDiv({ cls: 'opencodian-effort-gears' });

    this.updateDisplay();
  }

  private renderGears(): void {
    if (!this.gearsEl) return;
    const restoreFocus = this.container.contains(this.container.ownerDocument.activeElement);
    this.closeMenu();
    this.gearsEl.empty();

    const variants = this.callbacks.getVariants();
    const currentVariant = this.callbacks.getVariant();
    const allowDefaultOption = this.callbacks.allowDefaultOption?.() ?? true;
    const defaultLabel = this.callbacks.getDefaultOptionLabel?.() ?? t('chat.effort.disabled');
    const currentLabel = currentVariant ? formatVariantLabel(currentVariant) : defaultLabel;

    // Current value display
    const currentEl = this.gearsEl.createDiv({ cls: 'opencodian-effort-current' });
    currentEl.createSpan({ cls: 'opencodian-effort-current-value', text: currentLabel });
    currentEl.setAttribute('role', 'button');
    currentEl.setAttribute('tabindex', '0');
    currentEl.setAttribute('aria-haspopup', 'menu');
    currentEl.setAttribute('aria-expanded', 'false');
    currentEl.setAttribute('aria-controls', this.menuId);
    currentEl.addClass('opencodian-tooltip-trigger');
    currentEl.setAttribute('data-tooltip-position', 'top');
    currentEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMenu();
    });
    currentEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        this.toggleMenu(true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        if (!this.isMenuOpen) this.toggleMenu();
        this.focusOption(event.key === 'ArrowDown' ? 'first' : 'last');
      }
    });

    // Dropdown options
    const optionsEl = this.gearsEl.createDiv({
      cls: 'opencodian-effort-options',
      attr: { id: this.menuId, role: 'menu' },
    });
    const menuLabel = optionsEl.createSpan({ cls: 'opencodian-visually-hidden', text: t('chat.effort.label') });
    menuLabel.id = `${this.menuId}-label`;
    optionsEl.setAttribute('aria-labelledby', menuLabel.id);
    optionsEl.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        event.stopPropagation();
        this.focusOption(event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : event.key === 'ArrowDown' ? 1 : -1);
      }
    });
    this.mountDropdownLayoutController(optionsEl);

    const choices: Array<{ variant: string | undefined; label: string }> = [
      ...(allowDefaultOption ? [{ variant: undefined, label: defaultLabel }] : []),
      ...[...variants].reverse().map((variant) => ({ variant, label: formatVariantLabel(variant) })),
    ];
    for (const { variant, label } of choices) {
      const selected = variant === currentVariant || variant === undefined && !currentVariant;
      const gearEl = optionsEl.createDiv({
        cls: 'opencodian-effort-gear', text: label,
        attr: { role: 'menuitemradio', tabindex: '-1', 'aria-checked': String(selected) },
      });
      if (selected) {
        gearEl.addClass('selected');
      }
      gearEl.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.selectVariant(variant);
      });
      gearEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          void this.selectVariant(variant);
        }
      });
    }
    const hint = this.callbacks.getBoundaryHint?.()?.trim();
    if (hint) {
      const hintEl = optionsEl.createDiv({ cls: 'opencodian-effort-menu-hint', text: hint });
      hintEl.id = `${this.menuId}-hint`;
      optionsEl.setAttribute('aria-describedby', hintEl.id);
    }
    optionsEl.createDiv({ cls: 'opencodian-effort-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    if (restoreFocus) currentEl.focus();
  }

  updateDisplay(): void {
    const model = this.callbacks.getCurrentModel();
    const variants = this.callbacks.getVariants();

    if (!model || variants.length === 0) {
      this.closeMenu();
      if (this.groupEl) {
        this.groupEl.style.display = 'none';
      }
      this.syncAccessibleLabel('');
      return;
    }

    if (this.groupEl) {
      this.groupEl.style.display = '';
    }

    this.renderGears();
    this.syncAccessibleLabel(this.getCurrentDisplayLabel());
  }

  /** Get the container element */
  getElement(): HTMLElement {
    return this.container;
  }

  /** Obsidian's Scope may consume Escape before document listeners run. */
  handleEscape(): boolean {
    if (!this.isMenuOpen) return false;
    this.closeMenu(true);
    return true;
  }

  destroy(): void {
    const doc = this.container.ownerDocument;
    doc.removeEventListener('mousedown', this.handleDocumentMouseDown, true);
    doc.removeEventListener('keydown', this.handleDocumentKeyDown, true);
    this.closeMenu();
    this.dropdownLayoutController?.destroy();
    this.dropdownLayoutController = null;
    this.container.remove();
  }

  private toggleMenu(focusOption = false): void {
    if (this.isMenuOpen) {
      this.closeMenu();
      return;
    }
    this.closeMenu();
    this.isMenuOpen = true;
    this.gearsEl?.addClass('is-open');
    const current = this.gearsEl?.querySelector<HTMLElement>('.opencodian-effort-current');
    current?.setAttribute('aria-expanded', 'true');
    current?.removeClass('opencodian-tooltip-trigger');
    TooltipLayerController.ensureForElement(this.container).hide();
    this.dropdownLayoutController?.observe();
    this.dropdownLayoutController?.sync();
    if (focusOption) this.focusOption('selected');
  }

  private closeMenu(restoreFocus = false): void {
    this.isMenuOpen = false;
    this.gearsEl?.removeClass('is-open');
    const current = this.gearsEl?.querySelector<HTMLElement>('.opencodian-effort-current');
    current?.setAttribute('aria-expanded', 'false');
    current?.addClass('opencodian-tooltip-trigger');
    if (restoreFocus) current?.focus();
  }

  private focusOption(target: number | 'first' | 'last' | 'selected'): void {
    const options = Array.from(this.gearsEl?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    if (!options.length) return;
    const active = options.indexOf(this.container.ownerDocument.activeElement as HTMLElement);
    const index = target === 'first' ? 0 : target === 'last' ? options.length - 1
      : target === 'selected' ? Math.max(0, options.findIndex((option) => option.getAttribute('aria-checked') === 'true'))
        : (active + target + options.length) % options.length;
    options.forEach((option, i) => { option.tabIndex = i === index ? 0 : -1; });
    options[index]?.focus();
  }

  private async selectVariant(variant: string | undefined): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    const menu = this.gearsEl?.querySelector<HTMLElement>('.opencodian-effort-options');
    menu?.setAttribute('aria-busy', 'true');
    try {
      await this.callbacks.onVariantChange(variant);
      const restoreFocus = this.container.isConnected && Boolean(menu?.contains(this.container.ownerDocument.activeElement));
      this.closeMenu();
      this.updateDisplay();
      if (restoreFocus) this.gearsEl?.querySelector<HTMLElement>('.opencodian-effort-current')?.focus();
    } catch {
      const feedback = menu?.querySelector<HTMLElement>('.opencodian-effort-feedback');
      feedback?.setText(t('chat.effort.saveFailed'));
    } finally {
      this.isSaving = false;
      menu?.removeAttribute('aria-busy');
    }
  }

  private mountDropdownLayoutController(optionsEl: HTMLElement): void {
    this.dropdownLayoutController?.destroy();
    this.dropdownLayoutController = null;
    if (!this.gearsEl) {
      return;
    }

    this.dropdownLayoutController = new AnchoredOverlayLayoutController({
      anchorEl: this.gearsEl,
      overlayEl: optionsEl,
      resolveBoundary: () => this.container.closest<HTMLElement>('.opencodian-container'),
      alignment: 'end',
      preferredWidth: () => Math.max(optionsEl.scrollWidth, EFFORT_DROPDOWN_MINIMUM_WIDTH),
      minimumWidth: EFFORT_DROPDOWN_MINIMUM_WIDTH,
      safeInset: EFFORT_DROPDOWN_SAFE_INSET,
      isOpen: () => this.isMenuOpen,
    });
    this.dropdownLayoutController.observe();
  }

  private getCurrentDisplayLabel(): string {
    const currentVariant = this.callbacks.getVariant();
    if (currentVariant) {
      return formatVariantLabel(currentVariant);
    }
    return this.callbacks.getDefaultOptionLabel?.() ?? t('chat.effort.disabled');
  }

  private syncAccessibleLabel(currentLabel: string): void {
    if (!this.groupEl) {
      return;
    }

    this.groupEl.removeAttribute('aria-label');
    this.groupEl.removeAttribute('data-tooltip');
    this.groupEl.removeAttribute('title');
    const currentEl = this.gearsEl?.querySelector<HTMLElement>('.opencodian-effort-current');
    currentEl?.querySelector('[data-effort-accessible-label="true"]')?.remove();

    if (!currentLabel) {
      currentEl?.removeAttribute('aria-label');
      currentEl?.removeAttribute('aria-labelledby');
      currentEl?.removeAttribute('data-tooltip');
      currentEl?.removeAttribute('title');
      currentEl?.querySelector('[data-effort-accessible-label="true"]')?.remove();
      return;
    }

    const label = t('chat.effort.label');
    const hint = this.callbacks.getBoundaryHint?.()?.trim();
    const description = t('chat.effort.tooltip.description');
    const accessibleLabel = hint
      ? `${label}: ${currentLabel}. ${description} ${hint}`
      : `${label}: ${currentLabel}. ${description}`;
    if (!currentEl) {
      return;
    }

    const labelEl = currentEl.createSpan({
      cls: 'opencodian-visually-hidden',
      text: accessibleLabel,
    });
    labelEl.id = `opencodian-effort-label-${++accessibleLabelId}`;
    labelEl.setAttribute('data-effort-accessible-label', 'true');
    currentEl.setAttribute('aria-labelledby', labelEl.id);
    currentEl.setAttribute('data-tooltip', accessibleLabel);
    currentEl.removeAttribute('aria-label');
    currentEl.removeAttribute('title');
  }

}

function formatVariantLabel(variant: string): string {
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}
