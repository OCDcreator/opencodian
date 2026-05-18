import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ModelConfigService } from '../../../../src/core/config/ModelConfigService';
import { clearRecentLogs, getRecentLogEntries } from '../../../../src/shared';

const CONFIG_PATH = '/vault/.opencode/opencode.json';

function createConfigManager(readResult = {}) {
  return {
    read: jest.fn().mockResolvedValue(readResult),
    write: jest.fn(),
    getConfigPath: jest.fn().mockReturnValue(CONFIG_PATH),
  };
}

function provider(id: string, name: string, modelId: string, modelName = name) {
  return { id, name, models: [{ id: modelId, name: modelName }] };
}

function createOpenCodeServiceMock(overrides: Partial<{
  getAvailableModels: jest.Mock;
  getProviderDirectory: jest.Mock;
  getResolvedModelConfig: jest.Mock;
  getSettingsSnapshot: jest.Mock;
  probeProviderResponse: jest.Mock;
}> = {}) {
  return {
    getAvailableModels: jest.fn().mockResolvedValue({
      defaults: {},
      providers: [],
    }),
    getProviderDirectory: jest.fn().mockResolvedValue({
      defaults: {},
      providers: [],
      connected: [],
    }),
    getResolvedModelConfig: jest.fn().mockResolvedValue({}),
    getSettingsSnapshot: jest.fn().mockReturnValue({ server: { mode: 'remote' } }),
    probeProviderResponse: jest.fn().mockResolvedValue({
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      success: true,
      responsePreview: 'OK',
    }),
    ...overrides,
  };
}

