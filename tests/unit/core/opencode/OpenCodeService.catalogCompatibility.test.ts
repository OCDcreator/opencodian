import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  mockCreateSdkClient,
  type MockOpenCodeServiceSdkClient,
  mockRequestUrl,
  OpenCodeService,
} from './OpenCodeService.testSupport';

let service: OpenCodeService;
let mockSdkClient: MockOpenCodeServiceSdkClient;

beforeEach(() => {
  ({ service, mockSdkClient } = createOpenCodeServiceTestContext());
});

  describe('getAvailableModels', () => {
    it('uses the current vault directory for project-scoped SDK provider requests', async () => {
      service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
        sdkFeatureFlags: { sdkCrud: true },
      });
      service.setVaultPath('C:\\vault');
      mockSdkClient.config.providers.mockResolvedValue({
        providers: [{
          id: 'openai',
          name: 'OpenAI',
          models: {
            'gpt-4.1': { id: 'gpt-4.1', name: 'GPT-4.1' },
          },
        }],
        default: { openai: 'gpt-4.1' },
      });

      await service.getAvailableModels();

      expect(mockCreateSdkClient).toHaveBeenCalledWith(expect.objectContaining({
        baseUrl: 'http://127.0.0.1:4196',
        directory: 'C:/vault',
      }));
    });

    it('omits the vault directory when fetching the raw server catalog via SDK', async () => {
      service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
        sdkFeatureFlags: { sdkCrud: true },
      });
      service.setVaultPath('C:/vault');
      mockSdkClient.config.providers.mockResolvedValue({
        providers: [{
          id: 'deepseek',
          name: 'DeepSeek',
          models: {
            'deepseek-chat': { id: 'deepseek-chat', name: 'DeepSeek Chat' },
          },
        }],
        default: { deepseek: 'deepseek-chat' },
      });

      await service.getAvailableModels({ includeDirectory: false });

      expect(mockCreateSdkClient).toHaveBeenCalledWith(expect.objectContaining({
        baseUrl: 'http://127.0.0.1:4196',
        directory: undefined,
      }));
    });

    it('falls back to the legacy HTTP provider catalog and preserves context limits', async () => {
      service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
        sdkFeatureFlags: { sdkCrud: false },
      });
      service.setVaultPath('C:\\vault');
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          providers: [{
            id: 'openai',
            name: 'OpenAI',
            models: {
              'gpt-5': {
                id: 'gpt-5',
                name: 'GPT-5',
                limit: { context: 400000 },
              },
            },
          }],
          default: { provider: 'openai', model: 'gpt-5' },
        },
        text: '{}',
      });

      const result = await service.getAvailableModels();

      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/config/providers?directory=C%3A%2Fvault',
        method: 'GET',
      }));
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].id).toBe('openai');
      expect(result.defaults).toEqual({ openai: 'gpt-5' });
      expect(result.providers[0].models[0]).toMatchObject({
        id: 'gpt-5',
        name: 'GPT-5',
        contextWindow: 400000,
      });
    });
  });

  describe('getProviderDirectory', () => {
    it('uses SDK provider.list and normalizes object and array model structures', async () => {
      service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
        sdkFeatureFlags: { sdkCrud: true },
      });
      service.setVaultPath('C:\\vault');
      mockSdkClient.provider.list.mockResolvedValue({
        all: [
          {
            id: 'openai',
            name: 'OpenAI',
            models: {
              'gpt-4.1': {
                name: 'GPT-4.1',
                limit: { context: 256000 },
              },
            },
          },
          {
            id: 'ollama',
            name: 'Ollama',
            models: ['llama3.1'],
          },
        ],
        default: { openai: 'gpt-4.1' },
        connected: ['openai'],
      });

      const result = await service.getProviderDirectory();

      expect(mockCreateSdkClient).toHaveBeenCalledWith(expect.objectContaining({
        baseUrl: 'http://127.0.0.1:4196',
        directory: 'C:/vault',
      }));
      expect(mockSdkClient.provider.list).toHaveBeenCalledTimes(1);
      expect(mockSdkClient.config.providers).not.toHaveBeenCalled();
      expect(result.defaults).toEqual({ openai: 'gpt-4.1' });
      expect(result.connected).toEqual(['openai']);
      expect(result.providers).toEqual([
        {
          id: 'openai',
          name: 'OpenAI',
          models: [
            {
              id: 'gpt-4.1',
              name: 'GPT-4.1',
              contextWindow: 256000,
            },
          ],
        },
        {
          id: 'ollama',
          name: 'Ollama',
          models: [
            {
              id: 'llama3.1',
              name: 'llama3.1',
            },
          ],
        },
      ]);
    });

    it('falls back to legacy /provider and keeps connected providers', async () => {
      service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
        sdkFeatureFlags: { sdkCrud: false },
      });
      service.setVaultPath('C:\\vault');
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          all: [
            {
              id: 'deepseek',
              name: 'DeepSeek',
              models: {
                'deepseek-chat': {
                  name: 'DeepSeek Chat',
                  limit: { context: 128000 },
                },
              },
            },
            {
              id: 'openai',
              name: 'OpenAI',
              models: ['gpt-4.1'],
            },
          ],
          default: { deepseek: 'deepseek-chat' },
          connected: ['deepseek'],
        },
        text: '{}',
      });

      const result = await service.getProviderDirectory();

      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/provider?directory=C%3A%2Fvault',
        method: 'GET',
      }));
      expect(result.defaults).toEqual({ deepseek: 'deepseek-chat' });
      expect(result.connected).toEqual(['deepseek']);
      expect(result.providers.map((provider) => provider.id)).toEqual(['deepseek', 'openai']);
      expect(result.providers.find((provider) => provider.id === 'deepseek')?.models[0]).toMatchObject({
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        contextWindow: 128000,
      });
      expect(result.providers.find((provider) => provider.id === 'openai')?.models[0]).toMatchObject({
        id: 'gpt-4.1',
        name: 'gpt-4.1',
      });
    });
  });

