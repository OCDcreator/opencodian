export type OverlayHorizontalAlignment = 'start' | 'end';

export interface AnchoredOverlayLayoutInput {
  readonly boundaryLeft: number;
  readonly boundaryRight: number;
  readonly anchorLeft: number;
  readonly anchorRight: number;
  readonly alignment: OverlayHorizontalAlignment;
  readonly preferredWidth: number;
  readonly minimumWidth: number;
  readonly safeInset: number;
}

export interface AnchoredOverlayLayout {
  readonly leftOffset: number;
  readonly width: number;
  readonly minWidth: number;
}

export interface AnchoredOverlayLayoutOptions {
  readonly anchorEl: HTMLElement;
  readonly overlayEl: HTMLElement;
  readonly resolveBoundary: () => HTMLElement | null;
  readonly alignment: OverlayHorizontalAlignment;
  readonly preferredWidth: number | (() => number);
  readonly minimumWidth: number;
  readonly safeInset: number;
  readonly isOpen: () => boolean;
}

function roundGeometry(value: number): number {
  return Number(value.toFixed(2));
}

export function calculateAnchoredOverlayLayout({
  boundaryLeft,
  boundaryRight,
  anchorLeft,
  anchorRight,
  alignment,
  preferredWidth,
  minimumWidth,
  safeInset,
}: AnchoredOverlayLayoutInput): AnchoredOverlayLayout {
  const availableWidth = Math.max(0, boundaryRight - boundaryLeft - (safeInset * 2));
  const width = Math.min(preferredWidth, availableWidth);
  const minWidth = Math.min(minimumWidth, width);
  const minimumLeft = boundaryLeft + safeInset;
  const maximumLeft = boundaryRight - safeInset - width;
  const alignedLeft = alignment === 'start' ? anchorLeft : anchorRight - width;
  const left = Math.min(Math.max(alignedLeft, minimumLeft), maximumLeft);

  return {
    leftOffset: roundGeometry(left - anchorLeft),
    width: roundGeometry(width),
    minWidth: roundGeometry(minWidth),
  };
}

export class AnchoredOverlayLayoutController {
  private resizeObserver: ResizeObserver | null = null;
  private observedBoundary: HTMLElement | null = null;

  constructor(private readonly options: AnchoredOverlayLayoutOptions) {}

  sync(): boolean {
    const boundary = this.options.resolveBoundary();
    if (!boundary) {
      return false;
    }
    this.observeBoundary(boundary, false);

    const boundaryRect = boundary.getBoundingClientRect();
    const anchorRect = this.options.anchorEl.getBoundingClientRect();
    const preferredWidth = typeof this.options.preferredWidth === 'function'
      ? this.options.preferredWidth()
      : this.options.preferredWidth;
    const layout = calculateAnchoredOverlayLayout({
      boundaryLeft: boundaryRect.left,
      boundaryRight: boundaryRect.right,
      anchorLeft: anchorRect.left,
      anchorRight: anchorRect.right,
      alignment: this.options.alignment,
      preferredWidth,
      minimumWidth: this.options.minimumWidth,
      safeInset: this.options.safeInset,
    });

    this.options.overlayEl.style.right = 'auto';
    this.options.overlayEl.style.left = `${layout.leftOffset}px`;
    this.options.overlayEl.style.width = `${layout.width}px`;
    this.options.overlayEl.style.minWidth = `${layout.minWidth}px`;
    return true;
  }

  observe(): void {
    const boundary = this.options.resolveBoundary();
    if (!boundary) {
      return;
    }
    this.observeBoundary(boundary, true);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedBoundary = null;
  }

  private observeBoundary(boundary: HTMLElement, force: boolean): void {
    if (!force && this.observedBoundary === boundary && this.resizeObserver) {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedBoundary = null;
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (this.options.isOpen()) {
        this.sync();
      }
    });
    this.resizeObserver.observe(boundary);
    this.observedBoundary = boundary;
  }
}
