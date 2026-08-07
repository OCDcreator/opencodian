import {
  getProgrammaticScrollGuardDelayMs,
  isNearBottom as isNearBottomByMetrics,
} from '../autoScrollState';

export interface ScrollRuntimeState {
  autoScrollEnabled: boolean;
  programmaticScrollGuardUntil: number;
  isHydratingConversation?: boolean;
  /** Number of nested render/hydration passes owning the pane shell. */
  hydrationDepth?: number;
  /** Set by the pane while a hydration rebuild observes a real user scroll. */
  userScrollIntentDuringHydration?: boolean;
}

export type ConversationScrollRestoreMode = 'bottom' | 'preserve-distance' | 'preserve-anchor';

export interface ConversationScrollRestoreSnapshot {
  mode: ConversationScrollRestoreMode;
  scrollTop: number;
  distanceFromBottom: number;
  anchorMessageId: string | null;
  anchorOffsetTop: number;
}

export interface ScrollToBottomOptions {
  behavior?: ScrollBehavior;
  enableAutoScroll?: boolean;
}

export interface RestoreElementScrollOptions {
  runtime?: Pick<ScrollRuntimeState, 'programmaticScrollGuardUntil'>
    & Partial<Pick<ScrollRuntimeState, 'userScrollIntentDuringHydration'>>
    | null;
  onRestoreBottom?: () => void;
  onRestored?: (scrollTop: number) => void;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  /**
   * When > 0 and the snapshot preserves an anchor, keep correcting the anchor
   * position as late-loading content (images) fires load events inside the
   * container. Any user scroll after the last applied restore disposes the
   * correction early; it always ends after this many milliseconds.
   */
  lateContentReapplyWindowMs?: number;
  /** Returns whether this restore transaction still owns the pane surface. */
  isRestoreCurrent?: () => boolean;
}

/**
 * How long after an anchor-preserving restore we keep correcting the scroll
 * position for late-loading content such as images.
 */
export const LATE_CONTENT_SCROLL_REAPPLY_WINDOW_MS = 1500;

/**
 * Arms the programmatic scroll guard on a runtime state. Extracted so that
 * programmatic mutations other than scroll-to-bottom (for example clearing
 * the messages container, which clamps scrollTop and fires a scroll event)
 * can mark their induced scrolls as programmatic too.
 */
export function armProgrammaticScrollGuard(
  runtime: Pick<ScrollRuntimeState, 'programmaticScrollGuardUntil'>,
  behavior: ScrollBehavior = 'auto',
): void {
  runtime.programmaticScrollGuardUntil = Date.now()
    + getProgrammaticScrollGuardDelayMs(behavior);
}

export function isElementNearBottom(messagesEl: HTMLElement, threshold?: number): boolean {
  return isNearBottomByMetrics({
    scrollTop: messagesEl.scrollTop,
    scrollHeight: messagesEl.scrollHeight,
    clientHeight: messagesEl.clientHeight,
  }, threshold);
}

export function scrollElementToBottom(
  messagesEl: HTMLElement,
  runtime?: ScrollRuntimeState | null,
  options: ScrollToBottomOptions = {},
): void {
  if (options.enableAutoScroll && runtime) {
    runtime.autoScrollEnabled = true;
  }

  if (runtime) {
    armProgrammaticScrollGuard(runtime, options.behavior);
  }

  if (options.behavior === 'smooth') {
    messagesEl.scrollTo({
      top: messagesEl.scrollHeight,
      behavior: 'smooth',
    });
    return;
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

export function captureElementScrollRestoreSnapshot(
  messagesEl: HTMLElement,
  shouldStickToBottom: boolean,
  fallbackScrollTop = messagesEl.scrollTop,
): ConversationScrollRestoreSnapshot {
  const scrollTop = Number.isFinite(fallbackScrollTop) ? fallbackScrollTop : messagesEl.scrollTop;
  const distanceFromBottom = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight - scrollTop);
  const messageElements = Array.from(messagesEl.querySelectorAll<HTMLElement>('.opencodian-message[data-message-id]'));
  const containerRect = messagesEl.getBoundingClientRect();
  const anchorMessageEl = messageElements.find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= containerRect.top;
  }) ?? null;

  return {
    mode: shouldStickToBottom
      ? 'bottom'
      : anchorMessageEl?.dataset.messageId
        ? 'preserve-anchor'
        : 'preserve-distance',
    scrollTop,
    distanceFromBottom,
    anchorMessageId: anchorMessageEl?.dataset.messageId ?? null,
    anchorOffsetTop: anchorMessageEl
      ? anchorMessageEl.getBoundingClientRect().top - containerRect.top
      : 0,
  };
}

