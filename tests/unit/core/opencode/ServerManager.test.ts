/**
 * ServerManager unit tests
 */

import * as fs from 'fs';
import * as path from 'path';

import { ServerManager } from '../../../../src/core/opencode/ServerManager';

// Mock Obsidian
jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  requestUrl: jest.fn(),
}));

const { requestUrl: mockRequestUrl } = jest.requireMock('obsidian') as {
  requestUrl: jest.Mock;
};

// Mock child_process
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

// Mock net
jest.mock('net', () => ({
  createServer: jest.fn().mockReturnValue({
    once: jest.fn().mockReturnThis(),
    listen: jest.fn().mockReturnThis(),
    close: jest.fn(),
  }),
}));

describe('ServerManager', () => {
  let manager: ServerManager;
  const testVaultPath = path.join(__dirname, 'server-manager-vault');
  const defaultConfig = {
    mode: 'local' as const,
    baseUrl: 'http://127.0.0.1:4096',
    local: {
      host: '127.0.0.1',
      port: 4096,
      autoStart: true,
    },
    auth: {
      type: 'none' as const,
      username: 'opencode',
      password: '',
      token: '',
    },
    modelSourceMode: 'merge' as const,
    pluginIsolationMode: 'default' as const,
  };

  beforeEach(() => {
    if (fs.existsSync(testVaultPath)) {
      fs.rmSync(testVaultPath, { recursive: true, force: true });
    }
    manager = new ServerManager(defaultConfig);
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(testVaultPath)) {
      fs.rmSync(testVaultPath, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      expect(manager).toBeDefined();
      expect(manager.getStatus()).toBe('stopped');
      expect(manager.isRunning()).toBe(false);
    });

    it('should create manager with custom config', () => {
      const customManager = new ServerManager({
        ...defaultConfig,
        baseUrl: 'http://0.0.0.0:5000',
        local: {
          host: '0.0.0.0',
          port: 5000,
          autoStart: true,
        },
        timeout: 60000,
      });
      expect(customManager).toBeDefined();
    });
  });

  describe('status management', () => {
    it('should return stopped status initially', () => {
      expect(manager.getStatus()).toBe('stopped');
    });

    it('should report not running initially', () => {
      expect(manager.isRunning()).toBe(false);
    });
  });

  describe('stop', () => {
    it('should handle stop when not running', async () => {
      await expect(manager.stop()).resolves.not.toThrow();
    });
  });

  describe('restart', () => {
    it('should be defined', () => {
      expect(typeof manager.restart).toBe('function');
    });
  });

  describe('checkHealth', () => {
    it('should return true for healthy server', async () => {
      mockRequestUrl.mockResolvedValueOnce({ status: 200 });

      const result = await manager.checkHealth();

      expect(result).toBe(true);
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4096/global/health',
        method: 'GET',
      }));
    });

    it('should return false for unhealthy server', async () => {
      mockRequestUrl.mockResolvedValueOnce({ status: 500 });

      const result = await manager.checkHealth();

      expect(result).toBe(false);
    });

    it('should return false on fetch error', async () => {
      mockRequestUrl.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await manager.checkHealth();

      expect(result).toBe(false);
    });

    it('should respect timeout', async () => {
      mockRequestUrl.mockImplementation(() => new Promise(() => {}));

      const startTime = Date.now();
      const result = await manager.checkHealth(100);
      const elapsed = Date.now() - startTime;

      expect(result).toBe(false);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('event handlers', () => {
    it('should accept event handlers in constructor', () => {
      const onStatusChange = jest.fn();
      const onError = jest.fn();

      const managerWithEvents = new ServerManager(
        defaultConfig,
        { onStatusChange, onError }
      );

      expect(managerWithEvents).toBeDefined();
    });
  });

  describe('local-only model source mode', () => {
    it('should disable all providers when local config has no models', () => {
      manager = new ServerManager({
        ...defaultConfig,
        modelSourceMode: 'local',
      });
      fs.mkdirSync(path.join(testVaultPath, '.opencode'), { recursive: true });
      fs.writeFileSync(
        path.join(testVaultPath, '.opencode', 'opencode.json'),
        JSON.stringify({ $schema: 'https://opencode.ai/config.json' }),
        'utf-8',
      );

      manager.setWorkingDirectory(testVaultPath);
      const env = (manager as any).getSpawnEnv() as NodeJS.ProcessEnv;

      expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe('true');
      expect(env.OPENCODE_CONFIG_DIR).toBe(path.join(testVaultPath, '.opencode'));
      expect(env.OPENCODE_CONFIG_CONTENT).toBe(JSON.stringify({ enabled_providers: [] }));
    });
  });

  describe('plugin isolation mode', () => {
    it('should enable OPENCODE_PURE in pure mode', () => {
      manager = new ServerManager({
        ...defaultConfig,
        pluginIsolationMode: 'pure',
      });

      const env = (manager as any).getSpawnEnv() as NodeJS.ProcessEnv;

      expect(env.OPENCODE_PURE).toBe('true');
    });
  });
});
