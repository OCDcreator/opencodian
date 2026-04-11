import {
  captureElementScrollRestoreSnapshot,
  isElementNearBottom,
  restoreElementScrollAfterRender,
  scrollElementToBottom,
} from '../../../../src/features/chat/services/ScrollManager';

function installScrollMetrics(
  element: HTMLElement,
  options: { scrollTop?: number; scrollHeight: number; clientHeight: number },
) {
  let currentScrollTop = options.scrollTop ?? 0;
  let currentScrollHeight = options.scrollHeight;

  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => options.clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => currentScrollHeight,
  });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value;
    },
  });
  Object.defineProperty(element, 'scrollTo', {
    configurable: true,
    value: jest.fn(({ top }: { top: number }) => {
      currentScrollTop = top;
    }),
  });

  return {
    setScrollTop(value: number) {
      currentScrollTop = value;
    },
    setScrollHeight(value: number) {
      currentScrollHeight = value;
    },
  };
}

function setRect(element: HTMLElement, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: rect.top ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? Math.max(0, (rect.bottom ?? 0) - (rect.top ?? 0)),
      top: rect.top ?? 0,
      right: rect.right ?? 0,
      bottom: rect.bottom ?? 0,
      left: rect.left ?? 0,
      toJSON: () => ({}),
    }),
  });
}

describe('ScrollManager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('detects when a messages pane is near the bottom', () => {
    const messagesEl = document.createElement('div');
    installScrollMetrics(messagesEl, {
      scrollTop: 690,
      scrollHeight: 1000,
      clientHeight: 220,
    });

    expect(isElementNearBottom(messagesEl)).toBe(true);
  });

  it('scrolls to the bottom and arms the programmatic guard', () => {
    const messagesEl = document.createElement('div');
    installScrollMetrics(messagesEl, {
      scrollTop: 120,
      scrollHeight: 900,
      clientHeight: 200,
    });
    const runtime = {
      autoScrollEnabled: false,
      programmaticScrollGuardUntil: 0,
    };

    jest.spyOn(Date, 'now').mockReturnValue(1_000);

    scrollElementToBottom(messagesEl, runtime, {
      behavior: 'smooth',
      enableAutoScroll: true,
    });

    expect(runtime.autoScrollEnabled).toBe(true);
    expect(runtime.programmaticScrollGuardUntil).toBe(1_500);
    expect(messagesEl.scrollTo).toHaveBeenCalledWith({
      top: 900,
      behavior: 'smooth',
    });
  });

  it('captures the visible anchor when preserving scroll position', () => {
    const messagesEl = document.createElement('div');
    installScrollMetrics(messagesEl, {
      scrollTop: 240,
      scrollHeight: 800,
      clientHeight: 200,
    });
    setRect(messagesEl, { top: 100, bottom: 300 });

    const aboveFold = document.createElement('div');
    aboveFold.dataset.messageId = 'msg-1';
    aboveFold.className = 'opencodian-message';
    const anchor = document.createElement('div');
    anchor.dataset.messageId = 'msg-2';
    anchor.className = 'opencodian-message';
    messagesEl.append(aboveFold, anchor);

    setRect(aboveFold, { top: 40, bottom: 90 });
    setRect(anchor, { top: 120, bottom: 180 });

    const snapshot = captureElementScrollRestoreSnapshot(messagesEl, false);

    expect(snapshot).toMatchObject({
      mode: 'preserve-anchor',
      scrollTop: 240,
      distanceFromBottom: 360,
      anchorMessageId: 'msg-2',
      anchorOffsetTop: 20,
    });
  });

  it('restores anchor-preserving scroll and re-arms the guard after render', () => {
    const messagesEl = document.createElement('div');
    const metrics = installScrollMetrics(messagesEl, {
      scrollTop: 300,
      scrollHeight: 1000,
      clientHeight: 200,
    });
    setRect(messagesEl, { top: 100, bottom: 300 });

    const anchor = document.createElement('div');
    anchor.dataset.messageId = 'msg-2';
    anchor.className = 'opencodian-message';
    messagesEl.append(anchor);
    setRect(anchor, { top: 170, bottom: 240 });

    const runtime = {
      programmaticScrollGuardUntil: 0,
    };
    const restored = jest.fn();
    const frames: FrameRequestCallback[] = [];

    jest.spyOn(Date, 'now').mockReturnValue(2_000);

    restoreElementScrollAfterRender(messagesEl, {
      mode: 'preserve-anchor',
      scrollTop: 240,
      distanceFromBottom: 560,
      anchorMessageId: 'msg-2',
      anchorOffsetTop: 40,
    }, {
      runtime,
      onRestored: restored,
      requestAnimationFrame: (callback) => {
        frames.push(callback);
        return 1;
      },
    });

    expect(messagesEl.scrollTop).toBe(330);
    expect(runtime.programmaticScrollGuardUntil).toBe(2_120);
    expect(restored).toHaveBeenCalledWith(330);

    metrics.setScrollTop(330);
    frames[0]?.(16);

    expect(messagesEl.scrollTop).toBe(360);
    expect(restored).toHaveBeenLastCalledWith(360);
  });
});
