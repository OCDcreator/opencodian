import { type CollapsibleState, setupCollapsible } from '../../../../src/features/chat/rendering/collapsible';

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
