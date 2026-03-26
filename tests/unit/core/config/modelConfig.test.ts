import {
  buildCatalogFromConfig,
  isModelEnabledByConfig,
  isProviderEnabledByConfig,
  mergeCatalogs,
  setModelEnabled,
  setProviderEnabled,
} from '../../../../src/core/config/modelConfig';

describe('modelConfig', () => {
  it('builds local catalog with provider and model enabled states', () => {
    const catalog = buildCatalogFromConfig({
      disabled_providers: ['openai'],
      provider: {
        anthropic: {
          name: 'Anthropic',
          blacklist: ['claude-3-haiku'],
          models: {
            'claude-3-sonnet': { name: 'Claude Sonnet' },
            'claude-3-haiku': { name: 'Claude Haiku' },
          },
        },
        openai: {
          name: 'OpenAI',
          models: {
            'gpt-4.1': { name: 'GPT-4.1' },
          },
        },
      },
    }, 'local');

    expect(catalog.providers.find((provider) => provider.id === 'anthropic')?.enabled).toBe(true);
    expect(
      catalog.providers
        .find((provider) => provider.id === 'anthropic')
        ?.models.find((model) => model.id === 'claude-3-haiku')
        ?.enabled,
    ).toBe(false);
    expect(catalog.providers.find((provider) => provider.id === 'openai')?.enabled).toBe(false);
  });

  it('merges server catalog with local toggle metadata', () => {
    const server = buildCatalogFromConfig({
      provider: {
        openai: {
          name: 'OpenAI',
          models: {
            'gpt-4.1': { name: 'GPT-4.1' },
            'gpt-4o-mini': { name: 'GPT-4o mini' },
          },
        },
      },
    }, 'server');

    const local = buildCatalogFromConfig({
      provider: {
        openai: {
          name: 'OpenAI',
          blacklist: ['gpt-4o-mini'],
          models: {},
        },
      },
    }, 'local');

    const merged = mergeCatalogs(server, local);
    const provider = merged.providers.find((item) => item.id === 'openai');

    expect(provider?.enabled).toBe(true);
    expect(provider?.models.find((model) => model.id === 'gpt-4.1')?.enabled).toBe(true);
    expect(provider?.models.find((model) => model.id === 'gpt-4o-mini')?.enabled).toBe(false);
  });

  it('updates provider and model toggle config without losing structure', () => {
    const providerDisabled = setProviderEnabled({
      enabled_providers: ['anthropic', 'openai'],
      provider: {
        openai: {
          blacklist: ['gpt-4o-mini'],
          models: {
            'gpt-4.1': { name: 'GPT-4.1' },
          },
        },
      },
    }, 'openai', false);

    expect(isProviderEnabledByConfig(providerDisabled, 'openai')).toBe(false);
    expect(providerDisabled.enabled_providers).toEqual(['anthropic']);
    expect(providerDisabled.disabled_providers).toEqual(['openai']);

    const modelDisabled = setModelEnabled(providerDisabled, 'openai', 'gpt-4.1', false);
    expect(isModelEnabledByConfig(modelDisabled, 'openai', 'gpt-4.1')).toBe(false);
    expect(modelDisabled.provider?.openai?.blacklist).toEqual(
      expect.arrayContaining(['gpt-4o-mini', 'gpt-4.1']),
    );
  });
});
