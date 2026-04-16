import {
  buildCatalogFromConfig,
  filterCatalog,
  isProviderEnabled,
  mergeProviderAvailabilityConfig,
  resolveInheritedModelConfigResolution,
  setProviderEnabled,
} from '../../../../src/core/config/modelConfig';
import type { OpencodeModelConfigSubset } from '../../../../src/core/types';

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

describe('modelConfig provider availability helpers', () => {
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
    const disabledOpenAi = setProviderEnabled({
      subset: localConfig,
      providerId: 'openai',
      enabled: false,
      knownProviderIds: ['openai', 'anthropic'],
    });
    expect(disabledOpenAi.enabled_providers).toEqual(['anthropic']);
    expect(disabledOpenAi.disabled_providers).toEqual(['anthropic']);

    const reenabledAnthropic = setProviderEnabled({
      subset: localConfig,
      providerId: 'anthropic',
      enabled: true,
      knownProviderIds: ['openai', 'anthropic'],
    });
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
});

describe('modelConfig inherited availability helpers', () => {
  it('resolves local inherited config layering from disk, scoped runtime, and project overrides', () => {
    const resolution = resolveInheritedModelConfigResolution({
      localServerMode: true,
      diskInheritedConfig: {
        disabled_providers: ['alibaba'],
      },
      scopedConfig: {
        enabled_providers: ['deepseek'],
        disabled_providers: ['opencode'],
      },
      defaultScopeConfig: {
        disabled_providers: ['should-not-apply'],
      },
      localConfig: {},
    });

    expect(resolution.inheritedConfigSource).toBe('local_disk');
    expect(resolution.inheritedConfig).toEqual({
      enabled_providers: ['deepseek'],
      disabled_providers: ['alibaba', 'opencode'],
    });
    expect(resolution.mergedScopedConfig).toEqual({
      enabled_providers: ['deepseek'],
      disabled_providers: ['opencode'],
    });
    expect(resolution.effectiveProviderConfig).toEqual({
      enabled_providers: ['deepseek'],
      disabled_providers: ['alibaba', 'opencode'],
    });
    expect(resolution.getCurrentEnabledProviderIds(['deepseek', 'alibaba', 'deepseek'])).toEqual(['deepseek']);
    expect(resolution.isProviderEnabledInServerScope('deepseek')).toBe(true);
    expect(resolution.isProviderEnabledInCurrentScope('alibaba')).toBe(false);
    expect(resolution.isProviderEffectivelyEnabled('opencode')).toBe(false);
  });

  it('lets remote inherited availability come from server default scope while project overrides clear it', () => {
    const resolution = resolveInheritedModelConfigResolution({
      localServerMode: false,
      diskInheritedConfig: {
        disabled_providers: ['should-not-apply'],
      },
      scopedConfig: {
        enabled_providers: ['deepseek'],
        disabled_providers: [],
      },
      defaultScopeConfig: {
        enabled_providers: ['deepseek'],
        disabled_providers: ['alibaba'],
      },
      localConfig: {
        disabled_providers: [],
      },
    });

    expect(resolution.inheritedConfigSource).toBe('server_default_scope');
    expect(resolution.inheritedConfig).toEqual({
      enabled_providers: ['deepseek'],
      disabled_providers: ['alibaba'],
    });
    expect(resolution.effectiveProviderConfig).toEqual({
      enabled_providers: ['deepseek'],
      disabled_providers: [],
    });
    expect(resolution.isProviderEnabledInCurrentScope('deepseek')).toBe(true);
    expect(resolution.isProviderEffectivelyEnabled('deepseek')).toBe(true);
    expect(resolution.isProviderEffectivelyEnabled('alibaba')).toBe(false);
  });

  it('preserves inherited blacklist diff when locally re-enabling one provider', () => {
    const inherited = {
      disabled_providers: ['alibaba', 'alibaba-cn'],
    };

    const locallyEnabledAlibaba = setProviderEnabled({
      subset: {},
      providerId: 'alibaba',
      enabled: true,
      knownProviderIds: ['deepseek', 'alibaba', 'alibaba-cn'],
      inherited,
    });
    expect(locallyEnabledAlibaba).toEqual({
      disabled_providers: ['alibaba-cn'],
    });

    const restored = setProviderEnabled({
      subset: locallyEnabledAlibaba,
      providerId: 'alibaba',
      enabled: false,
      knownProviderIds: ['deepseek', 'alibaba', 'alibaba-cn'],
      inherited,
    });
    expect(restored).toEqual({});
  });

  it('extends inherited whitelist entries without clearing unrelated server rules', () => {
    const inherited = {
      enabled_providers: ['deepseek'],
      disabled_providers: ['alibaba'],
    };

    const locallyEnabledOpenAI = setProviderEnabled({
      subset: {},
      providerId: 'openai',
      enabled: true,
      knownProviderIds: ['deepseek', 'openai', 'alibaba'],
      inherited,
    });
    expect(locallyEnabledOpenAI).toEqual({
      enabled_providers: ['deepseek', 'openai'],
    });

    const restored = setProviderEnabled({
      subset: locallyEnabledOpenAI,
      providerId: 'openai',
      enabled: false,
      knownProviderIds: ['deepseek', 'openai', 'alibaba'],
      inherited,
    });
    expect(restored).toEqual({});
  });
});