describe('applyCompactionConfig', () => {
  it('applies compaction config through backend config.update and preserves adjacent fields', async () => {
    service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
    });
    service.setVaultPath('C:\\vault');
    mockSdkClient.config.get.mockResolvedValue({
      model: 'openai/gpt-5',
      compaction: {
        prune: false,
        tail_turns: 3,
      },
    });
    mockSdkClient.config.update.mockResolvedValue({
      model: 'openai/gpt-5',
      compaction: {
        prune: false,
        tail_turns: 3,
        auto: false,
        reserved: 16_000,
      },
    });

    const result = await service.applyCompactionConfig({
      auto: false,
      reserved: 16_000,
    });

    expect(result.status).toBe('applied');
    expect(mockSdkClient.config.get).toHaveBeenCalledTimes(1);
    expect(mockSdkClient.config.update).toHaveBeenCalledWith({
      config: {
        compaction: {
          prune: false,
          tail_turns: 3,
          auto: false,
          reserved: 16_000,
        },
      },
    });
    expect(mockCreateSdkClient).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:4196',
      directory: 'C:/vault',
    }));
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  it('reports deferred compaction apply when backend config update is unavailable', async () => {
    service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: { sdkCrud: false },
    });
    service.setVaultPath('C:\\vault');
    mockRequestUrl.mockRejectedValue(new Error('backend unavailable'));

    const result = await service.applyCompactionConfig({
      auto: true,
      reserved: 12_000,
    });

    expect(result).toMatchObject({
      status: 'deferred',
      reason: 'backend unavailable',
    });
  });
});

  describe('resolved config and context usage fallback', () => {
    it('uses a normalized directory query when falling back to legacy /config', async () => {
      service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
        sdkFeatureFlags: { sdkCrud: false },
      });
      service.setVaultPath('C:\\vault');
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          disabled_providers: ['zhipuai'],
          provider: {
            deepseek: {
              name: 'DeepSeek',
            },
          },
        },
        text: '{}',
      });

      const result = await service.getResolvedModelConfig();

      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/config?directory=C%3A%2Fvault',
        method: 'GET',
      }));
      expect(result.disabled_providers).toEqual(['zhipuai']);
      expect(result.provider).toEqual({
        deepseek: {
          name: 'DeepSeek',
        },
      });
    });

    it('unwraps SDK field-style config.get responses before normalizing model config', async () => {
      service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
        sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
      });
      mockSdkClient.config.get.mockResolvedValue({
        data: {
          model: 'openai/gpt-5',
          small_model: 'openai/gpt-5-mini',
          provider: {
            openai: {
              name: 'OpenAI',
            },
          },
          enabled_providers: ['openai'],
          disabled_providers: ['deepseek'],
        },
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      });

      const result = await service.getResolvedModelConfig();

      expect(result).toEqual({
        model: 'openai/gpt-5',
        small_model: 'openai/gpt-5-mini',
        provider: {
          openai: {
            name: 'OpenAI',
          },
        },
        enabled_providers: ['openai'],
        disabled_providers: ['deepseek'],
      });
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    it('uses the latest assistant message with tokens for context metrics', async () => {
      mockRequestUrl
        .mockResolvedValueOnce({
          status: 200,
          json: {
            id: 'session-1',
            title: 'Planning session',
            time: {
              created: 1000,
              updated: 9000,
            },
          },
          text: '{}',
        })
        .mockResolvedValueOnce({
          status: 200,
          json: [
            {
              info: {
                id: 'assistant-1',
                role: 'assistant',
                providerID: 'openai',
                modelID: 'gpt-4.1',
                cost: 0.1,
                tokens: {
                  input: 10,
                  output: 5,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
                time: { created: 2000 },
              },
              parts: [],
            },
            {
              info: {
                id: 'assistant-2',
                role: 'assistant',
                providerID: 'openai',
                modelID: 'gpt-5',
                cost: 0.2,
                tokens: {
                  input: 0,
                  output: 0,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
                time: { created: 3000 },
              },
              parts: [],
            },
            {
              info: {
                id: 'assistant-3',
                role: 'assistant',
                providerID: 'openai',
                modelID: 'gpt-5',
                cost: 0.3,
                tokens: {
                  input: 40,
                  output: 20,
                  reasoning: 10,
                  cache: { read: 5, write: 5 },
                },
                time: { created: 4000 },
              },
              parts: [],
            },
          ],
          text: '[]',
        })
        .mockResolvedValueOnce({
          status: 200,
          json: {
            providers: [
              {
                id: 'openai',
                name: 'OpenAI',
                models: {
                  'gpt-4.1': { name: 'GPT-4.1', limit: { context: 128000 } },
                  'gpt-5': { name: 'GPT-5', limit: { context: 400000 } },
                },
              },
            ],
            default: { provider: 'openai', model: 'gpt-5' },
          },
          text: '{}',
        });

      const snapshot = await service.getSessionContextUsageSnapshot('session-1');

      expect(snapshot).toMatchObject({
        sessionId: 'session-1',
        sessionTitle: 'Planning session',
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5',
        modelName: 'GPT-5',
        contextWindow: 400000,
        inputTokens: 40,
        outputTokens: 20,
        reasoningTokens: 10,
        cacheReadTokens: 5,
        cacheWriteTokens: 5,
        updatedAt: 4000,
      });
      expect(snapshot?.totalCost).toBeCloseTo(0.6, 6);
    });
  });
