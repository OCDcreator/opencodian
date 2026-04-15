import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ModelConfigService } from '../../../../src/core/config/ModelConfigService';

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
    getSettingsSnapshot: jest.fn().mockReturnValue({
      server: {
        mode: 'remote',
      },
    }),
    probeProviderResponse: jest.fn().mockResolvedValue({
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      success: true,
      responsePreview: 'OK',
    }),
    ...overrides,
  };
}

describe('ModelConfigService catalog projection', () => {
  it('separates baseEffective from filtered effective catalogs', async () => {
    const configManager = {
      read: jest.fn().mockResolvedValue({
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
      }),
      write: jest.fn(),
      getConfigPath: jest.fn().mockReturnValue('/vault/.opencode/opencode.json'),
    };
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { openai: 'gpt-4o' },
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            models: [
              { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
              { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 256000 },
            ],
          },
          {
            id: 'anthropic',
            name: 'Anthropic',
            models: [
              { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
            ],
          },
        ],
      }),
      getResolvedModelConfig: jest.fn().mockResolvedValue({
        enabled_providers: ['openai', 'anthropic'],
        disabled_providers: ['anthropic'],
      }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('merge', ['openai/gpt-4.1']);

    expect(openCodeService.getAvailableModels).toHaveBeenCalledWith({ includeDirectory: true });
    expect(openCodeService.getProviderDirectory).not.toHaveBeenCalled();
    expect(openCodeService.getResolvedModelConfig).toHaveBeenCalledWith({ includeDirectory: true });
    expect(openCodeService.getResolvedModelConfig).toHaveBeenCalledWith({ includeDirectory: false });
    expect(catalogs.baseEffective.providers.map((provider) => provider.id)).toEqual(['anthropic', 'openai']);
    expect(catalogs.currentEnabledProviderIds).toEqual(['openai']);
    expect(
      catalogs.baseEffective.providers.find((provider) => provider.id === 'openai')?.models.map((model) => model.id),
    ).toEqual(['gpt-4.1', 'gpt-4o']);
    expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual(['openai']);
    expect(catalogs.effective.providers[0].models.map((model) => model.id)).toEqual(['gpt-4o']);
    expect(catalogs.effectiveProviderConfig).toEqual({
      enabled_providers: ['openai', 'anthropic'],
      disabled_providers: ['anthropic'],
    });
    expect(configManager.write).not.toHaveBeenCalled();
  });

  it('returns enabled local provider ids using whitelist and blacklist rules', async () => {
    const configManager = {
      read: jest.fn().mockResolvedValue({
        provider: {
          openai: { name: 'OpenAI', models: {} },
          anthropic: { name: 'Anthropic', models: {} },
          ollama: { name: 'Ollama', models: {} },
        },
        enabled_providers: ['openai', 'anthropic'],
        disabled_providers: ['anthropic'],
      }),
      write: jest.fn(),
      getConfigPath: jest.fn().mockReturnValue('/vault/.opencode/opencode.json'),
    };
    const openCodeService = createOpenCodeServiceMock();

    const service = new ModelConfigService(configManager as never, openCodeService as never);

    await expect(service.getLocalProviderIds()).resolves.toEqual(['openai']);
    expect(openCodeService.getAvailableModels).not.toHaveBeenCalled();
  });

  it('builds the server catalog from current runtime providers only', async () => {
    const configManager = {
      read: jest.fn().mockResolvedValue({}),
      write: jest.fn(),
      getConfigPath: jest.fn().mockReturnValue('/vault/.opencode/opencode.json'),
    };
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [
          {
            id: 'deepseek',
            name: 'DeepSeek',
            models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 128000 }],
          },
          {
            id: 'openai',
            name: 'OpenAI',
            models: [{ id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 256000 }],
          },
          {
            id: 'anthropic',
            name: 'Anthropic',
            models: [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', contextWindow: 200000 }],
          },
        ],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: { deepseek: 'deepseek-chat' },
        providers: [
          {
            id: 'deepseek',
            name: 'DeepSeek',
            models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 128000 }],
          },
          {
            id: 'openai',
            name: 'OpenAI',
            models: [{ id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 256000 }],
          },
          {
            id: 'anthropic',
            name: 'Anthropic',
            models: [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', contextWindow: 200000 }],
          },
        ],
        connected: ['deepseek', 'openai', 'anthropic'],
      }),
      getResolvedModelConfig: jest.fn().mockResolvedValue({
        disabled_providers: ['alibaba', 'alibaba-cn'],
      }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('merge');

    expect(catalogs.server.providers.map((provider) => provider.id)).toEqual([
      'anthropic',
      'deepseek',
      'openai',
    ]);
    expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual([
      'anthropic',
      'deepseek',
      'openai',
    ]);
  });
});