describe('ModelConfigService runtime scope catalogs', () => {
  beforeEach(() => {
    clearRecentLogs();
  });

  it('captures provider.list-only entries in providerDirectory without widening the server catalog', async () => {
    const configManager = createConfigManager();
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat')],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: {
          deepseek: 'deepseek-chat',
          openrouter: 'gpt-5',
        },
        providers: [
          provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat'),
          provider('openrouter', 'OpenRouter', 'gpt-5', 'GPT-5'),
        ],
        connected: ['deepseek', 'openrouter'],
      }),
      getResolvedModelConfig: jest.fn().mockResolvedValue({}),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('server');

    expect(openCodeService.getProviderDirectory).toHaveBeenCalledTimes(1);
    expect(openCodeService.getProviderDirectory).toHaveBeenCalledWith({ includeDirectory: true });
    expect(catalogs.providerDirectory.catalog.providers.map((provider) => provider.id)).toEqual(['deepseek', 'openrouter']);
    expect(catalogs.providerDirectory.connectedProviderIds).toEqual(['deepseek', 'openrouter']);
    expect(catalogs.providerDirectory.defaults).toEqual({
      deepseek: 'deepseek-chat',
      openrouter: 'gpt-5',
    });
    expect(catalogs.server.providers.map((provider) => provider.id)).toEqual(['deepseek']);
  });

  it('keeps the server catalog when provider directory loading fails', async () => {
    const configManager = createConfigManager();
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat')],
      }),
      getProviderDirectory: jest.fn().mockRejectedValue(new Error('provider.list unavailable')),
      getResolvedModelConfig: jest.fn().mockResolvedValue({}),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const catalogs = await service.getCatalogs('server');

      expect(openCodeService.getProviderDirectory).toHaveBeenCalledTimes(1);
      expect(openCodeService.getProviderDirectory).toHaveBeenCalledWith({ includeDirectory: true });
      expect(catalogs.server.providers.map((provider) => provider.id)).toEqual(['deepseek']);
      expect(catalogs.baseEffective.providers.map((provider) => provider.id)).toEqual(['deepseek']);
      expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual(['deepseek']);
      expect(catalogs.providerDirectory).toEqual({
        catalog: {
          providers: [],
          defaults: {},
        },
        connectedProviderIds: [],
        defaults: {},
      });
      expect(getRecentLogEntries()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'warn',
            scope: 'ModelConfigService',
            message: expect.stringContaining('Failed to load OpenCode provider directory'),
          }),
        ]),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('ignores provider.list entries that are outside config.providers runtime results', async () => {
    const configManager = createConfigManager({
      provider: {
        deepseek: { name: 'DeepSeek', models: { 'deepseek-chat': { name: 'DeepSeek Chat' } } },
        openai: { name: 'OpenAI', models: { 'gpt-4.1': { name: 'GPT-4.1' } } },
        anthropic: { name: 'Anthropic', models: { 'claude-sonnet': { name: 'Claude Sonnet' } } },
        groq: { name: 'Groq', models: { llama: { name: 'Llama' } } },
        gemini: { name: 'Gemini', models: { 'gemini-pro': { name: 'Gemini Pro' } } },
        xai: { name: 'xAI', models: { grok: { name: 'Grok' } } },
        ollama: { name: 'Ollama', models: { 'qwen2.5': { name: 'Qwen 2.5' } } },
      },
    });
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat')],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [
          provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat'),
          provider('openrouter', 'OpenRouter', 'gpt-5', 'GPT-5'),
          provider('anthropic', 'Anthropic', 'claude-sonnet', 'Claude Sonnet'),
        ],
        connected: ['deepseek'],
      }),
      getResolvedModelConfig: jest.fn().mockResolvedValue({
        disabled_providers: ['alibaba', 'alibaba-cn'],
      }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('merge');

    expect(openCodeService.getProviderDirectory).toHaveBeenCalledTimes(1);
    expect(openCodeService.getProviderDirectory).toHaveBeenCalledWith({ includeDirectory: true });
    expect(catalogs.server.providers.map((provider) => provider.id)).toEqual(['deepseek']);
    expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual([
      'anthropic',
      'deepseek',
      'gemini',
      'groq',
      'ollama',
      'openai',
      'xai',
    ]);
  });

  it('prefers the current scoped runtime when it still exposes a provider', async () => {
    const configManager = createConfigManager();
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [
          provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat'),
          provider('codexzh', 'CodexZH', 'gpt-5.4', 'GPT-5.4'),
        ],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat', codexzh: 'gpt-5.4' },
        providers: [
          provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat'),
          provider('codexzh', 'CodexZH', 'gpt-5.4', 'GPT-5.4'),
        ],
        connected: ['deepseek', 'codexzh'],
      }),
      getResolvedModelConfig: jest.fn()
        .mockResolvedValueOnce({
          disabled_providers: ['zhipuai'],
        })
        .mockResolvedValueOnce({
          disabled_providers: ['alibaba', 'alibaba-cn', 'codexzh'],
        }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('merge');

    expect(openCodeService.getAvailableModels).toHaveBeenCalledWith({ includeDirectory: true });
    expect(openCodeService.getProviderDirectory).toHaveBeenCalledTimes(1);
    expect(openCodeService.getProviderDirectory).toHaveBeenCalledWith({ includeDirectory: true });
    expect(openCodeService.getResolvedModelConfig).toHaveBeenNthCalledWith(1, { includeDirectory: true });
    expect(openCodeService.getResolvedModelConfig).toHaveBeenNthCalledWith(2, { includeDirectory: false });
    expect(catalogs.server.providers.map((provider) => provider.id)).toEqual(['codexzh', 'deepseek']);
    expect(catalogs.currentEnabledProviderIds).toEqual(['codexzh', 'deepseek']);
    expect(catalogs.baseEffective.providers.map((provider) => provider.id)).toEqual(['codexzh', 'deepseek']);
    expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual(['codexzh', 'deepseek']);
  });
});

