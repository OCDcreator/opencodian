import {
  type CollapsibleState,
  disposeCollapsiblesWithin,
  setupCollapsible,
} from '../../../../src/features/chat/rendering/collapsible';

describe('setupCollapsible', () => {
  const labels = {
    showMoreLabel: 'Show more',
    showLessLabel: 'Show less',
  };

  function createElements() {
    const wrapperEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const headerEl = document.createElement('button');
    wrapperEl.append(contentEl, headerEl);
    return { wrapperEl, contentEl, headerEl };
  }

  it('keeps short content expanded without toggle', () => {
    const { wrapperEl, contentEl, headerEl } = createElements();
    Object.defineProperty(contentEl, 'scrollHeight', { configurable: true, value: 120 });

    const state: CollapsibleState = { isExpanded: false, isCollapsible: false };
    setupCollapsible({
      wrapperEl,
      headerEl,
      contentEl,
      state,
      options: labels,
    });

    expect(state.isCollapsible).toBe(false);
    expect(headerEl.hidden).toBe(true);
    expect(wrapperEl.classList.contains('is-collapsed')).toBe(false);
  });

  it('collapses long content and toggles on click', () => {
    const { wrapperEl, contentEl, headerEl } = createElements();
    Object.defineProperty(contentEl, 'scrollHeight', { configurable: true, value: 320 });

    const state: CollapsibleState = { isExpanded: false, isCollapsible: false };
    setupCollapsible({
      wrapperEl,
      headerEl,
      contentEl,
      state,
      options: labels,
    });

    expect(state.isCollapsible).toBe(true);
    expect(wrapperEl.classList.contains('is-collapsed')).toBe(true);
    expect(headerEl.getAttribute('aria-expanded')).toBe('false');
    expect(headerEl.textContent).toBe('Show more');

    headerEl.click();

    expect(state.isExpanded).toBe(true);
    expect(wrapperEl.classList.contains('is-expanded')).toBe(true);
    expect(headerEl.getAttribute('aria-expanded')).toBe('true');
    expect(headerEl.textContent).toBe('Show less');
  });

  it('toggles on keyboard enter and space', () => {
    const { wrapperEl, contentEl, headerEl } = createElements();
    Object.defineProperty(contentEl, 'scrollHeight', { configurable: true, value: 320 });

    const state: CollapsibleState = { isExpanded: false, isCollapsible: false };
    setupCollapsible({
      wrapperEl,
      headerEl,
      contentEl,
      state,
      options: labels,
    });

    headerEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(state.isExpanded).toBe(true);

    headerEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(state.isExpanded).toBe(false);
  });

  it('calls the toggle callback after expanding and collapsing', () => {
    const { wrapperEl, contentEl, headerEl } = createElements();
    const onToggle = jest.fn();
    Object.defineProperty(contentEl, 'scrollHeight', { configurable: true, value: 320 });

    const state: CollapsibleState = { isExpanded: false, isCollapsible: false };
    setupCollapsible({
      wrapperEl,
      headerEl,
      contentEl,
      state,
      options: labels,
      onToggle,
    });

    headerEl.click();
    headerEl.click();

    expect(onToggle).toHaveBeenNthCalledWith(1, true);
    expect(onToggle).toHaveBeenNthCalledWith(2, false);
  });
});

describe('setupCollapsible disposal', () => {
  const labels = {
    showMoreLabel: 'Show more',
    showLessLabel: 'Show less',
  };

  type ResizeObserverMockInstance = {
    observe: jest.Mock;
    unobserve: jest.Mock;
    disconnect: jest.Mock;
  };

  let observerInstances: ResizeObserverMockInstance[];
  let originalResizeObserver: typeof ResizeObserver | undefined;

  function createElements() {
    const wrapperEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const headerEl = document.createElement('button');
    wrapperEl.append(contentEl, headerEl);
    return { wrapperEl, contentEl, headerEl };
  }

  beforeEach(() => {
    observerInstances = [];
    originalResizeObserver = globalThis.ResizeObserver;
    (globalThis as Record<string, unknown>).ResizeObserver = jest.fn().mockImplementation(() => {
      const instance: ResizeObserverMockInstance = {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
      };
      observerInstances.push(instance);
      return instance;
    });
  });

  afterEach(() => {
    if (originalResizeObserver === undefined) {
      delete (globalThis as Record<string, unknown>).ResizeObserver;
    } else {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('returns a dispose handle that disconnects the observer and removes listeners', () => {
    const { wrapperEl, contentEl, headerEl } = createElements();
    Object.defineProperty(contentEl, 'scrollHeight', { configurable: true, value: 320 });

    const state: CollapsibleState = { isExpanded: false, isCollapsible: false };
    const dispose = setupCollapsible({ wrapperEl, headerEl, contentEl, state, options: labels });

    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0].observe).toHaveBeenCalledWith(contentEl);

    headerEl.click();
    expect(state.isExpanded).toBe(true);

    dispose();
    expect(observerInstances[0].disconnect).toHaveBeenCalledTimes(1);

    // Listeners are removed: further clicks no longer toggle.
    headerEl.click();
    expect(state.isExpanded).toBe(true);

    // Dispose is idempotent.
    dispose();
    expect(observerInstances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('disposeCollapsiblesWithin disposes nested collapsibles exactly once', () => {
    const rootEl = document.createElement('div');
    const first = createElements();
    const second = createElements();
    rootEl.append(first.wrapperEl, second.wrapperEl);

    setupCollapsible({ ...first, state: { isExpanded: false, isCollapsible: false }, options: labels });
    setupCollapsible({ ...second, state: { isExpanded: false, isCollapsible: false }, options: labels });

    disposeCollapsiblesWithin(rootEl);
    expect(observerInstances[0].disconnect).toHaveBeenCalledTimes(1);
    expect(observerInstances[1].disconnect).toHaveBeenCalledTimes(1);

    // A second pass (e.g. a repeated container clear) is a no-op.
    disposeCollapsiblesWithin(rootEl);
    expect(observerInstances[0].disconnect).toHaveBeenCalledTimes(1);
    expect(observerInstances[1].disconnect).toHaveBeenCalledTimes(1);
  });
});
