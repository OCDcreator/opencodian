jest.mock('../../../../src/features/chat/ui/modelSelectorStickyHeaders', () => ({
  bindModelSelectorStickyHeaders: jest.fn(() => jest.fn()),
}));

import { renderModelList } from '../../../../src/features/chat/ui/modelSelector/ModelSelectorRenderer';
import type {
  ModelSelectorProvider,
  ModelSelectorRenderTexts,
} from '../../../../src/features/chat/ui/modelSelector/types';
import { bindModelSelectorStickyHeaders } from '../../../../src/features/chat/ui/modelSelectorStickyHeaders';

const mockedBindModelSelectorStickyHeaders = bindModelSelectorStickyHeaders as jest.MockedFunction<
  typeof bindModelSelectorStickyHeaders
>;

describe('ModelSelectorRenderer', () => {
  const configuredOnlyTexts = {
    loading: 'Loading models...',
    noModels: 'No models available',
    noModelsFound: 'No models found',
    noModelsAvailable: 'No models available',
    configuredOnlyBadge: 'Configured only',
    configuredOnlyTitle: 'Configured locally but unavailable in the runtime catalog',
  } as ModelSelectorRenderTexts;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state before the model catalog has loaded', () => {
    const scrollContainer = document.createElement('div');

    const result = renderModelList({
      scrollContainer,
      providers: [],
      hasLoadedModelCatalog: false,
      filterQuery: '',
      currentSelection: null,
      highlightedValue: null,
      texts: {
        loading: 'Loading models...',
        noModels: 'No models available',
        noModelsFound: 'No models found',
        noModelsAvailable: 'No models available',
        configuredOnlyBadge: 'Configured only',
        configuredOnlyTitle: 'Configured locally but unavailable in the runtime catalog',
      },
      onSelect: jest.fn(),
      onHighlight: jest.fn(),
    });

    expect(scrollContainer.querySelector('.opencodian-model-dropdown-loading')?.textContent).toBe('Loading models...');
    expect(result.disposeStickyHeaders).toBeNull();
    expect(mockedBindModelSelectorStickyHeaders).not.toHaveBeenCalled();
  });

  it('renders empty states for empty catalog and no filter matches', () => {
    const emptyCatalogContainer = document.createElement('div');
    renderModelList({
      scrollContainer: emptyCatalogContainer,
      providers: [],
      hasLoadedModelCatalog: true,
      filterQuery: '',
      currentSelection: null,
      highlightedValue: null,
      texts: {
        loading: 'Loading models...',
        noModels: 'No models available',
        noModelsFound: 'No models found',
        noModelsAvailable: 'No models available',
        configuredOnlyBadge: 'Configured only',
        configuredOnlyTitle: 'Configured locally but unavailable in the runtime catalog',
      },
      onSelect: jest.fn(),
      onHighlight: jest.fn(),
    });
    expect(emptyCatalogContainer.querySelector('.opencodian-model-dropdown-empty')?.textContent).toBe('No models available');

    const noMatchContainer = document.createElement('div');
    renderModelList({
      scrollContainer: noMatchContainer,
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          models: [{ id: 'gpt-5', name: 'GPT-5' }],
        },
      ],
      hasLoadedModelCatalog: true,
      filterQuery: 'anthropic',
      currentSelection: null,
      highlightedValue: null,
      texts: {
        loading: 'Loading models...',
        noModels: 'No models available',
        noModelsFound: 'No models found',
        noModelsAvailable: 'No models available',
        configuredOnlyBadge: 'Configured only',
        configuredOnlyTitle: 'Configured locally but unavailable in the runtime catalog',
      },
      onSelect: jest.fn(),
      onHighlight: jest.fn(),
    });
    expect(noMatchContainer.querySelector('.opencodian-model-dropdown-empty')?.textContent).toBe('No models found');
  });

  it('renders grouped options, keeps selection state, and wires hover/click callbacks', () => {
    const scrollContainer = document.createElement('div');
    const previousStickyCleanup = jest.fn();
    const nextStickyCleanup = jest.fn();
    mockedBindModelSelectorStickyHeaders.mockReturnValue(nextStickyCleanup);
    const onSelect = jest.fn();
    const onHighlight = jest.fn();

    const result = renderModelList({
      scrollContainer,
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          models: [
            { id: 'gpt-5', name: 'GPT-5' },
            { id: 'gpt-4.1', name: 'GPT-4.1' },
          ],
        },
      ],
      hasLoadedModelCatalog: true,
      filterQuery: '',
      currentSelection: { provider: 'openai', model: 'gpt-5' },
      highlightedValue: 'openai::gpt-4.1',
      previousStickyHeadersCleanup: previousStickyCleanup,
      texts: {
        loading: 'Loading models...',
        noModels: 'No models available',
        noModelsFound: 'No models found',
        noModelsAvailable: 'No models available',
        configuredOnlyBadge: 'Configured only',
        configuredOnlyTitle: 'Configured locally but unavailable in the runtime catalog',
      },
      onSelect,
      onHighlight,
    });

    expect(previousStickyCleanup).toHaveBeenCalledTimes(1);
    expect(mockedBindModelSelectorStickyHeaders).toHaveBeenCalledTimes(1);
    expect(result.disposeStickyHeaders).toBe(nextStickyCleanup);

    const options = Array.from(scrollContainer.querySelectorAll<HTMLElement>('.opencodian-model-option'));
    expect(options).toHaveLength(2);
    expect(options[0].dataset.value).toBe('openai::gpt-5');
    expect(options[0].hasClass('is-selected')).toBe(true);
    expect(options[1].hasClass('is-highlighted')).toBe(true);

    options[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(onHighlight).toHaveBeenCalledWith('openai::gpt-4.1');

    options[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('openai', 'gpt-4.1');
  });

  it('renders configured-only models as labelled disabled options', () => {
    const scrollContainer = document.createElement('div');
    const onSelect = jest.fn();
    const onHighlight = jest.fn();
    const providers = [{
      id: 'local',
      name: 'Local',
      models: [{
        id: 'custom',
        name: 'Custom',
        availability: 'configured-only',
        availabilityLabel: 'Configured only',
      }],
    }] as unknown as ModelSelectorProvider[];

    renderModelList({
      scrollContainer,
      providers,
      hasLoadedModelCatalog: true,
      filterQuery: '',
      currentSelection: null,
      highlightedValue: 'local::custom',
      texts: configuredOnlyTexts,
      onSelect,
      onHighlight,
    });

    const option = scrollContainer.querySelector<HTMLElement>('.opencodian-model-option');
    expect(option).not.toBeNull();
    expect(option?.hasClass('is-configured-only')).toBe(true);
    expect(option?.getAttribute('aria-disabled')).toBe('true');
    expect(option?.getAttribute('title')).toBe(
      'Configured locally but unavailable in the runtime catalog',
    );
    expect(option?.hasClass('is-highlighted')).toBe(false);
    expect(option?.querySelector('.opencodian-model-option-availability')?.textContent)
      .toBe('Configured only');

    option?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onHighlight).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