describe('ModelConfigService default scope and directory config', () => {
  it('local mode prefers disk inherited config over the server default-scope /config result', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-model-config-'));
    const xdgConfigHome = path.join(tempRoot, 'xdg');
    const managedConfigDir = path.join(tempRoot, 'managed');
    fs.mkdirSync(path.join(xdgConfigHome, 'opencode'), { recursive: true });
    fs.writeFileSync(
      path.join(xdgConfigHome, 'opencode', 'opencode.json'),
      JSON.stringify({
        disabled_providers: ['alibaba', 'alibaba-cn'],
      }, null, 2),
      'utf-8',
    );

    const configManager = createConfigManager();
    const openCodeService = createOpenCodeServiceMock({
      getSettingsSnapshot: jest.fn().mockReturnValue({ server: { mode: 'local' } }),
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat')],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat')],
        connected: ['deepseek'],
      }),
      getResolvedModelConfig: jest.fn()
        .mockResolvedValueOnce({
          disabled_providers: ['zhipuai'],
        })
        .mockResolvedValueOnce({
          disabled_providers: ['alibaba', 'alibaba-cn', 'ccodezh', 'codexzh', 'kimi-for-coding', 'opencode'],
        }),
    });

    try {
      const service = new ModelConfigService(
        configManager as never,
        openCodeService as never,
        {
          xdgConfigHome,
          homeDir: tempRoot,
          managedConfigDir,
        },
      );
      const catalogs = await service.getCatalogs('merge');

      expect(catalogs.server.providers.map((provider) => provider.id)).toEqual(['deepseek']);
      expect(catalogs.server.providers.map((provider) => provider.id)).not.toContain('ccodezh');
      expect(catalogs.server.providers.map((provider) => provider.id)).not.toContain('codexzh');
      expect(catalogs.server.providers.map((provider) => provider.id)).not.toContain('kimi-for-coding');
      expect(catalogs.server.providers.map((provider) => provider.id)).not.toContain('opencode');
      expect(catalogs.serverConfig.disabled_providers).toEqual(['alibaba', 'alibaba-cn', 'zhipuai']);
      expect(catalogs.currentEnabledProviderIds).toEqual(['deepseek']);
      expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual(['deepseek']);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses directory-scoped resolved config for effective provider availability', async () => {
    const configManager = createConfigManager({ disabled_providers: ['zhipuai'] });
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { opencode: 'big-pickle' },
        providers: [
          provider('opencode', 'OpenCode Zen', 'big-pickle', 'Big Pickle'),
          provider('kimi-for-coding', 'Kimi For Coding', 'kimi-k2-thinking', 'Kimi K2 Thinking'),
        ],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: { opencode: 'big-pickle', 'kimi-for-coding': 'kimi-k2-thinking' },
        providers: [
          provider('opencode', 'OpenCode Zen', 'big-pickle', 'Big Pickle'),
          provider('kimi-for-coding', 'Kimi For Coding', 'kimi-k2-thinking', 'Kimi K2 Thinking'),
        ],
        connected: ['opencode', 'kimi-for-coding'],
      }),
      getResolvedModelConfig: jest.fn()
        .mockResolvedValueOnce({
          disabled_providers: ['zhipuai'],
        })
        .mockResolvedValueOnce({
          disabled_providers: ['opencode', 'kimi-for-coding', 'zhipuai'],
        }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('merge');

    expect(catalogs.effectiveProviderConfig).toEqual({
      disabled_providers: ['zhipuai'],
      enabled_providers: undefined,
    });
    expect(catalogs.currentEnabledProviderIds).toEqual(['kimi-for-coding', 'opencode']);
    expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual(['kimi-for-coding', 'opencode']);
  });

  it('does not widen the server catalog with provider.list when config.providers is incomplete', async () => {
    const configManager = createConfigManager();
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat')],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: {
          deepseek: 'deepseek-chat',
          opencode: 'big-pickle',
          'kimi-for-coding': 'kimi-k2-thinking',
        },
        providers: [
          provider('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat'),
          provider('opencode', 'OpenCode Zen', 'big-pickle', 'Big Pickle'),
          provider('kimi-for-coding', 'Kimi For Coding', 'kimi-k2-thinking', 'Kimi K2 Thinking'),
          provider('openrouter', 'OpenRouter', 'gpt-5', 'GPT-5'),
        ],
        connected: ['deepseek', 'opencode', 'kimi-for-coding'],
      }),
      getResolvedModelConfig: jest.fn().mockResolvedValue({
        provider: {
          ccodezh: {
            name: 'Claude Code ZH',
            models: {
              'claude-sonnet-4-6': { name: 'Claude Sonnet 4.6' },
            },
          },
        },
        disabled_providers: ['alibaba', 'alibaba-cn'],
      }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('merge');

    expect(openCodeService.getProviderDirectory).toHaveBeenCalledTimes(1);
    expect(openCodeService.getProviderDirectory).toHaveBeenCalledWith({ includeDirectory: true });
    expect(catalogs.server.providers.map((provider) => provider.id)).toEqual(['deepseek']);
    expect(catalogs.server.providers.map((provider) => provider.id)).not.toContain('ccodezh');
    expect(catalogs.server.providers.map((provider) => provider.id)).not.toContain('openrouter');
    expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual(['deepseek']);
  });
});