describe('ModelConfigService inheritance overrides', () => {
  it('lets project config extend a server whitelist by replacing enabled_providers locally', async () => {
    const configManager = {
      read: jest.fn().mockResolvedValue({
        provider: {
          openai: {
            name: 'OpenAI',
            models: {
              'gpt-4.1': { name: 'GPT-4.1' },
            },
          },
        },
        enabled_providers: ['deepseek', 'openai'],
      }),
      write: jest.fn(),
      getConfigPath: jest.fn().mockReturnValue('/vault/.opencode/opencode.json'),
    };
    const openCodeService = createOpenCodeServiceMock({
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: {},
        providers: [
          {
            id: 'deepseek',
            name: 'DeepSeek',
            models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 128000 }],
          },
        ],
      }),
      getProviderDirectory: jest.fn().mockResolvedValue({
        defaults: {},
        providers: [
          {
            id: 'deepseek',
            name: 'DeepSeek',
            models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 128000 }],
          },
        ],
        connected: ['deepseek'],
      }),
      getResolvedModelConfig: jest.fn()
        .mockResolvedValueOnce({
          enabled_providers: ['deepseek', 'openai'],
        })
        .mockResolvedValueOnce({
          enabled_providers: ['deepseek'],
        }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('merge');

    expect(catalogs.effectiveProviderConfig).toEqual({
      enabled_providers: ['deepseek', 'openai'],
      disabled_providers: undefined,
    });
    expect(catalogs.currentEnabledProviderIds).toEqual(['deepseek', 'openai']);
    expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual(['deepseek', 'openai']);
    expect(catalogs.server.providers.map((provider) => provider.id)).toEqual(['deepseek']);
  });

  it('allows the current scoped runtime to keep inherited-disabled providers enabled when the project clears them', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-global-disable-'));
    const xdgConfigHome = path.join(tempRoot, 'xdg');
    const managedConfigDir = path.join(tempRoot, 'managed');
    fs.mkdirSync(path.join(xdgConfigHome, 'opencode'), { recursive: true });
    fs.writeFileSync(
      path.join(xdgConfigHome, 'opencode', 'opencode.json'),
      JSON.stringify({
        disabled_providers: ['alibaba'],
      }, null, 2),
      'utf-8',
    );

    const configManager = {
      read: jest.fn().mockResolvedValue({
        disabled_providers: [],
      }),
      write: jest.fn(),
      getConfigPath: jest.fn().mockReturnValue('/vault/.opencode/opencode.json'),
    };
    const openCodeService = createOpenCodeServiceMock({
      getSettingsSnapshot: jest.fn().mockReturnValue({
        server: {
          mode: 'local',
        },
      }),
      getAvailableModels: jest.fn().mockResolvedValue({
        defaults: { alibaba: 'qwen-max', deepseek: 'deepseek-chat' },
        providers: [
          {
            id: 'alibaba',
            name: 'Alibaba',
            models: [{ id: 'qwen-max', name: 'Qwen Max', contextWindow: 128000 }],
          },
          {
            id: 'deepseek',
            name: 'DeepSeek',
            models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 128000 }],
          },
        ],
      }),
      getResolvedModelConfig: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
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

      expect(catalogs.server.providers.map((provider) => provider.id)).toEqual(['alibaba', 'deepseek']);
      expect(catalogs.currentEnabledProviderIds).toEqual(['alibaba', 'deepseek']);
      expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual(['alibaba', 'deepseek']);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps server-disabled providers out of the current disabled list only after a project override re-enables them', async () => {
    const configManager = {
      read: jest.fn().mockResolvedValue({
        disabled_providers: ['alibaba-cn'],
      }),
      write: jest.fn(),
      getConfigPath: jest.fn().mockReturnValue('/vault/.opencode/opencode.json'),
    };
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
      getResolvedModelConfig: jest.fn().mockResolvedValue({
        provider: {
          alibaba: {
            name: 'Alibaba',
            models: {
              'qwen-max': { name: 'Qwen Max' },
            },
          },
          'alibaba-cn': {
            name: 'Alibaba CN',
            models: {
              'qwen-plus': { name: 'Qwen Plus' },
            },
          },
        },
        disabled_providers: ['alibaba', 'alibaba-cn'],
      }),
    });

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('merge');

    expect(catalogs.server.providers).toEqual([]);
    expect(catalogs.currentEnabledProviderIds).toEqual([]);
    expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual([]);
  });
});
