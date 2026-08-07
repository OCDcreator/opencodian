/**
 * Lifecycle registry for the lightweight collapsibles used by streaming
 * thinking/tool blocks. Chat message teardown can dispose these blocks without
 * importing renderer implementations (and without changing their behaviour).
 */
const disposersByWrapper = new WeakMap<HTMLElement, () => void>();

export function registerStreamingCollapsible(
  wrapperEl: HTMLElement,
  dispose: () => void,
): () => void {
  disposersByWrapper.get(wrapperEl)?.();

  let disposed = false;
  const registeredDispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    dispose();
    disposersByWrapper.delete(wrapperEl);
  };

  disposersByWrapper.set(wrapperEl, registeredDispose);
  return registeredDispose;
}

export function disposeStreamingCollapsible(wrapperEl: HTMLElement | null | undefined): void {
  if (!wrapperEl) {
    return;
  }
  disposersByWrapper.get(wrapperEl)?.();
}

export function disposeStreamingCollapsiblesWithin(
  rootEl: ParentNode | null | undefined,
): void {
  if (!rootEl) {
    return;
  }

  const selectors = '.streaming-thinking-block, .streaming-tool-call';
  const wrappers: HTMLElement[] = [];
  if (rootEl instanceof HTMLElement && rootEl.matches(selectors)) {
    wrappers.push(rootEl);
  }
  for (const wrapperEl of Array.from(rootEl.querySelectorAll(selectors))) {
    if (wrapperEl instanceof HTMLElement) {
      wrappers.push(wrapperEl);
    }
  }

  for (const wrapperEl of wrappers) {
    disposeStreamingCollapsible(wrapperEl);
  }
}
