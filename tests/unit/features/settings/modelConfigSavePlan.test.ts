import type { OpencodeProviderConfig } from '../../../../src/core/types';
import {
  createModelConfigModalSnapshot,
  parseAddProviderJsonDraft,
  syncProviderFormFromJsonDraft,
} from '../../../../src/features/settings/modelConfigModalState';
import {
  buildModelConfigSavePlan,
  serializeProviderConfig,
} from '../../../../src/features/settings/modelConfigSavePlan';
import type {
  KeyValueFieldState,
  ModelFormState,
  ProviderFormState,
} from '../../../../src/features/settings/modelConfigWorkspace';
import { t } from '../../../../src/i18n';

function field(key: string, value: string): KeyValueFieldState {
  return {
    uid: `${key}-field`,
    key,
    value,
  };
}

function model(overrides: Partial<ModelFormState> = {}): ModelFormState {
  return {
    uid: 'model-1',
    id: 'gpt-4o',
    name: 'GPT-4o',
    context: '128000',
    output: '4096',
    enabled: true,
    options: [],
    variants: [],
    extraFields: [],
    raw: {},
    ...overrides,
  };
}

function provider(overrides: Partial<ProviderFormState> = {}): ProviderFormState {
  return {
    uid: 'provider-1',
    id: 'openai',
    name: 'OpenAI',
    interfaceFormat: 'openai-compatible',
    customNpm: '',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    enabled: true,
    extraOptions: [],
    models: [model()],
    raw: {},
    ...overrides,
  };
}

describe('model config save plan helpers', () => {
  it('builds workspace plans with provider serialization and disabled model refs', () => {
    const plan = buildModelConfigSavePlan({
      flow: 'workspace',
      modelValue: ' openai/gpt-4o ',
      smallModelValue: ' openai/gpt-4o-mini ',
      providers: [
        provider({
          raw: {
            headers: {
              'x-custom': 'keep',
            },
          } as OpencodeProviderConfig,
          extraOptions: [
            field('region', '"us-east-1"'),
            field('apiKey', 'ignored'),
          ],
          models: [
            model({
              enabled: false,
              options: [field('temperature', '0.2')],
              variants: [field('fast', '{"temperature":0.1}')],
              extraFields: [field('release', 'true')],
            }),
          ],
        }),
      ],
      selectedProvider: null,
      localConfigAtOpen: {
        provider: {
          openai: {
            name: 'OpenAI',
            models: {
              'gpt-4o': {},
            },
          },
        },
      },
      serverConfigAtOpen: {},
      initialDisabledModelRefs: ['openai/legacy', 'other/model'],
      jsonDraftValue: '',
    });

    expect(plan.restartServerAfterWrite).toBe(true);
    expect(plan.nextDisabledModelRefs).toEqual(['openai/gpt-4o', 'other/model']);
    expect(plan.nextConfig).toEqual({
      model: 'openai/gpt-4o',
      small_model: 'openai/gpt-4o-mini',
      provider: {
        openai: {
          headers: {
            'x-custom': 'keep',
          },
          name: 'OpenAI',
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://api.openai.com/v1',
            region: 'us-east-1',
          },
          models: {
            'gpt-4o': {
              name: 'GPT-4o',
              limit: {
                context: 128000,
                output: 4096,
              },
              options: {
                temperature: 0.2,
              },
              variants: {
                fast: {
                  temperature: 0.1,
                },
              },
              release: true,
            },
          },
        },
      },
      enabled_providers: undefined,
      disabled_providers: undefined,
    });
  });

  it('builds add-provider plans from the JSON draft without touching disabled refs', () => {
    const selectedProvider = provider({
      id: 'anthropic',
      name: 'Anthropic',
      interfaceFormat: 'anthropic',
      baseURL: 'https://api.anthropic.com',
      models: [],
      raw: {},
    });

    const plan = buildModelConfigSavePlan({
      flow: 'add-provider',
      modelValue: '',
      smallModelValue: '',
      providers: [selectedProvider],
      selectedProvider,
      localConfigAtOpen: {
        provider: {
          openai: {
            name: 'OpenAI',
          },
        },
      },
      serverConfigAtOpen: {},
      initialDisabledModelRefs: ['openai/legacy'],
      jsonDraftValue: JSON.stringify({
        npm: '@ai-sdk/anthropic',
        options: {
          baseURL: 'https://api.anthropic.com',
        },
        models: {
          'claude-3-7-sonnet': {},
        },
        custom: 123,
      }),
    });

    expect(plan.restartServerAfterWrite).toBe(false);
    expect(plan.nextDisabledModelRefs).toEqual(['openai/legacy']);
    expect(plan.nextConfig.provider?.anthropic).toEqual({
      npm: '@ai-sdk/anthropic',
      name: 'Anthropic',
      options: {
        baseURL: 'https://api.anthropic.com',
      },
      models: {
        'claude-3-7-sonnet': {},
      },
      custom: 123,
    });
  });

  it('serializes preview providers without requiring workspace-only fields', () => {
    const serialized = serializeProviderConfig(provider({
      name: '',
      baseURL: '',
      models: [
        model({
          id: '',
        }),
      ],
    }), {
      validate: false,
      includeName: false,
    });

    expect(serialized).toEqual({
      npm: '@ai-sdk/openai-compatible',
      options: {},
      models: {},
    });
  });
});

