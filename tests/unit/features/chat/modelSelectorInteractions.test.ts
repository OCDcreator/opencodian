import {
  highlightModelOption,
  navigateModelList,
  scrollToCurrentModel,
  selectHighlightedModel,
} from '../../../../src/features/chat/ui/modelSelector/ModelSelectorInteractions';

function createOption(value: string): HTMLElement {
  const option = document.createElement('div');
  option.className = 'opencodian-model-option';
  option.dataset.value = value;
  option.scrollIntoView = jest.fn();
  return option;
}

function disableOption(option: HTMLElement): HTMLElement {
  option.setAttribute('aria-disabled', 'true');
  return option;
}

describe('ModelSelectorInteractions', () => {
  it('moves keyboard highlight and clamps at list boundaries', () => {
    const scrollContainer = document.createElement('div');
    const first = createOption('openai::gpt-5');
    const second = createOption('anthropic::claude-sonnet');
    scrollContainer.append(first, second);

    navigateModelList(scrollContainer, 1);
    expect(first.hasClass('is-highlighted')).toBe(true);
    expect(first.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

    navigateModelList(scrollContainer, 1);
    expect(first.hasClass('is-highlighted')).toBe(false);
    expect(second.hasClass('is-highlighted')).toBe(true);

    navigateModelList(scrollContainer, 1);
    expect(second.hasClass('is-highlighted')).toBe(true);

    navigateModelList(scrollContainer, -1);
    expect(first.hasClass('is-highlighted')).toBe(true);
  });

  it('skips disabled options during keyboard navigation', () => {
    const scrollContainer = document.createElement('div');
    const first = createOption('openai::gpt-5');
    const disabled = disableOption(createOption('local::custom'));
    const third = createOption('anthropic::claude-sonnet');
    scrollContainer.append(first, disabled, third);

    navigateModelList(scrollContainer, 1);
    expect(first.hasClass('is-highlighted')).toBe(true);

    navigateModelList(scrollContainer, 1);
    expect(disabled.hasClass('is-highlighted')).toBe(false);
    expect(third.hasClass('is-highlighted')).toBe(true);

    navigateModelList(scrollContainer, -1);
    expect(first.hasClass('is-highlighted')).toBe(true);
  });

  it('highlights exactly one option by value', () => {
    const scrollContainer = document.createElement('div');
    const first = createOption('openai::gpt-5');
    const second = createOption('anthropic::claude-sonnet');
    first.addClass('is-highlighted');
    second.addClass('is-highlighted');
    scrollContainer.append(first, second);

    highlightModelOption(scrollContainer, 'anthropic::claude-sonnet');

    expect(first.hasClass('is-highlighted')).toBe(false);
    expect(second.hasClass('is-highlighted')).toBe(true);
  });

  it('selects the highlighted option by parsing provider/model from the option value', () => {
    const scrollContainer = document.createElement('div');
    const highlighted = createOption('openai::gpt-5');
    highlighted.addClass('is-highlighted');
    scrollContainer.appendChild(highlighted);
    const onSelect = jest.fn();

    const didSelect = selectHighlightedModel(scrollContainer, onSelect);

    expect(didSelect).toBe(true);
    expect(onSelect).toHaveBeenCalledWith('openai', 'gpt-5');
  });

  it('refuses to select a disabled highlighted option', () => {
    const scrollContainer = document.createElement('div');
    const highlighted = disableOption(createOption('local::custom'));
    highlighted.addClass('is-highlighted');
    scrollContainer.appendChild(highlighted);
    const onSelect = jest.fn();

    expect(selectHighlightedModel(scrollContainer, onSelect)).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('scrolls the current model into view only when the option exists', () => {
    const scrollContainer = document.createElement('div');
    const current = createOption('openai::gpt-5');
    scrollContainer.appendChild(current);

    expect(scrollToCurrentModel(scrollContainer, { provider: 'openai', model: 'gpt-5' })).toBe(true);
    expect(current.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(scrollToCurrentModel(scrollContainer, { provider: 'anthropic', model: 'claude-sonnet' })).toBe(false);
  });
});
