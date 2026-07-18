import {
  focusPopoverOption,
  getPopoverOptions,
  getSelectedPopoverOptionIndex,
  movePopoverOptionFocus,
} from '../../../../../src/features/chat/ui/ComposerPopoverListNavigation';

function createOptions(): { rootEl: HTMLElement; options: HTMLElement[] } {
  const rootEl = document.createElement('div');
  const options = ['First', 'Second', 'Third'].map((label, index) => {
    const option = document.createElement('div');
    option.className = 'option';
    option.textContent = label;
    option.setAttribute('aria-selected', String(index === 1));
    option.scrollIntoView = jest.fn();
    rootEl.appendChild(option);
    return option;
  });

  document.body.appendChild(rootEl);
  return { rootEl, options };
}

describe('ComposerPopoverListNavigation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('discovers DOM options and the selected option index', () => {
    const { rootEl, options } = createOptions();

    expect(getPopoverOptions(rootEl, '.option')).toEqual(options);
    expect(getSelectedPopoverOptionIndex(rootEl, '.option')).toBe(1);
  });

  it('wraps ArrowUp focus from the first option to the last option', () => {
    const { rootEl, options } = createOptions();

    const activeIndex = movePopoverOptionFocus(rootEl, '.option', 0, -1);

    expect(activeIndex).toBe(2);
    expect(options.map((option) => option.tabIndex)).toEqual([-1, -1, 0]);
    expect(document.activeElement).toBe(options[2]);
    expect(options[2].scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('wraps ArrowDown focus from the last option to the first option', () => {
    const { rootEl, options } = createOptions();

    const activeIndex = movePopoverOptionFocus(rootEl, '.option', 2, 1);

    expect(activeIndex).toBe(0);
    expect(options.map((option) => option.tabIndex)).toEqual([0, -1, -1]);
    expect(document.activeElement).toBe(options[0]);
    expect(options[0].scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('clamps direct focus requests and returns null for an empty root', () => {
    const { rootEl, options } = createOptions();
    const emptyRoot = document.createElement('div');
    const focusOption = jest.spyOn(options[1], 'focus');

    expect(focusPopoverOption(rootEl, '.option', 1)).toBe(1);
    expect(options.map((option) => option.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(options[1]);
    expect(focusOption).toHaveBeenCalledWith({ preventScroll: true });
    expect(focusPopoverOption(rootEl, '.option', 40)).toBe(2);
    expect(options.map((option) => option.tabIndex)).toEqual([-1, -1, 0]);
    expect(focusPopoverOption(emptyRoot, '.option', 0)).toBeNull();
    expect(movePopoverOptionFocus(emptyRoot, '.option', null, 1)).toBeNull();
    expect(getSelectedPopoverOptionIndex(emptyRoot, '.option')).toBeNull();
  });
});
