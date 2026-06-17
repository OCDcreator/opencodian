const TOOLTIP_TRIGGER_SELECTOR = '.opencodian-tooltip-trigger[data-tooltip]:not([data-tooltip=""])';
const VIEWPORT_MARGIN_PX = 12;
const TOOLTIP_GAP_PX = 12;
const TOOLTIP_ARROW_SIZE_PX = 8;
const TOOLTIP_ARROW_MIN_INSET_PX = 10;

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
type TooltipPlacementPreference = TooltipPlacement | 'auto';

interface TooltipDisplayOptions {
  preferredPlacement?: TooltipPlacementPreference;
}

interface TooltipPosition {
  arrowOffset: number;
  left: number;
  placement: TooltipPlacement;
  top: number;
}

const controllers = new WeakMap<Document, TooltipLayerController>();

export class TooltipLayerController {
  private activeLabel: string | null = null;
  private activePlacement: TooltipPlacementPreference = 'auto';
  private activeTrigger: HTMLElement | null = null;
  private bubbleEl: HTMLElement | null = null;
  private layerEl: HTMLElement | null = null;
  private readonly handleFocusIn = (event: FocusEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (!trigger) {
      return;
    }
    this.showForTrigger(trigger);
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

    this.hide(trigger);
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

    this.hide(trigger);
  };
  private readonly handleMouseOver = (event: MouseEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (!trigger) {
      return;
    }
    this.showForTrigger(trigger);
  };
  private readonly handleViewportChange = (): void => {
    if (!this.activeTrigger || !this.activeTrigger.isConnected) {
      this.hide();
      return;
    }
    this.positionActiveTooltip();
  };
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

  static ensureForDocument(document: Document): TooltipLayerController {
    const existing = controllers.get(document);
    if (existing) {
      return existing;
    }

    const controller = new TooltipLayerController(document);
    controllers.set(document, controller);
    return controller;
  }

  static ensureForElement(element: Element): TooltipLayerController {
    return TooltipLayerController.ensureForDocument(element.ownerDocument);
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

  hide(trigger?: HTMLElement): void {
    if (trigger && this.activeTrigger !== trigger) {
      return;
    }

    this.activeTrigger = null;
    this.activeLabel = null;
    this.layerEl?.classList.remove('is-visible');
    this.destroyLayer();
  }

  show(anchorEl: HTMLElement, label: string, options: TooltipDisplayOptions = {}): void {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      this.hide(anchorEl);
      return;
    }

    this.activeTrigger = anchorEl;
    this.activeLabel = normalizedLabel;
    this.activePlacement = options.preferredPlacement ?? 'auto';
    this.positionActiveTooltip();
  }

  showForTrigger(trigger: HTMLElement): void {
    const label = trigger.dataset.tooltip?.trim();
    if (!label) {
      this.hide(trigger);
      return;
    }

    trigger.removeAttribute('title');
    this.show(trigger, label, {
      preferredPlacement: TooltipLayerController.resolvePreferredPlacement(trigger),
    });
  }

  private destroyLayer(): void {
    this.layerEl?.remove();
    this.layerEl = null;
    this.bubbleEl = null;
  }

  private ensureLayer(): HTMLElement {
    if (this.layerEl?.isConnected && this.bubbleEl) {
      return this.layerEl;
    }

    const layerEl = this.document.createElement('div');
    layerEl.className = 'opencodian-tooltip-layer';
    layerEl.setAttribute('aria-hidden', 'true');

    const bubbleEl = this.document.createElement('div');
    bubbleEl.className = 'opencodian-tooltip-bubble';
    layerEl.appendChild(bubbleEl);

    const arrowEl = this.document.createElement('div');
    arrowEl.className = 'opencodian-tooltip-arrow';
    layerEl.appendChild(arrowEl);

    this.document.body.appendChild(layerEl);
    this.layerEl = layerEl;
    this.bubbleEl = bubbleEl;
    return layerEl;
  }

