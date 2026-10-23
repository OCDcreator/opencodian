const VIEWPORT_MARGIN_PX = 12;
const POPOVER_GAP_PX = 8;

type SettingsPopoverPlacement = 'bottom-start' | 'top-start';

interface SettingsPopoverDisplayOptions {
  anchorEl: HTMLElement;
  popoverEl: HTMLElement;
  matchAnchorWidth?: boolean;
  preferredPlacement?: SettingsPopoverPlacement;
  /** Optional boundary element. When provided the popover is clamped within
   *  this element's visible rect instead of the full viewport. */
  boundaryEl?: HTMLElement;
}

const SCROLL_INTENT_KEYS = new Set([
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'ArrowUp',
  'ArrowDown',
  ' ',
]);

const controllers = new WeakMap<Document, SettingsPopoverController>();

export class SettingsPopoverController {
  private activeAnchorEl: HTMLElement | null = null;
  private activePopoverEl: HTMLElement | null = null;
  private activePreferredPlacement: SettingsPopoverPlacement = 'bottom-start';
  private activeBoundaryEl: HTMLElement | null = null;
  private readonly view: Window | null;

  private constructor(private readonly document: Document) {
    this.view = document.defaultView;
    this.view?.addEventListener('resize', this.handleResize, { passive: true });
    this.view?.addEventListener('scroll', this.handleScroll, { capture: true, passive: true });
    this.document.addEventListener('wheel', this.handleWheel, { capture: true, passive: true });
    this.document.addEventListener('keydown', this.handleKeyDown, { capture: true, passive: true });
  }

  static ensureForDocument(document: Document): SettingsPopoverController {
    const existing = controllers.get(document);
    if (existing) {
      return existing;
    }
    const controller = new SettingsPopoverController(document);
    controllers.set(document, controller);
    return controller;
  }

  destroy(): void {
    this.hide();
    this.view?.removeEventListener('resize', this.handleResize);
    this.view?.removeEventListener('scroll', this.handleScroll, true);
    this.document.removeEventListener('wheel', this.handleWheel, true);
    this.document.removeEventListener('keydown', this.handleKeyDown, true);
    controllers.delete(this.document);
  }

  show(options: SettingsPopoverDisplayOptions): void {
    const { anchorEl, popoverEl, matchAnchorWidth = true, preferredPlacement = 'bottom-start', boundaryEl } = options;
    this.activeAnchorEl = anchorEl;
    this.activePopoverEl = popoverEl;
    this.activePreferredPlacement = preferredPlacement;
    this.activeBoundaryEl = boundaryEl ?? null;
    if (popoverEl.parentElement !== this.document.body) {
      this.document.body.appendChild(popoverEl);
    }
    popoverEl.hidden = false;
    popoverEl.style.position = 'fixed';
    popoverEl.style.zIndex = '2280';
    if (matchAnchorWidth) {
      popoverEl.style.minWidth = `${Math.round(anchorEl.getBoundingClientRect().width)}px`;
    }
    this.position(preferredPlacement);
  }

  hide(popoverEl?: HTMLElement): void {
    if (popoverEl && popoverEl !== this.activePopoverEl) {
      return;
    }
    this.activePopoverEl?.setAttribute('hidden', 'true');
    this.activeAnchorEl = null;
    this.activePopoverEl = null;
    this.activeBoundaryEl = null;
  }

  private readonly handleResize = (): void => {
    if (!this.activeAnchorEl?.isConnected || !this.activePopoverEl?.isConnected) {
      this.hide();
      return;
    }
    this.position(this.activePreferredPlacement);
  };

  private readonly handleScroll = (): void => {
    // Close the popover on any scroll event. Body-level fixed popovers
    // cannot reliably track intermediate scroll containers in all Obsidian
    // layout modes (classic settings, tabbed settings, modal settings all
    // use different scroll roots). The window capture-phase listener sees
    // scroll events from every ancestor.
    this.hide();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.activePopoverEl) {
      return;
    }
    // Allow wheel scrolling inside the popover itself.
    if (event.target instanceof Node && this.activePopoverEl.contains(event.target)) {
      return;
    }
    this.hide();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.activePopoverEl) {
      return;
    }
    if (!SCROLL_INTENT_KEYS.has(event.key)) {
      return;
    }
    // Allow keyboard navigation inside the popover itself (e.g. ArrowDown
    // to move through suggestion items).
    if (event.target instanceof Node && this.activePopoverEl.contains(event.target)) {
      return;
    }
    this.hide();
  };

  private position(preferredPlacement: SettingsPopoverPlacement): void {
    if (!this.activeAnchorEl || !this.activePopoverEl) {
      return;
    }

    const anchorRect = this.activeAnchorEl.getBoundingClientRect();
    const popoverRect = this.activePopoverEl.getBoundingClientRect();
    const viewportWidth = this.view?.innerWidth ?? this.document.documentElement.clientWidth ?? 0;
    const viewportHeight = this.view?.innerHeight ?? this.document.documentElement.clientHeight ?? 0;

    // Determine clamp bounds: use boundary element if provided, else viewport.
    const boundaryRect = this.activeBoundaryEl?.getBoundingClientRect();
    const clampLeft = boundaryRect?.left ?? VIEWPORT_MARGIN_PX;
    const clampTop = boundaryRect?.top ?? VIEWPORT_MARGIN_PX;
    const clampRight = boundaryRect ? boundaryRect.left + boundaryRect.width : viewportWidth - VIEWPORT_MARGIN_PX;
    const clampBottom = boundaryRect ? boundaryRect.top + boundaryRect.height : viewportHeight - VIEWPORT_MARGIN_PX;

    const popoverWidth = popoverRect.width;
    const popoverHeight = popoverRect.height;

    let placement: SettingsPopoverPlacement = preferredPlacement;
    let left = anchorRect.left;
    let top: number;

    if (preferredPlacement === 'bottom-start') {
      top = anchorRect.bottom + POPOVER_GAP_PX;
      // Flip to top-start if not enough space below boundary
      if (top + popoverHeight > clampBottom) {
        placement = 'top-start';
        top = anchorRect.top - POPOVER_GAP_PX - popoverHeight;
      }
    } else {
      top = anchorRect.top - POPOVER_GAP_PX - popoverHeight;
      // Flip to bottom-start if not enough space above boundary
      if (top < clampTop) {
        placement = 'bottom-start';
        top = anchorRect.bottom + POPOVER_GAP_PX;
      }
    }

    // Clamp left within boundary
    left = Math.max(
      clampLeft,
      Math.min(left, Math.max(clampLeft, clampRight - popoverWidth)),
    );

    // Clamp top within boundary so tall popovers do not overflow
    top = Math.max(
      clampTop,
      Math.min(top, Math.max(clampTop, clampBottom - popoverHeight)),
    );

    this.activePopoverEl.dataset.placement = placement;
    this.activePopoverEl.style.left = `${Math.round(left)}px`;
    this.activePopoverEl.style.top = `${Math.round(top)}px`;
  }
}
