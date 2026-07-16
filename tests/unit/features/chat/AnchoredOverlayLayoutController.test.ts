import {
  AnchoredOverlayLayoutController,
  calculateAnchoredOverlayLayout,
} from '../../../../src/features/chat/ui/AnchoredOverlayLayoutController';

function rect(left: number, right: number): DOMRect {
  return {
    left,
    right,
    top: 0,
    bottom: 40,
    width: right - left,
    height: 40,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

class ResizeObserverMock {
  static readonly instances: ResizeObserverMock[] = [];

  readonly observe = jest.fn();
  readonly disconnect = jest.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }

  emit(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe('AnchoredOverlayLayoutController', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    ResizeObserverMock.instances.length = 0;
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    jest.restoreAllMocks();
  });

  it('clamps a start-aligned overlay to the right safety inset', () => {
    expect(calculateAnchoredOverlayLayout({
      boundaryLeft: 924.5,
      boundaryRight: 1440,
      anchorLeft: 1112.2,
      anchorRight: 1304.2,
      alignment: 'start',
      preferredWidth: 340,
      minimumWidth: 280,
      safeInset: 8,
    })).toEqual({
      leftOffset: -20.2,
      width: 340,
      minWidth: 280,
    });
  });

  it('preserves end alignment while clamping to the left safety inset', () => {
    expect(calculateAnchoredOverlayLayout({
      boundaryLeft: 100,
      boundaryRight: 360,
      anchorLeft: 112,
      anchorRight: 152,
      alignment: 'end',
      preferredWidth: 220,
      minimumWidth: 60,
      safeInset: 8,
    })).toEqual({
      leftOffset: -4,
      width: 220,
      minWidth: 60,
    });
  });

  it('shrinks below the configured minimum when the boundary is narrower', () => {
    expect(calculateAnchoredOverlayLayout({
      boundaryLeft: 100,
      boundaryRight: 350,
      anchorLeft: 120,
      anchorRight: 180,
      alignment: 'start',
      preferredWidth: 340,
      minimumWidth: 280,
      safeInset: 8,
    })).toEqual({
      leftOffset: -12,
      width: 234,
      minWidth: 234,
    });
  });

  it('rounds fractional geometry without accumulating coordinate drift', () => {
    expect(calculateAnchoredOverlayLayout({
      boundaryLeft: 10.25,
      boundaryRight: 250.75,
      anchorLeft: 28.65,
      anchorRight: 88.65,
      alignment: 'end',
      preferredWidth: 180.2,
      minimumWidth: 60,
      safeInset: 8,
    })).toEqual({
      leftOffset: -10.4,
      width: 180.2,
      minWidth: 60,
    });
  });

  it('recomputes on resize only while open and disconnects on destroy', () => {
    const boundaryEl = document.createElement('div');
    const anchorEl = document.createElement('div');
    const overlayEl = document.createElement('div');
    let isOpen = false;

    jest.spyOn(boundaryEl, 'getBoundingClientRect').mockReturnValue(rect(100, 360));
    jest.spyOn(anchorEl, 'getBoundingClientRect').mockReturnValue(rect(300, 340));

    const controller = new AnchoredOverlayLayoutController({
      anchorEl,
      overlayEl,
      resolveBoundary: () => boundaryEl,
      alignment: 'end',
      preferredWidth: 220,
      minimumWidth: 60,
      safeInset: 8,
      isOpen: () => isOpen,
    });

    controller.observe();
    const observer = ResizeObserverMock.instances[0];
    expect(observer?.observe).toHaveBeenCalledWith(boundaryEl);

    observer?.emit();
    expect(overlayEl.style.width).toBe('');

    isOpen = true;
    observer?.emit();
    expect(overlayEl.style.left).toBe('-180px');
    expect(overlayEl.style.width).toBe('220px');
    expect(overlayEl.style.minWidth).toBe('60px');

    controller.destroy();
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps CSS fallback styles untouched when ResizeObserver and a boundary are unavailable', () => {
    globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver;
    const anchorEl = document.createElement('div');
    const overlayEl = document.createElement('div');
    overlayEl.style.right = '0px';

    const controller = new AnchoredOverlayLayoutController({
      anchorEl,
      overlayEl,
      resolveBoundary: () => null,
      alignment: 'end',
      preferredWidth: 180,
      minimumWidth: 60,
      safeInset: 8,
      isOpen: () => true,
    });

    controller.observe();

    expect(controller.sync()).toBe(false);
    expect(overlayEl.style.right).toBe('0px');
    expect(overlayEl.style.left).toBe('');
    expect(ResizeObserverMock.instances).toHaveLength(0);
  });

  it('subscribes when the boundary first becomes available during sync', () => {
    const boundaryEl = document.createElement('div');
    const anchorEl = document.createElement('div');
    const overlayEl = document.createElement('div');
    let boundary: HTMLElement | null = null;

    jest.spyOn(boundaryEl, 'getBoundingClientRect').mockReturnValue(rect(100, 360));
    jest.spyOn(anchorEl, 'getBoundingClientRect').mockReturnValue(rect(120, 180));

    const controller = new AnchoredOverlayLayoutController({
      anchorEl,
      overlayEl,
      resolveBoundary: () => boundary,
      alignment: 'start',
      preferredWidth: 280,
      minimumWidth: 220,
      safeInset: 8,
      isOpen: () => true,
    });

    controller.observe();
    expect(ResizeObserverMock.instances).toHaveLength(0);

    boundary = boundaryEl;
    expect(controller.sync()).toBe(true);
    expect(ResizeObserverMock.instances).toHaveLength(1);
    expect(ResizeObserverMock.instances[0]?.observe).toHaveBeenCalledWith(boundaryEl);
  });

  it('refreshes a potentially stale subscription when observe is called again', () => {
    const boundaryEl = document.createElement('div');
    const anchorEl = document.createElement('div');
    const overlayEl = document.createElement('div');
    const controller = new AnchoredOverlayLayoutController({
      anchorEl,
      overlayEl,
      resolveBoundary: () => boundaryEl,
      alignment: 'start',
      preferredWidth: 280,
      minimumWidth: 220,
      safeInset: 8,
      isOpen: () => true,
    });

    controller.observe();
    const firstObserver = ResizeObserverMock.instances[0];
    controller.observe();

    expect(firstObserver?.disconnect).toHaveBeenCalledTimes(1);
    expect(ResizeObserverMock.instances).toHaveLength(2);
    expect(ResizeObserverMock.instances[1]?.observe).toHaveBeenCalledWith(boundaryEl);
  });
});
