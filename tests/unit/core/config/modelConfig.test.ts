import {
  buildCatalogFromConfig,
  filterCatalog,
  isProviderEnabled,
  resolveModelSelection,
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
    expect(reenabledAnthropic.disabled_providers).toEqual([]);
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
});