  private measureBubble(label: string): { height: number; width: number } {
    const layerEl = this.ensureLayer();
    if (!this.bubbleEl) {
      return { height: 0, width: 0 };
    }

    this.bubbleEl.textContent = label;
    layerEl.classList.remove('is-visible');
    layerEl.style.left = '0px';
    layerEl.style.top = '0px';
    const rect = this.bubbleEl.getBoundingClientRect();
    return {
      width: Math.max(Math.ceil(rect.width), 0),
      height: Math.max(Math.ceil(rect.height), 0),
    };
  }

  private positionActiveTooltip(): void {
    if (!this.activeTrigger || !this.activeTrigger.isConnected || !this.activeLabel) {
      this.hide();
      return;
    }

    const layerEl = this.ensureLayer();
    if (!this.bubbleEl) {
      return;
    }

    const anchorRect = this.activeTrigger.getBoundingClientRect();
    const size = this.measureBubble(this.activeLabel);
    const placement = this.resolvePlacement(anchorRect, size, this.activePlacement);
    const position = this.computePosition(anchorRect, size, placement);

    this.bubbleEl.textContent = this.activeLabel;
    layerEl.dataset.placement = position.placement;
    layerEl.style.left = `${Math.round(position.left)}px`;
    layerEl.style.top = `${Math.round(position.top)}px`;
    layerEl.style.setProperty('--opencodian-tooltip-arrow-offset', `${Math.round(position.arrowOffset)}px`);
    layerEl.classList.add('is-visible');
  }

  private computePosition(
    anchorRect: DOMRect,
    size: { height: number; width: number },
    placement: TooltipPlacement,
  ): TooltipPosition {
    const viewportWidth = this.view?.innerWidth ?? this.document.documentElement.clientWidth ?? 0;
    const viewportHeight = this.view?.innerHeight ?? this.document.documentElement.clientHeight ?? 0;
    const anchorCenterX = anchorRect.left + (anchorRect.width / 2);
    const anchorCenterY = anchorRect.top + (anchorRect.height / 2);

    if (placement === 'top' || placement === 'bottom') {
      const left = this.clamp(
        anchorCenterX - (size.width / 2),
        VIEWPORT_MARGIN_PX,
        Math.max(VIEWPORT_MARGIN_PX, viewportWidth - VIEWPORT_MARGIN_PX - size.width),
      );
      const top = placement === 'top'
        ? anchorRect.top - size.height - TOOLTIP_GAP_PX
        : anchorRect.bottom + TOOLTIP_GAP_PX;
      const arrowOffset = this.clamp(
        anchorCenterX - left - (TOOLTIP_ARROW_SIZE_PX / 2),
        TOOLTIP_ARROW_MIN_INSET_PX,
        Math.max(
          TOOLTIP_ARROW_MIN_INSET_PX,
          size.width - TOOLTIP_ARROW_MIN_INSET_PX - TOOLTIP_ARROW_SIZE_PX,
        ),
      );

      return {
        placement,
        left,
        top: this.clamp(
          top,
          VIEWPORT_MARGIN_PX,
          Math.max(VIEWPORT_MARGIN_PX, viewportHeight - VIEWPORT_MARGIN_PX - size.height),
        ),
        arrowOffset,
      };
    }

    const top = this.clamp(
      anchorCenterY - (size.height / 2),
      VIEWPORT_MARGIN_PX,
      Math.max(VIEWPORT_MARGIN_PX, viewportHeight - VIEWPORT_MARGIN_PX - size.height),
    );
    const left = placement === 'left'
      ? anchorRect.left - size.width - TOOLTIP_GAP_PX
      : anchorRect.right + TOOLTIP_GAP_PX;
    const arrowOffset = this.clamp(
      anchorCenterY - top - (TOOLTIP_ARROW_SIZE_PX / 2),
      TOOLTIP_ARROW_MIN_INSET_PX,
      Math.max(
        TOOLTIP_ARROW_MIN_INSET_PX,
        size.height - TOOLTIP_ARROW_MIN_INSET_PX - TOOLTIP_ARROW_SIZE_PX,
      ),
    );

    return {
      placement,
      left: this.clamp(
        left,
        VIEWPORT_MARGIN_PX,
        Math.max(VIEWPORT_MARGIN_PX, viewportWidth - VIEWPORT_MARGIN_PX - size.width),
      ),
      top,
      arrowOffset,
    };
  }

