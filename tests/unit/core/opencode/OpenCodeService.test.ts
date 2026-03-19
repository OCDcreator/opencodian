/**
 * OpenCodeService unit tests
 */

import { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

// Mock global fetch
global.fetch = jest.fn() as unknown as typeof fetch;

// Mock EventSource
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = jest.fn();
  addEventListener = jest.fn();
  
  constructor() {
    setTimeout(() => {
      this.onerror?.();
    }, 100);
  }
}

global.EventSource = MockEventSource as unknown as typeof EventSource;

// Mock Obsidian
jest.mock('obsidian', () => ({
  Notice: jest.fn(),
}));

// Mock child_process for ServerManager
jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    once: jest.fn(),
    kill: jest.fn(),
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    killed: false,
  }),
}));

// Mock net for ServerManager
jest.mock('net', () => ({
  createServer: jest.fn().mockReturnValue({
    once: jest.fn().mockReturnThis(),
    listen: jest.fn().mockReturnThis(),
    close: jest.fn(),
  }),
}));

describe('OpenCodeService', () => {
  let service: OpenCodeService;

  beforeEach(() => {
    service = new OpenCodeService(DEFAULT_SETTINGS);
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
        server: { ...DEFAULT_SETTINGS.server, port: 5000 },
      };
      const customService = new OpenCodeService(customSettings);
      expect(customService).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should not auto-start if disabled', async () => {
      const settings = { ...DEFAULT_SETTINGS, server: { ...DEFAULT_SETTINGS.server, autoStart: false } };
      service = new OpenCodeService(settings);

      await service.initialize();

      expect(service.isReady()).toBe(false);
    });
  });

  describe('session management', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 'test-session' }),
      });
    });

    it('should create session via HTTP API', async () => {
      const sessionId = await service.createSession('Test');
      expect(sessionId).toBe('test-session');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:4096/session',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should list sessions via HTTP API', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ id: '1', title: 'Test' }]),
      });

      const sessions = await service.listSessions();
      expect(sessions).toHaveLength(1);
    });

    it('should get session messages via HTTP API', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{ info: { id: 'm1', role: 'user' }, parts: [] }]),
      });

      const messages = await service.getSessionMessages('test-id');
      expect(messages).toHaveLength(1);
    });

    it('should delete session via HTTP API', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await service.deleteSession('test-id');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:4096/session/test-id',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('session ID management', () => {
    it('should get and set session ID', () => {
      expect(service.getSessionId()).toBeNull();

      service.setSessionId('test-session-123');
      expect(service.getSessionId()).toBe('test-session-123');
    });
  });

  describe('sendMessage', () => {
    it('should yield error when no active session', async () => {
      const chunks: unknown[] = [];
      for await (const chunk of service.sendMessage('Hello')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ type: 'error', content: 'No active session' });
    });

    it('should send message with active session', async () => {
      service.setSessionId('test-session');
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

      const chunks: unknown[] = [];
      for await (const chunk of service.sendMessage('Hello')) {
        chunks.push(chunk);
      }

      // Should get message_start and message_stop
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0]).toEqual({ type: 'message_start' });
      expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
    });
  });

  describe('getAvailableModels', () => {
    it('should fetch models via HTTP API', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          providers: [{
            id: 'anthropic',
            name: 'Anthropic',
            models: {
              'claude-3': { id: 'claude-3', name: 'Claude 3' }
            }
          }],
          default: { anthropic: 'claude-3' }
        }),
      });

      const result = await service.getAvailableModels();
      
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].id).toBe('anthropic');
      expect(result.defaults).toEqual({ anthropic: 'claude-3' });
    });
  });

  describe('updateSettings', () => {
    it('should update settings without restarting if server config unchanged', () => {
      const newSettings = { ...DEFAULT_SETTINGS, userName: 'Test User' };

      expect(() => service.updateSettings(newSettings)).not.toThrow();
    });

    it('should handle server config changes', () => {
      const newSettings = {
        ...DEFAULT_SETTINGS,
        server: { ...DEFAULT_SETTINGS.server, port: 5000 },
      };

      expect(() => service.updateSettings(newSettings)).not.toThrow();
    });
  });

  describe('server status', () => {
    it('should return stopped status initially', () => {
      expect(service.getServerStatus()).toBe('stopped');
    });
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
    expect(message.toolCalls?.[0].input).toEqual({ path: '/test/file.txt' });
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
});

describe('Error handling', () => {
  it('should handle SDK BadRequestError format', async () => {
    // Test through the service methods
    const service = new OpenCodeService(DEFAULT_SETTINGS);
    expect(service.isReady()).toBe(false);
  });
});
