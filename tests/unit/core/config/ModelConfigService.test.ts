import { ModelConfigService } from '../../../../src/core/config/ModelConfigService';

describe('ModelConfigService', () => {
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
    const openCodeService = {
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
    };

    const service = new ModelConfigService(configManager as never, openCodeService as never);
    const catalogs = await service.getCatalogs('merge', ['openai/gpt-4.1']);

    expect(openCodeService.getAvailableModels).toHaveBeenCalledWith({ includeDirectory: false });
    expect(catalogs.baseEffective.providers.map((provider) => provider.id)).toEqual(['anthropic', 'openai']);
    expect(
      catalogs.baseEffective.providers.find((provider) => provider.id === 'openai')?.models.map((model) => model.id),
    ).toEqual(['gpt-4.1', 'gpt-4o']);
    expect(catalogs.effective.providers.map((provider) => provider.id)).toEqual(['openai']);
    expect(catalogs.effective.providers[0].models.map((model) => model.id)).toEqual(['gpt-4o']);
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
    const openCodeService = {
      getAvailableModels: jest.fn().mockResolvedValue({ defaults: {}, providers: [] }),
    };

    const service = new ModelConfigService(configManager as never, openCodeService as never);

    await expect(service.getLocalProviderIds()).resolves.toEqual(['openai']);
    expect(openCodeService.getAvailableModels).not.toHaveBeenCalled();
  });
});
