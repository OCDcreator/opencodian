import type {
  ModelSelectorOptionValue,
  ModelSelectorSelection,
} from './types';

export function buildModelOptionValue(provider: string, model: string): ModelSelectorOptionValue {
  return `${provider}::${model}`;
}

export function highlightModelOption(
  scrollContainer: HTMLElement,
  value: string,
): boolean {
  const options = scrollContainer.querySelectorAll<HTMLElement>('.opencodian-model-option');
  options.forEach((option) => {
    option.removeClass('is-highlighted');
  });

  const option = scrollContainer.querySelector<HTMLElement>(`[data-value="${value}"]`);
  if (!option) {
    return false;
  }

  option.addClass('is-highlighted');
  return true;
}

export function navigateModelList(
  scrollContainer: HTMLElement,
  direction: 1 | -1,
): string | null {
  const options = Array.from(scrollContainer.querySelectorAll<HTMLElement>('.opencodian-model-option'));
  if (options.length === 0) {
    return null;
  }

  const currentIndex = options.findIndex((option) => option.hasClass('is-highlighted'));
  let nextIndex = currentIndex + direction;

  if (nextIndex < 0) {
    nextIndex = 0;
  }
  if (nextIndex >= options.length) {
    nextIndex = options.length - 1;
  }

  if (currentIndex >= 0) {
    options[currentIndex].removeClass('is-highlighted');
  }

  const nextOption = options[nextIndex];
  nextOption.addClass('is-highlighted');
  nextOption.scrollIntoView({ block: 'nearest' });
  return nextOption.dataset.value ?? null;
}

export function parseModelOptionValue(value: string | null | undefined): ModelSelectorSelection | null {
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf('::');
  if (separatorIndex <= 0 || separatorIndex >= value.length - 2) {
    return null;
  }

  return {
    provider: value.slice(0, separatorIndex),
    model: value.slice(separatorIndex + 2),
  };
}

export function selectHighlightedModel(
  scrollContainer: HTMLElement,
  onSelect: (provider: string, model: string) => void,
): boolean {
  const highlighted = scrollContainer.querySelector<HTMLElement>('.opencodian-model-option.is-highlighted');
  const selection = parseModelOptionValue(highlighted?.dataset.value);
  if (!selection) {
    return false;
  }

  onSelect(selection.provider, selection.model);
  return true;
}

export function scrollToCurrentModel(
  scrollContainer: HTMLElement,
  currentSelection: ModelSelectorSelection | null,
): boolean {
  if (!currentSelection) {
    return false;
  }

  const value = buildModelOptionValue(currentSelection.provider, currentSelection.model);
  const currentEl = scrollContainer.querySelector<HTMLElement>(`[data-value="${value}"]`);
  if (!currentEl) {
    return false;
  }

  currentEl.scrollIntoView({ block: 'center' });
  return true;
}