describe('model config modal state helpers', () => {
  it('syncs a provider form from JSON while preserving existing model enablement', () => {
    const state = provider({
      interfaceFormat: 'openai-compatible',
      customNpm: '',
      extraOptions: [],
      models: [
        model({
          id: 'claude-3-7-sonnet',
          enabled: false,
        }),
      ],
    });

    syncProviderFormFromJsonDraft(state, {
      npm: '@scope/custom-adapter',
      options: {
        baseURL: 'https://api.example.com/v1',
        apiKey: 'secret',
        setCacheKey: true,
      },
      models: {
        'claude-3-7-sonnet': {
          name: 'Claude',
          limit: {
            context: 200000,
          },
          options: {
            temperature: 0.3,
          },
          beta: true,
        },
      },
    });

    expect(state.interfaceFormat).toBe('custom');
    expect(state.customNpm).toBe('@scope/custom-adapter');
    expect(state.baseURL).toBe('https://api.example.com/v1');
    expect(state.apiKey).toBe('secret');
    expect(state.extraOptions).toEqual([
      expect.objectContaining({
        key: 'setCacheKey',
        value: 'true',
      }),
    ]);
    expect(state.models[0]).toEqual(expect.objectContaining({
      id: 'claude-3-7-sonnet',
      enabled: false,
      context: '200000',
      options: [
        expect.objectContaining({
          key: 'temperature',
          value: '0.3',
        }),
      ],
      extraFields: [
        expect.objectContaining({
          key: 'beta',
          value: 'true',
        }),
      ],
    }));
  });

  it('parses provider JSON drafts and rejects non-object drafts', () => {
    expect(parseAddProviderJsonDraft('{"npm":"@ai-sdk/openai"}')).toEqual({
      npm: '@ai-sdk/openai',
    });
    expect(() => parseAddProviderJsonDraft('[]')).toThrow(t('settings.model.jsonEditor.providerObject'));
  });

  it('creates snapshots that only include JSON drafts for add-provider flow', () => {
    const base = {
      modelValue: '',
      smallModelValue: '',
      jsonDraftValue: '{"draft":true}',
      providers: [provider()],
    };

    expect(JSON.parse(createModelConfigModalSnapshot({
      ...base,
      flow: 'add-provider',
    })).jsonDraftValue).toBe('{"draft":true}');
    expect(JSON.parse(createModelConfigModalSnapshot({
      ...base,
      flow: 'workspace',
    }))).not.toHaveProperty('jsonDraftValue');
  });
});
