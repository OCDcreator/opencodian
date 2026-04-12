import type {
  ScrollRuntimeState,
} from '../services/ScrollManager';
import {
  captureElementScrollRestoreSnapshot,
  isElementNearBottom,
  restoreElementScrollAfterRender,
} from '../services/ScrollManager';
import type { TabId } from '../tabs';

export interface ConversationHydrationRenderContext {
  activeTabId: TabId | null;
  messagesEl: HTMLElement | null;
  runtime: ScrollRuntimeState | null;
  preserveScrollPosition: boolean;
  previousScrollTop: number;
  shouldStickToBottom: boolean;
}

export interface ConversationHydrationRenderBridgeHost {
  getMessagesContainer(): HTMLElement | null;
  getActiveTabId(): TabId | null;
  getScrollRuntimeForTab(tabId: TabId | null): ScrollRuntimeState | null;
  scrollToBottom(options: { tabId: TabId | null }): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl: HTMLElement): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
}

export interface ConversationHydrationRenderPort {
  captureHydrationContext(preserveScrollPosition: boolean): ConversationHydrationRenderContext;
  beginHydrationShell(context: ConversationHydrationRenderContext): void;
  restoreHydrationShell(context: ConversationHydrationRenderContext): void;
}

export class ConversationHydrationRenderBridge implements ConversationHydrationRenderPort {
  constructor(private readonly host: ConversationHydrationRenderBridgeHost) {}

  captureHydrationContext(preserveScrollPosition: boolean): ConversationHydrationRenderContext {
    const messagesEl = this.host.getMessagesContainer();
    const activeTabId = this.host.getActiveTabId();
    const runtime = this.host.getScrollRuntimeForTab(activeTabId);
    const shouldPreserveScrollPosition = Boolean(preserveScrollPosition && messagesEl);
    const previousScrollTop = shouldPreserveScrollPosition && messagesEl
      ? messagesEl.scrollTop
      : 0;
    const shouldStickToBottom = shouldPreserveScrollPosition && messagesEl
      ? runtime?.autoScrollEnabled ?? isElementNearBottom(messagesEl)
      : true;

    return {
      activeTabId,
      messagesEl,
      runtime,
      preserveScrollPosition: shouldPreserveScrollPosition,
      previousScrollTop,
      shouldStickToBottom,
    };
  }

  beginHydrationShell(context: ConversationHydrationRenderContext): void {
    context.messagesEl?.classList.add('is-rehydrating');
  }

  restoreHydrationShell(context: ConversationHydrationRenderContext): void {
    const {
      activeTabId,
      messagesEl,
      preserveScrollPosition,
      previousScrollTop,
      runtime,
      shouldStickToBottom,
    } = context;
    if (!messagesEl) {
      return;
    }

    if (runtime) {
      runtime.autoScrollEnabled = shouldStickToBottom;
    }

    const scrollSnapshot = captureElementScrollRestoreSnapshot(
      messagesEl,
      !preserveScrollPosition || shouldStickToBottom,
      previousScrollTop,
    );

    restoreElementScrollAfterRender(messagesEl, scrollSnapshot, {
      runtime,
      onRestoreBottom: () => {
        this.host.scrollToBottom({ tabId: activeTabId });
      },
      onRestored: () => {
        this.host.syncPaneScrollMetrics(activeTabId, messagesEl);
      },
      requestAnimationFrame: (callback) => this.host.requestAnimationFrame(callback),
    });

    this.host.requestAnimationFrame(() => {
      messagesEl.classList.remove('is-rehydrating');
    });
  }
}
