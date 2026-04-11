export function syncModelSelectorStickyHeaders(
  scrollContainer: HTMLElement,
  headers: readonly HTMLElement[],
): void {
  const scrollRect = scrollContainer.getBoundingClientRect();
  const isScrolled = scrollContainer.scrollTop > 0;

  for (const header of headers) {
    const headerRect = header.getBoundingClientRect();
    const isStuck = headerRect.top <= scrollRect.top + 1 && isScrolled;
    header.setAttribute('data-stuck', String(isStuck));
  }
}

export function bindModelSelectorStickyHeaders(
  scrollContainer: HTMLElement,
  headers: readonly HTMLElement[],
): () => void {
  const handler = () => {
    syncModelSelectorStickyHeaders(scrollContainer, headers);
  };

  scrollContainer.addEventListener('scroll', handler, { passive: true });
  handler();

  let disposed = false;
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    scrollContainer.removeEventListener('scroll', handler);
  };
}