describe('ModelConfigService provider availability probes', () => {
  it('reports project-disabled providers ahead of server-disabled in availability probes', async () => {
    const configManager = createConfigManager({ disabled_providers: ['alibaba'] });
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: {},
        providers: [],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: {},
        providers: [],
        connected: [],
      }),
      getResolvedModelConfig: jest.fn()
        .mockResolvedValueOnce({
          disabled_providers: ['alibaba'],
        })
        .mockResolvedValueOnce({
          disabled_providers: ['alibaba'],
        }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    await expect(service.testProviderAvailability('alibaba')).resolves.toMatchObject({
      providerId: 'alibaba',
      status: 'project_disabled',
      projectDisabled: true,
      serverDisabled: false,
      effectiveEnabled: false,
      sendTestAttempted: false,
    });
  });

  it('allows a project override to probe a provider when the current scoped runtime still exposes it', async () => {
    const configManager = createConfigManager({
      enabled_providers: ['alibaba'],
      disabled_providers: [],
    });
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { alibaba: 'qwen-max' },
        providers: [provider('alibaba', 'Alibaba', 'qwen-max', 'Qwen Max')],
      }),
      getResolvedModelConfig: jest.fn()
        .mockResolvedValueOnce({
          enabled_providers: ['alibaba'],
          disabled_providers: [],
        })
        .mockResolvedValueOnce({
          provider: {
            alibaba: {
              name: 'Alibaba',
              models: {
                'qwen-max': { name: 'Qwen Max' },
              },
            },
          },
          disabled_providers: ['alibaba'],
        }),
      probeProviderResponse: jest.fn().mockResolvedValue({
        providerId: 'alibaba',
        modelId: 'qwen-max',
        success: false,
        error: 'Incorrect API key provided. (HTTP 401)',
      }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    await expect(service.testProviderAvailability('alibaba')).resolves.toMatchObject({
      providerId: 'alibaba',
      status: 'send_failed',
      serverDisabled: false,
      effectiveEnabled: true,
      overridesServerDisabled: false,
      testedModelId: 'qwen-max',
      sendTestAttempted: true,
      sendTestSucceeded: false,
      catalogModelCount: 1,
      runtimeModelCount: 1,
    });
    expect(openCodeService.probeProviderResponse).toHaveBeenCalledWith('alibaba', 'qwen-max');
  });

  it('reports missing when no provider entry remains for a real send probe', async () => {
    const configManager = createConfigManager({
      enabled_providers: ['alibaba'],
      disabled_providers: [],
    });
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: {},
        providers: [],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: {},
        providers: [],
        connected: [],
      }),
      getResolvedModelConfig: jest.fn()
        .mockResolvedValueOnce({
          enabled_providers: ['alibaba'],
        })
        .mockResolvedValueOnce({
          provider: {
            alibaba: {
              name: 'Alibaba',
              models: {},
            },
          },
          enabled_providers: ['alibaba'],
        }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    await expect(service.testProviderAvailability('alibaba')).resolves.toMatchObject({
      providerId: 'alibaba',
      status: 'missing',
      effectiveEnabled: true,
      testedModelId: undefined,
      sendTestAttempted: false,
      catalogModelCount: 0,
    });
    expect(openCodeService.probeProviderResponse).not.toHaveBeenCalled();
  });
});
