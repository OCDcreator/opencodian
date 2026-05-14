/* eslint-disable max-lines-per-function -- Title generation tests keep the official-title and local-fallback harness inline for readable flow coverage. */
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { TitleGenerationService } from '../../../../src/features/chat/services/TitleGenerationService';
import type OpenCodianPlugin from '../../../../src/main';

describe('TitleGenerationService', () => {
  const createHarness = () => {
    const openCodeService = {
      listSessions: jest.fn().mockResolvedValue([]),
      createSession: jest.fn().mockResolvedValue('temp-session'),
      requestAssistantResponse: jest.fn(),
      deleteSession: jest.fn().mockResolvedValue(undefined),
    };
    const modelConfigService = {
      getCatalogs: jest.fn(),
    };
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        locale: 'en',
        aiTitleModel: '',
      },
      openCodeService,
      modelConfigService,
      getConversationById: jest.fn().mockResolvedValue(null),
    };
    const service = new TitleGenerationService(plugin as unknown as OpenCodianPlugin);
    const callback = jest.fn().mockResolvedValue(undefined);

    return { service, callback, openCodeService, modelConfigService, plugin };
  };

  it('prefers structured title output and still normalizes punctuation and length', async () => {
    const { service, callback, openCodeService } = createHarness();
    openCodeService.requestAssistantResponse.mockResolvedValue({
      content: 'Ignored fallback',
      structured: {
        title: 'Title: Build a robust OpenCodian title generation workflow for very long prompts!!!',
      },
    });

    await service.generateTitle(
      'conversation-1',
      'Help me improve title generation',
      { provider: 'openai', model: 'gpt-5' },
      callback,
    );

    expect(openCodeService.requestAssistantResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        format: {
          type: 'json_schema',
          schema: expect.objectContaining({
            type: 'object',
            required: ['title'],
          }),
        },
      }),
    );
    expect(callback).toHaveBeenCalledWith('conversation-1', {
      success: true,
      title: 'Build a robust OpenCodian title generation work...',
    });
  });

  it('uses the official OpenCode title when it has been generated for the real session', async () => {
    const { service, callback, openCodeService } = createHarness();
    openCodeService.listSessions.mockResolvedValue([
      {
        id: 'real-session',
        title: 'Official SDK title',
        time: { created: 1, updated: 2 },
      },
    ]);

    await service.generateTitle(
      'conversation-official',
      'Help me improve title generation',
      { provider: 'openai', model: 'gpt-5' },
      callback,
      { sessionId: 'real-session', officialPollAttempts: 1, officialPollIntervalMs: 0 },
    );

    expect(openCodeService.listSessions).toHaveBeenCalled();
    expect(openCodeService.requestAssistantResponse).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith('conversation-official', {
      success: true,
      title: 'Official SDK title',
    });
  });

  it('falls back to local title generation when the official title remains the OpenCode default', async () => {
    const { service, callback, openCodeService } = createHarness();
    openCodeService.listSessions.mockResolvedValue([
      {
        id: 'real-session',
        title: 'New session - 2026-05-14T10:00:00.000Z',
        time: { created: 1, updated: 2 },
      },
    ]);
    openCodeService.requestAssistantResponse.mockResolvedValue({
      content: 'Title: Local fallback title',
      structured: null,
    });

    await service.generateTitle(
      'conversation-local-fallback',
      'Help me improve fallback handling',
      { provider: 'openai', model: 'gpt-5' },
      callback,
      { sessionId: 'real-session', officialPollAttempts: 1, officialPollIntervalMs: 0 },
    );

    expect(openCodeService.listSessions).toHaveBeenCalled();
    expect(openCodeService.requestAssistantResponse).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith('conversation-local-fallback', {
      success: true,
      title: 'Local fallback title',
    });
  });

  it('resolves the real session id from the conversation when no explicit session id is supplied', async () => {
    const { service, callback, openCodeService, plugin } = createHarness();
    plugin.getConversationById.mockResolvedValue({
      id: 'conversation-from-cache',
      title: 'Local provisional',
      createdAt: 1,
      updatedAt: 2,
      openCodeSessionId: 'real-session-from-conversation',
      messages: [],
    });
    openCodeService.listSessions.mockResolvedValue([
      {
        id: 'real-session-from-conversation',
        title: 'Official title from conversation session',
        time: { created: 1, updated: 2 },
      },
    ]);

    await service.generateTitle(
      'conversation-from-cache',
      'Help me improve title generation',
      { provider: 'openai', model: 'gpt-5' },
      callback,
      { officialPollAttempts: 1, officialPollIntervalMs: 0 },
    );

    expect(plugin.getConversationById).toHaveBeenCalledWith('conversation-from-cache', {
      preferCache: true,
    });
    expect(openCodeService.listSessions).toHaveBeenCalled();
    expect(openCodeService.requestAssistantResponse).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith('conversation-from-cache', {
      success: true,
      title: 'Official title from conversation session',
    });
  });

  it('falls back to parsing plain text when structured output is missing or invalid', async () => {
    const { service, callback, openCodeService } = createHarness();
    openCodeService.requestAssistantResponse.mockResolvedValue({
      content: 'Title: Reliable fallback title.',
      structured: {
        title: 123,
      },
    });

    await service.generateTitle(
      'conversation-2',
      'Help me improve fallback handling',
      { provider: 'openai', model: 'gpt-5' },
      callback,
    );

    expect(callback).toHaveBeenCalledWith('conversation-2', {
      success: true,
      title: 'Reliable fallback title',
    });
  });

  it('reports a failure when neither structured nor text output yields a usable title', async () => {
    const { service, callback, openCodeService } = createHarness();
    openCodeService.requestAssistantResponse.mockResolvedValue({
      content: '   ',
      structured: {
        title: '""',
      },
    });

    await service.generateTitle(
      'conversation-3',
      'Help me improve invalid title handling',
      { provider: 'openai', model: 'gpt-5' },
      callback,
    );

    expect(callback).toHaveBeenCalledWith('conversation-3', {
      success: false,
      error: 'Failed to parse title from response',
    });
    expect(openCodeService.deleteSession).toHaveBeenCalledWith('temp-session');
  });

  it('fails title generation when the explicit title model is disabled or unavailable', async () => {
    const { service, callback, openCodeService, modelConfigService, plugin } = createHarness();
    plugin.settings.aiTitleModel = 'openai/gpt-4.1';
    modelConfigService.getCatalogs.mockResolvedValue({
      local: { providers: [], defaults: {} },
      server: { providers: [], defaults: {} },
      baseEffective: {
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            source: 'server',
            existsInLocal: false,
            existsInServer: true,
            models: [
              {
                id: 'gpt-4.1',
                name: 'GPT-4.1',
                source: 'server',
                existsInLocal: false,
                existsInServer: true,
              },
            ],
          },
        ],
        defaults: {},
      },
      effective: {
        providers: [],
        defaults: {},
      },
    });
    openCodeService.requestAssistantResponse.mockResolvedValue({
      content: 'Title: Use the current conversation model',
      structured: null,
    });

    await service.generateTitle(
      'conversation-4',
      'Help me improve fallback handling',
      { provider: 'anthropic', model: 'claude-3-5-sonnet' },
      callback,
    );

    expect(openCodeService.requestAssistantResponse).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith('conversation-4', {
      success: false,
      error: 'Configured AI title model is unavailable',
    });
  });

  it('falls back to the current conversation model when availability cannot be resolved', async () => {
    const { service, callback, openCodeService, modelConfigService, plugin } = createHarness();
    plugin.settings.aiTitleModel = 'openai/gpt-4.1';
    modelConfigService.getCatalogs.mockRejectedValue(new Error('catalog unavailable'));
    openCodeService.requestAssistantResponse.mockResolvedValue({
      content: 'Title: Use the current conversation model',
      structured: null,
    });

    await service.generateTitle(
      'conversation-5',
      'Help me improve fallback handling',
      { provider: 'anthropic', model: 'claude-3-5-sonnet' },
      callback,
    );

    expect(openCodeService.requestAssistantResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
      }),
    );
  });
});
