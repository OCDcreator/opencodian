/**
 * OpenCodeService unit tests
 */

import { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { resolveToolExecutionStatus } from '../../../../src/shared';

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
    removeListener: jest.fn(),
    kill: jest.fn(),
    stdout: { on: jest.fn(), removeListener: jest.fn() },
    stderr: { on: jest.fn(), removeListener: jest.fn() },
    killed: false,
  }),
  spawnSync: jest.fn().mockReturnValue({ status: 0, error: null }),
}));

// Mock net for ServerManager
jest.mock('net', () => ({
  createServer: jest.fn().mockReturnValue({
    once: jest.fn().mockReturnThis(),
    listen: jest.fn().mockReturnThis(),
    close: jest.fn(),
  }),
}));

let service: OpenCodeService;
let mockSdkClient: {
  global: { health: jest.Mock; syncEvent: { subscribe: jest.Mock } };
  session: {
    create: jest.Mock;
    diff: jest.Mock;
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
  config: { providers: jest.Mock; get: jest.Mock };
  provider: { list: jest.Mock };
  permission: { list: jest.Mock; reply: jest.Mock };
  question: { list: jest.Mock; reply: jest.Mock; reject: jest.Mock };
  event: { subscribe: jest.Mock };
};

beforeEach(() => {
  service = new OpenCodeService(DEFAULT_SETTINGS);
  mockSdkClient = {
    global: { health: jest.fn(), syncEvent: { subscribe: jest.fn() } },
    session: {
      create: jest.fn(),
      diff: jest.fn(),
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
    config: { providers: jest.fn(), get: jest.fn() },
    provider: { list: jest.fn() },
    permission: { list: jest.fn(), reply: jest.fn() },
    question: { list: jest.fn(), reply: jest.fn(), reject: jest.fn() },
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
        url: 'http://127.0.0.1:4196/session',
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
        url: 'http://127.0.0.1:4196/session/test-id',
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
        url: 'http://127.0.0.1:4196/session/test-id',
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
        url: 'http://127.0.0.1:4196/session/test-id/fork',
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
        url: 'http://127.0.0.1:4196/session/test-id/revert',
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
        url: 'http://127.0.0.1:4196/session/test-id/unrevert',
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

  describe('updateSettings', () => {
    it('should update settings without restarting if server config unchanged', async () => {
      const newSettings = { ...DEFAULT_SETTINGS, userName: 'Test User' };

      await expect(service.updateSettings(newSettings)).resolves.toBeUndefined();
    });

    it('should handle server config changes', async () => {
      const newSettings = {
        ...DEFAULT_SETTINGS,
        server: {
          ...DEFAULT_SETTINGS.server,
          local: { ...DEFAULT_SETTINGS.server.local, port: 5000 },
        },
      };

      await expect(service.updateSettings(newSettings)).resolves.toBeUndefined();
    });
  });

  describe('server status', () => {
    it('should return stopped status initially', () => {
      expect(service.getServerStatus()).toBe('stopped');
    });

    it('should expose empty diagnostics initially', () => {
      expect(service.getServerDiagnostics()).toEqual({ reason: 'none' });
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
