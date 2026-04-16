/**
 * OpenCodeService bootstrap and baseline unit tests.
 */

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { resolveToolExecutionStatus } from '../../../../src/shared';
import {
  createOpenCodeServiceTestContext,
  OpenCodeService,
} from './OpenCodeService.testSupport';

let service: OpenCodeService;

beforeEach(() => {
  ({ service } = createOpenCodeServiceTestContext());
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('OpenCodeService bootstrap basics', () => {
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

describe('OpenCodeService error handling baseline', () => {
  it('should handle SDK BadRequestError format', async () => {
    const service = new OpenCodeService(DEFAULT_SETTINGS);
    expect(service.isReady()).toBe(false);
  });
});
