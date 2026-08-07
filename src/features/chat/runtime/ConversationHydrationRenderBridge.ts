import { markHydrationSettledMessages } from '../services/ConversationRenderRuntime';
import {
  bumpPaneRenderSurfaceGeneration,
  captureElementScrollRestoreSnapshot,
  type ConversationScrollRestoreSnapshot,
  getPaneRenderSurfaceGeneration,
  isElementNearBottom,
  LATE_CONTENT_SCROLL_REAPPLY_WINDOW_MS,
  resolveEffectiveScrollRestoreSnapshot,
  restoreElementScrollAfterRender,
  type ScrollRuntimeState,
} from '../services/ScrollManager';
import type { TabId } from '../tabs';

export interface ConversationHydrationRenderContext {
  activeTabId: TabId | null;
  messagesEl: HTMLElement | null;
  runtime: ScrollRuntimeState | null;
  preserveScrollPosition: boolean;
  previousScrollTop: number;
  shouldStickToBottom: boolean;
  /**
   * Full anchor/distance snapshot captured on the live DOM before any clear.
   * Capturing it later (after the rebuild) would pick a new-DOM anchor and
   * jump the restored position to the top.
   */
  scrollSnapshot: ConversationScrollRestoreSnapshot | null;
  shellGeneration: number;
  paneSurfaceGeneration: number;
}

export interface ConversationHydrationRenderBridgeHost {
  getMessagesContainer(): HTMLElement | null;
  getActiveTabId(): TabId | null;
  getScrollRuntimeForTab(tabId: TabId | null): ScrollRuntimeState | null;
  scrollToBottom(options: { tabId: TabId | null }): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl: HTMLElement): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  commitHydrationStaging(messagesEl: HTMLElement, stagingEl: HTMLElement): void;
}

export interface ConversationHydrationRenderPort {
  captureHydrationContext(preserveScrollPosition: boolean): ConversationHydrationRenderContext;
  beginHydrationShell(context: ConversationHydrationRenderContext): void;
  restoreHydrationShell(context: ConversationHydrationRenderContext): void;
  abortHydrationShell(context: ConversationHydrationRenderContext): void;
  getStagingContainer(context: ConversationHydrationRenderContext): HTMLElement | null;
  commitStaging(context: ConversationHydrationRenderContext): void;
  /** Explicit end-of-owner hook used when bounded rAF cleanup has stopped retrying. */
  cleanupHydrationShell?(context: ConversationHydrationRenderContext): void;
  getCurrentContext(): ConversationHydrationRenderContext | null;
}

export class ConversationHydrationRenderBridge implements ConversationHydrationRenderPort {
  private static readonly MAX_SHELL_CLEANUP_FRAMES = 120;
  private shellGeneration = 0;
  private readonly stagingByContext = new WeakMap<object, HTMLElement>();
  private currentContext: ConversationHydrationRenderContext | null = null;

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
    const scrollSnapshot = shouldPreserveScrollPosition && messagesEl
      ? captureElementScrollRestoreSnapshot(messagesEl, shouldStickToBottom, previousScrollTop)
      : null;

