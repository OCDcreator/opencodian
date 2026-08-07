/* eslint-disable max-lines-per-function -- pane model tests cover scroll and nested cleanup matrix. */
import {
  ConversationHydrationRenderBridge,
  type ConversationHydrationRenderBridgeHost,
} from '../../../../src/features/chat/runtime/ConversationHydrationRenderBridge';
import type { ScrollRuntimeState } from '../../../../src/features/chat/services/ScrollManager';

/**
 * Faithful jsdom scroll-pane model: message rects are derived from the live
 * scrollTop, exactly like a real browser viewport, so anchor math converges
 * across the double-rAF re-apply instead of double-applying a static delta.
 */
interface PaneModel {
  messagesEl: HTMLElement;
  getScrollTop(): number;
  setScrollTop(value: number): void;
  addMessage(id: string, documentTop: number, height: number): HTMLElement;
  moveMessage(id: string, documentTop: number): void;
  clearMessages(): void;
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
    clearMessages() {
      messagesEl.innerHTML = '';
      // A real browser clamps scrollTop to 0 once the content collapses.
      scrollTop = 0;
    },
  };
}

function createHost(
  pane: PaneModel | null,
  runtime: ScrollRuntimeState | null,
  overrides: Partial<jest.Mocked<ConversationHydrationRenderBridgeHost>> = {},
) {
  const frames: FrameRequestCallback[] = [];
  const host: jest.Mocked<ConversationHydrationRenderBridgeHost> = {
    getMessagesContainer: jest.fn().mockReturnValue(pane?.messagesEl ?? null),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    getScrollRuntimeForTab: jest.fn().mockReturnValue(runtime),
    scrollToBottom: jest.fn(),
    syncPaneScrollMetrics: jest.fn(),
    requestAnimationFrame: jest.fn().mockImplementation((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }),
    ...overrides,
  };

  return {
    host,
    runFrames: () => {
      const pending = frames.splice(0, frames.length);
      pending.forEach((callback) => callback(16));
    },
  };
}

function createRuntime(overrides: Partial<ScrollRuntimeState> = {}): ScrollRuntimeState {
  return {
    autoScrollEnabled: false,
    programmaticScrollGuardUntil: 0,
    ...overrides,
  };
}

/** 2000px conversation, 400px viewport, four 500px messages. */
function buildConversation(pane: PaneModel): void {
  pane.addMessage('m-1', 0, 500);
  pane.addMessage('m-2', 500, 500);
  pane.addMessage('m-3', 1000, 500);
  pane.addMessage('m-4', 1500, 500);
}

