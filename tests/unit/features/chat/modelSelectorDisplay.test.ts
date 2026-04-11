import type { ResolvedModelSelection } from '../../../../src/core/config/modelConfig';
import { buildModelSelectorDisplayState } from '../../../../src/features/chat/ui/modelSelector/ModelSelectorDisplay';

function createResolution(
  overrides: Partial<ResolvedModelSelection> = {},
): ResolvedModelSelection {
  return {
    status: 'available',
    provider: 'openai',
    model: 'gpt-5',
    ref: 'openai/gpt-5',
    providerName: 'OpenAI',
    modelName: 'GPT-5',
    ...overrides,
  };
}

describe('ModelSelectorDisplay', () => {
  it('shows the unconfigured fallback when there is no current selection', () => {
    expect(buildModelSelectorDisplayState({
      currentSelection: null,
      resolution: createResolution({ status: 'unconfigured', provider: '', model: '', ref: '' }),
      knownModelInfo: null,
      hasLoadedModelCatalog: false,
      availableProviderCount: 0,
      unavailableTitle: 'Selected model is unavailable',
      unconfiguredLabel: 'Unconfigured',
    })).toEqual({
      text: 'Unconfigured',
      title: 'Unconfigured',
      iconLabel: 'Unconfigured',
      isUnavailable: false,
      isUnconfigured: true,
    });
  });

  it('prefers known metadata when the current model is available', () => {
    expect(buildModelSelectorDisplayState({
      currentSelection: { provider: 'openai', model: 'gpt-5' },
      resolution: createResolution(),
      knownModelInfo: {
        providerName: 'OpenAI',
        modelName: 'GPT-5 Thinking',
      },
      hasLoadedModelCatalog: true,
      availableProviderCount: 3,
      unavailableTitle: 'Selected model is unavailable',
      unconfiguredLabel: 'Unconfigured',
    })).toEqual({
      text: 'GPT-5 Thinking',
      title: 'OpenAI/GPT-5 Thinking',
      iconLabel: 'OpenAI',
      isUnavailable: false,
      isUnconfigured: false,
    });
  });

  it('keeps metadata-driven label and title when the selection is unavailable', () => {
    expect(buildModelSelectorDisplayState({
      currentSelection: { provider: 'openai', model: 'gpt-5' },
      resolution: createResolution({
        status: 'unavailable',
      }),
      knownModelInfo: {
        providerName: 'OpenAI',
        modelName: 'GPT-5',
      },
      hasLoadedModelCatalog: true,
      availableProviderCount: 0,
      unavailableTitle: 'Selected model is unavailable',
      unconfiguredLabel: 'Unconfigured',
    })).toEqual({
      text: 'GPT-5',
      title: 'OpenAI/GPT-5',
      iconLabel: 'OpenAI',
      isUnavailable: true,
      isUnconfigured: false,
    });
  });

  it('falls back to the unavailable empty-state title when the catalog is loaded but empty', () => {
    expect(buildModelSelectorDisplayState({
      currentSelection: null,
      resolution: createResolution({ status: 'unconfigured', provider: '', model: '', ref: '' }),
      knownModelInfo: null,
      hasLoadedModelCatalog: true,
      availableProviderCount: 0,
      unavailableTitle: 'No available models right now',
      unconfiguredLabel: 'Unconfigured',
    })).toEqual({
      text: 'Unconfigured',
      title: 'No available models right now',
      iconLabel: 'Unconfigured',
      isUnavailable: false,
      isUnconfigured: true,
    });
  });
});
