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

const DEFAULT_COLLAPSED_HEIGHT = 168;
const DEFAULT_MIN_OVERFLOW = 24;

export function setupCollapsible(
  wrapperEl: HTMLElement,
  headerEl: HTMLElement,
  contentEl: HTMLElement,
  state: CollapsibleState,
  options: CollapsibleOptions = {},
): void {
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
  };

  headerEl.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });

  headerEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    toggle();
  });

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => applyState());
    observer.observe(contentEl);
  }

  applyState();
}
