/**
 * OpenCodeService unit tests
 */

import { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

// Mock the SDK
jest.mock('@opencode-ai/sdk', () => ({
  createOpencode: jest.fn(),
  createOpencodeClient: jest.fn().mockReturnValue({
    session: {
      create: jest.fn().mockResolvedValue({ data: { id: 'test-session' }, error: null }),
      list: jest.fn().mockResolvedValue({ data: [], error: null }),
      messages: jest.fn().mockResolvedValue({ data: [], error: null }),
      delete: jest.fn().mockResolvedValue({ error: null }),
      prompt: jest.fn().mockResolvedValue({ error: null }),
    },
    config: {
      providers: jest.fn().mockResolvedValue({
        data: {
          providers: [{ id: 'anthropic', name: 'Anthropic', models: [] }],
          default: { anthropic: 'claude-3-5-sonnet' },
        },
        error: null,
      }),
    },
    event: {
      subscribe: jest.fn().mockResolvedValue({
        stream: (async function* () {})(),
      }),
    },
  }),
}));

describe('OpenCodeService', () => {
  let service: OpenCodeService;

  beforeEach(() => {
    service = new OpenCodeService(DEFAULT_SETTINGS);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should not auto-start if disabled', async () => {
      const settings = { ...DEFAULT_SETTINGS, server: { ...DEFAULT_SETTINGS.server, autoStart: false } };
      service = new OpenCodeService(settings);
      
      await service.initialize();
      
      expect(service.isReady()).toBe(false);
    });
  });

  describe('createSession', () => {
    it('should throw if not initialized', async () => {
      await expect(service.createSession()).rejects.toThrow('Service not initialized');
    });
  });

  describe('message transformation', () => {
    it('should transform OpenCode message to ChatMessage', () => {
      const info = {
        id: 'msg-1',
        role: 'assistant',
        createdAt: new Date().toISOString(),
      };
      
      const parts = [
        { type: 'text' as const, text: 'Hello' },
      ];

      const message = OpenCodeService.openCodeMessageToChatMessage(
        info as unknown as Parameters<typeof OpenCodeService['openCodeMessageToChatMessage']>[0], 
        parts
      );

      expect(message.id).toBe('msg-1');
      expect(message.role).toBe('assistant');
      expect(message.content).toBe('Hello');
    });
  });
});
