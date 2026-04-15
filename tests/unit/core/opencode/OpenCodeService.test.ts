/**
 * OpenCodeService unit tests
 */

import { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { resolveToolExecutionStatus } from '../../../../src/shared';

// Mock Obsidian
jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  requestUrl: jest.fn(),
}));

const { requestUrl: mockRequestUrl } = jest.requireMock('obsidian') as {
  requestUrl: jest.Mock;
};

jest.mock('../../../../src/core/opencode/createSdkClient', () => ({
  createSdkClient: jest.fn(),
}));

const { createSdkClient: mockCreateSdkClient } = jest.requireMock('../../../../src/core/opencode/createSdkClient') as {
  createSdkClient: jest.Mock;
};

// Mock child_process for ServerManager
jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    kill: jest.fn(),
    stdout: { on: jest.fn(), removeListener: jest.fn() },
    stderr: { on: jest.fn(), removeListener: jest.fn() },
    killed: false,
  }),
  spawnSync: jest.fn().mockReturnValue({ status: 0, error: null }),
}));

// Mock net for ServerManager
jest.mock('net', () => ({
  createServer: jest.fn().mockReturnValue({
    once: jest.fn().mockReturnThis(),
    listen: jest.fn().mockReturnThis(),
    close: jest.fn(),
  }),
}));

let service: OpenCodeService;
let mockSdkClient: {
  global: { health: jest.Mock; syncEvent: { subscribe: jest.Mock } };
  session: {
    create: jest.Mock;
    diff: jest.Mock;
    list: jest.Mock;
    status: jest.Mock;
    messages: jest.Mock;
    todo: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
    prompt: jest.Mock;
    promptAsync: jest.Mock;
    abort: jest.Mock;
    get: jest.Mock;
    fork: jest.Mock;
    revert: jest.Mock;
    unrevert: jest.Mock;
  };
  config: { providers: jest.Mock; get: jest.Mock };
  provider: { list: jest.Mock };
  permission: { list: jest.Mock; reply: jest.Mock };
  question: { list: jest.Mock; reply: jest.Mock; reject: jest.Mock };
  event: { subscribe: jest.Mock };
};

