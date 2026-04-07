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
const { spawn: mockSpawn } = jest.requireMock('child_process') as {
  spawn: jest.Mock;
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
  const originalEnv = { ...process.env };
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
    process.env = { ...originalEnv };
    if (fs.existsSync(testVaultPath)) {
      fs.rmSync(testVaultPath, { recursive: true, force: true });
    }
    manager = new ServerManager(defaultConfig);
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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
    it('should not inject a provider whitelist into the managed server env', () => {
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

      expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBeUndefined();
      expect(env.OPENCODE_CONFIG_DIR).toBeUndefined();
      expect(env.OPENCODE_CONFIG_CONTENT).toBeUndefined();
    });

    it('should ignore local enabled_providers and disabled_providers when preparing server env', () => {
      manager = new ServerManager({
        ...defaultConfig,
        modelSourceMode: 'local',
      });
      fs.mkdirSync(path.join(testVaultPath, '.opencode'), { recursive: true });
      fs.writeFileSync(
        path.join(testVaultPath, '.opencode', 'opencode.json'),
        JSON.stringify({
          $schema: 'https://opencode.ai/config.json',
          provider: {
            openai: { name: 'OpenAI', models: {} },
            anthropic: { name: 'Anthropic', models: {} },
            ollama: { name: 'Ollama', models: {} },
          },
          enabled_providers: ['openai', 'anthropic'],
          disabled_providers: ['anthropic'],
        }),
        'utf-8',
      );

      manager.setWorkingDirectory(testVaultPath);
      const env = (manager as any).getSpawnEnv() as NodeJS.ProcessEnv;

      expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBeUndefined();
      expect(env.OPENCODE_CONFIG_DIR).toBeUndefined();
      expect(env.OPENCODE_CONFIG_CONTENT).toBeUndefined();
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

  describe('binary resolution', () => {
    if (process.platform === 'win32') {
      it('prefers npm global opencode.cmd over PATH opencode.exe', () => {
        const npmBinDir = path.join(testVaultPath, 'AppData', 'npm');
        const pathBinDir = path.join(testVaultPath, 'WinGetLinks');
        const npmBinary = path.join(npmBinDir, 'opencode.cmd');
        const pathBinary = path.join(pathBinDir, 'opencode.exe');

        fs.mkdirSync(npmBinDir, { recursive: true });
        fs.mkdirSync(pathBinDir, { recursive: true });
        fs.writeFileSync(npmBinary, '@echo off', 'utf-8');
        fs.writeFileSync(pathBinary, '', 'utf-8');

        process.env.APPDATA = path.join(testVaultPath, 'AppData');
        process.env.LOCALAPPDATA = path.join(testVaultPath, 'LocalAppData');
        process.env.PATH = pathBinDir;

        const resolved = (manager as any).findOpenCodeBinary() as string | null;

        expect(resolved).toBe(npmBinary);
      });
    }

    it('resolves the first matching binary from PATH', () => {
      const pathBinDir = path.join(testVaultPath, 'PathBin');
      const binaryName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
      const binaryPath = path.join(pathBinDir, binaryName);

      fs.mkdirSync(pathBinDir, { recursive: true });
      fs.writeFileSync(binaryPath, process.platform === 'win32' ? '@echo off' : '#!/bin/sh', 'utf-8');

      delete process.env.APPDATA;
      delete process.env.LOCALAPPDATA;
      process.env.PATH = pathBinDir;

      const resolved = (manager as any).findOpenCodeBinary() as string | null;

      expect(resolved).toBe(binaryPath);
    });

    if (process.platform === 'win32') {
      it('spawns npm opencode.cmd through the shell', async () => {
        jest.useFakeTimers();
        try {
          const npmBinDir = path.join(testVaultPath, 'AppData', 'npm');
          const npmBinary = path.join(npmBinDir, 'opencode.cmd');

          fs.mkdirSync(npmBinDir, { recursive: true });
          fs.writeFileSync(npmBinary, '@echo off', 'utf-8');
          process.env.APPDATA = path.join(testVaultPath, 'AppData');
          process.env.LOCALAPPDATA = path.join(testVaultPath, 'LocalAppData');
          process.env.PATH = '';

          const spawnPromise = (manager as any).spawnServer() as Promise<void>;
          await jest.advanceTimersByTimeAsync(1000);
          await spawnPromise;

          expect(mockSpawn).toHaveBeenCalledWith(
            npmBinary,
            expect.any(Array),
            expect.objectContaining({
              shell: true,
              windowsHide: true,
            }),
          );
        } finally {
          jest.useRealTimers();
        }
      });
    }
  });
});
