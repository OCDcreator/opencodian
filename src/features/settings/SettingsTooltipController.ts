const TOOLTIP_TRIGGER_SELECTOR = '[data-settings-tooltip]:not([data-settings-tooltip=""])';
const VIEWPORT_MARGIN_PX = 12;
const TOOLTIP_GAP_PX = 12;
const TOOLTIP_ARROW_SIZE_PX = 8;
const TOOLTIP_ARROW_MIN_INSET_PX = 10;

type SettingsTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface SettingsTooltipPosition {
  arrowOffset: number;
  left: number;
  placement: SettingsTooltipPlacement;
  top: number;
}

interface SettingsTooltipViewport {
  height: number;
  width: number;
}

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
    trigger.removeAttribute('title');
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
    const placement = this.resolvePlacement(anchorRect, size, viewportWidth, viewportHeight);
    const position = this.computePosition(anchorRect, size, placement, {
      height: viewportHeight,
      width: viewportWidth,
    });

    this.layerEl.style.left = `${Math.round(position.left)}px`;
    this.layerEl.style.top = `${Math.round(position.top)}px`;
    this.layerEl.dataset.placement = position.placement;
    this.layerEl.style.setProperty(
      '--opencodian-settings-tooltip-arrow-offset',
      `${Math.round(position.arrowOffset)}px`,
    );
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private computePosition(
    anchorRect: DOMRect,
    size: { height: number; width: number },
    placement: SettingsTooltipPlacement,
    viewport: SettingsTooltipViewport,
  ): SettingsTooltipPosition {
    const anchorCenterX = anchorRect.left + (anchorRect.width / 2);
    const anchorCenterY = anchorRect.top + (anchorRect.height / 2);

    if (placement === 'top' || placement === 'bottom') {
      const left = this.clamp(
        anchorCenterX - (size.width / 2),
        VIEWPORT_MARGIN_PX,
        Math.max(VIEWPORT_MARGIN_PX, viewport.width - VIEWPORT_MARGIN_PX - size.width),
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
        arrowOffset,
        left,
        placement,
        top: this.clamp(
          top,
          VIEWPORT_MARGIN_PX,
          Math.max(VIEWPORT_MARGIN_PX, viewport.height - VIEWPORT_MARGIN_PX - size.height),
        ),
      };
    }

    const left = placement === 'left'
      ? anchorRect.left - size.width - TOOLTIP_GAP_PX
      : anchorRect.right + TOOLTIP_GAP_PX;
    const top = this.clamp(
      anchorCenterY - (size.height / 2),
      VIEWPORT_MARGIN_PX,
      Math.max(VIEWPORT_MARGIN_PX, viewport.height - VIEWPORT_MARGIN_PX - size.height),
    );
    const arrowOffset = this.clamp(
      anchorCenterY - top - (TOOLTIP_ARROW_SIZE_PX / 2),
      TOOLTIP_ARROW_MIN_INSET_PX,
      Math.max(
        TOOLTIP_ARROW_MIN_INSET_PX,
        size.height - TOOLTIP_ARROW_MIN_INSET_PX - TOOLTIP_ARROW_SIZE_PX,
      ),
    );

    return {
      arrowOffset,
      left: this.clamp(
        left,
        VIEWPORT_MARGIN_PX,
        Math.max(VIEWPORT_MARGIN_PX, viewport.width - VIEWPORT_MARGIN_PX - size.width),
      ),
      placement,
      top,
    };
  }

  private flipPlacement(placement: SettingsTooltipPlacement): SettingsTooltipPlacement {
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

  private resolveAutomaticPlacement(
    anchorRect: DOMRect,
    viewportWidth: number,
    viewportHeight: number,
  ): SettingsTooltipPlacement {
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

  private resolvePlacement(
    anchorRect: DOMRect,
    size: { height: number; width: number },
    viewportWidth: number,
    viewportHeight: number,
  ): SettingsTooltipPlacement {
    const fits = (placement: SettingsTooltipPlacement): boolean => {
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

    const initialPlacement = this.resolveAutomaticPlacement(anchorRect, viewportWidth, viewportHeight);
    const remainingPlacements: SettingsTooltipPlacement[] =
      initialPlacement === 'left' || initialPlacement === 'right'
        ? ['top', 'bottom', 'right', 'left']
        : ['right', 'left', 'top', 'bottom'];
    const fallbacks: SettingsTooltipPlacement[] = [
      initialPlacement,
      this.flipPlacement(initialPlacement),
      ...remainingPlacements,
    ];

    return fallbacks.find((candidate, index) =>
      fallbacks.indexOf(candidate) === index && fits(candidate)
    ) ?? initialPlacement;
  }
}
