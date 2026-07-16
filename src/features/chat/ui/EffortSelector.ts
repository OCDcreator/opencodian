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
import { AnchoredOverlayLayoutController } from './AnchoredOverlayLayoutController';

const EFFORT_DROPDOWN_MINIMUM_WIDTH = 60;
const EFFORT_DROPDOWN_SAFE_INSET = 8;

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
  private static tooltipLabelId = 0;
  private container: HTMLElement;
  private gearsEl: HTMLElement | null = null;
  private groupEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private callbacks: EffortSelectorCallbacks;
  private isMenuOpen = false;
  private dropdownLayoutController: AnchoredOverlayLayoutController | null = null;
  private readonly handleDocumentMouseDown: (event: MouseEvent) => void;
  private readonly handleDocumentKeyDown: (event: KeyboardEvent) => void;

  constructor(parentEl: HTMLElement, callbacks: EffortSelectorCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'opencodian-effort-selector' });
    const doc = this.container.ownerDocument;
    this.handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && this.container.contains(target)) {
        return;
      }
      this.closeMenu();
    };
    this.handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.closeMenu();
      }
    };
    doc.addEventListener('mousedown', this.handleDocumentMouseDown, true);
    doc.addEventListener('keydown', this.handleDocumentKeyDown, true);
    this.render();
  }

  private render(): void {
    this.container.empty();

    this.groupEl = this.container.createDiv({ cls: 'opencodian-effort-group' });
    const label = this.groupEl.createSpan({ cls: 'opencodian-effort-label' });
    label.setText(t('chat.effort.label'));

    // Boundary hint: honest text about when the effort change takes effect
    this.hintEl = null;
    const hint = this.callbacks.getBoundaryHint?.();
    if (hint) {
      this.hintEl = this.groupEl.createSpan({ cls: 'opencodian-effort-boundary-hint' });
      this.hintEl.setText(hint);
      this.groupEl.setAttribute('title', hint);
    }

    this.gearsEl = this.groupEl.createDiv({ cls: 'opencodian-effort-gears' });

    this.updateDisplay();
  }

  private renderGears(): void {
    if (!this.gearsEl) return;
    this.gearsEl.empty();

    const variants = this.callbacks.getVariants();
    const currentVariant = this.callbacks.getVariant();
    const allowDefaultOption = this.callbacks.allowDefaultOption?.() ?? true;
    const defaultLabel = this.callbacks.getDefaultOptionLabel?.() ?? t('chat.effort.disabled');

    // Current value display
    const currentEl = this.gearsEl.createDiv({ cls: 'opencodian-effort-current' });
    currentEl.setText(currentVariant ? formatVariantLabel(currentVariant) : defaultLabel);
    currentEl.setAttribute('role', 'button');
    currentEl.setAttribute('tabindex', '0');
    currentEl.setAttribute('aria-haspopup', 'menu');
    currentEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMenu();
    });
    currentEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.toggleMenu();
      }
    });

    // Dropdown options
    const optionsEl = this.gearsEl.createDiv({ cls: 'opencodian-effort-options' });
    this.mountDropdownLayoutController(optionsEl);

    if (allowDefaultOption) {
      const defaultGear = optionsEl.createDiv({ cls: 'opencodian-effort-gear' });
      defaultGear.setText(defaultLabel);
      if (!currentVariant) {
        defaultGear.addClass('selected');
      }
      defaultGear.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onVariantChange(undefined);
        this.closeMenu();
        this.updateDisplay();
      });
    }

    // Variant options (reverse order so highest effort is at top)
    for (const variant of [...variants].reverse()) {
      const gearEl = optionsEl.createDiv({ cls: 'opencodian-effort-gear' });
      gearEl.setText(formatVariantLabel(variant));

      if (variant === currentVariant) {
        gearEl.addClass('selected');
      }

      gearEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onVariantChange(variant);
        this.closeMenu();
        this.updateDisplay();
      });
    }
  }

  updateDisplay(): void {
    const model = this.callbacks.getCurrentModel();
    const variants = this.callbacks.getVariants();

    if (!model || variants.length === 0) {
      this.closeMenu();
      if (this.groupEl) {
        this.groupEl.style.display = 'none';
      }
      return;
    }

    if (this.groupEl) {
      this.groupEl.style.display = '';
    }

    // Refresh boundary hint
    const hint = this.callbacks.getBoundaryHint?.();
    if (hint && this.groupEl) {
      if (!this.hintEl) {
        // Insert hint before the gears element
        this.hintEl = this.groupEl.createSpan({ cls: 'opencodian-effort-boundary-hint' });
        if (this.gearsEl) {
          this.groupEl.insertBefore(this.hintEl, this.gearsEl);
        }
      }
      this.hintEl.setText(hint);
      this.groupEl.setAttribute('title', hint);
    } else if (this.hintEl) {
      this.hintEl.remove();
      this.hintEl = null;
      this.groupEl?.removeAttribute('title');
    }

    this.renderGears();
  }

  /** Get the container element */
  getElement(): HTMLElement {
    return this.container;
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

  private toggleMenu(): void {
    if (this.isMenuOpen) {
      this.closeMenu();
      return;
    }
    this.closeMenu();
    this.isMenuOpen = true;
    this.gearsEl?.addClass('is-open');
    this.dropdownLayoutController?.observe();
    this.dropdownLayoutController?.sync();
  }

  private closeMenu(): void {
    this.isMenuOpen = false;
    this.gearsEl?.removeClass('is-open');
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
}

function formatVariantLabel(variant: string): string {
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}
