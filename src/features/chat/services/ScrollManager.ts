import {
  getProgrammaticScrollGuardDelayMs,
  isNearBottom as isNearBottomByMetrics,
} from '../autoScrollState';

export interface ScrollRuntimeState {
  autoScrollEnabled: boolean;
  programmaticScrollGuardUntil: number;
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
  runtime?: Pick<ScrollRuntimeState, 'programmaticScrollGuardUntil'> | null;
  onRestoreBottom?: () => void;
  onRestored?: (scrollTop: number) => void;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
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
    runtime.programmaticScrollGuardUntil = Date.now()
      + getProgrammaticScrollGuardDelayMs(options.behavior);
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

  const apply = () => {
    if (snapshot.mode === 'bottom') {
      options.onRestoreBottom?.();
      return;
    }

    if (options.runtime) {
      options.runtime.programmaticScrollGuardUntil = Date.now()
        + getProgrammaticScrollGuardDelayMs();
    }

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

    messagesEl.scrollTop = nextScrollTop;
    options.onRestored?.(nextScrollTop);
  };

  apply();
  scheduleAnimationFrame(() => {
    apply();
  });
}
