import { requestUrl } from 'obsidian';

import {
  buildConfigPreview,
  fetchProviderModels,
  hydrateWorkspaceState,
  normalizeFetchedModelsFromResponse,
} from '../../../../src/features/settings/modelConfigWorkspace';

describe('modelConfigWorkspace', () => {
  beforeEach(() => {
    (requestUrl as jest.Mock).mockReset();
  });

  it('hydrates provider/model extra fields and disabled state', () => {
    const state = hydrateWorkspaceState({
      model: 'openai/gpt-4.1',
      small_model: 'openai/gpt-4.1-mini',
      provider: {
        openai: {
          name: 'OpenAI',
          npm: '@ai-sdk/openai',
          options: {
            baseURL: 'https://api.openai.com/v1',
            apiKey: '{env:OPENAI_API_KEY}',
            timeout: 600000,
          },
          models: {
            'gpt-4.1': {
              name: 'GPT-4.1',
              limit: { context: 200000, output: 32000 },
              options: { reasoningEffort: 'high' },
              variants: { high: { reasoningEffort: 'high' } },
            },
          },
        },
      },
    }, ['openai/gpt-4.1']);

    expect(state.modelValue).toBe('openai/gpt-4.1');
    expect(state.providers[0].extraOptions).toEqual([
      expect.objectContaining({ key: 'timeout', value: '600000' }),
    ]);
    expect(state.providers[0].models[0].enabled).toBe(false);
    expect(state.providers[0].models[0].options).toEqual([
      expect.objectContaining({ key: 'reasoningEffort', value: 'high' }),
    ]);
    expect(state.providers[0].models[0].extraFields).toEqual([
      expect.objectContaining({
        key: 'variants',
        value: JSON.stringify({ high: { reasoningEffort: 'high' } }, null, 2),
      }),
    ]);
  });

  it('builds preview JSON with provider options and model extras', () => {
    const state = hydrateWorkspaceState({
      provider: {
        openai: {
          name: 'OpenAI',
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://example.com/v1',
            apiKey: 'sk-test',
            timeout: 120000,
          },
          models: {
            'gpt-4.1': {
              name: 'GPT-4.1',
              options: { reasoningEffort: 'high' },
              variants: { low: { reasoningEffort: 'low' } },
            },
          },
        },
      },
      enabled_providers: ['openai'],
    }, []);

    const preview = buildConfigPreview(
      'openai/gpt-4.1',
      '',
      state.providers,
      {
        enabled_providers: ['openai'],
        disabled_providers: undefined,
      },
    );
    const parsed = JSON.parse(preview) as {
      provider: {
        openai: {
          options: Record<string, unknown>;
          models: Record<string, Record<string, unknown>>;
        };
      };
      enabled_providers: string[];
    };

    expect(parsed.enabled_providers).toEqual(['openai']);
    expect(parsed.provider.openai.options.timeout).toBe(120000);
    expect(parsed.provider.openai.models['gpt-4.1'].options).toEqual({ reasoningEffort: 'high' });
    expect(parsed.provider.openai.models['gpt-4.1'].variants).toEqual({ low: { reasoningEffort: 'low' } });
  });

  it('normalizes Google Gemini model responses', () => {
    const models = normalizeFetchedModelsFromResponse('google-gemini', {
      models: [
        {
          name: 'models/gemini-2.5-pro',
          displayName: 'Gemini 2.5 Pro',
          inputTokenLimit: 1048576,
          outputTokenLimit: 65536,
        },
      ],
    });

    expect(models).toEqual([
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        context: 1048576,
        output: 65536,
      },
    ]);
  });

  it('fetches OpenAI-compatible models via requestUrl', async () => {
    (requestUrl as jest.Mock).mockResolvedValue({
      status: 200,
      json: {
        data: [
          { id: 'gpt-4.1', name: 'GPT-4.1', context_window: 200000, max_output_tokens: 32000 },
        ],
      },
    });

    const models = await fetchProviderModels('openai-compatible', 'https://example.com/v1', 'sk-test');

    expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://example.com/v1/models',
      headers: expect.objectContaining({
        Authorization: 'Bearer sk-test',
      }),
    }));
    expect(models).toEqual([
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        context: 200000,
        output: 32000,
      },
    ]);
  });
});
