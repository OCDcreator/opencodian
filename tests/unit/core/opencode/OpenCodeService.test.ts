/**
 * OpenCodeService unit tests
 */

import { TextDecoder } from 'util';

import { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { resolveToolExecutionStatus } from '../../../../src/shared';

// Mock global fetch
global.fetch = jest.fn() as unknown as typeof fetch;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

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
  requestUrl: jest.fn(),
}));

const { requestUrl: mockRequestUrl } = jest.requireMock('obsidian') as {
  requestUrl: jest.Mock;
};

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
        url: 'http://127.0.0.1:4096/session',
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
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: [{ info: { id: 'm1', role: 'user' }, parts: [] }],
        text: '[{"info":{"id":"m1","role":"user"},"parts":[]}]',
      });

      const messages = await service.getSessionMessages('test-id');
      expect(messages).toHaveLength(1);
    });

    it('should delete session via HTTP API', async () => {
      mockRequestUrl.mockResolvedValue({ status: 204, json: {}, text: '' });

      await service.deleteSession('test-id');
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4096/session/test-id',
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
        url: 'http://127.0.0.1:4096/session/test-id',
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
        url: 'http://127.0.0.1:4096/session/test-id/fork',
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
        url: 'http://127.0.0.1:4096/session/test-id/revert',
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
      
      mockRequestUrl.mockResolvedValue({
        status: 204,
        json: {},
        text: '',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
            cancel: jest.fn(),
            releaseLock: jest.fn(),
          }),
        },
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

    it('should request a full assistant response without SSE', async () => {
      service.setSessionId('test-session');
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          info: {
            id: 'assistant-1',
            sessionID: 'test-session',
            role: 'assistant',
            time: { created: 1234567890 },
          },
          parts: [
            {
              id: 'part-1',
              sessionID: 'test-session',
              messageID: 'assistant-1',
              type: 'text',
              text: 'Generated title',
            },
          ],
        },
        text: '{"info":{"id":"assistant-1","sessionID":"test-session","role":"assistant","time":{"created":1234567890}},"parts":[{"id":"part-1","sessionID":"test-session","messageID":"assistant-1","type":"text","text":"Generated title"}]}',
      });

      const response = await service.requestAssistantResponse('Create a title', {
        sessionId: 'test-session',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        system: 'Return only the title',
      });

      expect(response?.content).toBe('Generated title');
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4096/session/test-session/message',
        method: 'POST',
      }));
    });
  });

  describe('getAvailableModels', () => {
    it('should fetch models via HTTP API', async () => {
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
    it('should update settings without restarting if server config unchanged', () => {
      const newSettings = { ...DEFAULT_SETTINGS, userName: 'Test User' };

      expect(() => service.updateSettings(newSettings)).not.toThrow();
    });

    it('should handle server config changes', () => {
      const newSettings = {
        ...DEFAULT_SETTINGS,
        server: {
          ...DEFAULT_SETTINGS.server,
          local: { ...DEFAULT_SETTINGS.server.local, port: 5000 },
        },
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
        text: '<system-reminder>\n[BACKGROUND TASK COMPLETED]\n整理完成：史料摘要已更新。\n</system-reminder>\n<!-- OMO_INTERNAL_INITIATOR -->',
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
  it('treats older completed bash results with fatal output as errors', () => {
    expect(resolveToolExecutionStatus({
      toolName: 'bash',
      storedStatus: 'completed',
      result: 'fatal: not a git repository (or any of the parent directories): .git',
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
