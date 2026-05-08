import { setIcon } from 'obsidian';

import { ProviderIconService } from '../../../../utils/icons/ProviderIconService';
import { bindModelSelectorStickyHeaders } from '../modelSelectorStickyHeaders';
import { buildModelOptionValue } from './ModelSelectorInteractions';
import type {
  ModelSelectorProvider,
  ModelSelectorRenderTexts,
  ModelSelectorSelection,
} from './types';

export interface RenderModelListOptions {
  scrollContainer: HTMLElement;
  providers: readonly ModelSelectorProvider[];
  hasLoadedModelCatalog: boolean;
  filterQuery: string;
  currentSelection: ModelSelectorSelection | null;
  highlightedValue?: string | null;
  previousStickyHeadersCleanup?: (() => void) | null;
  texts: ModelSelectorRenderTexts;
  onSelect: (provider: string, model: string) => void;
  onHighlight: (value: string) => void;
}

export interface RenderModelListResult {
  disposeStickyHeaders: (() => void) | null;
}

export function renderModelList({
  scrollContainer,
  providers,
  hasLoadedModelCatalog,
  filterQuery,
  currentSelection,
  highlightedValue = null,
  previousStickyHeadersCleanup = null,
  texts,
  onSelect,
  onHighlight,
}: RenderModelListOptions): RenderModelListResult {
  previousStickyHeadersCleanup?.();
  scrollContainer.empty();

  if (providers.length === 0) {
    if (!hasLoadedModelCatalog) {
      const loading = scrollContainer.createDiv({
        cls: 'opencodian-model-dropdown-loading',
      });
      loading.setText(texts.loading);
    } else {
      const emptyState = scrollContainer.createDiv({
        cls: 'opencodian-model-dropdown-empty',
      });
      emptyState.setText(texts.noModels);
    }
    return { disposeStickyHeaders: null };
  }

  const normalizedQuery = filterQuery.toLowerCase();
  const filteredProviders = providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter((model) =>
        model.name.toLowerCase().includes(normalizedQuery)
        || provider.name.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((provider) => provider.models.length > 0);

  if (filteredProviders.length === 0) {
    const emptyState = scrollContainer.createDiv({
      cls: 'opencodian-model-dropdown-empty',
    });
    emptyState.setText(normalizedQuery ? texts.noModelsFound : texts.noModelsAvailable);
    return { disposeStickyHeaders: null };
  }

  const currentValue = currentSelection
    ? buildModelOptionValue(currentSelection.provider, currentSelection.model)
    : null;

  const groupsContainer = scrollContainer.createDiv({
    cls: 'opencodian-model-groups',
  });
  const headers: HTMLElement[] = [];

  for (const provider of filteredProviders) {
    const groupEl = groupsContainer.createDiv({
      cls: 'opencodian-model-group',
    });

    const header = groupEl.createDiv({
      cls: 'opencodian-model-provider-header',
    });

    const iconEl = ProviderIconService.createIconElement(provider.id, 14);
    if (iconEl) {
      iconEl.classList.add('opencodian-model-provider-header-icon');
      iconEl.setAttribute('aria-hidden', 'true');
      const img = iconEl.querySelector('img');
      if (img) img.alt = '';
      header.appendChild(iconEl);
    }

    const headerText = header.createSpan({ cls: 'opencodian-model-provider-header-text' });
    headerText.setText(provider.name);
    headers.push(header);

    for (const model of provider.models) {
      const modelValue = buildModelOptionValue(provider.id, model.id);
      const modelOption = groupEl.createDiv({
        cls: 'opencodian-model-option',
        attr: { 'data-value': modelValue },
      });

      if (modelValue === currentValue) {
        modelOption.addClass('is-selected');
      }
      if (modelValue === highlightedValue) {
        modelOption.addClass('is-highlighted');
      }

      const nameSpan = modelOption.createSpan({ cls: 'opencodian-model-option-name' });
      nameSpan.setText(model.name);

      const checkmark = modelOption.createSpan({ cls: 'opencodian-model-option-check' });
      setIcon(checkmark, 'check');

      modelOption.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect(provider.id, model.id);
      });
      modelOption.addEventListener('mouseenter', () => {
        onHighlight(modelValue);
      });
    }
  }

  return {
    disposeStickyHeaders: bindModelSelectorStickyHeaders(scrollContainer, headers),
  };
}
