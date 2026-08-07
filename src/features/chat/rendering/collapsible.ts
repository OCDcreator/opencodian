import { disposeStreamingCollapsiblesWithin } from '../../../utils/streaming/streamingCollapsible';

export interface CollapsibleState {
  isExpanded: boolean;
  isCollapsible: boolean;
}

export interface CollapsibleOptions {
  collapsedHeight?: number;
  minOverflow?: number;
  showMoreLabel?: string;
  showLessLabel?: string;
}

export interface SetupCollapsibleOptions {
  wrapperEl: HTMLElement;
  headerEl: HTMLElement;
  contentEl: HTMLElement;
  state: CollapsibleState;
  options?: CollapsibleOptions;
  onToggle?: (isExpanded: boolean) => void;
}

const DEFAULT_COLLAPSED_HEIGHT = 168;
const DEFAULT_MIN_OVERFLOW = 24;

/**
 * Live dispose handles keyed by the collapsible wrapper element, so code that
 * removes a rendered subtree (container clears, in-place re-renders) can
 * release observers and listeners without knowing each setup call site.
 */
const disposersByWrapper = new WeakMap<HTMLElement, () => void>();

/**
 * Disconnect observers and remove listeners for every collapsible inside
 * `rootEl`. Call before dropping or replacing a rendered message subtree;
 * undisposed ResizeObservers otherwise keep detached content elements alive
 * (potential retention risk).
 */
export function disposeCollapsiblesWithin(rootEl: ParentNode | null | undefined): void {
  if (!rootEl) {
    return;
  }

  for (const wrapperEl of Array.from(rootEl.querySelectorAll('.opencodian-collapsible'))) {
    if (wrapperEl instanceof HTMLElement) {
      disposersByWrapper.get(wrapperEl)?.();
    }
  }

  disposeStreamingCollapsiblesWithin(rootEl);
}

export function setupCollapsible(setup: SetupCollapsibleOptions): () => void {
  const {
    wrapperEl,
    headerEl,
    contentEl,
    state,
    options = {},
    onToggle,
  } = setup;
  const collapsedHeight = options.collapsedHeight ?? DEFAULT_COLLAPSED_HEIGHT;
  const minOverflow = options.minOverflow ?? DEFAULT_MIN_OVERFLOW;
  const showMoreLabel = options.showMoreLabel ?? 'Show more';
  const showLessLabel = options.showLessLabel ?? 'Show less';

  state.isExpanded = state.isExpanded ?? false;
  state.isCollapsible = false;

  wrapperEl.classList.add('opencodian-collapsible');
  contentEl.classList.add('opencodian-collapsible-content');
  headerEl.classList.add('opencodian-collapsible-toggle');
  headerEl.setAttribute('aria-expanded', 'false');
  headerEl.setAttribute('aria-hidden', 'true');
  headerEl.setAttribute('hidden', 'true');
  headerEl.setAttribute('type', 'button');
  headerEl.tabIndex = -1;
  wrapperEl.style.setProperty('--opencodian-collapsible-max-height', `${collapsedHeight}px`);

  const applyState = (): void => {
    const isCollapsible = contentEl.scrollHeight > collapsedHeight + minOverflow;
    state.isCollapsible = isCollapsible;

    wrapperEl.classList.toggle('is-collapsible', isCollapsible);
    wrapperEl.classList.toggle('is-expanded', isCollapsible && state.isExpanded);
    wrapperEl.classList.toggle('is-collapsed', isCollapsible && !state.isExpanded);

    if (!isCollapsible) {
      state.isExpanded = false;
      headerEl.setAttribute('aria-expanded', 'false');
      headerEl.setAttribute('aria-hidden', 'true');
      headerEl.setAttribute('hidden', 'true');
      headerEl.tabIndex = -1;
      headerEl.textContent = '';
      return;
    }

    headerEl.removeAttribute('hidden');
    headerEl.setAttribute('aria-hidden', 'false');
    headerEl.tabIndex = 0;
    headerEl.setAttribute('aria-expanded', String(state.isExpanded));
    headerEl.textContent = state.isExpanded ? showLessLabel : showMoreLabel;
  };

  const toggle = (): void => {
    if (!state.isCollapsible) {
      return;
    }
    state.isExpanded = !state.isExpanded;
    applyState();
    onToggle?.(state.isExpanded);
  };

  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    toggle();
  };
  headerEl.addEventListener('click', onClick);
  headerEl.addEventListener('keydown', onKeydown);

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => applyState());
    observer.observe(contentEl);
  }

  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    observer?.disconnect();
    headerEl.removeEventListener('click', onClick);
    headerEl.removeEventListener('keydown', onKeydown);
    disposersByWrapper.delete(wrapperEl);
  };
  disposersByWrapper.set(wrapperEl, dispose);

  applyState();

  return dispose;
}
