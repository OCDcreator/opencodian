import {
  assembleModelCatalog,
  assembleServerModelCatalog,
  buildCatalogFromConfig,
  buildServerCatalog,
  catalogFromRuntimeResult,
  filterCatalog,
  mergeCatalogs,
  resolveModelSelection,
  resolvePreferredAvailableModel,
  resolveProviderAvailabilityProbePlan,
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

describe('modelConfig server catalog helpers', () => {
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

  it('assembles server catalog state through the inherited config resolution seam', () => {
    const assembled = assembleServerModelCatalog({
      runtimeResult: {
        defaults: {
          deepseek: 'deepseek-chat',
        },
        providers: [
          {
            id: 'deepseek',
            name: 'DeepSeek Runtime',
            models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat Runtime', contextWindow: 128000 }],
          },
        ],
      },
      localServerMode: true,
      diskInheritedConfig: {
        disabled_providers: ['alibaba'],
      },
      scopedConfig: {
        enabled_providers: ['deepseek'],
        disabled_providers: ['opencode'],
        provider: {
          deepseek: {
            name: 'DeepSeek Metadata',
            models: {
              'deepseek-chat': { name: 'DeepSeek Chat Metadata' },
            },
          },
          opencode: {
            name: 'OpenCode Metadata',
            models: {
              'big-pickle': { name: 'Big Pickle' },
            },
          },
        },
      },
      defaultScopeConfig: {
        disabled_providers: ['should-not-apply'],
      },
      localConfig: {},
    });

    expect(assembled.runtime.providers.map((provider) => provider.id)).toEqual(['deepseek']);
    expect(assembled.configResolution.inheritedConfig).toEqual({
      enabled_providers: ['deepseek'],
      disabled_providers: ['alibaba', 'opencode'],
    });
    expect(assembled.configResolution.getCurrentEnabledProviderIds(['deepseek', 'opencode'])).toEqual(['deepseek']);
    expect(assembled.server.providers.map((provider) => provider.id)).toEqual(['deepseek']);
    expect(assembled.server.providers[0]).toMatchObject({
      id: 'deepseek',
      name: 'DeepSeek Metadata',
      models: [{
        id: 'deepseek-chat',
        name: 'DeepSeek Chat Metadata',
        contextWindow: 128000,
      }],
    });
    expect(assembled.server.defaults).toEqual({
      deepseek: 'deepseek-chat',
    });
  });
});

describe('modelConfig catalog projection helpers', () => {
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
