import { DEFAULT_SETTINGS } from '../../../../../src/core/types';
import { TitleGenerationService } from '../../../../../src/features/chat/services/TitleGenerationService';

describe('Task 14 TitleGenerationService plugin-port characterization', () => {
  it('uses the official title before fallback and never creates a temporary OpenCode session', async () => {
    const events: string[] = [];
    const openCodeService = {
      createSession: jest.fn(() => { events.push('create'); }),
      requestAssistantResponse: jest.fn(() => { events.push('request'); }),
      deleteSession: jest.fn(() => { events.push('delete'); }),
    };
    const plugin = {
      settings: { ...DEFAULT_SETTINGS, locale: 'en', aiTitleModel: '' },
      getConversationById: jest.fn(async () => {
        events.push('conversation');
        return { backend: 'opencode' };
      }),
      agentServiceRegistry: {
        get: jest.fn(() => ({
          capabilities: new Set(['chat', 'sessions']),
          hasCapability(capability: string) {
            return this.capabilities.has(capability);
          },
          getSession: jest.fn(async () => {
            events.push('official');
            return { id: 'real-session', title: 'Official lifecycle title' };
          }),
        })),
      },
      openCodeService,
      generateDefaultTitle: jest.fn(() => { events.push('default'); return 'unused'; }),
    };
    const callback = jest.fn(async () => { events.push('callback'); });

    await new TitleGenerationService(plugin as never).generateTitle(
      'conversation-1',
      'A user message',
      { provider: 'openai', model: 'gpt-5' },
      callback,
      { sessionId: 'real-session', officialPollAttempts: 1, officialPollIntervalMs: 0 },
    );

    expect(events).toEqual(['conversation', 'official', 'callback']);
    expect(callback).toHaveBeenCalledWith('conversation-1', {
      success: true,
      title: 'Official lifecycle title',
    });
    expect(openCodeService.createSession).not.toHaveBeenCalled();
    expect(openCodeService.requestAssistantResponse).not.toHaveBeenCalled();
    expect(openCodeService.deleteSession).not.toHaveBeenCalled();
  });

  it('uses the non-OpenCode default-title callback path without touching OpenCode', async () => {
    const events: string[] = [];
    const openCodeService = {
      createSession: jest.fn(() => { events.push('create'); }),
      requestAssistantResponse: jest.fn(() => { events.push('request'); }),
      deleteSession: jest.fn(() => { events.push('delete'); }),
    };
    const plugin = {
      settings: { ...DEFAULT_SETTINGS, locale: 'en', aiTitleModel: '' },
      getConversationById: jest.fn(async () => {
        events.push('conversation');
        return { backend: 'claude-code', messages: [] };
      }),
      agentServiceRegistry: { get: jest.fn(() => undefined) },
      openCodeService,
      generateDefaultTitle: jest.fn((message: string) => {
        events.push('default');
        return `Default: ${message}`;
      }),
    };
    const callback = jest.fn(async () => { events.push('callback'); });

    await new TitleGenerationService(plugin as never).generateTitle(
      'conversation-2',
      'A Claude message',
      { provider: 'anthropic', model: 'claude-sonnet' },
      callback,
      { officialPollAttempts: 1, officialPollIntervalMs: 0 },
    );

    expect(events).toEqual(['conversation', 'conversation', 'default', 'callback']);
    expect(callback).toHaveBeenCalledWith('conversation-2', {
      success: true,
      title: 'Default: A Claude message',
    });
    expect(openCodeService.createSession).not.toHaveBeenCalled();
    expect(openCodeService.requestAssistantResponse).not.toHaveBeenCalled();
    expect(openCodeService.deleteSession).not.toHaveBeenCalled();
  });

  it('creates, requests, reports, then deletes a temporary OpenCode title session', async () => {
    const events: string[] = [];
    const openCodeService = {
      createSession: jest.fn(async () => {
        events.push('create');
        return 'temporary-title-session';
      }),
      requestAssistantResponse: jest.fn(async () => {
        events.push('request');
        return { content: 'Title: Temporary session title', structured: null };
      }),
      deleteSession: jest.fn(async () => { events.push('delete'); }),
    };
    const plugin = {
      settings: { ...DEFAULT_SETTINGS, locale: 'en', aiTitleModel: '' },
      getConversationById: jest.fn(async () => {
        events.push('conversation');
        return null;
      }),
      agentServiceRegistry: { get: jest.fn(() => undefined) },
      openCodeService,
      generateDefaultTitle: jest.fn(),
    };
    const callback = jest.fn(async () => { events.push('callback'); });

    await new TitleGenerationService(plugin as never).generateTitle(
      'conversation-3',
      'A local OpenCode title',
      { provider: 'openai', model: 'gpt-5' },
      callback,
      { officialPollAttempts: 1, officialPollIntervalMs: 0 },
    );

    expect(events.slice(-4)).toEqual(['create', 'request', 'callback', 'delete']);
    expect(openCodeService.createSession).toHaveBeenCalledWith('Title Generation', { setCurrent: false });
    expect(openCodeService.deleteSession).toHaveBeenCalledWith('temporary-title-session');
    expect(callback).toHaveBeenCalledWith('conversation-3', {
      success: true,
      title: 'Temporary session title',
    });
  });
});
