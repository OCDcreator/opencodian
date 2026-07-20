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
  optionIdPrefix: string;
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

function buildModelOptionId(prefix: string, value: string): string {
  return prefix + '-' + encodeURIComponent(value);
}

export function renderModelList({
  scrollContainer,
  optionIdPrefix,
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
    const providerLabelId = buildModelOptionId(optionIdPrefix, provider.id) + '-label';
    const groupEl = groupsContainer.createDiv({
      cls: 'opencodian-model-group',
      attr: {
        role: 'group',
        'aria-labelledby': providerLabelId,
      },
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

    const headerText = header.createSpan({
      cls: 'opencodian-model-provider-header-text',
      attr: { id: providerLabelId },
    });
    headerText.setText(provider.name);
    headers.push(header);

    const optionsEl = groupEl.createDiv({
      cls: 'opencodian-model-group-options',
    });

    for (const model of provider.models) {
      const modelValue = buildModelOptionValue(provider.id, model.id);
      const isConfiguredOnly = model.availability === 'configured-only';
      const modelOption = optionsEl.createDiv({
        cls: 'opencodian-model-option opencodian-composer-popover-option',
        attr: {
          id: buildModelOptionId(optionIdPrefix, modelValue),
          'data-value': modelValue,
          role: 'option',
          'aria-selected': String(modelValue === currentValue),
          tabindex: '-1',
          ...(isConfiguredOnly
            ? {
                'aria-disabled': 'true',
                title: texts.configuredOnlyTitle,
              }
            : {}),
        },
      });
      if (isConfiguredOnly) {
        modelOption.addClass('is-configured-only');
      }

      if (modelValue === currentValue) {
        modelOption.addClass('is-selected');
      }
      if (!isConfiguredOnly && modelValue === highlightedValue) {
        modelOption.addClass('is-highlighted');
      }

      // The shared 22px leading slot stays empty so the model row reads as a
      // child of the provider group while keeping Command row alignment.
      modelOption.createSpan({
        cls: 'opencodian-model-option-icon opencodian-composer-popover-option-icon',
        attr: { 'aria-hidden': 'true' },
      });

      const nameSpan = modelOption.createSpan({
        cls: 'opencodian-model-option-name opencodian-model-option-main opencodian-composer-popover-option-main',
      });
      nameSpan.setText(model.name);

      if (isConfiguredOnly) {
        const availability = modelOption.createSpan({
          cls: 'opencodian-model-option-availability',
        });
        availability.setText(model.availabilityLabel ?? texts.configuredOnlyBadge);
      }

      const checkmark = modelOption.createSpan({
        cls: 'opencodian-model-option-check opencodian-composer-popover-option-check',
      });
      setIcon(checkmark, 'check');

      if (!isConfiguredOnly) {
        modelOption.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelect(provider.id, model.id);
        });
        modelOption.addEventListener('mouseenter', () => {
          onHighlight(modelValue);
        });
      }
    }
  }

  return {
    disposeStickyHeaders: bindModelSelectorStickyHeaders(scrollContainer, headers),
  };
}
