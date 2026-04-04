import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { TitleGenerationService } from '../../../../src/features/chat/services/TitleGenerationService';
import type OpenCodianPlugin from '../../../../src/main';

describe('TitleGenerationService', () => {
  const createHarness = () => {
    const openCodeService = {
      createSession: jest.fn().mockResolvedValue('temp-session'),
      requestAssistantResponse: jest.fn(),
      deleteSession: jest.fn().mockResolvedValue(undefined),
    };
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        locale: 'en',
        aiTitleModel: '',
      },
      openCodeService,
    };
    const service = new TitleGenerationService(plugin as unknown as OpenCodianPlugin);
    const callback = jest.fn().mockResolvedValue(undefined);

    return { service, callback, openCodeService };
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
});
