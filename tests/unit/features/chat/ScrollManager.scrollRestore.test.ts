import {
  adjustScrollRestoreSnapshotForStickiness,
  armProgrammaticScrollGuard,
  type ConversationScrollRestoreSnapshot,
  resolveEffectiveScrollRestoreSnapshot,
  restoreElementScrollAfterRender,
} from '../../../../src/features/chat/services/ScrollManager';

/**
 * Faithful jsdom scroll-pane model: message rects derive from live scrollTop
 * so anchor re-applies converge like they do in a real viewport.
 */
interface PaneModel {
  messagesEl: HTMLElement;
  getScrollTop(): number;
  setScrollTop(value: number): void;
  addMessage(id: string, documentTop: number, height: number): HTMLElement;
  moveMessage(id: string, documentTop: number): void;
}

function createPaneModel(options: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop?: number;
}): PaneModel {
  const messagesEl = document.createElement('div');
  const documentTops = new Map<string, number>();
  const heights = new Map<string, number>();
  let scrollTop = options.scrollTop ?? 0;
  const scrollHeight = options.scrollHeight;

  Object.defineProperty(messagesEl, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  Object.defineProperty(messagesEl, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(messagesEl, 'clientHeight', {
    configurable: true,
    get: () => options.clientHeight,
  });
  Object.defineProperty(messagesEl, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      width: 400,
      height: options.clientHeight,
      top: 0,
      bottom: options.clientHeight,
      left: 0,
      right: 400,
      toJSON: () => ({}),
    }),
  });

  return {
    messagesEl,
    getScrollTop: () => scrollTop,
    setScrollTop: (value) => {
      scrollTop = value;
    },
    addMessage(id, documentTop, height) {
      const element = document.createElement('div');
      element.className = 'opencodian-message';
      element.dataset.messageId = id;
      documentTops.set(id, documentTop);
      heights.set(id, height);
      Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => {
          const top = (documentTops.get(id) ?? 0) - scrollTop;
          const heightValue = heights.get(id) ?? 0;
          return {
            x: 0,
            y: top,
            width: 400,
            height: heightValue,
            top,
            bottom: top + heightValue,
            left: 0,
            right: 400,
            toJSON: () => ({}),
          };
        },
      });
      messagesEl.append(element);
      return element;
    },
    moveMessage(id, documentTop) {
      documentTops.set(id, documentTop);
    },
  };
}

function createRafQueue() {
  const frames: FrameRequestCallback[] = [];
  return {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    },
    runFrames: () => {
      const pending = frames.splice(0, frames.length);
      pending.forEach((callback) => callback(16));
    },
  };
}

describe('adjustScrollRestoreSnapshotForStickiness', () => {
  const base: ConversationScrollRestoreSnapshot = {
    mode: 'preserve-anchor',
    scrollTop: 1200,
    distanceFromBottom: 400,
    anchorMessageId: 'm-3',
    anchorOffsetTop: -200,
  };

  it('forces bottom mode when sticking to the bottom', () => {
    const adjusted = adjustScrollRestoreSnapshotForStickiness(base, true);
    expect(adjusted.mode).toBe('bottom');
    expect(adjusted.scrollTop).toBe(1200);
  });

  it('downgrades a bottom snapshot to preserve-anchor when the user left the bottom', () => {
    const bottom: ConversationScrollRestoreSnapshot = { ...base, mode: 'bottom' };
    const adjusted = adjustScrollRestoreSnapshotForStickiness(bottom, false);
    expect(adjusted.mode).toBe('preserve-anchor');
    expect(adjusted.anchorMessageId).toBe('m-3');
  });

  it('downgrades a bottom snapshot to preserve-distance without an anchor', () => {
    const bottom: ConversationScrollRestoreSnapshot = {
      ...base,
      mode: 'bottom',
      anchorMessageId: null,
      anchorOffsetTop: 0,
    };
    const adjusted = adjustScrollRestoreSnapshotForStickiness(bottom, false);
    expect(adjusted.mode).toBe('preserve-distance');
  });

  it('keeps a non-bottom snapshot untouched when not sticking', () => {
    const adjusted = adjustScrollRestoreSnapshotForStickiness(base, false);
    expect(adjusted).toEqual(base);
  });
});

