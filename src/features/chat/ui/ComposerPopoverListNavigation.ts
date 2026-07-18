export function getPopoverOptions(rootEl: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(rootEl.querySelectorAll<HTMLElement>(selector));
}

export function getSelectedPopoverOptionIndex(rootEl: HTMLElement, selector: string): number | null {
  const selectedIndex = getPopoverOptions(rootEl, selector)
    .findIndex((optionEl) => optionEl.getAttribute('aria-selected') === 'true');
  return selectedIndex === -1 ? null : selectedIndex;
}

export function focusPopoverOption(rootEl: HTMLElement, selector: string, index: number): number | null {
  const options = getPopoverOptions(rootEl, selector);
  if (options.length === 0) {
    return null;
  }

  const activeIndex = Math.min(Math.max(index, 0), options.length - 1);
  for (const optionEl of options) {
    optionEl.tabIndex = -1;
  }

  const activeOption = options[activeIndex];
  activeOption.tabIndex = 0;
  activeOption.focus({ preventScroll: true });
  activeOption.scrollIntoView({ block: 'nearest' });
  return activeIndex;
}

export function movePopoverOptionFocus(
  rootEl: HTMLElement,
  selector: string,
  currentIndex: number | null,
  direction: 1 | -1,
): number | null {
  const options = getPopoverOptions(rootEl, selector);
  if (options.length === 0) {
    return null;
  }

  const selectedIndex = getSelectedPopoverOptionIndex(rootEl, selector);
  const startIndex = currentIndex ?? selectedIndex ?? (direction === 1 ? -1 : 0);
  const nextIndex = (startIndex + direction + options.length) % options.length;
  return focusPopoverOption(rootEl, selector, nextIndex);
}
