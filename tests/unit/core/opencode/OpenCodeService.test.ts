/**
 * OpenCodeService unit tests
 */

import { TextDecoder, TextEncoder } from 'util';

import { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { resolveToolExecutionStatus } from '../../../../src/shared';

// Mock global fetch
global.fetch = jest.fn() as unknown as typeof fetch;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;

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
  let mockSdkClient: {
    global: { health: jest.Mock; syncEvent: { subscribe: jest.Mock } };
    session: {
      create: jest.Mock;
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
    config: { providers: jest.Mock };
    permission: { list: jest.Mock; reply: jest.Mock };
    event: { subscribe: jest.Mock };
  };

  beforeEach(() => {
    service = new OpenCodeService(DEFAULT_SETTINGS);
    mockSdkClient = {
      global: { health: jest.fn(), syncEvent: { subscribe: jest.fn() } },
      session: {
        create: jest.fn(),
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
      config: { providers: jest.fn() },
      permission: { list: jest.fn(), reply: jest.fn() },
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

    it('restores reverted session via HTTP API', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { id: 'test-id', title: 'Test', time: { created: 1, updated: 1 } },
        text: '{"id":"test-id","title":"Test","time":{"created":1,"updated":1}}',
      });

      await expect(service.unrevertSession('test-id')).resolves.toBe(true);
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4096/session/test-id/unrevert',
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

  describe('sdk migration paths', () => {
    const createServiceWithSdkFlags = () => new OpenCodeService(
      DEFAULT_SETTINGS,
      {},
      { sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS },
    );

    it('uses SDK createSession when rollout flags are enabled', async () => {
      service = createServiceWithSdkFlags();
      mockSdkClient.session.create.mockResolvedValue({
        id: 'sdk-session',
        title: 'Test',
        time: { created: 1, updated: 1 },
      });

      const sessionId = await service.createSession('Test');

      expect(sessionId).toBe('sdk-session');
      expect(mockCreateSdkClient).toHaveBeenCalled();
      expect(mockSdkClient.session.create).toHaveBeenCalledWith({
        title: 'Test',
      });
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    it('falls back to legacy HTTP for read-only listSessions failures', async () => {
      service = createServiceWithSdkFlags();
      mockSdkClient.session.list.mockRejectedValue(new Error('sdk read failed'));
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: [{ id: 'legacy-session', title: 'Legacy' }],
        text: '[{"id":"legacy-session","title":"Legacy"}]',
      });

      const sessions = await service.listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('legacy-session');
      expect(mockSdkClient.session.list).toHaveBeenCalled();
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4096/session',
        method: 'GET',
      }));
    });

    it('applies session revert state when loading messages via SDK', async () => {
      service = createServiceWithSdkFlags();
      mockSdkClient.session.messages.mockResolvedValue([
        { info: { id: 'msg-1', role: 'user' }, parts: [] },
        { info: { id: 'msg-2', role: 'assistant' }, parts: [] },
        { info: { id: 'msg-3', role: 'user' }, parts: [] },
        { info: { id: 'msg-4', role: 'assistant' }, parts: [] },
      ]);
      mockSdkClient.session.get.mockResolvedValue({
        id: 'sdk-session',
        title: 'SDK',
        revert: { messageID: 'msg-3' },
        time: { created: 1, updated: 1 },
      });

      const messages = await service.getSessionMessages('sdk-session');

      expect(messages.map((message) => message.info.id)).toEqual(['msg-1', 'msg-2']);
      expect(mockSdkClient.session.messages).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
      expect(mockSdkClient.session.get).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
    });

    it('loads session todos via SDK and normalizes entries', async () => {
      service = createServiceWithSdkFlags();
      mockSdkClient.session.todo = jest.fn().mockResolvedValue([
        { id: 'todo-1', content: 'Inspect docs', status: 'in_progress', priority: 'high' },
        { content: 'Draft spec', status: 'pending', priority: 'medium' },
        { content: '', status: 'pending' },
      ]);

      await expect(service.getSessionTodos('sdk-session')).resolves.toEqual([
        { id: 'todo-1', content: 'Inspect docs', status: 'in_progress', priority: 'high' },
        { content: 'Draft spec', status: 'pending', priority: 'medium' },
      ]);
      expect(mockSdkClient.session.todo).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
    });

    it('loads session statuses via SDK and normalizes entries', async () => {
      service = createServiceWithSdkFlags();
      mockSdkClient.session.status = jest.fn().mockResolvedValue({
        data: {
          'sdk-session': { type: 'busy' },
          'retry-session': { type: 'retry', attempt: 2, message: 'Retrying', next: 123 },
          'invalid-session': { type: 'unknown' },
        },
      });

      await expect(service.getSessionStatuses()).resolves.toEqual({
        'sdk-session': { type: 'busy' },
        'retry-session': { type: 'retry', attempt: 2, message: 'Retrying', next: 123 },
      });
      expect(mockSdkClient.session.status).toHaveBeenCalledWith();
    });

    it('emits todo.updated payloads from SDK sync events', async () => {
      service = createServiceWithSdkFlags();
      const updates: Array<{ sessionId: string; todos: unknown[] }> = [];
      mockSdkClient.global.syncEvent.subscribe.mockResolvedValue({
        stream: (async function* () {
          yield {
            type: 'todo.updated',
            properties: {
              sessionID: 'sdk-session',
              todos: [
                { content: 'Inspect docs', status: 'in_progress', priority: 'high' },
                { content: 'Draft spec', status: 'pending', priority: 'medium' },
              ],
            },
          };
        })(),
      });

      const dispose = service.subscribeToSessionTodoUpdates((update) => {
        updates.push(update as unknown as { sessionId: string; todos: unknown[] });
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      dispose();

      expect(mockSdkClient.global.syncEvent.subscribe).toHaveBeenCalled();
      expect(updates).toEqual([
        {
          sessionId: 'sdk-session',
          todos: [
            { content: 'Inspect docs', status: 'in_progress', priority: 'high' },
            { content: 'Draft spec', status: 'pending', priority: 'medium' },
          ],
        },
      ]);
    });

    it('emits session.status payloads from SDK sync events', async () => {
      service = createServiceWithSdkFlags();
      const updates: Array<{ sessionId: string; status: unknown }> = [];
      mockSdkClient.global.syncEvent.subscribe.mockResolvedValue({
        stream: (async function* () {
          yield {
            type: 'session.status',
            properties: {
              sessionID: 'sdk-session',
              status: { type: 'idle' },
            },
          };
        })(),
      });

      const dispose = service.subscribeToSessionStatusUpdates((update) => {
        updates.push(update as unknown as { sessionId: string; status: unknown });
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      dispose();

      expect(mockSdkClient.global.syncEvent.subscribe).toHaveBeenCalled();
      expect(updates).toEqual([
        {
          sessionId: 'sdk-session',
          status: { type: 'idle' },
        },
      ]);
    });

    it('returns session revert state via SDK', async () => {
      service = createServiceWithSdkFlags();
      mockSdkClient.session.get.mockResolvedValue({
        id: 'sdk-session',
        title: 'SDK',
        revert: { messageID: 'msg-1', partID: 'part-1' },
        time: { created: 1, updated: 1 },
      });

      await expect(service.getSessionRevertState('sdk-session')).resolves.toEqual({
        messageID: 'msg-1',
        partID: 'part-1',
      });
      expect(mockSdkClient.session.get).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
    });

    it('restores reverted session via SDK', async () => {
      service = createServiceWithSdkFlags();
      mockSdkClient.session.unrevert.mockResolvedValue({
        id: 'sdk-session',
        title: 'SDK',
        time: { created: 1, updated: 1 },
      });

      await expect(service.unrevertSession('sdk-session')).resolves.toBe(true);
      expect(mockSdkClient.session.unrevert).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
    });

    it('maps requestAssistantResponse through SDK prompt with tools and variant', async () => {
      service = createServiceWithSdkFlags();
      service.setSessionId('sdk-session');
      mockSdkClient.session.prompt.mockResolvedValue({
        info: {
          id: 'assistant-1',
          sessionID: 'sdk-session',
          role: 'assistant',
          time: { created: 1234567890 },
        },
        parts: [
          {
            id: 'part-1',
            sessionID: 'sdk-session',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Generated title',
          },
        ],
      });

      const response = await service.requestAssistantResponse('Create a title', {
        sessionId: 'sdk-session',
        provider: 'openai',
        model: 'gpt-5',
        system: 'Return only the title',
        allowedTools: ['read', 'grep'],
        reasoningEffort: 'high',
      });

      expect(response?.content).toBe('Generated title');
      expect(mockSdkClient.session.prompt).toHaveBeenCalledWith(expect.objectContaining({
        sessionID: 'sdk-session',
        system: 'Return only the title',
        tools: {
          read: true,
          grep: true,
        },
        variant: 'high',
      }));
    });

    it('falls back to legacy SSE when the SDK event stream fails before the first event', async () => {
      service = createServiceWithSdkFlags();
      service.setSessionId('test-session');

      mockSdkClient.session.promptAsync.mockResolvedValue({});
      mockSdkClient.event.subscribe.mockResolvedValue({
        stream: (async function* () {
          throw new Error('sdk stream failed');
          yield undefined as never;
        })(),
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: {
          getReader: () => {
            const chunks = [
              {
                done: false,
                value: new TextEncoder().encode('data: {"type":"session.idle","properties":{"sessionID":"test-session"}}\n\n'),
              },
              {
                done: true,
                value: undefined,
              },
            ];
            return {
              read: jest.fn().mockImplementation(() => Promise.resolve(chunks.shift() ?? { done: true, value: undefined })),
              cancel: jest.fn(),
              releaseLock: jest.fn(),
            };
          },
        },
      });

      const chunks: unknown[] = [];
      for await (const chunk of service.sendMessage('Hello', { sessionId: 'test-session' })) {
        chunks.push(chunk);
      }

      expect(chunks[0]).toEqual({ type: 'message_start' });
      expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
      expect(mockSdkClient.session.promptAsync).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:4096/event',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('calls session.abort when cancelStream is invoked during an SDK stream', async () => {
      service = createServiceWithSdkFlags();
      service.setSessionId('test-session');

      mockSdkClient.session.promptAsync.mockResolvedValue({});
      mockSdkClient.event.subscribe.mockResolvedValue({
        stream: (async function* () {
          yield {
            type: 'message.part.updated',
            properties: {
              sessionID: 'test-session',
              part: {
                id: 'part-1',
                type: 'text',
              },
            },
          };
          yield {
            type: 'message.part.delta',
            properties: {
              sessionID: 'test-session',
              partID: 'part-1',
              field: 'text',
              delta: 'Hello',
            },
          };
          await new Promise(() => {});
        })(),
      });

      const iterator = service.sendMessage('Hello', { sessionId: 'test-session' });
      await iterator.next();
      await iterator.next();

      service.cancelStream();
      await Promise.resolve();

      expect(mockSdkClient.session.abort).toHaveBeenCalledWith({
        sessionID: 'test-session',
      });

      if (iterator.return) {
        await iterator.return(undefined);
      }
    });

    it('emits final assistant metadata from SDK stream completion', async () => {
      service = createServiceWithSdkFlags();
      service.setSessionId('test-session');

      mockSdkClient.session.promptAsync.mockResolvedValue({});
      mockSdkClient.event.subscribe.mockResolvedValue({
        stream: (async function* () {
          yield {
            type: 'session.idle',
            properties: {
              sessionID: 'test-session',
            },
          };
        })(),
      });
      mockSdkClient.session.messages.mockResolvedValue([
        {
          info: {
            id: 'assistant-42',
            sessionID: 'test-session',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            time: { created: 1234567890 },
          },
          parts: [
            {
              id: 'part-1',
              sessionID: 'test-session',
              messageID: 'assistant-42',
              type: 'text',
              text: 'Hello',
            },
          ],
        },
      ]);
      mockSdkClient.session.get.mockResolvedValue({
        id: 'test-session',
        title: 'SDK',
        time: { created: 1, updated: 1 },
      });

      const chunks: unknown[] = [];
      for await (const chunk of service.sendMessage('Hello', { sessionId: 'test-session' })) {
        chunks.push(chunk);
      }

      expect(chunks).toContainEqual({
        type: 'message_metadata',
        messageId: 'assistant-42',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      });
      expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
    });

    it('re-emits tool_use when later stream updates provide richer tool input', async () => {
      service = createServiceWithSdkFlags();
      service.setSessionId('test-session');

      mockSdkClient.session.promptAsync.mockResolvedValue({});
      mockSdkClient.event.subscribe.mockResolvedValue({
        stream: (async function* () {
          yield {
            type: 'message.part.updated',
            properties: {
              sessionID: 'test-session',
              part: {
                id: 'part-tool-1',
                type: 'tool',
                callID: 'call-tool-1',
                tool: 'read',
                state: {
                  status: 'running',
                  input: {},
                },
              },
            },
          };
          yield {
            type: 'message.part.updated',
            properties: {
              sessionID: 'test-session',
              part: {
                id: 'part-tool-1',
                type: 'tool',
                callID: 'call-tool-1',
                tool: 'read',
                state: {
                  status: 'running',
                  input: {
                    file_path: 'docs/architecture/README.md',
                  },
                },
              },
            },
          };
          yield {
            type: 'session.idle',
            properties: {
              sessionID: 'test-session',
            },
          };
        })(),
      });
      mockSdkClient.session.messages.mockResolvedValue([]);
      mockSdkClient.session.get.mockResolvedValue({
        id: 'test-session',
        title: 'SDK',
        time: { created: 1, updated: 1 },
      });

      const chunks: unknown[] = [];
      for await (const chunk of service.sendMessage('Hello', { sessionId: 'test-session' })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(expect.arrayContaining([
        {
          type: 'tool_use',
          id: 'call-tool-1',
          name: 'read',
          input: {},
        },
        {
          type: 'tool_use',
          id: 'call-tool-1',
          name: 'read',
          input: {
            file_path: 'docs/architecture/README.md',
          },
        },
      ]));
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