describe('resolveEffectiveScrollRestoreSnapshot', () => {
  function buildPane(scrollTop: number): PaneModel {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop });
    pane.addMessage('m-1', 0, 500);
    pane.addMessage('m-2', 500, 500);
    pane.addMessage('m-3', 1000, 500);
    pane.addMessage('m-4', 1500, 500);
    return pane;
  }

  const captured: ConversationScrollRestoreSnapshot = {
    mode: 'preserve-anchor',
    scrollTop: 1200,
    distanceFromBottom: 400,
    anchorMessageId: 'm-3',
    anchorOffsetTop: -200,
  };

  it('forces bottom when preservation is disabled', () => {
    const pane = buildPane(0);
    const resolved = resolveEffectiveScrollRestoreSnapshot(pane.messagesEl, captured, {
      preserveScrollPosition: false,
      stickToBottom: false,
    });
    expect(resolved.mode).toBe('bottom');
  });

  it('keeps the captured snapshot when the pane was untouched mid-conversation', () => {
    const pane = buildPane(0);
    const resolved = resolveEffectiveScrollRestoreSnapshot(pane.messagesEl, captured, {
      preserveScrollPosition: true,
      stickToBottom: false,
    });
    expect(resolved.mode).toBe('preserve-anchor');
    expect(resolved.anchorMessageId).toBe('m-3');
    expect(resolved.anchorOffsetTop).toBe(-200);
  });

  it('goes to the bottom when an untouched pane was sticking to the bottom', () => {
    const pane = buildPane(0);
    const resolved = resolveEffectiveScrollRestoreSnapshot(pane.messagesEl, captured, {
      preserveScrollPosition: true,
      stickToBottom: true,
    });
    expect(resolved.mode).toBe('bottom');
  });

  it('goes to the bottom when the user scrolled to the bottom during the rebuild', () => {
    const pane = buildPane(1600);
    const resolved = resolveEffectiveScrollRestoreSnapshot(pane.messagesEl, captured, {
      preserveScrollPosition: true,
      stickToBottom: false,
    });
    expect(resolved.mode).toBe('bottom');
  });

  it('re-captures at the user position when the user scrolled mid-rebuild', () => {
    const pane = buildPane(250);
    const resolved = resolveEffectiveScrollRestoreSnapshot(pane.messagesEl, captured, {
      preserveScrollPosition: true,
      stickToBottom: true,
    });
    expect(resolved.mode).toBe('preserve-anchor');
    expect(resolved.scrollTop).toBe(250);
    expect(resolved.anchorMessageId).toBe('m-1');
    expect(resolved.anchorOffsetTop).toBe(-250);
    expect(resolved.distanceFromBottom).toBe(1350);
  });

  it('preserves an explicit user scroll to scrollTop 0 during the rebuild', () => {
    const pane = buildPane(0);
    const resolved = resolveEffectiveScrollRestoreSnapshot(pane.messagesEl, captured, {
      preserveScrollPosition: true,
      stickToBottom: false,
      userScrollIntent: true,
    });

    expect(resolved.mode).toBe('preserve-anchor');
    expect(resolved.scrollTop).toBe(0);
    expect(resolved.anchorMessageId).toBe('m-1');
    expect(resolved.anchorOffsetTop).toBe(0);
  });

  it('falls back to preserve-distance when the user position has no anchor', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 250 });
    const resolved = resolveEffectiveScrollRestoreSnapshot(pane.messagesEl, captured, {
      preserveScrollPosition: true,
      stickToBottom: false,
    });
    expect(resolved.mode).toBe('preserve-distance');
    expect(resolved.scrollTop).toBe(250);
  });
});

