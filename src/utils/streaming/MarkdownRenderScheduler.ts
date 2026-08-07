/**
 * Shared minimum interval between streamed markdown re-renders. Streaming
 * text (StreamController), thinking blocks and pseudo-stream reveals all
 * render cumulative markdown; capping redraw frequency keeps long messages,
 * code blocks and math from re-rendering on every chunk.
 */
export const STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS = 96;

/**
 * Coalesces markdown re-render requests into a shared frame budget: at most
 * one render per interval, with a leading-edge render when idle and a single
 * trailing render carrying the latest content. The render callback reads the
 * current content at render time, so coalesced bursts never render stale or
 * intermediate states.
 */
export class MarkdownRenderScheduler {
  private requested = false;
  private timerId: number | null = null;
  private inFlight: Promise<void> | null = null;
  private lastRenderAt = 0;
  private cancelled = false;

  constructor(
    private readonly render: () => Promise<void>,
    private readonly minIntervalMs: number = STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS,
  ) {}

  /** Request a render, coalesced into the frame budget. */
  schedule(): void {
    this.cancelled = false;
    this.requested = true;
    if (this.inFlight) {
      return;
    }
    if (this.timerId !== null) {
      return;
    }
    const delayMs = this.lastRenderAt === 0
      ? 0
      : Math.max(0, this.minIntervalMs - (Date.now() - this.lastRenderAt));
    this.timerId = window.setTimeout(() => {
      this.timerId = null;
      void this.runScheduled();
    }, delayMs);
  }

  /**
   * Render the latest content now, after any in-flight render settles, and
   * cancel the pending schedule. Used at stream boundaries where the final
   * content must be on screen before continuing.
   */
  async flush(): Promise<void> {
    const hadPendingRequest = this.requested;
    const hadInFlightRender = this.inFlight !== null;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.requested = false;
    while (this.inFlight) {
      await this.inFlight;
    }
    // A flush after cleanup/cancellation must not perform a detached DOM
    // write. Render only when this call (or a concurrent caller) still has a
    // pending request; an already-completed in-flight render is sufficient.
    const shouldRender = hadPendingRequest || hadInFlightRender || this.requested;
    this.requested = false;
    if (this.cancelled || !shouldRender) {
      return;
    }
    await this.render();
    this.lastRenderAt = Date.now();
  }

  /** Drop any pending render (e.g. teardown); in-flight renders complete. */
  cancel(): void {
    this.requested = false;
    this.cancelled = true;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private async runScheduled(): Promise<void> {
    if (!this.requested) {
      return;
    }
    this.requested = false;
    const renderPromise = Promise.resolve()
      .then(() => this.render())
      .then(() => {
        this.lastRenderAt = Date.now();
      })
      .finally(() => {
        if (this.inFlight === renderPromise) {
          this.inFlight = null;
        }
      });
    this.inFlight = renderPromise;
    // Scheduled renders are best-effort: a failed render must not become an
    // unhandled rejection from a timer; flush() surfaces errors to its caller.
    await renderPromise.catch(() => undefined);
    if (this.requested) {
      this.schedule();
    }
  }
}
