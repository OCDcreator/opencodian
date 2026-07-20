jest.mock('../../../../src/features/chat/ui/modelSelectorStickyHeaders', () => ({
  bindModelSelectorStickyHeaders: jest.fn(() => jest.fn()),
}));

import { renderModelList } from '../../../../src/features/chat/ui/modelSelector/ModelSelectorRenderer';
import type {
  ModelSelectorProvider,
  ModelSelectorRenderTexts,
} from '../../../../src/features/chat/ui/modelSelector/types';

describe('ModelSelectorRenderer configured-only options', () => {
  it('renders configured-only models as labelled disabled options', () => {
    const scrollContainer = document.createElement('div');
    const onSelect = jest.fn();
    const onHighlight = jest.fn();
    const providers: ModelSelectorProvider[] = [{
      id: 'local',
      name: 'Local',
      models: [{
        id: 'custom',
        name: 'Custom',
        availability: 'configured-only',
        availabilityLabel: 'Configured only',
      }],
    }];
    const texts: ModelSelectorRenderTexts = {
      loading: 'Loading models...',
      noModels: 'No models available',
      noModelsFound: 'No models found',
      noModelsAvailable: 'No models available',
      configuredOnlyBadge: 'Configured only',
      configuredOnlyTitle: 'Configured locally but unavailable in the runtime catalog',
    };

    renderModelList({
      scrollContainer,
      optionIdPrefix: 'configured-only-option',
      providers,
      hasLoadedModelCatalog: true,
      filterQuery: '',
      currentSelection: null,
      highlightedValue: 'local::custom',
      texts,
      onSelect,
      onHighlight,
    });

    const option = scrollContainer.querySelector<HTMLElement>('.opencodian-model-option');
    expect(option).not.toBeNull();
    expect(option?.hasClass('is-configured-only')).toBe(true);
    expect(option?.getAttribute('aria-disabled')).toBe('true');
    expect(option?.getAttribute('title')).toBe(texts.configuredOnlyTitle);
    expect(option?.hasClass('is-highlighted')).toBe(false);
    expect(option?.querySelector('.opencodian-model-option-availability')?.textContent)
      .toBe('Configured only');

    option?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onHighlight).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
