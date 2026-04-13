import { SettingsModelCatalogPresenter } from '../../../../src/features/settings/SettingsModelCatalogPresenter';

function createCatalogState() {
  const provider = {
    id: 'openai',
    name: 'OpenAI',
    models: [{
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      source: 'server' as const,
      existsInLocal: false,
      existsInServer: true,
    }],
    source: 'server' as const,
    existsInLocal: false,
    existsInServer: true,
  };
  const disabledProvider = {
    id: 'alibaba',
    name: 'Alibaba',
    models: [{
      id: 'qwen-max',
      name: 'Qwen Max',
      source: 'server' as const,
      existsInLocal: false,
      existsInServer: true,
      disabledScopes: ['project'] as Array<'project'>,
    }],
    source: 'server' as const,
    existsInLocal: false,
    existsInServer: true,
    disabledScopes: ['project'] as Array<'project'>,
  };

  return {
    localModelConfig: { disabled_providers: ['alibaba'] },
    disabledModelRefs: [],
    catalogs: {
      local: { providers: [], defaults: {} },
      server: { providers: [provider, disabledProvider], defaults: {} },
      baseEffective: { providers: [provider, disabledProvider], defaults: {} },
      effective: { providers: [provider], defaults: {} },
      currentEnabledProviderIds: ['openai'],
      serverConfig: {},
      effectiveProviderConfig: { disabled_providers: ['alibaba'] },
    },
    displayCatalogs: {
      local: { providers: [], defaults: {} },
      server: { providers: [provider, disabledProvider], defaults: {} },
      effective: { providers: [provider], defaults: {} },
      disabled: { providers: [disabledProvider], defaults: {} },
    },
    providerStatusCatalogs: {
      local: { providers: [], defaults: {} },
      server: { providers: [provider, disabledProvider], defaults: {} },
      effective: { providers: [provider, disabledProvider], defaults: {} },
      disabled: { providers: [disabledProvider], defaults: {} },
    },
  };
}

describe('SettingsModelCatalogPresenter', () => {
  function createPresenter() {
    const presenter = new SettingsModelCatalogPresenter({
      catalogStateService: {
        probeProvider: jest.fn().mockResolvedValue({
          providerId: 'openai',
          status: 'available',
          effectiveEnabled: true,
          projectDisabled: false,
          serverDisabled: false,
          overridesServerDisabled: false,
          runtimeModelCount: 1,
          catalogModelCount: 1,
          testedModelId: 'gpt-4.1',
          sendTestAttempted: true,
          sendTestSucceeded: true,
        }),
      } as never,
      applyInlineCodeText: (targetEl, text) => {
        targetEl.textContent = text;
      },
      applyProviderIcon: async () => {},
      onProviderAvailabilityChange: async () => {},
      onModelAvailabilityChange: async () => {},
    });

    return {
      presenter,
    };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers project-disabled over server-disabled when provider scopes include both', () => {
    const { presenter } = createPresenter();
    const reason = (presenter as unknown as {
      getProviderPrimaryDisabledReason: (
        provider: {
          id: string;
          name: string;
          models: [];
          source: 'server';
          existsInLocal: boolean;
          existsInServer: boolean;
          disabledScopes?: Array<'global' | 'project'>;
        },
        providerEnabled: boolean,
      ) => 'project' | 'server' | null;
    }).getProviderPrimaryDisabledReason(
      {
        id: 'alibaba',
        name: 'Alibaba',
        models: [],
        source: 'server',
        existsInLocal: false,
        existsInServer: true,
        disabledScopes: ['global', 'project'],
      },
      false,
    );

    expect(reason).toBe('project');
  });

  it('filters the rendered provider list from the presenter search state', () => {
    const { presenter } = createPresenter();
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    presenter.setPreferredCatalogTab('merge');

    presenter.render({
      containerEl,
      catalogState: createCatalogState() as never,
    });

    const initialProviders = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-model-toggle-provider-name'),
    ).map((element) => element.textContent);
    expect(initialProviders).toEqual(['OpenAI']);

    const searchInput = containerEl.querySelector<HTMLInputElement>('.opencodian-model-availability-search-input');
    expect(searchInput).not.toBeNull();
    searchInput!.value = 'openai';
    searchInput!.dispatchEvent(new Event('input'));

    const filteredProviders = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-model-toggle-provider-name'),
    ).map((element) => element.textContent);
    expect(filteredProviders).toEqual(['OpenAI']);
  });
});
