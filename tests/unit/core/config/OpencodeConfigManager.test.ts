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

const testVaultPath = path.join(__dirname, 'test-vault');
let manager: OpencodeConfigManager;

beforeEach(() => {
  if (fs.existsSync(testVaultPath)) {
    fs.rmSync(testVaultPath, { recursive: true });
  }
  fs.mkdirSync(testVaultPath, { recursive: true });

  manager = new OpencodeConfigManager(testVaultPath);
});

afterEach(() => {
  if (fs.existsSync(testVaultPath)) {
    fs.rmSync(testVaultPath, { recursive: true });
  }
});

describe('OpencodeConfigManager file operations', () => {
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
});

describe('OpencodeConfigManager permissions', () => {
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
});

describe('OpencodeConfigManager plugin compatibility', () => {
  describe('plugin config', () => {
    it('should update plugin config entries', async () => {
      await manager.updatePluginConfig([
        'opencode-plugin',
        ['oh-my-opencode', { profile: 'vault' }],
      ]);

      const plugins = await manager.getPluginConfig();
      expect(plugins).toEqual([
        'opencode-plugin',
        ['oh-my-opencode', { profile: 'vault' }],
      ]);
    });

    it('should remove plugin field when the list is empty', async () => {
      await manager.updatePluginConfig(['opencode-plugin']);
      await manager.updatePluginConfig([]);

      const config = await manager.read();
      expect(config.plugin).toBeUndefined();
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

    it('round-trips agent, command, compaction, and default agent config fields', async () => {
      await manager.write({
        default_agent: 'build',
        compaction: {
          auto: true,
          prune: true,
          reserved: 16000,
        },
        command: {
          test: {
            template: 'Run the full test suite',
            description: 'Run tests',
            agent: 'build',
            subtask: false,
            model: 'anthropic/claude-3-5-sonnet-20241022',
          },
        },
        agent: {
          build: {
            description: 'Build-focused primary agent',
            mode: 'primary',
            model: 'anthropic/claude-3-5-sonnet-20241022',
            prompt: 'You are the build agent.',
            temperature: 0.2,
            top_p: 0.9,
            steps: 12,
            color: '#7c3aed',
            permission: {
              task: {
                '*': 'ask',
              },
            },
            tools: {
              bash: true,
              write: true,
            },
            options: {
              reasoningSummary: 'auto',
            },
          },
        },
        formatter: {
          biome: {
            disabled: true,
          },
        },
      });

      const config = await manager.read();
      expect(config).toEqual(expect.objectContaining({
        default_agent: 'build',
        compaction: {
          auto: true,
          prune: true,
          reserved: 16000,
        },
        command: {
          test: expect.objectContaining({
            template: 'Run the full test suite',
            agent: 'build',
            subtask: false,
          }),
        },
        agent: {
          build: expect.objectContaining({
            mode: 'primary',
            steps: 12,
            tools: expect.objectContaining({
              bash: true,
            }),
          }),
        },
        formatter: {
          biome: {
            disabled: true,
          },
        },
      }));
    });
  });

});

describe('OpencodeConfigManager session agent command helpers', () => {
  it('updates compaction and default agent config while preserving adjacent fields', async () => {
    await manager.write({
      default_agent: 'plan',
      compaction: {
        auto: true,
        prune: true,
        reserved: 10000,
        strategy: 'token-budget',
      },
      formatter: {
        biome: {
          disabled: true,
        },
      },
    });

    await manager.updateCompactionConfig({
      auto: false,
      reserved: 18000,
    });
    await manager.updateDefaultAgent('  build  ');

    let config = await manager.read();
    expect(await manager.getCompactionConfig()).toEqual({
      auto: false,
      prune: true,
      reserved: 18000,
      strategy: 'token-budget',
    });
    expect(await manager.getDefaultAgent()).toBe('build');
    expect(config.formatter).toEqual({
      biome: {
        disabled: true,
      },
    });

    await manager.updateCompactionConfig(null);
    await manager.updateDefaultAgent('   ');

    config = await manager.read();
    expect(config.compaction).toBeUndefined();
    expect(config.default_agent).toBeUndefined();
    expect(config.formatter).toEqual({
      biome: {
        disabled: true,
      },
    });
  });

  it('round-trips tail_turns and preserve_recent_tokens in compaction config', async () => {
    await manager.write({
      compaction: {
        auto: true,
        prune: false,
        tail_turns: 4,
        preserve_recent_tokens: 8000,
        reserved: 12000,
      },
    });

    expect(await manager.getCompactionConfig()).toEqual({
      auto: true,
      prune: false,
      tail_turns: 4,
      preserve_recent_tokens: 8000,
      reserved: 12000,
    });

    await manager.updateCompactionConfig({
      tail_turns: 6,
      preserve_recent_tokens: 16000,
    });

    const updated = await manager.getCompactionConfig();
    expect(updated).toEqual(
      expect.objectContaining({
        tail_turns: 6,
        preserve_recent_tokens: 16000,
        auto: true,
        prune: false,
        reserved: 12000,
      }),
    );
  });

  it('imports deprecated mode agents and preserves tool config fields during agent writes', async () => {
    await manager.write({
      mode: {
        legacy: {
          description: 'Legacy imported agent',
          mode: 'primary',
          tools: {
            bash: false,
          },
          legacyNote: 'keep',
        },
        build: {
          description: 'Legacy build agent',
          mode: 'primary',
        },
      },
      agent: {
        build: {
          description: 'Native build agent',
          mode: 'primary',
          tools: {
            bash: true,
            write: true,
          },
          nativeNote: 'keep',
        },
      },
      tools: {
        'legacy-tool': false,
      },
      formatter: {
        biome: {
          disabled: true,
        },
      },
    });

    expect(await manager.getAgentConfig()).toEqual({
      legacy: expect.objectContaining({
        description: 'Legacy imported agent',
        legacyNote: 'keep',
      }),
      build: expect.objectContaining({
        description: 'Native build agent',
        nativeNote: 'keep',
      }),
    });

    await manager.upsertAgentConfig(' build ', {
      tools: {
        edit: false,
      },
      temperature: 0.2,
    });
    await manager.removeAgentConfig('legacy');

    const config = await manager.read();
    expect(config.agent?.build).toEqual(expect.objectContaining({
      description: 'Native build agent',
      nativeNote: 'keep',
      temperature: 0.2,
      tools: {
        bash: true,
        write: true,
        edit: false,
      },
    }));
    expect(config.mode).toEqual({
      build: {
        description: 'Legacy build agent',
        mode: 'primary',
      },
    });
    expect(config.tools).toEqual({
      'legacy-tool': false,
    });
    expect(config.formatter).toEqual({
      biome: {
        disabled: true,
      },
    });
  });

  it('updates command config entries while preserving command and top-level unknown fields', async () => {
    await manager.write({
      command: {
        test: {
          template: 'Run tests',
          description: 'Run tests',
          customPlaceholder: '{{vault_path}}',
        },
        fmt: {
          template: 'Format files',
        },
      },
      watcher: {
        ignore: ['dist/**'],
      },
    });

    await manager.upsertCommandConfig(' test ', {
      description: 'Run the focused test suite',
      agent: 'build',
    });
    await manager.removeCommandConfig('fmt');

    const config = await manager.read();
    expect(await manager.getCommandConfig()).toEqual({
      test: {
        template: 'Run tests',
        description: 'Run the focused test suite',
        customPlaceholder: '{{vault_path}}',
        agent: 'build',
      },
    });
    expect(config.command).toEqual({
      test: {
        template: 'Run tests',
        description: 'Run the focused test suite',
        customPlaceholder: '{{vault_path}}',
        agent: 'build',
      },
    });
    expect(config.watcher).toEqual({
      ignore: ['dist/**'],
    });
  });

});

describe('OpencodeConfigManager paths', () => {
    it('should return correct config directory path', () => {
      const dir = manager.getConfigDir();
      expect(dir).toBe(path.join(testVaultPath, '.opencode'));
    });

    it('should return correct config file path', () => {
      const configPath = manager.getConfigPath();
      expect(configPath).toBe(path.join(testVaultPath, '.opencode', 'opencode.json'));
    });

    it('should return correct plugin directory path', () => {
      expect(manager.getPluginDir()).toBe(path.join(testVaultPath, '.opencode', 'plugins'));
    });
  });

describe('OpencodeConfigManager formatter config', () => {
  it('returns undefined when no formatter config exists', async () => {
    expect(await manager.getFormatterConfig()).toBeUndefined();
  });

  it('reads boolean false formatter config', async () => {
    await manager.write({ formatter: false });
    expect(await manager.getFormatterConfig()).toBe(false);
  });

  it('reads object formatter config with entries', async () => {
    await manager.write({
      formatter: {
        prettier: {
          disabled: true,
        },
        'custom-fmt': {
          command: ['deno', 'fmt', '$FILE'],
          extensions: ['.md'],
        },
      },
    });

    const config = await manager.getFormatterConfig();
    expect(config).toEqual({
      prettier: { disabled: true },
      'custom-fmt': { command: ['deno', 'fmt', '$FILE'], extensions: ['.md'] },
    });
  });

  it('updateFormatterConfig writes formatter: false', async () => {
    await manager.updateFormatterConfig(false);
    const config = await manager.read();
    expect(config.formatter).toBe(false);
  });

  it('updateFormatterConfig writes formatter object', async () => {
    await manager.updateFormatterConfig({
      prettier: { disabled: true },
      biome: { command: ['npx', '@biomejs/biome', 'format', '--write', '$FILE'] },
    });

    const config = await manager.read();
    expect(config.formatter).toEqual({
      prettier: { disabled: true },
      biome: { command: ['npx', '@biomejs/biome', 'format', '--write', '$FILE'] },
    });
  });

  it('updateFormatterConfig deletes formatter field when passed null', async () => {
    await manager.write({ formatter: false });
    await manager.updateFormatterConfig(null);

    const config = await manager.read();
    expect(config.formatter).toBeUndefined();
  });

  it('updateFormatterConfig deletes formatter field when passed undefined', async () => {
    await manager.write({ formatter: { biome: { disabled: true } } });
    await manager.updateFormatterConfig(undefined);

    const config = await manager.read();
    expect(config.formatter).toBeUndefined();
  });

  it('updateFormatterConfig preserves explicit empty object formatter config', async () => {
    await manager.write({ formatter: { biome: { disabled: true } } });
    await manager.updateFormatterConfig({});

    const config = await manager.read();
    expect(config.formatter).toEqual({});
  });

  it('updateFormatterConfig uses exact write (not deep merge), allowing entry deletion', async () => {
    await manager.write({
      formatter: {
        prettier: { disabled: true },
        biome: { command: ['biome', 'format', '--write', '$FILE'] },
        ruff: { disabled: true },
      },
    });

    // Update with only prettier — biome and ruff should be gone
    await manager.updateFormatterConfig({
      prettier: { disabled: false },
    });

    const config = await manager.read();
    expect(config.formatter).toEqual({
      prettier: { disabled: false },
    });
  });

  it('formatter config preserves unrelated top-level fields', async () => {
    await manager.write({
      provider: { demo: { name: 'Demo' } },
      formatter: { biome: { disabled: true } },
      watcher: { ignore: ['dist/**'] },
    });

    await manager.updateFormatterConfig({ prettier: { disabled: true } });

    const config = await manager.read();
    expect(config.provider?.demo?.name).toBe('Demo');
    expect(config.watcher).toEqual({ ignore: ['dist/**'] });
    expect(config.formatter).toEqual({ prettier: { disabled: true } });
  });

  it('formatter config preserves unknown entry fields', async () => {
    await manager.write({
      formatter: {
        prettier: {
          disabled: true,
          futureField: 'should-be-preserved',
        },
      },
    });

    const config = await manager.getFormatterConfig();
    expect(config).toEqual({
      prettier: {
        disabled: true,
        futureField: 'should-be-preserved',
      },
    });
  });

  it('formatter config preserves environment variables', async () => {
    await manager.updateFormatterConfig({
      prettier: {
        command: ['npx', 'prettier', '--write', '$FILE'],
        environment: { NODE_ENV: 'development', BUN_BE_BUN: '1' },
        extensions: ['.js', '.ts'],
      },
    });

    const config = await manager.getFormatterConfig();
    expect(config).toEqual({
      prettier: {
        command: ['npx', 'prettier', '--write', '$FILE'],
        environment: { NODE_ENV: 'development', BUN_BE_BUN: '1' },
        extensions: ['.js', '.ts'],
      },
    });
  });

  it('formatter update preserves unknown fields round-trip through write and read', async () => {
    await manager.updateFormatterConfig({
      prettier: {
        disabled: false,
        futureField: 'keep-me',
        nestedUnknown: { deep: true },
      },
    });

    const readback = await manager.getFormatterConfig();
    expect(readback).toEqual({
      prettier: {
        disabled: false,
        futureField: 'keep-me',
        nestedUnknown: { deep: true },
      },
    });
  });

  it('formatter update exact-write removes entries not in the new value while keeping unknown fields on surviving entries', async () => {
    await manager.updateFormatterConfig({
      prettier: { disabled: true, futureField: 'keep' },
      biome: { command: ['biome', 'fmt', '$FILE'] },
    });

    await manager.updateFormatterConfig({
      prettier: { disabled: false, futureField: 'keep' },
    });

    const config = await manager.getFormatterConfig();
    expect(config).toEqual({
      prettier: { disabled: false, futureField: 'keep' },
    });
  });

  it('formatter update writes boolean false while preserving other top-level config', async () => {
    await manager.write({
      provider: { demo: { name: 'Demo' } },
      formatter: { prettier: { disabled: true } },
    });

    await manager.updateFormatterConfig(false);

    const config = await manager.read();
    expect(config.formatter).toBe(false);
    expect(config.provider?.demo?.name).toBe('Demo');
  });
});
