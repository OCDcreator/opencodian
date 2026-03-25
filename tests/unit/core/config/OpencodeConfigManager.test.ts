/**
 * Tests for OpencodeConfigManager
 */

import * as fs from 'fs';
import * as path from 'path';

import { OpencodeConfigManager } from '../../../../src/core/config/OpencodeConfigManager';

// Mock Obsidian's Notice
jest.mock('obsidian', () => ({
  Notice: jest.fn(),
}));

describe('OpencodeConfigManager', () => {
  const testVaultPath = path.join(__dirname, 'test-vault');
  let manager: OpencodeConfigManager;

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testVaultPath)) {
      fs.rmSync(testVaultPath, { recursive: true });
    }
    fs.mkdirSync(testVaultPath, { recursive: true });
    
    manager = new OpencodeConfigManager(testVaultPath);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testVaultPath)) {
      fs.rmSync(testVaultPath, { recursive: true });
    }
  });

  describe('exists', () => {
    it('should return false when config does not exist', async () => {
      const exists = await manager.exists();
      expect(exists).toBe(false);
    });

    it('should return true when config exists', async () => {
      await manager.write({ permission: { '*': 'ask' } });
      const exists = await manager.exists();
      expect(exists).toBe(true);
    });
  });

  describe('read', () => {
    it('should return default config when file does not exist', async () => {
      const config = await manager.read();
      expect(config.$schema).toBe('https://opencode.ai/config.json');
      expect(config.permission).toEqual({ '*': 'ask' });
    });

    it('should read existing config', async () => {
      const testConfig = {
        $schema: 'https://opencode.ai/config.json',
        permission: { bash: 'allow', edit: 'deny' },
      };
      await manager.write(testConfig);
      
      const config = await manager.read();
      expect(config.permission).toEqual(testConfig.permission);
    });
  });

  describe('write', () => {
    it('should create .opencode directory if not exists', async () => {
      await manager.write({ permission: { '*': 'allow' } });
      
      expect(fs.existsSync(manager.getConfigDir())).toBe(true);
      expect(fs.existsSync(manager.getConfigPath())).toBe(true);
    });

    it('should write config with schema', async () => {
      await manager.write({ permission: { bash: 'allow' } });
      
      const content = fs.readFileSync(manager.getConfigPath(), 'utf-8');
      const parsed = JSON.parse(content);
      
      expect(parsed.$schema).toBe('https://opencode.ai/config.json');
      expect(parsed.permission.bash).toBe('allow');
    });
  });

  describe('updatePermission', () => {
    it('should update permission config', async () => {
      await manager.updatePermission({ bash: 'allow', edit: 'ask' });
      
      const config = await manager.read();
      expect(config.permission).toEqual({ bash: 'allow', edit: 'ask' });
    });

    it('should support string permission', async () => {
      await manager.updatePermission('allow');
      
      const config = await manager.read();
      expect(config.permission).toBe('allow');
    });
  });

  describe('permission modes', () => {
    it('setYoloMode should set allow all', async () => {
      await manager.setYoloMode();
      
      const config = await manager.read();
      expect(config.permission).toBe('allow');
    });

    it('setNormalMode should set ask all', async () => {
      await manager.setNormalMode();
      
      const config = await manager.read();
      expect(config.permission).toMatchObject({
        '*': 'ask',
        bash: 'ask',
        edit: 'ask',
        write: 'ask',
      });
    });

    it('setPlanMode should deny write operations', async () => {
      await manager.setPlanMode();
      
      const config = await manager.read();
      const permission = config.permission as Record<string, string>;
      expect(permission['*']).toBe('ask');
      expect(permission.edit).toBe('deny');
      expect(permission.write).toBe('deny');
    });
  });

  describe('setToolPermission', () => {
    it('should set individual tool permission', async () => {
      await manager.setToolPermission('bash', 'allow');
      
      const config = await manager.read();
      const permission = config.permission as Record<string, string>;
      expect(permission.bash).toBe('allow');
    });

    it('should convert string permission to object', async () => {
      await manager.setYoloMode(); // Sets 'allow'
      await manager.setToolPermission('edit', 'deny');
      
      const config = await manager.read();
      const permission = config.permission as Record<string, string>;
      expect(permission['*']).toBe('allow');
      expect(permission.edit).toBe('deny');
    });
  });

  describe('remove', () => {
    it('should remove config file', async () => {
      await manager.write({ permission: { '*': 'ask' } });
      expect(await manager.exists()).toBe(true);
      
      await manager.remove();
      expect(await manager.exists()).toBe(false);
    });

    it('should not throw if file does not exist', async () => {
      await expect(manager.remove()).resolves.not.toThrow();
    });
  });

  describe('getPermissionConfig', () => {
    it('should return permission config', async () => {
      await manager.updatePermission({ bash: 'allow' });
      
      const permission = await manager.getPermissionConfig();
      expect(permission).toEqual({ bash: 'allow' });
    });
  });

  describe('model config compatibility', () => {
    it('should preserve provider config when updating permissions', async () => {
      await manager.write({
        provider: {
          myprovider: {
            name: 'My Provider',
            models: {
              'my-model': {
                name: 'My Model',
              },
            },
          },
        },
      });

      await manager.setPlanMode();

      const config = await manager.read();
      expect(config.provider?.myprovider?.name).toBe('My Provider');
      expect(config.provider?.myprovider?.models?.['my-model']?.name).toBe('My Model');
    });

    it('should read JSONC config files with comments', async () => {
      fs.mkdirSync(manager.getConfigDir(), { recursive: true });
      fs.writeFileSync(
        manager.getConfigPath(),
        `{
          // local provider
          "provider": {
            "demo": {
              "name": "Demo",
              "models": {
                "demo-model": {
                  "name": "Demo Model"
                }
              }
            }
          }
        }`,
        'utf-8',
      );

      const config = await manager.read();
      expect(config.provider?.demo?.models?.['demo-model']?.name).toBe('Demo Model');
    });
  });

  describe('paths', () => {
    it('should return correct config directory path', () => {
      const dir = manager.getConfigDir();
      expect(dir).toBe(path.join(testVaultPath, '.opencode'));
    });

    it('should return correct config file path', () => {
      const configPath = manager.getConfigPath();
      expect(configPath).toBe(path.join(testVaultPath, '.opencode', 'opencode.json'));
    });
  });
});
