import {
  buildCatalogFromConfig,
  filterCatalog,
  isProviderEnabled,
  mergeCatalogs,
  mergeProviderAvailabilityConfig,
  resolveModelSelection,
  resolvePreferredAvailableModel,
  setProviderEnabled,
} from '../../../../src/core/config/modelConfig';
import type { OpencodeModelConfigSubset } from '../../../../src/core/types';

describe('modelConfig helpers', () => {
  const localConfig: OpencodeModelConfigSubset = {
    model: 'openai/gpt-4o',
    provider: {
      openai: {
        name: 'OpenAI',
        models: {
          'gpt-4o': { name: 'GPT-4o' },
          'gpt-4.1': { name: 'GPT-4.1' },
        },
      },
      anthropic: {
        name: 'Anthropic',
        models: {
          'claude-3-5-sonnet': { name: 'Claude 3.5 Sonnet' },
        },
      },
    },
    enabled_providers: ['openai', 'anthropic'],
    disabled_providers: ['anthropic'],
  };

  it('resolves provider visibility by whitelist first and blacklist second', () => {
    expect(isProviderEnabled(localConfig, 'openai')).toBe(true);
    expect(isProviderEnabled(localConfig, 'anthropic')).toBe(false);
    expect(isProviderEnabled(localConfig, 'gemini')).toBe(false);
  });

  it('filters providers and disabled models without mutating the base catalog', () => {
    const baseCatalog = buildCatalogFromConfig(localConfig, 'local');
    const filteredCatalog = filterCatalog(baseCatalog, {
      providerConfig: localConfig,
      disabledModelRefs: ['openai/gpt-4.1'],
    });

    expect(baseCatalog.providers).toHaveLength(2);
    expect(baseCatalog.providers.find((provider) => provider.id === 'openai')?.models).toHaveLength(2);
    expect(filteredCatalog.providers.map((provider) => provider.id)).toEqual(['openai']);
    expect(filteredCatalog.providers[0].models.map((model) => model.id)).toEqual(['gpt-4o']);
  });

  it('preserves whitelist mode when toggling providers', () => {
    const disabledOpenAi = setProviderEnabled(localConfig, 'openai', false, ['openai', 'anthropic']);
    expect(disabledOpenAi.enabled_providers).toEqual(['anthropic']);
    expect(disabledOpenAi.disabled_providers).toEqual(['anthropic']);

    const reenabledAnthropic = setProviderEnabled(localConfig, 'anthropic', true, ['openai', 'anthropic']);
    expect(reenabledAnthropic.enabled_providers).toEqual(['openai', 'anthropic']);
    expect(reenabledAnthropic.disabled_providers).toBeUndefined();
  });

  it('replaces inherited provider arrays field by field', () => {
    expect(mergeProviderAvailabilityConfig(
      {
        enabled_providers: ['deepseek'],
        disabled_providers: ['alibaba', 'alibaba-cn'],
      },
      {
        disabled_providers: ['alibaba-cn'],
      },
    )).toEqual({
      enabled_providers: ['deepseek'],
      disabled_providers: ['alibaba-cn'],
    });
  });

  it('preserves inherited blacklist entries when locally re-enabling one provider', () => {
    const inherited = {
      disabled_providers: ['alibaba', 'alibaba-cn'],
    };

    const locallyEnabledAlibaba = setProviderEnabled(
      {},
      'alibaba',
      true,
      ['deepseek', 'alibaba', 'alibaba-cn'],
      inherited,
    );
    expect(locallyEnabledAlibaba).toEqual({
      disabled_providers: ['alibaba-cn'],
    });

    const restored = setProviderEnabled(
      locallyEnabledAlibaba,
      'alibaba',
      false,
      ['deepseek', 'alibaba', 'alibaba-cn'],
      inherited,
    );
    expect(restored).toEqual({});
  });

  it('extends inherited whitelist entries without clearing unrelated server rules', () => {
    const inherited = {
      enabled_providers: ['deepseek'],
      disabled_providers: ['alibaba'],
    };

    const locallyEnabledOpenAI = setProviderEnabled(
      {},
      'openai',
      true,
      ['deepseek', 'openai', 'alibaba'],
      inherited,
    );
    expect(locallyEnabledOpenAI).toEqual({
      enabled_providers: ['deepseek', 'openai'],
    });

    const restored = setProviderEnabled(
      locallyEnabledOpenAI,
      'openai',
      false,
      ['deepseek', 'openai', 'alibaba'],
      inherited,
    );
    expect(restored).toEqual({});
  });

  it('preserves server disabled scopes when local and server catalogs merge', () => {
    const merged = mergeCatalogs(
      {
        providers: [{
          id: 'alibaba',
          name: 'Alibaba',
          source: 'server',
          existsInLocal: false,
          existsInServer: true,
          disabledScopes: ['global'],
          models: [{
            id: 'qwen-max',
            name: 'Qwen Max',
            source: 'server',
            existsInLocal: false,
            existsInServer: true,
            disabledScopes: ['global'],
          }],
        }],
        defaults: {},
      },
      {
        providers: [{
          id: 'alibaba',
          name: 'Alibaba',
          source: 'local',
          existsInLocal: true,
          existsInServer: false,
          models: [{
            id: 'qwen-max',
            name: 'Qwen Max',
            source: 'local',
            existsInLocal: true,
            existsInServer: false,
          }],
        }],
        defaults: {},
      },
    );

    expect(merged.providers[0]?.disabledScopes).toEqual(['global']);
    expect(merged.providers[0]?.models[0]?.disabledScopes).toEqual(['global']);
  });

  it('resolves model selections as available, unconfigured, or unavailable', () => {
    const baseCatalog = buildCatalogFromConfig(localConfig, 'local');
    const effectiveCatalog = filterCatalog(baseCatalog, {
      providerConfig: localConfig,
      disabledModelRefs: ['openai/gpt-4.1'],
    });

    expect(resolveModelSelection(baseCatalog, effectiveCatalog, 'openai', 'gpt-4o')).toMatchObject({
      status: 'available',
      ref: 'openai/gpt-4o',
    });
    expect(resolveModelSelection(baseCatalog, effectiveCatalog, '', '')).toMatchObject({
      status: 'unconfigured',
      ref: '',
    });
    expect(resolveModelSelection(baseCatalog, effectiveCatalog, 'anthropic', 'claude-3-5-sonnet')).toMatchObject({
      status: 'unavailable',
      ref: 'anthropic/claude-3-5-sonnet',
    });
  });

  it('prefers another available model when the requested one is filtered out', () => {
    const baseCatalog = buildCatalogFromConfig(localConfig, 'local');
    const effectiveCatalog = filterCatalog(baseCatalog, {
      providerConfig: localConfig,
      disabledModelRefs: ['openai/gpt-4.1'],
    });

    expect(resolvePreferredAvailableModel(effectiveCatalog, 'openai', 'gpt-4.1')).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      ref: 'openai/gpt-4o',
    });
  });

  it('falls back to the first effective default when the requested provider is unavailable', () => {
    const baseCatalog = buildCatalogFromConfig(localConfig, 'local');
    const effectiveCatalog = filterCatalog(baseCatalog, {
      providerConfig: localConfig,
      disabledModelRefs: [],
    });

    expect(resolvePreferredAvailableModel(effectiveCatalog, 'anthropic', 'claude-3-5-sonnet')).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      ref: 'openai/gpt-4o',
    });
    expect(resolvePreferredAvailableModel(effectiveCatalog, '', '')).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      ref: 'openai/gpt-4o',
    });
  });
});
