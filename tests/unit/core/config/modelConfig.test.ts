import {
  assembleModelCatalog,
  buildCatalogFromConfig,
  buildServerCatalog,
  catalogFromRuntimeResult,
  filterCatalog,
  isProviderEnabled,
  mergeCatalogs,
  mergeProviderAvailabilityConfig,
  resolveInheritedModelConfigResolution,
  resolveModelSelection,
  resolvePreferredAvailableModel,
  resolveProviderAvailabilityProbePlan,
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

  it('assembles runtime-backed server catalogs without widening beyond current providers', () => {
    const runtimeCatalog = catalogFromRuntimeResult({
      defaults: {
        deepseek: 'deepseek-chat',
      },
      providers: [
        {
          id: 'deepseek',
          name: 'DeepSeek Runtime',
          models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 128000 }],
        },
        {
          id: 'openai',
          name: 'OpenAI Runtime',
          models: [{ id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 256000 }],
        },
      ],
    });

    const serverCatalog = buildServerCatalog(runtimeCatalog, {
      model: 'openai/gpt-4.1',
      provider: {
        deepseek: {
          name: 'DeepSeek',
          models: {
            'deepseek-chat': { name: 'DeepSeek Chat' },
          },
        },
        openai: {
          name: 'OpenAI',
          models: {
            'gpt-4.1': { name: 'GPT-4.1' },
          },
        },
        anthropic: {
          name: 'Anthropic',
          models: {
            'claude-sonnet': { name: 'Claude Sonnet' },
          },
        },
      },
    });

    expect(serverCatalog.providers.map((provider) => provider.id)).toEqual(['deepseek', 'openai']);
    expect(serverCatalog.providers.find((provider) => provider.id === 'deepseek')?.name).toBe('DeepSeek');
    expect(serverCatalog.defaults).toEqual({
      deepseek: 'deepseek-chat',
      openai: 'gpt-4.1',
    });
  });

  it('assembles effective catalogs through the shared catalog seam', () => {
    const localCatalog = buildCatalogFromConfig(localConfig, 'local');

    const assembled = assembleModelCatalog({
      local: localCatalog,
      server: buildCatalogFromConfig({}, 'server'),
      mode: 'merge',
      disabledModelRefs: ['openai/gpt-4.1'],
      configResolution: {
        effectiveProviderConfig: {
          enabled_providers: ['openai', 'anthropic'],
          disabled_providers: ['anthropic'],
        },
        getCurrentEnabledProviderIds: jest.fn().mockReturnValue(['openai']),
      },
    });

    expect(assembled.baseEffective.providers.map((provider) => provider.id)).toEqual(['anthropic', 'openai']);
    expect(assembled.currentEnabledProviderIds).toEqual(['openai']);
    expect(assembled.effective.providers.map((provider) => provider.id)).toEqual(['openai']);
    expect(assembled.effective.providers[0]?.models.map((model) => model.id)).toEqual(['gpt-4o']);
    expect(assembled.effectiveProviderConfig).toEqual({
      enabled_providers: ['openai', 'anthropic'],
      disabled_providers: ['anthropic'],
    });
  });

  it('derives provider probe plans from effective enablement and default fallbacks', () => {
    const runtimeCatalog = catalogFromRuntimeResult({
      defaults: {
        alibaba: 'qwen-max',
      },
      providers: [
        {
          id: 'alibaba',
          name: 'Alibaba',
          models: [{ id: 'qwen-max', name: 'Qwen Max', contextWindow: 128000 }],
        },
      ],
    });

    expect(resolveProviderAvailabilityProbePlan({
      providerId: ' alibaba ',
      localConfig: {
        model: 'alibaba/qwen-max',
      },
      runtimeCatalog,
      serverCatalog: runtimeCatalog,
      configResolution: {
        isProviderEnabledInServerScope: () => true,
        isProviderEffectivelyEnabled: () => true,
      },
    })).toMatchObject({
      providerId: 'alibaba',
      status: 'available',
      testedModelId: 'qwen-max',
      shouldSendProbe: true,
      runtimeModelCount: 1,
      catalogModelCount: 1,
    });

    expect(resolveProviderAvailabilityProbePlan({
      providerId: 'alibaba',
      localConfig: {
        disabled_providers: ['alibaba'],
      },
      runtimeCatalog,
      serverCatalog: runtimeCatalog,
      configResolution: {
        isProviderEnabledInServerScope: () => false,
        isProviderEffectivelyEnabled: () => false,
      },
    })).toMatchObject({
      providerId: 'alibaba',
      status: 'project_disabled',
      testedModelId: 'qwen-max',
      shouldSendProbe: false,
      effectiveEnabled: false,
      projectDisabled: true,
      serverDisabled: false,
    });
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
