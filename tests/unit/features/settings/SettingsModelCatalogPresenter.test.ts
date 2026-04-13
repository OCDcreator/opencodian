import { SettingsModelCatalogPresenter } from '../../../../src/features/settings/SettingsModelCatalogPresenter';

describe('SettingsModelCatalogPresenter', () => {
  function createPresenter(disabledModelRefs: string[] = []) {
    const state = {
      disabledModelRefs,
    };

    const presenter = new SettingsModelCatalogPresenter({
      modelConfigService: {
        testProviderAvailability: jest.fn().mockResolvedValue({
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
      getDisabledModelRefs: () => state.disabledModelRefs,
      onProviderAvailabilityChange: async () => {},
      onModelAvailabilityChange: async () => {},
    });

    return {
      presenter,
      state,
    };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps runtime providers visible in the server catalog even when they are currently disabled', () => {
    const { presenter } = createPresenter();
    const catalogs = {
      local: { providers: [], defaults: {} },
      server: {
        providers: [
          {
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
          },
          {
            id: 'alibaba',
            name: 'Alibaba',
            models: [{
              id: 'qwen-max',
              name: 'Qwen Max',
              source: 'server' as const,
              existsInLocal: false,
              existsInServer: true,
            }],
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
          },
        ],
        defaults: {},
      },
      baseEffective: { providers: [], defaults: {} },
      effective: { providers: [], defaults: {} },
      currentEnabledProviderIds: ['openai'],
      serverConfig: { disabled_providers: ['alibaba'] },
      effectiveProviderConfig: { disabled_providers: ['deepseek'] },
    };

    const serverCatalog = presenter.getDisplayCatalogForMode(
      'server',
      catalogs as never,
      { disabled_providers: ['deepseek'] },
    );

    expect(serverCatalog.providers.map((provider) => provider.id)).toEqual(['openai', 'alibaba']);
  });

  it('shows disabled models from merged local and server catalogs in the disabled view', () => {
    const { presenter } = createPresenter(['local-only/alpha', 'openai/gpt-4.1']);
    const catalogs = {
      local: {
        providers: [{
          id: 'local-only',
          name: 'Local Only',
          models: [{
            id: 'alpha',
            name: 'Alpha',
            source: 'local' as const,
            existsInLocal: true,
            existsInServer: false,
          }],
          source: 'local' as const,
          existsInLocal: true,
          existsInServer: false,
        }],
        defaults: {},
      },
      server: {
        providers: [{
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
        }],
        defaults: {},
      },
      baseEffective: { providers: [], defaults: {} },
      effective: { providers: [], defaults: {} },
      currentEnabledProviderIds: [],
      serverConfig: {},
      effectiveProviderConfig: { disabled_providers: ['deepseek'] },
    };

    const disabledCatalog = presenter.getDisplayCatalogForMode(
      'disabled',
      catalogs as never,
      { disabled_providers: ['deepseek'] },
    );

    expect(disabledCatalog.providers.map((provider) => provider.id)).toEqual(['deepseek', 'local-only', 'openai']);
    expect(disabledCatalog.providers.find((provider) => provider.id === 'deepseek')?.models).toEqual([]);
    expect(disabledCatalog.providers.find((provider) => provider.id === 'local-only')?.models.map((model) => model.id)).toEqual(['alpha']);
    expect(disabledCatalog.providers.find((provider) => provider.id === 'openai')?.models.map((model) => model.id)).toEqual(['gpt-4.1']);
  });

  it('removes re-enabled providers from the disabled view once they are back in currentEnabledProviderIds', () => {
    const { presenter } = createPresenter();
    const catalogs = {
      local: { providers: [], defaults: {} },
      server: {
        providers: [
          {
            id: 'alibaba',
            name: 'Alibaba',
            models: [{
              id: 'qwen-max',
              name: 'Qwen Max',
              source: 'server' as const,
              existsInLocal: false,
              existsInServer: true,
            }],
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
          },
          {
            id: 'alibaba-cn',
            name: 'Alibaba CN',
            models: [{
              id: 'qwen-plus',
              name: 'Qwen Plus',
              source: 'server' as const,
              existsInLocal: false,
              existsInServer: true,
            }],
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
          },
        ],
        defaults: {},
      },
      baseEffective: { providers: [], defaults: {} },
      effective: { providers: [], defaults: {} },
      currentEnabledProviderIds: ['alibaba'],
      serverConfig: { disabled_providers: ['alibaba', 'alibaba-cn'] },
      effectiveProviderConfig: { disabled_providers: ['alibaba-cn'] },
    };

    const disabledCatalog = presenter.getDisplayCatalogForMode(
      'disabled',
      catalogs as never,
      { disabled_providers: ['alibaba-cn'] },
    );

    expect(disabledCatalog.providers.map((provider) => provider.id)).toEqual(['alibaba-cn']);
    expect(disabledCatalog.providers[0].disabledScopes).toEqual(['project']);
  });

  it('does not keep inherited disabled placeholders after local config clears them', () => {
    const { presenter } = createPresenter();
    const catalogs = {
      local: { providers: [], defaults: {} },
      server: { providers: [], defaults: {} },
      baseEffective: { providers: [], defaults: {} },
      effective: { providers: [], defaults: {} },
      currentEnabledProviderIds: [],
      serverConfig: { disabled_providers: ['alibaba', 'alibaba-cn'] },
      effectiveProviderConfig: { disabled_providers: [] },
    };

    const disabledCatalog = presenter.getDisplayCatalogForMode(
      'disabled',
      catalogs as never,
      { disabled_providers: [] },
    );

    expect(disabledCatalog.providers).toEqual([]);
  });

  it('prefers project-disabled over server-disabled when both apply', () => {
    const { presenter } = createPresenter();
    const reason = (presenter as unknown as {
      getProviderPrimaryDisabledReason: (
        provider: {
          id: string;
          disabledScopes?: Array<'global' | 'project'>;
        },
        localModelConfig: { disabled_providers: string[] },
        providerEnabled: boolean,
      ) => 'project' | 'server' | null;
    }).getProviderPrimaryDisabledReason(
      {
        id: 'alibaba',
        disabledScopes: ['global'],
      },
      { disabled_providers: ['alibaba'] },
      false,
    );

    expect(reason).toBe('project');
  });

  it('treats server catalog providers as disabled when the global server config disabled them', () => {
    const { presenter } = createPresenter();
    const statusClass = (presenter as unknown as {
      getProviderAvailabilityStatusClass: (
        provider: {
          id: string;
          disabledScopes?: Array<'global' | 'project'>;
        },
        providerEnabled: boolean,
        disabledCount: number,
        mode: 'local' | 'server' | 'effective' | 'disabled',
      ) => 'is-disabled' | 'is-partial' | 'is-available';
    }).getProviderAvailabilityStatusClass(
      {
        id: 'alibaba',
        disabledScopes: ['global'],
      },
      true,
      0,
      'server',
    );

    expect(statusClass).toBe('is-disabled');
  });

  it('treats a provider as disabled when it is absent from currentEnabledProviderIds', () => {
    const { presenter } = createPresenter();
    const enabled = (presenter as unknown as {
      isProviderCurrentlyEnabled: (
        providerId: string,
        catalogs: {
          currentEnabledProviderIds: string[];
        },
      ) => boolean;
    }).isProviderCurrentlyEnabled('alibaba', {
      currentEnabledProviderIds: ['deepseek'],
    });

    expect(enabled).toBe(false);
  });

  it('filters the rendered provider list from the presenter search state', () => {
    const { presenter } = createPresenter();
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    presenter.setPreferredCatalogTab('merge');

    const catalogs = {
      local: { providers: [], defaults: {} },
      server: { providers: [], defaults: {} },
      baseEffective: {
        providers: [
          {
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
            disabledScopes: undefined,
          },
          {
            id: 'alibaba',
            name: 'Alibaba',
            models: [{
              id: 'qwen-max',
              name: 'Qwen Max',
              source: 'server' as const,
              existsInLocal: false,
              existsInServer: true,
            }],
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
            disabledScopes: undefined,
          },
        ],
        defaults: {},
      },
      effective: {
        providers: [
          {
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
            disabledScopes: undefined,
          },
          {
            id: 'alibaba',
            name: 'Alibaba',
            models: [{
              id: 'qwen-max',
              name: 'Qwen Max',
              source: 'server' as const,
              existsInLocal: false,
              existsInServer: true,
            }],
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
            disabledScopes: undefined,
          },
        ],
        defaults: {},
      },
      currentEnabledProviderIds: ['openai', 'alibaba'],
      serverConfig: {},
      effectiveProviderConfig: {},
    };

    presenter.render({
      containerEl,
      catalogs: catalogs as never,
      localModelConfig: {},
    });

    const initialProviders = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-model-toggle-provider-name'),
    ).map((element) => element.textContent);
    expect(initialProviders).toEqual(['OpenAI', 'Alibaba']);

    const searchInput = containerEl.querySelector<HTMLInputElement>('.opencodian-model-availability-search-input');
    expect(searchInput).not.toBeNull();
    searchInput!.value = 'alibaba';
    searchInput!.dispatchEvent(new Event('input'));

    const filteredProviders = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-model-toggle-provider-name'),
    ).map((element) => element.textContent);
    expect(filteredProviders).toEqual(['Alibaba']);
  });
});
