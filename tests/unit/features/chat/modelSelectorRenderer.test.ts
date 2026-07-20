jest.mock('../../../../src/features/chat/ui/modelSelectorStickyHeaders', () => ({
  bindModelSelectorStickyHeaders: jest.fn(() => jest.fn()),
}));

import { renderModelList } from '../../../../src/features/chat/ui/modelSelector/ModelSelectorRenderer';
import type {
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
      optionIdPrefix: 'test-option',
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
      optionIdPrefix: 'empty-catalog-option',
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
      optionIdPrefix: 'no-match-option',
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
      optionIdPrefix: 'first-model-option',
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
    expect(options[0].getAttribute('role')).toBe('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[0].tabIndex).toBe(-1);
    expect(options[0].hasClass('opencodian-composer-popover-option')).toBe(true);
    expect(options[0].hasClass('is-selected')).toBe(true);
    expect(options[0].id).toBe('first-model-option-openai%3A%3Agpt-5');
    expect(options[0].querySelector('.opencodian-model-option-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(options[0].querySelector('.opencodian-model-option-main')?.textContent).toBe('GPT-5');
    expect(options[0].querySelector('.opencodian-model-option-check')).not.toBeNull();
    expect(options[1].getAttribute('aria-selected')).toBe('false');
    expect(options[1].hasClass('is-highlighted')).toBe(true);

    const group = scrollContainer.querySelector('.opencodian-model-group');
    expect(group).not.toBeNull();
    expect(group?.getAttribute('role')).toBe('group');
    const labelledBy = group?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const headerLabel = labelledBy ? scrollContainer.querySelector<HTMLElement>(`[id="${labelledBy}"]`) : null;
    expect(headerLabel?.textContent).toContain('OpenAI');
    expect(headerLabel?.getAttribute('role')).not.toBe('option');

    options[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(onHighlight).toHaveBeenCalledWith('openai::gpt-4.1');

    options[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('openai', 'gpt-4.1');
  });

  it('renders provider identity once per group and leaves model icon slots empty', () => {
    const scrollContainer = document.createElement('div');

    renderModelList({
      scrollContainer,
      optionIdPrefix: 'icon-contract-option',
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
      currentSelection: null,
      highlightedValue: null,
      texts: configuredOnlyTexts,
      onSelect: jest.fn(),
      onHighlight: jest.fn(),
    });

    const group = scrollContainer.querySelector('.opencodian-model-group');
    const headerIcons = group?.querySelectorAll(':scope > .opencodian-model-provider-header .opencodian-model-provider-header-icon');
    expect((headerIcons?.length ?? 0)).toBeLessThanOrEqual(1);

    const modelIcons = scrollContainer.querySelectorAll('.opencodian-model-option-icon img, .opencodian-model-option-icon svg');
    expect(modelIcons.length).toBe(0);

    for (const option of scrollContainer.querySelectorAll<HTMLElement>('.opencodian-model-option')) {
      const iconSlot = option.querySelector('.opencodian-model-option-icon');
      expect(iconSlot).not.toBeNull();
      expect(iconSlot?.getAttribute('aria-hidden')).toBe('true');
      expect(iconSlot?.childElementCount).toBe(0);
    }
  });
});