beforeEach(() => {
  service = new OpenCodeService(DEFAULT_SETTINGS);
  mockSdkClient = {
    global: { health: jest.fn(), syncEvent: { subscribe: jest.fn() } },
    session: {
      create: jest.fn(),
      diff: jest.fn(),
      list: jest.fn(),
      status: jest.fn(),
      messages: jest.fn(),
      todo: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      prompt: jest.fn(),
      promptAsync: jest.fn(),
      abort: jest.fn(),
      get: jest.fn(),
      fork: jest.fn(),
      revert: jest.fn(),
      unrevert: jest.fn(),
    },
    config: { providers: jest.fn(), get: jest.fn() },
    provider: { list: jest.fn() },
    permission: { list: jest.fn(), reply: jest.fn() },
    question: { list: jest.fn(), reply: jest.fn(), reject: jest.fn() },
    event: { subscribe: jest.fn() },
  };
  mockCreateSdkClient.mockReturnValue(mockSdkClient);
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

  describe('constructor', () => {
    it('should create service with default settings', () => {
      expect(service).toBeDefined();
      expect(service.isReady()).toBe(false);
    });

    it('should create service with custom settings', () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        server: {
          ...DEFAULT_SETTINGS.server,
          local: { ...DEFAULT_SETTINGS.server.local, port: 5000 },
        },
      };
      const customService = new OpenCodeService(customSettings);
      expect(customService).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should not auto-start if disabled', async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        server: {
          ...DEFAULT_SETTINGS.server,
          local: { ...DEFAULT_SETTINGS.server.local, autoStart: false },
        },
      };
      service = new OpenCodeService(settings);

      await service.initialize();

      expect(service.isReady()).toBe(false);
    });
  });

  describe('session management', () => {
    beforeEach(() => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { id: 'test-session' },
        text: '{"id":"test-session"}',
      });
    });

    it('should create session via HTTP API', async () => {
      const sessionId = await service.createSession('Test');
      expect(sessionId).toBe('test-session');
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/session',
        method: 'POST',
      }));
    });

    it('should list sessions via HTTP API', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: [{ id: '1', title: 'Test' }],
        text: '[{"id":"1","title":"Test"}]',
      });

      const sessions = await service.listSessions();
      expect(sessions).toHaveLength(1);
    });

    it('should get session messages via HTTP API', async () => {
      mockRequestUrl
        .mockResolvedValueOnce({
          status: 200,
          json: [{ info: { id: 'm1', role: 'user' }, parts: [] }],
          text: '[{"info":{"id":"m1","role":"user"},"parts":[]}]',
        })
        .mockResolvedValueOnce({
          status: 200,
          json: {
            id: 'test-id',
            title: 'Test',
            time: { created: 1, updated: 1 },
          },
          text: '{"id":"test-id","title":"Test","time":{"created":1,"updated":1}}',
        });

      const messages = await service.getSessionMessages('test-id');
      expect(messages).toHaveLength(1);
    });

    it('applies session revert state when loading messages via HTTP API', async () => {
      mockRequestUrl
        .mockResolvedValueOnce({
          status: 200,
          json: [
            { info: { id: 'msg-1', role: 'user' }, parts: [] },
            { info: { id: 'msg-2', role: 'assistant' }, parts: [] },
            { info: { id: 'msg-3', role: 'user' }, parts: [] },
            { info: { id: 'msg-4', role: 'assistant' }, parts: [] },
          ],
          text: '[]',
        })
        .mockResolvedValueOnce({
          status: 200,
          json: {
            id: 'test-id',
            title: 'Test',
            revert: {
              messageID: 'msg-3',
            },
            time: { created: 1, updated: 1 },
          },
          text: '{"id":"test-id","title":"Test","revert":{"messageID":"msg-3"},"time":{"created":1,"updated":1}}',
        });

      const messages = await service.getSessionMessages('test-id');
      expect(messages.map((message) => message.info.id)).toEqual(['msg-1', 'msg-2']);
    });

    it('returns session revert state via HTTP API', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          id: 'test-id',
          title: 'Test',
          revert: { messageID: 'msg-1' },
          time: { created: 1, updated: 1 },
        },
        text: '{"id":"test-id","title":"Test","revert":{"messageID":"msg-1"},"time":{"created":1,"updated":1}}',
      });

      await expect(service.getSessionRevertState('test-id')).resolves.toEqual({ messageID: 'msg-1' });
    });

    it('should delete session via HTTP API', async () => {
      mockRequestUrl.mockResolvedValue({ status: 204, json: {}, text: '' });

      await service.deleteSession('test-id');
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/session/test-id',
        method: 'DELETE',
      }));
    });

    it('should update session title via HTTP API', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { id: 'test-id', title: 'Renamed' },
        text: '{"id":"test-id","title":"Renamed"}',
      });

      await service.updateSessionTitle('test-id', 'Renamed');
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/session/test-id',
        method: 'PATCH',
      }));
    });

    it('should fork session via HTTP API', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { id: 'fork-session', title: 'Fork Session' },
        text: '{"id":"fork-session","title":"Fork Session"}',
      });

      const result = await service.forkSession('test-id', 'msg-1');
      expect(result).toEqual({ id: 'fork-session', title: 'Fork Session' });
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/session/test-id/fork',
        method: 'POST',
      }));
    });

    it('should revert session via HTTP API', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: true,
        text: 'true',
      });

      const reverted = await service.revertSession('test-id', 'msg-1');
      expect(reverted).toBe(true);
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/session/test-id/revert',
        method: 'POST',
      }));
    });

    it('restores reverted session via HTTP API', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { id: 'test-id', title: 'Test', time: { created: 1, updated: 1 } },
        text: '{"id":"test-id","title":"Test","time":{"created":1,"updated":1}}',
      });

      await expect(service.unrevertSession('test-id')).resolves.toBe(true);
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/session/test-id/unrevert',
        method: 'POST',
      }));
    });

    it('treats 204 revert response as success', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 204,
        json: null,
        text: '',
      });

      const reverted = await service.revertSession('test-id', 'msg-1');
      expect(reverted).toBe(true);
    });

    it('treats session object revert response as success', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          id: 'test-id',
          title: 'New Conversation (fork #1)',
        },
        text: '{"id":"test-id","title":"New Conversation (fork #1)"}',
      });

      const reverted = await service.revertSession('test-id', 'msg-1');
      expect(reverted).toBe(true);
    });
  });

  describe('session ID management', () => {
    it('should get and set session ID', () => {
      expect(service.getSessionId()).toBeNull();

      service.setSessionId('test-session-123');
      expect(service.getSessionId()).toBe('test-session-123');
    });
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

    it('should fetch models via HTTP API', async () => {
      service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
        sdkFeatureFlags: { sdkCrud: false },
      });
      service.setVaultPath('C:\\vault');
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          providers: [{
            id: 'anthropic',
            name: 'Anthropic',
            models: {
              'claude-3': { id: 'claude-3', name: 'Claude 3' }
            }
          }],
          default: { provider: 'anthropic', model: 'claude-3' }
        },
        text: '{}',
      });

      const result = await service.getAvailableModels();
      
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/config/providers?directory=C%3A%2Fvault',
        method: 'GET',
      }));
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].id).toBe('anthropic');
      expect(result.defaults).toEqual({ anthropic: 'claude-3' });
    });

    it('should parse context window limits from provider metadata', async () => {
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

  describe('getResolvedModelConfig', () => {
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
  });

  describe('getSessionContextUsageSnapshot', () => {
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

  describe('updateSettings', () => {
    it('should update settings without restarting if server config unchanged', async () => {
      const newSettings = { ...DEFAULT_SETTINGS, userName: 'Test User' };

      await expect(service.updateSettings(newSettings)).resolves.toBeUndefined();
    });

    it('should handle server config changes', async () => {
      const newSettings = {
        ...DEFAULT_SETTINGS,
        server: {
          ...DEFAULT_SETTINGS.server,
          local: { ...DEFAULT_SETTINGS.server.local, port: 5000 },
        },
      };

      await expect(service.updateSettings(newSettings)).resolves.toBeUndefined();
    });
  });

  describe('server status', () => {
    it('should return stopped status initially', () => {
      expect(service.getServerStatus()).toBe('stopped');
    });

    it('should expose empty diagnostics initially', () => {
      expect(service.getServerDiagnostics()).toEqual({ reason: 'none' });
    });
  });

describe('OpenCodeService.openCodeMessageToChatMessage', () => {
  it('should transform assistant message with text parts', () => {
    const info = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567890 },
      parentID: 'msg-0',
      modelID: 'claude-3-5-sonnet',
      providerID: 'anthropic',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0.001,
      tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts: Part[] = [
      { type: 'text', id: 'part-1', sessionID: 'session-1', messageID: 'msg-1', text: 'Hello world' },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.id).toBe('msg-1');
    expect(message.role).toBe('assistant');
    expect(message.content).toBe('Hello world');
    expect(message.timestamp).toBe(1234567890);
    expect(message.sourceMessageId).toBe('msg-1');
  });

  it('should transform user message', () => {
    const info = {
      id: 'msg-2',
      sessionID: 'session-1',
      role: 'user' as const,
      time: { created: 1234567891 },
      agent: 'default',
      model: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet' },
    };

    const parts: Part[] = [
      { type: 'text', id: 'part-2', sessionID: 'session-1', messageID: 'msg-2', text: 'User message' },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.id).toBe('msg-2');
    expect(message.role).toBe('user');
    expect(message.content).toBe('User message');
    expect(message.sourceMessageId).toBe('msg-2');
  });

  it('strips inline read-tool hydration text from user messages and restores it as a context attachment', () => {
    const info = {
      id: 'msg-2b',
      sessionID: 'session-1',
      role: 'user' as const,
      time: { created: 1234567891 },
    };

    const parts: Part[] = [
      {
        type: 'text',
        id: 'part-2b',
        sessionID: 'session-1',
        messageID: 'msg-2b',
        text: '你能看到动画集成需求文档吗？Called the Read tool with the following input:\n{"filePath":"C:\\\\vault\\\\动画集成需求文档.md"}',
      },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts, 'C:\\vault');

    expect(message.content).toBe('你能看到动画集成需求文档吗？');
    expect(message.contextAttachments).toEqual([
      {
        kind: 'file',
        path: '动画集成需求文档.md',
        label: '动画集成需求文档.md',
        mime: 'text/markdown',
      },
    ]);
  });

  it('ignores synthetic read-tool text in hydrated user content while restoring context attachments', () => {
    const info = {
      id: 'msg-user-synthetic',
      sessionID: 'session-1',
      role: 'user' as const,
      time: { created: 1234567899 },
    };

    const parts: Part[] = [
      {
        type: 'text',
        id: 'part-user-text',
        sessionID: 'session-1',
        messageID: 'msg-user-synthetic',
        text: '能看到选中文字吗？',
      },
      {
        type: 'text',
        id: 'part-user-synth',
        sessionID: 'session-1',
        messageID: 'msg-user-synthetic',
        synthetic: true,
        text: 'Called the Read tool with the following input: {"filePath":"C:\\\\vault\\\\obsidian 联动设置.md","offset":6,"limit":1}',
      } as unknown as Part,
      {
        type: 'text',
        id: 'part-user-synth-output',
        sessionID: 'session-1',
        messageID: 'msg-user-synthetic',
        synthetic: true,
        text: '6| 这是被读取的选中文本',
      } as unknown as Part,
      {
        type: 'file',
        id: 'part-user-file',
        sessionID: 'session-1',
        messageID: 'msg-user-synthetic',
        mime: 'text/plain',
        url: 'file:///C:/vault/obsidian%20%E8%81%94%E5%8A%A8%E8%AE%BE%E7%BD%AE.md?start=6&end=6',
        source: {
          type: 'file',
          path: 'obsidian 联动设置.md',
          text: {
            value: '这是被读取的选中文本',
          },
        },
      } as unknown as Part,
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts, 'C:\\vault');

    expect(message.content).toBe('能看到选中文字吗？');
    expect(message.contextAttachments).toEqual([
      expect.objectContaining({
        kind: 'selection',
        path: 'obsidian 联动设置.md',
        lineRange: { startLine: 6, endLine: 6 },
      }),
    ]);
  });

  it('restores a selection attachment from inline read-tool metadata when no file part is present', () => {
    const info = {
      id: 'msg-user-inline-selection',
      sessionID: 'session-1',
      role: 'user' as const,
      time: { created: 1234567900 },
    };

    const parts: Part[] = [
      {
        type: 'text',
        id: 'part-user-inline-selection',
        sessionID: 'session-1',
        messageID: 'msg-user-inline-selection',
        text: '请看这里 Called the Read tool with the following input: {"filePath":"C:\\\\vault\\\\obsidian 联动设置.md","offset":6,"limit":1}',
      },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts, 'C:\\vault');

    expect(message.content).toBe('请看这里');
    expect(message.contextAttachments).toEqual([
      expect.objectContaining({
        kind: 'selection',
        path: 'obsidian 联动设置.md',
        lineRange: { startLine: 6, endLine: 6 },
      }),
    ]);
  });

  it('should extract tool calls from tool parts', () => {
    const info = {
      id: 'msg-3',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567892 },
      parentID: 'msg-2',
      modelID: 'claude-3-5-sonnet',
      providerID: 'anthropic',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0.002,
      tokens: { input: 15, output: 25, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts: Part[] = [
      { type: 'text', id: 'part-3', sessionID: 'session-1', messageID: 'msg-3', text: 'Using tool' },
      {
        type: 'tool',
        id: 'part-4',
        sessionID: 'session-1',
        messageID: 'msg-3',
        callID: 'call-1',
        tool: 'file_read',
        state: {
          status: 'pending' as const,
          input: { path: '/test/file.txt' },
          raw: '{"path": "/test/file.txt"}',
        },
      },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.toolCalls).toBeDefined();
    expect(message.toolCalls).toHaveLength(1);
    expect(message.toolCalls?.[0].id).toBe('call-1');
    expect(message.toolCalls?.[0].name).toBe('file_read');
    expect(message.toolCalls?.[0].kind).toBe('custom');
    expect(message.toolCalls?.[0].input).toEqual({ path: '/test/file.txt' });
  });

  it('classifies known OpenCode MCP tools in historical messages', () => {
    const info = {
      id: 'msg-mcp-history',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567892 },
      parentID: 'msg-2',
      modelID: 'gpt-5',
      providerID: 'openai',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0.002,
      tokens: { input: 15, output: 25, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts: Part[] = [
      {
        type: 'tool',
        id: 'part-mcp-history',
        sessionID: 'session-1',
        messageID: 'msg-mcp-history',
        callID: 'call-mcp-history',
        tool: 'exa_search',
        state: {
          status: 'completed' as const,
          input: { query: 'latest docs' },
          output: 'done',
        },
      } as unknown as Part,
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(
      info,
      parts,
      undefined,
      { knownMcpTools: ['exa_search'] },
    );

    expect(message.toolCalls).toBeUndefined();
    expect(message.contentBlocks?.[0]).toMatchObject({
      type: 'tool_use',
      toolId: 'call-mcp-history',
      toolName: 'exa_search',
      toolKind: 'mcp',
      toolResult: 'done',
    });
  });

  it('falls back to OpenCode external-tool styling when MCP catalog is unavailable', () => {
    const info = {
      id: 'msg-custom-history',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567892 },
      parentID: 'msg-2',
      modelID: 'gpt-5',
      providerID: 'openai',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0.002,
      tokens: { input: 15, output: 25, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts: Part[] = [
      {
        type: 'tool',
        id: 'part-custom-history',
        sessionID: 'session-1',
        messageID: 'msg-custom-history',
        callID: 'call-custom-history',
        tool: 'exa_search',
        state: {
          status: 'completed' as const,
          input: { query: 'latest docs' },
          output: 'done',
        },
      } as unknown as Part,
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.contentBlocks?.[0]).toMatchObject({
      type: 'tool_use',
      toolName: 'exa_search',
      toolKind: 'custom',
    });
  });

  it('should handle multiple text parts', () => {
    const info = {
      id: 'msg-4',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567893 },
      parentID: 'msg-3',
      modelID: 'claude-3-5-sonnet',
      providerID: 'anthropic',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0.001,
      tokens: { input: 5, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts: Part[] = [
      { type: 'text', id: 'part-5', sessionID: 'session-1', messageID: 'msg-4', text: 'First part. ' },
      { type: 'text', id: 'part-6', sessionID: 'session-1', messageID: 'msg-4', text: 'Second part.' },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.content).toBe('First part. Second part.');
  });

  it('should handle empty parts', () => {
    const info = {
      id: 'msg-5',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567894 },
      parentID: 'msg-4',
      modelID: 'claude-3-5-sonnet',
      providerID: 'anthropic',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts: Part[] = [];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.content).toBe('');
  });

  it('prefers SDK reasoning time windows for thinking duration', () => {
    const info = {
      id: 'msg-thinking-duration',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567895 },
      parentID: 'msg-5',
      modelID: 'claude-3-5-sonnet',
      providerID: 'anthropic',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0.001,
      tokens: { input: 5, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts = [
      {
        type: 'reasoning',
        id: 'part-thinking-duration',
        sessionID: 'session-1',
        messageID: 'msg-thinking-duration',
        text: 'Let me think...',
        time: {
          start: 1_000,
          end: 3_450,
        },
      },
    ] as unknown as Part[];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.contentBlocks?.[0]).toMatchObject({
      type: 'thinking',
      thinking: 'Let me think...',
      durationSeconds: 2.45,
    });
  });

  it('preserves assistant structured payloads alongside rendered content', () => {
    const info = {
      id: 'msg-structured',
      sessionID: 'session-1',
      role: 'assistant' as const,
      structured: { title: 'Generated title' },
      time: { created: 1234567896 },
      parentID: 'msg-structured-user',
      modelID: 'gpt-5',
      providerID: 'openai',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0,
      tokens: { input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts: Part[] = [
      {
        type: 'text',
        id: 'part-structured',
        sessionID: 'session-1',
        messageID: 'msg-structured',
        text: 'Generated title',
      },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.content).toBe('Generated title');
    expect(message.structured).toEqual({ title: 'Generated title' });
  });

  it('filters internal StructuredOutput tool parts while preserving structured payloads', () => {
    const info = {
      id: 'msg-structured-tool',
      sessionID: 'session-1',
      role: 'assistant' as const,
      structured: { title: 'Generated title' },
      time: { created: 1234567896 },
      parentID: 'msg-structured-user',
      modelID: 'gpt-5',
      providerID: 'openai',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0,
      tokens: { input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts = [
      {
        type: 'tool',
        id: 'part-structured-tool',
        sessionID: 'session-1',
        messageID: 'msg-structured-tool',
        callID: 'call-structured-tool',
        tool: 'structured_output',
        state: {
          status: 'completed' as const,
          input: {
            schema: {
              type: 'object',
            },
          },
          output: '{"title":"Generated title"}',
        },
      },
      {
        type: 'text',
        id: 'part-structured-text',
        sessionID: 'session-1',
        messageID: 'msg-structured-tool',
        text: 'Generated title',
      },
    ] as unknown as Part[];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.content).toBe('Generated title');
    expect(message.structured).toEqual({ title: 'Generated title' });
    expect(message.toolCalls).toBeUndefined();
    expect(message.contentBlocks).toEqual([
      {
        type: 'text',
        text: 'Generated title',
      },
    ]);
  });

  it('extracts OMO-injected user prompts into structured metadata', () => {
    const info = {
      id: 'msg-omo-user',
      sessionID: 'session-1',
      role: 'user' as const,
      time: { created: 1234567896 },
    };

    const parts: Part[] = [
      {
        type: 'text',
        id: 'part-omo-user',
        sessionID: 'session-1',
        messageID: 'msg-omo-user',
        text: '[search-mode]\nMAXIMIZE SEARCH EFFORT\n\n---\n使用工具搜索一下史料',
      },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.content).toBe('使用工具搜索一下史料');
    expect(message.omo).toMatchObject({
      kind: 'user-injection',
      modeTag: 'search-mode',
      injectedPrompt: 'MAXIMIZE SEARCH EFFORT',
      originalText: '使用工具搜索一下史料',
    });
  });

  it('maps OMO system reminders to notice messages', () => {
    const info = {
      id: 'msg-omo-reminder',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567897 },
      parentID: 'msg-omo-user',
      modelID: 'claude-3-5-sonnet',
      providerID: 'anthropic',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0.001,
      tokens: { input: 5, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts: Part[] = [
      {
        type: 'text',
        id: 'part-omo-reminder',
        sessionID: 'session-1',
        messageID: 'msg-omo-reminder',
        text: '<system-reminder>\n[BACKGROUND TASK COMPLETED]\n**ID:** `bg_8f454ac6`\n**Description:** 探索系统进程和文件管理\n</system-reminder>\n<!-- OMO_INTERNAL_INITIATOR -->',
      },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.displayStyle).toBe('notice');
    expect(message.noticeTone).toBe('info');
    expect(message.content).toContain('[BACKGROUND TASK COMPLETED]');
    expect(message.omo).toMatchObject({
      kind: 'system-reminder',
      reminderType: 'background-task-completed',
      isInternalInitiator: true,
      tasks: [
        {
          id: 'bg_8f454ac6',
          description: '探索系统进程和文件管理',
        },
      ],
    });
  });

  it('parses all background task completion reminders into structured task metadata', () => {
    const info = {
      id: 'msg-omo-reminder-all',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567898 },
      parentID: 'msg-omo-user',
      modelID: 'claude-3-5-sonnet',
      providerID: 'anthropic',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0.001,
      tokens: { input: 5, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts: Part[] = [
      {
        type: 'text',
        id: 'part-omo-reminder-all',
        sessionID: 'session-1',
        messageID: 'msg-omo-reminder-all',
        text: '<system-reminder>\n[ALL BACKGROUND TASKS COMPLETE]\n\n**Completed:**\n- `bg_8f454ac6`: 探索系统进程和文件管理\n- `bg_32c8a726`: 搜索文件管理最佳实践\n\nUse `background_output(task_id="<id>")` to retrieve each result.\n</system-reminder>\n<!-- OMO_INTERNAL_INITIATOR -->',
      },
    ];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.omo).toMatchObject({
      kind: 'system-reminder',
      reminderType: 'all-background-tasks-complete',
      tasks: [
        {
          id: 'bg_8f454ac6',
          description: '探索系统进程和文件管理',
        },
        {
          id: 'bg_32c8a726',
          description: '搜索文件管理最佳实践',
        },
      ],
    });
  });

  it('should mark bash tool with non-zero exit metadata as error', () => {
    const info = {
      id: 'msg-6',
      sessionID: 'session-1',
      role: 'assistant' as const,
      time: { created: 1234567895 },
      parentID: 'msg-5',
      modelID: 'claude-3-5-sonnet',
      providerID: 'anthropic',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      cost: 0.001,
      tokens: { input: 5, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
    };

    const parts = [
      {
        type: 'tool',
        id: 'part-7',
        sessionID: 'session-1',
        messageID: 'msg-6',
        callID: 'call-2',
        tool: 'bash',
        state: {
          status: 'completed' as const,
          input: { command: 'git status' },
          output: 'fatal: not a git repository (or any of the parent directories): .git',
          metadata: { exit: 128 },
        },
      },
    ] as unknown as Part[];

    const message = OpenCodeService.openCodeMessageToChatMessage(info, parts);

    expect(message.contentBlocks?.[0]).toMatchObject({
      type: 'tool_use',
      toolId: 'call-2',
      toolName: 'bash',
      toolStatus: 'error',
      toolResult: 'fatal: not a git repository (or any of the parent directories): .git',
    });
  });
});

describe('tool execution status helpers', () => {
  it('treats batch tool results with failed count metadata as errors', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'batch',
      state: {
        status: 'completed',
        output: 'Executed 3/5 tools successfully. 2 failed.',
        metadata: { failed: 2, successful: 3 },
      },
    })).toBe('error');
  });

  it('treats invalid tool calls as errors', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'invalid',
      storedStatus: 'completed',
      result: "The arguments provided to the tool are invalid: Model tried to call unavailable tool 'ls'.",
    })).toBe('error');
  });

  it('treats older completed bash results with fatal output as errors', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'bash',
      storedStatus: 'completed',
      result: 'fatal: not a git repository (or any of the parent directories): .git',
    })).toBe('error');
  });

  it('treats dismissed question tool calls as blocked', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'question',
      storedStatus: 'error',
      result: 'The user dismissed this question',
    })).toBe('blocked');
  });

  it('treats rejected permission tool calls as blocked', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'bash',
      storedStatus: 'error',
      result: 'The user rejected permission to use this specific tool call.',
    })).toBe('blocked');
  });

  it('treats permission rule denials as blocked', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'edit',
      storedStatus: 'error',
      result: 'The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules []',
    })).toBe('blocked');
  });

  it('treats rm missing-file output as a bash error', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'bash',
      storedStatus: 'completed',
      result: "rm: cannot remove '/c/Users/lt/Desktop/Write/testvault/message.txt': No such file or directory",
    })).toBe('error');
  });

  it('treats curl TLS handshake failures as bash errors', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'bash',
      storedStatus: 'completed',
      result: 'curl: (35) schannel: failed to receive handshake, SSL/TLS connection failed',
    })).toBe('error');
  });

  it('keeps successful bash results completed when exit code is zero', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'bash',
      storedStatus: 'completed',
      result: 'On branch main\nnothing to commit, working tree clean',
    })).toBe('completed');
  });
});

describe('Error handling', () => {
  it('should handle SDK BadRequestError format', async () => {
    // Test through the service methods
    const service = new OpenCodeService(DEFAULT_SETTINGS);
    expect(service.isReady()).toBe(false);
  });
});
