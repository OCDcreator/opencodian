import { ModelCatalogStateService } from '../../../../src/core/config/ModelCatalogStateService';

function createModelConfigServiceMock(overrides: Partial<{
  readLocalModelConfig: jest.Mock;
  getCatalogs: jest.Mock;
  writeLocalModelConfig: jest.Mock;
  testProviderAvailability: jest.Mock;
}> = {}) {
  return {
    readLocalModelConfig: jest.fn().mockResolvedValue({}),
    getCatalogs: jest.fn().mockResolvedValue({
      local: { providers: [], defaults: {} },
      server: { providers: [], defaults: {} },
      baseEffective: { providers: [], defaults: {} },
      effective: { providers: [], defaults: {} },
      currentEnabledProviderIds: [],
      serverConfig: {},
      effectiveProviderConfig: {},
    }),
    writeLocalModelConfig: jest.fn().mockResolvedValue(undefined),
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
    ...overrides,
  };
}

describe('ModelCatalogStateService', () => {
  it('builds the disabled display catalog from provider and model availability state', async () => {
    const modelConfigService = createModelConfigServiceMock({
      readLocalModelConfig: jest.fn().mockResolvedValue({
        disabled_providers: ['deepseek'],
      }),
      getCatalogs: jest.fn().mockResolvedValue({
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
      }),
    });

    const service = new ModelCatalogStateService(modelConfigService as never);
    const state = await service.getCatalogState('merge', ['local-only/alpha', 'openai/gpt-4.1']);

    expect(state.displayCatalogs.disabled.providers.map((provider) => provider.id)).toEqual([
      'deepseek',
      'local-only',
      'openai',
    ]);
    expect(state.displayCatalogs.disabled.providers.find((provider) => provider.id === 'deepseek')?.disabledScopes).toEqual([
      'project',
    ]);
    expect(
      state.displayCatalogs.disabled.providers.find((provider) => provider.id === 'local-only')?.models.map((model) => model.id),
    ).toEqual(['alpha']);
    expect(
      state.displayCatalogs.disabled.providers.find((provider) => provider.id === 'openai')?.models.map((model) => model.id),
    ).toEqual(['gpt-4.1']);
  });

  it('keeps server display providers visible while status catalogs track global disables', async () => {
    const modelConfigService = createModelConfigServiceMock({
      readLocalModelConfig: jest.fn().mockResolvedValue({}),
      getCatalogs: jest.fn().mockResolvedValue({
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
      }),
    });

    const service = new ModelCatalogStateService(modelConfigService as never);
    const state = await service.getCatalogState('merge');

    expect(state.displayCatalogs.server.providers.map((provider) => provider.id)).toEqual(['openai', 'alibaba']);
    expect(
      state.providerStatusCatalogs.server.providers.find((provider) => provider.id === 'alibaba')?.disabledScopes,
    ).toEqual(['global']);
  });

  it('writes provider availability changes through the local config owner', async () => {
    const writeLocalModelConfig = jest.fn().mockResolvedValue(undefined);
    const modelConfigService = createModelConfigServiceMock({
      readLocalModelConfig: jest.fn().mockResolvedValue({
        disabled_providers: ['alibaba'],
      }),
      writeLocalModelConfig,
    });
    const service = new ModelCatalogStateService(modelConfigService as never);

    await service.applyProviderAvailabilityChange({
      state: {
        localModelConfig: { disabled_providers: ['alibaba'] },
        disabledModelRefs: [],
        catalogs: {
          local: { providers: [], defaults: {} },
          server: {
            providers: [{
              id: 'alibaba',
              name: 'Alibaba',
              models: [],
              source: 'server',
              existsInLocal: false,
              existsInServer: true,
            }],
            defaults: {},
          },
          baseEffective: { providers: [], defaults: {} },
          effective: { providers: [], defaults: {} },
          currentEnabledProviderIds: [],
          serverConfig: { disabled_providers: ['alibaba'] },
          effectiveProviderConfig: { disabled_providers: ['alibaba'] },
        },
        displayCatalogs: {
          local: { providers: [], defaults: {} },
          server: { providers: [], defaults: {} },
          effective: { providers: [], defaults: {} },
          disabled: { providers: [], defaults: {} },
        },
        providerStatusCatalogs: {
          local: { providers: [], defaults: {} },
          server: { providers: [], defaults: {} },
          effective: { providers: [], defaults: {} },
          disabled: { providers: [], defaults: {} },
        },
      },
      providerIds: [' alibaba '],
      enabled: true,
    });

    const writtenConfig = writeLocalModelConfig.mock.calls[0]?.[0];
    expect(writtenConfig.disabled_providers ?? []).not.toContain('alibaba');
  });

  it('normalizes requested model refs while preserving existing disabled entries', () => {
    const service = new ModelCatalogStateService(createModelConfigServiceMock() as never);

    expect(service.applyModelAvailabilityChange({
      disabledModelRefs: ['openai/gpt-4.1', 'invalid'],
      modelRefs: [' anthropic/claude-3-7-sonnet ', 'openai/gpt-4.1'],
      enabled: false,
    })).toEqual(['anthropic/claude-3-7-sonnet', 'invalid', 'openai/gpt-4.1']);
  });

  it('delegates provider probes to the underlying model config service', async () => {
    const testProviderAvailability = jest.fn().mockResolvedValue({
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
    });
    const service = new ModelCatalogStateService(createModelConfigServiceMock({
      testProviderAvailability,
    }) as never);

    await expect(service.probeProvider('openai')).resolves.toMatchObject({
      providerId: 'openai',
      status: 'available',
    });
    expect(testProviderAvailability).toHaveBeenCalledWith('openai');
  });
});