describe('armProgrammaticScrollGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('arms the guard for the instant-scroll delay', () => {
    jest.spyOn(Date, 'now').mockReturnValue(5_000);
    const runtime = { programmaticScrollGuardUntil: 0 };

    armProgrammaticScrollGuard(runtime);

    expect(runtime.programmaticScrollGuardUntil).toBe(5_120);
  });

  it('arms the guard for the smooth-scroll delay', () => {
    jest.spyOn(Date, 'now').mockReturnValue(5_000);
    const runtime = { programmaticScrollGuardUntil: 0 };

    armProgrammaticScrollGuard(runtime, 'smooth');

    expect(runtime.programmaticScrollGuardUntil).toBe(5_500);
  });
});

describe('restoreElementScrollAfterRender late content re-apply', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function createAnchorSnapshot(): ConversationScrollRestoreSnapshot {
    return {
      mode: 'preserve-anchor',
      scrollTop: 1200,
      distanceFromBottom: 400,
      anchorMessageId: 'm-3',
      anchorOffsetTop: -200,
    };
  }

  function buildRestoredPane() {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 0 });
    pane.addMessage('m-1', 0, 500);
    pane.addMessage('m-2', 500, 500);
    pane.addMessage('m-3', 1000, 500);
    pane.addMessage('m-4', 1500, 500);
    return pane;
  }

  it('re-applies the anchor when late-loading content shifts it', () => {
    const pane = buildRestoredPane();
    const raf = createRafQueue();

    restoreElementScrollAfterRender(pane.messagesEl, createAnchorSnapshot(), {
      requestAnimationFrame: raf.requestAnimationFrame,
      lateContentReapplyWindowMs: 1500,
    });
    raf.runFrames();
    expect(pane.getScrollTop()).toBe(1200);

    pane.moveMessage('m-3', 1300);
    const image = document.createElement('img');
    pane.messagesEl.querySelector('[data-message-id="m-1"]')?.append(image);
    image.dispatchEvent(new Event('load'));
    raf.runFrames();

    expect(pane.getScrollTop()).toBe(1500);
  });

  it('cancels the deferred restore when the user changes scrollTop before the next frame', () => {
    const pane = buildRestoredPane();
    const raf = createRafQueue();

    restoreElementScrollAfterRender(pane.messagesEl, createAnchorSnapshot(), {
      requestAnimationFrame: raf.requestAnimationFrame,
      lateContentReapplyWindowMs: 1500,
    });
    expect(pane.getScrollTop()).toBe(1200);

    pane.setScrollTop(700);
    raf.runFrames();

    expect(pane.getScrollTop()).toBe(700);
  });

  it('cancels the deferred restore on an explicit user scroll intent at the same position', () => {
    const pane = buildRestoredPane();
    const raf = createRafQueue();
    const runtime = {
      programmaticScrollGuardUntil: 0,
      userScrollIntentDuringHydration: false,
    };

    restoreElementScrollAfterRender(pane.messagesEl, createAnchorSnapshot(), {
      requestAnimationFrame: raf.requestAnimationFrame,
      lateContentReapplyWindowMs: 1500,
      runtime,
    });
    expect(pane.getScrollTop()).toBe(1200);

    runtime.userScrollIntentDuringHydration = true;
    pane.messagesEl.dispatchEvent(new Event('scroll'));
    pane.moveMessage('m-3', 1300);
    raf.runFrames();

    expect(pane.getScrollTop()).toBe(1200);
  });

  it('stops re-applying once the user takes over the scroll position', () => {
    const pane = buildRestoredPane();
    const raf = createRafQueue();

    restoreElementScrollAfterRender(pane.messagesEl, createAnchorSnapshot(), {
      requestAnimationFrame: raf.requestAnimationFrame,
      lateContentReapplyWindowMs: 1500,
    });
    raf.runFrames();
    expect(pane.getScrollTop()).toBe(1200);

    pane.setScrollTop(900);
    pane.moveMessage('m-3', 1300);
    const image = document.createElement('img');
    pane.messagesEl.append(image);
    image.dispatchEvent(new Event('load'));
    raf.runFrames();

    expect(pane.getScrollTop()).toBe(900);

    // The listener is disposed: further loads do nothing.
    pane.setScrollTop(1000);
    image.dispatchEvent(new Event('load'));
    raf.runFrames();
    expect(pane.getScrollTop()).toBe(1000);
  });

  it('stops re-applying after the re-apply window expires', () => {
    jest.useFakeTimers();
    const pane = buildRestoredPane();
    const raf = createRafQueue();

    restoreElementScrollAfterRender(pane.messagesEl, createAnchorSnapshot(), {
      requestAnimationFrame: raf.requestAnimationFrame,
      lateContentReapplyWindowMs: 1500,
    });
    raf.runFrames();
    expect(pane.getScrollTop()).toBe(1200);

    jest.advanceTimersByTime(1600);
    pane.moveMessage('m-3', 1300);
    const image = document.createElement('img');
    pane.messagesEl.append(image);
    image.dispatchEvent(new Event('load'));
    raf.runFrames();

    expect(pane.getScrollTop()).toBe(1200);
  });

  it('does not let a superseded restore replay its anchor into the new render', () => {
    const pane = buildRestoredPane();
    const raf = createRafQueue();
    let current = true;

    restoreElementScrollAfterRender(pane.messagesEl, createAnchorSnapshot(), {
      requestAnimationFrame: raf.requestAnimationFrame,
      lateContentReapplyWindowMs: 1500,
      isRestoreCurrent: () => current,
    });
    raf.runFrames();
    expect(pane.getScrollTop()).toBe(1200);

    // A newer render takes ownership before late content arrives. The old
    // listener must not move the new pane back to its stale anchor.
    current = false;
    pane.setScrollTop(200);
    pane.moveMessage('m-3', 1300);
    const image = document.createElement('img');
    pane.messagesEl.append(image);
    image.dispatchEvent(new Event('load'));
    raf.runFrames();

    expect(pane.getScrollTop()).toBe(200);
  });

  it('does not track late content for bottom restores', () => {
    const pane = buildRestoredPane();
    const raf = createRafQueue();
    const onRestoreBottom = jest.fn();

    restoreElementScrollAfterRender(pane.messagesEl, {
      mode: 'bottom',
      scrollTop: 1600,
      distanceFromBottom: 0,
      anchorMessageId: 'm-4',
      anchorOffsetTop: -100,
    }, {
      onRestoreBottom,
      requestAnimationFrame: raf.requestAnimationFrame,
      lateContentReapplyWindowMs: 1500,
    });
    raf.runFrames();

    const image = document.createElement('img');
    pane.messagesEl.append(image);
    image.dispatchEvent(new Event('load'));
    raf.runFrames();

    expect(onRestoreBottom).toHaveBeenCalledTimes(2);
    expect(pane.getScrollTop()).toBe(0);
  });

  it('does not let a bottom restore reclaim the pane after user scrolls before deferred rAF', () => {
    const pane = buildRestoredPane();
    const raf = createRafQueue();
    const onRestoreBottom = jest.fn(() => {
      pane.setScrollTop(1600);
    });

    restoreElementScrollAfterRender(pane.messagesEl, {
      mode: 'bottom',
      scrollTop: 1600,
      distanceFromBottom: 0,
      anchorMessageId: null,
      anchorOffsetTop: 0,
    }, {
      onRestoreBottom,
      requestAnimationFrame: raf.requestAnimationFrame,
    });
    pane.setScrollTop(400);
    raf.runFrames();

    expect(onRestoreBottom).toHaveBeenCalledTimes(1);
    expect(pane.getScrollTop()).toBe(400);
  });
});