    return {
      activeTabId,
      messagesEl,
      runtime,
      preserveScrollPosition: shouldPreserveScrollPosition,
      previousScrollTop,
      shouldStickToBottom,
      scrollSnapshot,
      shellGeneration: 0,
      paneSurfaceGeneration: 0,
    };
  }

  beginHydrationShell(context: ConversationHydrationRenderContext): void {
    context.shellGeneration = ++this.shellGeneration;
    context.paneSurfaceGeneration = bumpPaneRenderSurfaceGeneration(context.messagesEl);
    context.messagesEl?.classList.add('is-rehydrating');
    this.stagingByContext.set(context, document.createElement('div'));
    this.currentContext = context;
  }

  getCurrentContext(): ConversationHydrationRenderContext | null { return this.currentContext; }

  getStagingContainer(context: ConversationHydrationRenderContext): HTMLElement | null {
    return this.stagingByContext.get(context) ?? null;
  }

  commitStaging(context: ConversationHydrationRenderContext): void {
    const messagesEl = context.messagesEl;
    const stagingEl = this.stagingByContext.get(context);
    if (!messagesEl || !stagingEl) return;
    this.host.commitHydrationStaging(messagesEl, stagingEl);
    this.stagingByContext.delete(context);
    if (this.currentContext === context) this.currentContext = null;
  }

  cleanupHydrationShell(context: ConversationHydrationRenderContext): void {
    const messagesEl = context.messagesEl;
    if (!messagesEl || this.host.getMessagesContainer() !== messagesEl) {
      return;
    }
    const hydrationDepth = this.host.getScrollRuntimeForTab(context.activeTabId)?.hydrationDepth ?? 0;
    if (hydrationDepth <= 0) {
      messagesEl.classList.remove('is-rehydrating');
    }
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

    // Prefer the live auto-scroll state over the capture-time one: the pane
    // scroll handler keeps it in sync with user intent during hydration.
    const currentStickToBottom = runtime?.autoScrollEnabled ?? shouldStickToBottom;
    const capturedSnapshot = context.scrollSnapshot ?? captureElementScrollRestoreSnapshot(
      messagesEl,
      !preserveScrollPosition || currentStickToBottom,
      previousScrollTop,
    );
    const scrollSnapshot = resolveEffectiveScrollRestoreSnapshot(messagesEl, capturedSnapshot, {
      preserveScrollPosition,
      stickToBottom: currentStickToBottom,
      userScrollIntent: runtime?.userScrollIntentDuringHydration,
    });

    const shellGeneration = context.shellGeneration;
    const paneSurfaceGeneration = getPaneRenderSurfaceGeneration(messagesEl);
    context.paneSurfaceGeneration = paneSurfaceGeneration;
    restoreElementScrollAfterRender(messagesEl, scrollSnapshot, {
      runtime,
      lateContentReapplyWindowMs: LATE_CONTENT_SCROLL_REAPPLY_WINDOW_MS,
      isRestoreCurrent: () => this.shellGeneration === shellGeneration
        && this.host.getMessagesContainer() === messagesEl
        && getPaneRenderSurfaceGeneration(messagesEl) === paneSurfaceGeneration,
      onRestoreBottom: () => {
        this.host.scrollToBottom({ tabId: activeTabId });
      },
      onRestored: () => {
        this.host.syncPaneScrollMetrics(activeTabId, messagesEl);
      },
      requestAnimationFrame: (callback) => this.host.requestAnimationFrame(callback),
    });
    markHydrationSettledMessages(messagesEl);

    // Rendering the rebuilt messages may advance the shared pane token within
    // this same hydration transaction; cleanup is bound to that post-render token.
    let cleanupFrames = 0;
    const removeShellWhenOutermost = (): void => {
      cleanupFrames += 1;
      // The shell class belongs to the entire pane hydration transaction. A
      // nested pass can finish while its outer pass is still rendering, so
      // depth=1 is not safe to treat as settled: that is the remaining outer
      // owner, not an empty depth. Read the current runtime rather than the
      // capture-time object because tab activation may have refreshed it.
      const activeHydrationDepth = this.host.getScrollRuntimeForTab(activeTabId)?.hydrationDepth ?? 0;
      if (this.shellGeneration === shellGeneration
        && this.host.getMessagesContainer() === messagesEl
        && getPaneRenderSurfaceGeneration(messagesEl) === paneSurfaceGeneration
        && activeHydrationDepth <= 0) {
        messagesEl.classList.remove('is-rehydrating');
        return;
      }
      if (this.shellGeneration === shellGeneration
        && this.host.getMessagesContainer() === messagesEl
        && getPaneRenderSurfaceGeneration(messagesEl) === paneSurfaceGeneration) {
        if (cleanupFrames < ConversationHydrationRenderBridge.MAX_SHELL_CLEANUP_FRAMES) {
          this.host.requestAnimationFrame(removeShellWhenOutermost);
        }
      }
    };
    this.host.requestAnimationFrame(removeShellWhenOutermost);
  }

  /**
   * A superseded conversation load skips scroll restore entirely, but it must
   * still release the rehydrating shell class its begin step added.
   */
  abortHydrationShell(context: ConversationHydrationRenderContext): void {
    const { messagesEl } = context;
    if (!messagesEl) {
      return;
    }
    this.stagingByContext.delete(context);
    if (this.currentContext === context) this.currentContext = null;

    const shellGeneration = context.shellGeneration;
    context.paneSurfaceGeneration = getPaneRenderSurfaceGeneration(messagesEl);
    const paneSurfaceGeneration = context.paneSurfaceGeneration;
    let cleanupFrames = 0;
    const removeShellWhenOutermost = (): void => {
      cleanupFrames += 1;
      const activeHydrationDepth = this.host.getScrollRuntimeForTab(context.activeTabId)?.hydrationDepth ?? 0;
      if (this.shellGeneration === shellGeneration
        && this.host.getMessagesContainer() === messagesEl
        && getPaneRenderSurfaceGeneration(messagesEl) === paneSurfaceGeneration
        && activeHydrationDepth <= 0) {
        messagesEl.classList.remove('is-rehydrating');
        return;
      }
      if (this.shellGeneration === shellGeneration
        && this.host.getMessagesContainer() === messagesEl
        && getPaneRenderSurfaceGeneration(messagesEl) === paneSurfaceGeneration) {
        if (cleanupFrames < ConversationHydrationRenderBridge.MAX_SHELL_CLEANUP_FRAMES) {
          this.host.requestAnimationFrame(removeShellWhenOutermost);
        }
      }
    };
    this.host.requestAnimationFrame(removeShellWhenOutermost);
  }
}