/**
 * Reconciles a captured scroll snapshot with the stick-to-bottom state that
 * applies at restore time. A snapshot captured while the user was at the
 * bottom must not drag them back down if they scrolled away while the
 * rebuild was in flight, and vice versa.
 */
export function adjustScrollRestoreSnapshotForStickiness(
  snapshot: ConversationScrollRestoreSnapshot,
  stickToBottom: boolean,
): ConversationScrollRestoreSnapshot {
  if (stickToBottom) {
    return snapshot.mode === 'bottom' ? snapshot : { ...snapshot, mode: 'bottom' };
  }
  if (snapshot.mode === 'bottom') {
    return {
      ...snapshot,
      mode: snapshot.anchorMessageId ? 'preserve-anchor' : 'preserve-distance',
    };
  }
  return snapshot;
}

/**
 * Decides which snapshot a restore should actually apply, given the state of
 * the freshly rebuilt container. A rebuilt pane sits at scrollTop 0 unless
 * the user scrolled while the rebuild was in flight; any non-zero position is
 * therefore user intent and wins over the pre-clear snapshot.
 */
export function resolveEffectiveScrollRestoreSnapshot(
  messagesEl: HTMLElement,
  captured: ConversationScrollRestoreSnapshot,
  options: {
    preserveScrollPosition: boolean;
    stickToBottom: boolean;
    /** True when the pane observed a user scroll during the rebuild. */
    userScrollIntent?: boolean;
  },
): ConversationScrollRestoreSnapshot {
  if (!options.preserveScrollPosition) {
    return { ...captured, mode: 'bottom' };
  }
  // A deliberate scroll to the very top is a valid user position too. The
  // pane records that event because a freshly rebuilt container also starts at
  // zero, so the position alone cannot distinguish the two cases.
  if (options.userScrollIntent || messagesEl.scrollTop > 0) {
    return isElementNearBottom(messagesEl)
      ? { ...captured, mode: 'bottom' }
      : captureElementScrollRestoreSnapshot(messagesEl, false);
  }
  return adjustScrollRestoreSnapshotForStickiness(captured, options.stickToBottom);
}

/**
 * Owns the double-requestAnimationFrame scheduling used to defer scroll-to-bottom
 * until layout has settled. Extracted from OpenCodianView so that the rAF frame
 * ID and cancellation logic live in scroll-owned code, not in the view itself.
 */
export class SettledScrollScheduler {
  private frameId: number | null = null;

  /**
   * Schedule a double-rAF settled scroll. Any previously scheduled frame is
   * cancelled first, ensuring at most one pending settled scroll at a time.
   */
  schedule(executor: () => void): void {
    this.clear();
    this.frameId = window.requestAnimationFrame(() => {
      this.frameId = window.requestAnimationFrame(() => {
        this.frameId = null;
        executor();
      });
    });
  }