  private resolvePlacement(
    anchorRect: DOMRect,
    size: { height: number; width: number },
    preferredPlacement: TooltipPlacementPreference,
  ): TooltipPlacement {
    const viewportWidth = this.view?.innerWidth ?? this.document.documentElement.clientWidth ?? 0;
    const viewportHeight = this.view?.innerHeight ?? this.document.documentElement.clientHeight ?? 0;
    const fits = (placement: TooltipPlacement): boolean => {
      switch (placement) {
        case 'top':
          return anchorRect.top - TOOLTIP_GAP_PX - size.height >= VIEWPORT_MARGIN_PX;
        case 'bottom':
          return anchorRect.bottom + TOOLTIP_GAP_PX + size.height <= viewportHeight - VIEWPORT_MARGIN_PX;
        case 'left':
          return anchorRect.left - TOOLTIP_GAP_PX - size.width >= VIEWPORT_MARGIN_PX;
        case 'right':
          return anchorRect.right + TOOLTIP_GAP_PX + size.width <= viewportWidth - VIEWPORT_MARGIN_PX;
      }
    };

    const initialPlacement = preferredPlacement === 'auto'
      ? this.resolveAutomaticPlacement(anchorRect)
      : preferredPlacement;
    const fallbacks: TooltipPlacement[] = [
      initialPlacement,
      this.flipPlacement(initialPlacement),
      ...this.resolveRemainingPlacements(initialPlacement),
    ];

    return fallbacks.find((candidate, index) =>
      fallbacks.indexOf(candidate) === index && fits(candidate)
    ) ?? initialPlacement;
  }

  private resolveTrigger(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }

    const trigger = target.closest<HTMLElement>(TOOLTIP_TRIGGER_SELECTOR);
    return trigger ?? null;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private flipPlacement(placement: TooltipPlacement): TooltipPlacement {
    switch (placement) {
      case 'top':
        return 'bottom';
      case 'bottom':
        return 'top';
      case 'left':
        return 'right';
      case 'right':
        return 'left';
    }
  }

  private resolveAutomaticPlacement(anchorRect: DOMRect): TooltipPlacement {
    const viewportWidth = this.view?.innerWidth ?? this.document.documentElement.clientWidth ?? 0;
    const viewportHeight = this.view?.innerHeight ?? this.document.documentElement.clientHeight ?? 0;
    const anchorCenterX = anchorRect.left + (anchorRect.width / 2);
    const anchorCenterY = anchorRect.top + (anchorRect.height / 2);
    const horizontalEdgeBand = Math.max(56, viewportWidth * 0.16);
    const verticalEdgeBand = Math.max(48, viewportHeight * 0.18);

    if (anchorCenterX >= viewportWidth - horizontalEdgeBand) {
      return 'left';
    }
    if (anchorCenterX <= horizontalEdgeBand) {
      return 'right';
    }
    if (anchorCenterY <= verticalEdgeBand) {
      return 'bottom';
    }
    if (anchorCenterY >= viewportHeight - verticalEdgeBand) {
      return 'top';
    }
    return 'top';
  }

  private resolveRemainingPlacements(initialPlacement: TooltipPlacement): TooltipPlacement[] {
    if (initialPlacement === 'left' || initialPlacement === 'right') {
      return ['top', 'bottom', 'right', 'left'];
    }
    return ['right', 'left', 'top', 'bottom'];
  }

  private static resolvePreferredPlacement(trigger: HTMLElement): TooltipPlacementPreference {
    const explicitPosition = trigger.dataset.tooltipPosition;
    if (
      explicitPosition === 'top'
      || explicitPosition === 'bottom'
      || explicitPosition === 'left'
      || explicitPosition === 'right'
    ) {
      return explicitPosition;
    }

    const sideAlignment = trigger.dataset.tooltipAlign;
    if (sideAlignment === 'left' || sideAlignment === 'right') {
      return sideAlignment;
    }

    return 'auto';
  }
}
