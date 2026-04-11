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

  it('scrolls the current model into view only when the option exists', () => {
    const scrollContainer = document.createElement('div');
    const current = createOption('openai::gpt-5');
    scrollContainer.appendChild(current);

    expect(scrollToCurrentModel(scrollContainer, { provider: 'openai', model: 'gpt-5' })).toBe(true);
    expect(current.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(scrollToCurrentModel(scrollContainer, { provider: 'anthropic', model: 'claude-sonnet' })).toBe(false);
  });
});