  /** Cancel any pending settled scroll. */
  clear(): void {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
}

export function restoreElementScrollAfterRender(
  messagesEl: HTMLElement,
  snapshot: ConversationScrollRestoreSnapshot,
  options: RestoreElementScrollOptions = {},
): void {
  const scheduleAnimationFrame = options.requestAnimationFrame
    ?? globalThis.requestAnimationFrame?.bind(globalThis)
    ?? ((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));

  const trackLateContent = (options.lateContentReapplyWindowMs ?? 0) > 0
    && snapshot.mode === 'preserve-anchor'
    && Boolean(snapshot.anchorMessageId);
  let disposed = false;
  let lastAppliedScrollTop: number | null = null;
  let userScrollIntent = false;
  let isApplying = false;
  let localProgrammaticScrollGuardUntil = 0;
  const isRestoreCurrent = options.isRestoreCurrent ?? (() => true);
  let resizeObserver: ResizeObserver | null = null;
  let lateCorrectionFramePending = false;
  let dispose = () => {};

  const handleUserScroll = () => {
    if (disposed || isApplying) {
      return;
    }
    if (options.runtime?.userScrollIntentDuringHydration) {
      userScrollIntent = true;
      dispose();
      return;
    }
    const guardUntil = Math.max(
      localProgrammaticScrollGuardUntil,
      options.runtime?.programmaticScrollGuardUntil ?? 0,
    );
    if (Date.now() < guardUntil) {
      return;
    }
    // A real scroll event is an explicit hand-off, even when the user landed
    // on the same pixel. This prevents the deferred frame from reclaiming the
    // pane after the first restore.
    userScrollIntent = true;
    dispose();
  };

  const apply = () => {
    if (disposed || !isRestoreCurrent()) {
      return;
    }
    if (snapshot.mode === 'bottom') {
      isApplying = true;
      options.onRestoreBottom?.();
      isApplying = false;
      lastAppliedScrollTop = messagesEl.scrollTop;
      return;
    }

    if (options.runtime) {
      options.runtime.programmaticScrollGuardUntil = Date.now()
        + getProgrammaticScrollGuardDelayMs();
    }
    localProgrammaticScrollGuardUntil = Date.now() + getProgrammaticScrollGuardDelayMs();

    const maxScrollTop = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);
    let nextScrollTop = Math.min(Math.max(0, snapshot.scrollTop), maxScrollTop);

    if (snapshot.mode === 'preserve-anchor' && snapshot.anchorMessageId) {
      const anchorEl = Array.from(messagesEl.querySelectorAll<HTMLElement>('.opencodian-message[data-message-id]'))
        .find((element) => element.dataset.messageId === snapshot.anchorMessageId) ?? null;
      if (anchorEl) {
        const anchorOffsetTop = anchorEl.getBoundingClientRect().top - messagesEl.getBoundingClientRect().top;
        nextScrollTop = Math.min(
          Math.max(0, messagesEl.scrollTop + (anchorOffsetTop - snapshot.anchorOffsetTop)),
          maxScrollTop,
        );
      } else {
        nextScrollTop = Math.min(Math.max(0, maxScrollTop - snapshot.distanceFromBottom), maxScrollTop);
      }
    } else {
      nextScrollTop = Math.min(Math.max(0, maxScrollTop - snapshot.distanceFromBottom), maxScrollTop);
    }

    isApplying = true;
    messagesEl.scrollTop = nextScrollTop;
    isApplying = false;
    lastAppliedScrollTop = nextScrollTop;
    options.onRestored?.(nextScrollTop);
  };

  dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    messagesEl.removeEventListener('scroll', handleUserScroll, true);
    if (trackLateContent) {
      messagesEl.removeEventListener('load', handleLateContentLoad, true);
      resizeObserver?.disconnect();
      resizeObserver = null;
    }
  };
  messagesEl.addEventListener('scroll', handleUserScroll, true);

  apply();
  scheduleAnimationFrame(() => {
    if (!isRestoreCurrent() || userScrollIntent || options.runtime?.userScrollIntentDuringHydration || (
      lastAppliedScrollTop !== null && messagesEl.scrollTop !== lastAppliedScrollTop
    )) {
      dispose();
      return;
    }
    apply();
  });

  if (!trackLateContent) {
    return;
  }

  const handleLateContentLoad = () => {
    if (disposed || !isRestoreCurrent()) {
      dispose();
      return;
    }
    if (lateCorrectionFramePending) {
      return;
    }
    lateCorrectionFramePending = true;
    scheduleAnimationFrame(() => {
      lateCorrectionFramePending = false;
      if (disposed || !isRestoreCurrent()) {
        dispose();
        return;
      }
      if (lastAppliedScrollTop !== null && messagesEl.scrollTop !== lastAppliedScrollTop) {
        // The user took over scrolling after the restore; stop correcting.
        dispose();
        return;
      }
      apply();
    });
  };
  messagesEl.addEventListener('load', handleLateContentLoad, true);
  if (typeof ResizeObserver !== 'undefined') {
    // MathJax, Mermaid, fonts, and custom embeds can resize after their
    // resource load event. Observe the pane for the same short, ownership-
    // guarded correction window so anchor restoration covers those paths too.
    resizeObserver = new ResizeObserver(() => handleLateContentLoad());
    resizeObserver.observe(messagesEl);
  }
  window.setTimeout(() => {
    if (!isRestoreCurrent()) {
      dispose();
      return;
    }
    dispose();
  }, options.lateContentReapplyWindowMs);
}
const paneRenderSurfaceGenerations = new WeakMap<HTMLElement, number>();

export function getPaneRenderSurfaceGeneration(messagesEl: HTMLElement | null): number {
  return messagesEl ? paneRenderSurfaceGenerations.get(messagesEl) ?? 0 : 0;
}

export function bumpPaneRenderSurfaceGeneration(messagesEl: HTMLElement | null): number {
  if (!messagesEl) {
    return 0;
  }
  const generation = getPaneRenderSurfaceGeneration(messagesEl) + 1;
  paneRenderSurfaceGenerations.set(messagesEl, generation);
  return generation;
}
