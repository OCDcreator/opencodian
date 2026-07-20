import type { ModelCatalogProvider } from '../../../../src/core/config/modelConfig';
import {
  describeModelAvailabilitySummary,
  describeModelCatalogComparison,
  describeProviderAvailabilityProbe,
  describeProviderDirectorySummary,
  describeProviderModels,
  getCatalogPlaceholderReason,
  getProviderAvailabilityProbeBadge,
  getProviderAvailabilityStatusClass,
  getProviderAvailabilityStatusLabel,
  getProviderDirectoryBadge,
  getProviderPrimaryDisabledReason,
  getProviderServerConstraintBadge,
  type ProviderAvailabilityCheckState,
  type ProviderAvailabilityDisplayState,
} from '../../../../src/features/settings/SettingsModelCatalogAvailability';

function createProvider(overrides: Partial<ModelCatalogProvider> = {}): ModelCatalogProvider {
  return {
    id: 'openai',
    name: 'OpenAI',
    models: [{
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      source: 'server',
      existsInLocal: false,
      existsInServer: true,
    }],
    source: 'server',
    existsInLocal: false,
    existsInServer: true,
    ...overrides,
  };
}

function createDisplayState(
  overrides: Partial<ProviderAvailabilityDisplayState> = {},
): ProviderAvailabilityDisplayState {
  const provider = overrides.provider ?? createProvider();
  return {
    provider,
    providerEnabled: true,
    disabledCount: 0,
    primaryDisabledReason: null,
    mode: 'effective',
    ...overrides,
  };
}

describe('SettingsModelCatalogAvailability', () => {
  it('describes matching, drifting, and unavailable V2 catalog comparisons without exposing IDs', () => {
    expect(describeModelCatalogComparison({
      status: 'match',
      legacyProviderCount: 2,
      legacyModelCount: 5,
      v2ProviderCount: 2,
      v2ModelCount: 5,
      legacyOnlyProviderIds: [],
      v2OnlyProviderIds: [],
      legacyOnlyModelRefs: [],
      v2OnlyModelRefs: [],
    })).toEqual({
      text: 'V2 catalog matches the stable runtime directory · 2 providers · 5 models',
      className: 'is-match',
    });

    const drift = describeModelCatalogComparison({
      status: 'drift',
      legacyProviderCount: 2,
      legacyModelCount: 5,
      v2ProviderCount: 3,
      v2ModelCount: 7,
      legacyOnlyProviderIds: ['private-provider'],
      v2OnlyProviderIds: ['new-provider'],
      legacyOnlyModelRefs: ['private-provider/private-model'],
      v2OnlyModelRefs: ['new-provider/new-model', 'openai/new-model'],
    });
    expect(drift).toEqual({
      text: 'V2 catalog differs · stable-only 1 provider / 1 models · V2-only 1 provider / 2 models',
      className: 'is-drift',
    });
    expect(drift.text).not.toContain('private-provider');
    expect(drift.text).not.toContain('new-provider');

    expect(describeModelCatalogComparison({
      status: 'unavailable',
      reason: 'HTTP 404',
    })).toEqual({
      text: 'V2 catalog is unavailable; the stable runtime directory remains in use',
      className: 'is-unavailable',
    });
  });

  it('prioritizes project-disabled provider presentation over server-disabled scope', () => {
    const provider = createProvider({ disabledScopes: ['global', 'project'] });
    const state = createDisplayState({
      provider,
      providerEnabled: false,
      primaryDisabledReason: getProviderPrimaryDisabledReason(provider, false),
    });

    expect(state.primaryDisabledReason).toBe('project');
    expect(getProviderAvailabilityStatusClass(state)).toBe('is-disabled');
    expect(getProviderAvailabilityStatusLabel(state)).toBe('Project disabled');
    expect(describeModelAvailabilitySummary(state)).toBe('openai · project disabled · 1 models hidden');
  });

  it('describes inherited server-disabled constraints separately from enabled overrides', () => {
    const provider = createProvider({ disabledScopes: ['global'] });
    const state = createDisplayState({ provider });

    expect(getProviderServerConstraintBadge(state)).toEqual({
      text: 'Server default disabled',
      className: 'is-partial',
    });
    expect(describeModelAvailabilitySummary(state)).toBe(
      'openai · server default disabled, but still kept in the current list · 1 models',
    );
  });

  it('keeps probe badge and detail descriptors centralized for catalog-only overrides', () => {
    const checkState: ProviderAvailabilityCheckState = {
      status: 'ready',
      probe: {
        providerId: 'openai',
        status: 'catalog_only',
        effectiveEnabled: true,
        projectDisabled: false,
        serverDisabled: true,
        overridesServerDisabled: true,
        runtimeModelCount: 0,
        catalogModelCount: 2,
        sendTestAttempted: false,
        sendTestSucceeded: false,
      },
    };

    expect(getProviderAvailabilityProbeBadge(checkState)).toEqual({
      text: 'No testable model',
      className: 'is-partial',
    });
    expect(describeProviderAvailabilityProbe(checkState)).toEqual({
      text: 'The current project tries to override a server-side disable, but no model was available for a real send test. Catalog model count: 2.',
      className: 'is-warning',
    });
  });

  it('describes provider model previews and placeholder reasons', () => {
    const emptyProjectProvider = createProvider({
      models: [],
      disabledScopes: ['project'],
    });
    const longProvider = createProvider({
      models: Array.from({ length: 8 }, (_, index) => ({
        id: `model-${index + 1}`,
        name: `Model ${index + 1}`,
        source: 'server' as const,
        existsInLocal: false,
        existsInServer: true,
      })),
    });

    expect(getCatalogPlaceholderReason(emptyProjectProvider, 'disabled')).toBe('project');
    expect(describeProviderModels(emptyProjectProvider, 'project')).toBe(
      'This provider is disabled by the current project config, so it stays visible here even though no runtime model list is available.',
    );
    expect(describeProviderModels(longProvider)).toBe('Model 1 · Model 2 · Model 3 · Model 4 · Model 5 · Model 6 · +2');
  });

  it('describes provider-directory summary and row badges as auxiliary metadata', () => {
    expect(describeProviderDirectorySummary({
      openai: {
        providerId: 'openai',
        listed: true,
        connected: true,
        directoryModelCount: 2,
        inServerCatalog: true,
        inEffectiveCatalog: true,
      },
      openrouter: {
        providerId: 'openrouter',
        listed: true,
        connected: false,
        directoryModelCount: 1,
        inServerCatalog: false,
        inEffectiveCatalog: false,
      },
    })).toBe('1 connected · 2 listed · 1 listed outside catalog');

    expect(getProviderDirectoryBadge({
      providerId: 'openai',
      listed: true,
      connected: true,
      directoryModelCount: 2,
      inServerCatalog: true,
      inEffectiveCatalog: true,
    })).toEqual({
      text: 'Directory: connected',
      className: 'is-diagnostic',
    });
    expect(getProviderDirectoryBadge({
      providerId: 'openrouter',
      listed: true,
      connected: false,
      directoryModelCount: 1,
      inServerCatalog: false,
      inEffectiveCatalog: false,
    })).toEqual({
      text: 'Directory: listed',
      className: 'is-partial',
    });
  });
});
