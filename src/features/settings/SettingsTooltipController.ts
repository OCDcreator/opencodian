const TOOLTIP_TRIGGER_SELECTOR = '[data-settings-tooltip]:not([data-settings-tooltip=""])';
const VIEWPORT_MARGIN_PX = 12;
const TOOLTIP_GAP_PX = 12;
const TOOLTIP_ARROW_SIZE_PX = 8;
const TOOLTIP_ARROW_MIN_INSET_PX = 10;

type SettingsTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

const controllers = new WeakMap<Document, SettingsTooltipController>();

export class SettingsTooltipController {
  private activeTrigger: HTMLElement | null = null;
  private bubbleEl: HTMLElement | null = null;
  private layerEl: HTMLElement | null = null;
  private readonly view: Window | null;

  private constructor(private readonly document: Document) {
    this.view = document.defaultView;
    document.addEventListener('mouseover', this.handleMouseOver);
    document.addEventListener('mouseout', this.handleMouseOut);
    document.addEventListener('focusin', this.handleFocusIn);
    document.addEventListener('focusout', this.handleFocusOut);
    this.view?.addEventListener('resize', this.handleViewportChange, { passive: true });
    this.view?.addEventListener('scroll', this.handleViewportChange, { capture: true, passive: true });
  }

  static ensureForDocument(document: Document): SettingsTooltipController {
    const existing = controllers.get(document);
    if (existing) {
      return existing;
    }
    const controller = new SettingsTooltipController(document);
    controllers.set(document, controller);
    return controller;
  }

  destroy(): void {
    this.hide();
    this.document.removeEventListener('mouseover', this.handleMouseOver);
    this.document.removeEventListener('mouseout', this.handleMouseOut);
    this.document.removeEventListener('focusin', this.handleFocusIn);
    this.document.removeEventListener('focusout', this.handleFocusOut);
    this.view?.removeEventListener('resize', this.handleViewportChange);
    this.view?.removeEventListener('scroll', this.handleViewportChange, true);
    controllers.delete(this.document);
  }

  private readonly handleFocusIn = (event: FocusEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (trigger) this.show(trigger);
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (!trigger || trigger !== this.activeTrigger) {
      return;
    }

    const nextTrigger = this.resolveTrigger(event.relatedTarget);
    if (nextTrigger === trigger) {
      return;
    }

    this.hide();
  };

  private readonly handleMouseOver = (event: MouseEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (trigger) this.show(trigger);
  };

  private readonly handleMouseOut = (event: MouseEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (!trigger || trigger !== this.activeTrigger) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && trigger.contains(relatedTarget)) {
      return;
    }

    const nextTrigger = this.resolveTrigger(relatedTarget);
    if (nextTrigger === trigger) {
      return;
    }

    this.hide();
  };

  private readonly handleViewportChange = (): void => {
    if (!this.activeTrigger?.isConnected) {
      this.hide();
      return;
    }
    this.position();
  };

  private resolveTrigger(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const trigger = target.closest<HTMLElement>(TOOLTIP_TRIGGER_SELECTOR);
    return trigger?.ownerDocument === this.document ? trigger : null;
  }

  private show(trigger: HTMLElement): void {
    const label = trigger.dataset.settingsTooltip?.trim();
    if (!label) {
      this.hide();
      return;
    }
    this.activeTrigger = trigger;
    this.ensureLayer();
    if (this.bubbleEl) {
      this.bubbleEl.textContent = label;
    }
    this.position();
    this.layerEl?.classList.add('is-visible');
  }

  private hide(): void {
    this.activeTrigger = null;
    this.layerEl?.remove();
    this.layerEl = null;
    this.bubbleEl = null;
  }

  private ensureLayer(): HTMLElement {
    if (this.layerEl?.isConnected && this.bubbleEl) {
      return this.layerEl;
    }

    const layerEl = this.document.createElement('div');
    layerEl.className = 'opencodian-settings-tooltip-layer';
    layerEl.setAttribute('aria-hidden', 'true');

    const bubbleEl = this.document.createElement('div');
    bubbleEl.className = 'opencodian-settings-tooltip-bubble';
    layerEl.appendChild(bubbleEl);

    const arrowEl = this.document.createElement('div');
    arrowEl.className = 'opencodian-settings-tooltip-arrow';
    layerEl.appendChild(arrowEl);

    this.document.body.appendChild(layerEl);
    this.layerEl = layerEl;
    this.bubbleEl = bubbleEl;
    return layerEl;
  }

  private position(): void {
    if (!this.activeTrigger || !this.activeTrigger.isConnected || !this.bubbleEl || !this.layerEl) {
      this.hide();
      return;
    }

    const anchorRect = this.activeTrigger.getBoundingClientRect();
    const bubbleRect = this.bubbleEl.getBoundingClientRect();
    const size = {
      width: Math.max(Math.ceil(bubbleRect.width), 0),
      height: Math.max(Math.ceil(bubbleRect.height), 0),
    };

    const viewportWidth = this.view?.innerWidth ?? this.document.documentElement.clientWidth ?? 0;
    const viewportHeight = this.view?.innerHeight ?? this.document.documentElement.clientHeight ?? 0;

    // Default placement: top
    let top = anchorRect.top - size.height - TOOLTIP_GAP_PX;
    let placement: SettingsTooltipPlacement = 'top';

    // If not enough space above, try below
    if (top < VIEWPORT_MARGIN_PX) {
      top = anchorRect.bottom + TOOLTIP_GAP_PX;
      placement = 'bottom';
    }

    // Clamp top within viewport
    top = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(top, Math.max(VIEWPORT_MARGIN_PX, viewportHeight - VIEWPORT_MARGIN_PX - size.height)),
    );

    // Center horizontally on anchor
    const anchorCenterX = anchorRect.left + (anchorRect.width / 2);
    let left = anchorCenterX - (size.width / 2);

    // Clamp left within viewport
    left = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(left, Math.max(VIEWPORT_MARGIN_PX, viewportWidth - VIEWPORT_MARGIN_PX - size.width)),
    );

    this.layerEl.style.left = `${Math.round(left)}px`;
    this.layerEl.style.top = `${Math.round(top)}px`;
    this.layerEl.dataset.placement = placement;

    // Set arrow offset so the arrow points at the anchor center.
    // Clamp on both sides so the arrow stays inside the bubble.
    const arrowOffset = this.clamp(
      Math.round(anchorCenterX - left - (TOOLTIP_ARROW_SIZE_PX / 2)),
      TOOLTIP_ARROW_MIN_INSET_PX,
      Math.max(
        TOOLTIP_ARROW_MIN_INSET_PX,
        size.width - TOOLTIP_ARROW_MIN_INSET_PX - TOOLTIP_ARROW_SIZE_PX,
      ),
    );
    this.layerEl.style.setProperty('--opencodian-settings-tooltip-arrow-offset', `${arrowOffset}px`);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