describe('ConversationHydrationRenderBridge', () => {
  it('captures the hydration shell inputs from the live pre-clear DOM', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: false });
    const { host } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(true);

    expect(host.getScrollRuntimeForTab).toHaveBeenCalledWith('tab-1');
    expect(context).toMatchObject({
      activeTabId: 'tab-1',
      preserveScrollPosition: true,
      previousScrollTop: 1200,
      shouldStickToBottom: false,
    });
    // The full snapshot is captured on the live DOM before any clear: the
    // anchor is the first visible pre-clear message, not a post-rebuild one.
    expect(context.scrollSnapshot).toMatchObject({
      mode: 'preserve-anchor',
      scrollTop: 1200,
      distanceFromBottom: 400,
      anchorMessageId: 'm-3',
      anchorOffsetTop: -200,
    });
  });

  it('restores the pre-clear mid-conversation position after a full rebuild', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: false });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(context);
    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(true);

    // Full clear + rebuild, exactly what the transition bridge does.
    pane.clearMessages();
    buildConversation(pane);

    bridge.restoreHydrationShell(context);
    runFrames();

    expect(pane.getScrollTop()).toBe(1200);
    expect(host.scrollToBottom).not.toHaveBeenCalled();
    expect(host.syncPaneScrollMetrics).toHaveBeenCalledWith('tab-1', pane.messagesEl);
    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(false);
  });

  it('does not let an older restore rAF remove a newer hydration shell class', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: false });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);

    const older = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(older);
    bridge.restoreHydrationShell(older);
    const newer = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(newer);

    runFrames();

    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(true);
  });

  it('restores to the bottom when the user stayed at the bottom', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1600 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: true });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(context);
    pane.clearMessages();
    buildConversation(pane);

    bridge.restoreHydrationShell(context);
    runFrames();

    expect(host.scrollToBottom).toHaveBeenCalledWith({ tabId: 'tab-1' });
  });

  it('keeps the position of a user who scrolled away from the bottom during hydration', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1600 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: true });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(context);
    pane.clearMessages();
    buildConversation(pane);

    // The pane scroll handler applies user intent while hydration is running.
    pane.setScrollTop(250);
    runtime.autoScrollEnabled = false;

    bridge.restoreHydrationShell(context);
    runFrames();

    expect(host.scrollToBottom).not.toHaveBeenCalled();
    expect(pane.getScrollTop()).toBe(250);
  });

  it('restores to the bottom when the user scrolled to the bottom during hydration', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: false });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(context);
    pane.clearMessages();
    buildConversation(pane);

    pane.setScrollTop(1600);
    runtime.autoScrollEnabled = true;

    bridge.restoreHydrationShell(context);
    runFrames();

    expect(host.scrollToBottom).toHaveBeenCalledWith({ tabId: 'tab-1' });
  });

  it('re-applies the anchor when late-loading content shifts it, then yields to the user', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: false });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(context);
    pane.clearMessages();
    buildConversation(pane);

    bridge.restoreHydrationShell(context);
    runFrames();
    expect(pane.getScrollTop()).toBe(1200);

    // An image above the anchor finishes loading and pushes it down by 300px.
    pane.moveMessage('m-3', 1300);
    const image = document.createElement('img');
    pane.messagesEl.querySelector('[data-message-id="m-1"]')?.append(image);
    image.dispatchEvent(new Event('load'));
    runFrames();

    expect(pane.getScrollTop()).toBe(1500);

    // Once the user takes over, late content must stop moving the pane.
    pane.setScrollTop(900);
    image.dispatchEvent(new Event('load'));
    runFrames();

    expect(pane.getScrollTop()).toBe(900);
  });

  it('does nothing when there is no messages container', () => {
    const { host, runFrames } = createHost(null, null);
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(true);

    expect(context).toMatchObject({
      messagesEl: null,
      preserveScrollPosition: false,
      previousScrollTop: 0,
    });

    bridge.beginHydrationShell(context);
    bridge.restoreHydrationShell(context);
    runFrames();

    expect(host.scrollToBottom).not.toHaveBeenCalled();
    expect(host.syncPaneScrollMetrics).not.toHaveBeenCalled();
  });

  it('abortHydrationShell releases the shell class without restoring scroll', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: false });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(context);
    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(true);

    bridge.abortHydrationShell(context);
    runFrames();

    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(false);
    expect(host.scrollToBottom).not.toHaveBeenCalled();
    expect(host.syncPaneScrollMetrics).not.toHaveBeenCalled();
    expect(pane.getScrollTop()).toBe(1200);
  });

  it('keeps the shell class until every nested hydration owner ends', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: false, hydrationDepth: 2 });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);
    const context = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(context);
    bridge.restoreHydrationShell(context);

    runFrames();
    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(true);
    runtime.hydrationDepth = 1;
    runFrames();
    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(true);
    runtime.hydrationDepth = 0;
    runFrames();
    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(false);
  });

  it('bounds shell cleanup retries when a hydration owner leaks', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: false, hydrationDepth: 1 });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);
    const context = bridge.captureHydrationContext(true);
    bridge.beginHydrationShell(context);
    bridge.restoreHydrationShell(context);

    for (let frame = 0; frame < 200; frame += 1) {
      runFrames();
    }

    expect(host.requestAnimationFrame.mock.calls.length).toBeLessThan(200);
    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(true);
    runtime.hydrationDepth = 0;
    bridge.cleanupHydrationShell(context);
    expect(pane.messagesEl.classList.contains('is-rehydrating')).toBe(false);
  });

  it('goes to the bottom when scroll preservation is disabled', () => {
    const pane = createPaneModel({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 });
    buildConversation(pane);
    const runtime = createRuntime({ autoScrollEnabled: false });
    const { host, runFrames } = createHost(pane, runtime);
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(false);
    bridge.beginHydrationShell(context);
    pane.clearMessages();
    buildConversation(pane);

    bridge.restoreHydrationShell(context);
    runFrames();

    expect(host.scrollToBottom).toHaveBeenCalledWith({ tabId: 'tab-1' });
  });
});
