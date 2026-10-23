const STORAGE_PREFIX = 'opencodian:settings-textarea-size:';

/**
 * Remembers user-resized textarea heights across sessions using localStorage.
 *
 * Usage:
 *   const m = TextareaSizeMemory.attach(textareaEl, 'my-stable-key');
 *   // later:
 *   m.destroy();
 *
 * For Obsidian `addTextArea` callbacks, pass `text.inputEl` as the textarea.
 */
export class TextareaSizeMemory {
  private readonly textarea: HTMLTextAreaElement;
  private readonly storageKey: string;
  private observer: ResizeObserver | null = null;
  private destroyed = false;

  private constructor(textarea: HTMLTextAreaElement, key: string) {
    this.textarea = textarea;
    this.storageKey = `${STORAGE_PREFIX}${key}`;
  }

  /**
   * Attach size memory to a textarea. Restores saved height immediately
   * and starts observing resize changes for persistence.
   */
  static attach(textarea: HTMLTextAreaElement, key: string): TextareaSizeMemory {
    const memory = new TextareaSizeMemory(textarea, key);
    memory.restore();
    memory.startObserving();
    return memory;
  }

  /** Restore previously saved height from localStorage. */
  private restore(): void {
    try {
      const saved = window.localStorage.getItem(this.storageKey);
      if (saved) {
        const height = Number.parseInt(saved, 10);
        if (height > 0) {
          this.textarea.style.height = `${height}px`;
        }
      }
    } catch {
      // localStorage unavailable (private browsing, etc.)
    }
  }

  /** Start observing textarea size changes. */
  private startObserving(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.observer = new ResizeObserver((entries) => {
      if (this.destroyed) {
        return;
      }
      for (const entry of entries) {
        const height = this.measureHeight(entry);
        if (height > 0) {
          this.persist(height);
        }
      }
    });
    this.observer.observe(this.textarea);
  }

  /** Persist a height value to localStorage. */
  private persist(height: number): void {
    try {
      window.localStorage.setItem(this.storageKey, `${height}`);
    } catch {
      // ignore storage failures
    }
  }

  /**
   * Test-only: simulate a resize event. In production, ResizeObserver
   * fires automatically. This method exists because jsdom does not fire
   * real ResizeObserver callbacks for style changes.
   */
  simulateResize(height: number): void {
    if (!this.destroyed) {
      this.persist(height);
    }
  }

  private measureHeight(entry: ResizeObserverEntry): number {
    const boxHeight = this.textarea.getBoundingClientRect().height || this.textarea.offsetHeight;
    if (boxHeight > 0) {
      return Math.round(boxHeight);
    }
    return Math.round(entry.contentRect.height);
  }

  /** Stop observing and clean up. Call when the textarea is removed. */
  destroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = null;
  }
}
