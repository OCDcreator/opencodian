import * as fs from 'fs';
import * as path from 'path';

import { OpencodeConfigManager } from '../../../../src/core/config/OpencodeConfigManager';
import { PluginManagementService } from '../../../../src/core/config/PluginManagementService';

describe('PluginManagementService', () => {
  const testRoot = path.join(__dirname, 'plugin-management-fixtures');
  const testHome = path.join(testRoot, 'home');
  const testVault = path.join(testRoot, 'vault');

  beforeEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
    fs.mkdirSync(testHome, { recursive: true });
    fs.mkdirSync(testVault, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  it('inspects global and project plugin sources', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(path.join(globalConfigDir, 'plugins'), { recursive: true });
    fs.writeFileSync(
      path.join(globalConfigDir, 'opencode.json'),
      JSON.stringify({
        plugin: [
          'opencode-global-plugin',
          ['oh-my-opencode', { profile: 'global' }],
        ],
      }, null, 2),
      'utf-8',
    );
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'global-local.ts'), 'export default {};', 'utf-8');

    const configManager = new OpencodeConfigManager(testVault);
    await configManager.updatePluginConfig([
      'opencode-project-plugin',
      ['./plugins/project-custom.ts', { enabled: true }],
    ]);
    fs.mkdirSync(configManager.getPluginDir(), { recursive: true });
    fs.writeFileSync(path.join(configManager.getPluginDir(), 'project-local.js'), 'module.exports = {};', 'utf-8');

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    expect(snapshot.globalConfigPlugins.map((item) => item.specifier)).toEqual([
      'opencode-global-plugin',
      'oh-my-opencode',
    ]);
    expect(snapshot.globalConfigPlugins[1].options).toEqual({ profile: 'global' });
    expect(snapshot.globalDirectoryPlugins.map((item) => item.displayName)).toEqual(['global-local.ts']);
    expect(snapshot.projectConfigPlugins.map((item) => item.specifier)).toEqual([
      'opencode-project-plugin',
      './plugins/project-custom.ts',
    ]);
    expect(snapshot.projectConfigPlugins[1].kind).toBe('local');
    expect(snapshot.projectDirectoryPlugins.map((item) => item.displayName)).toEqual(['project-local.js']);
    expect(snapshot.disabledProjectConfigPlugins).toEqual([]);
    expect(snapshot.disabledProjectDirectoryPlugins).toEqual([]);
    expect(snapshot.globalInfluenceDetected).toBe(true);
  });

  it('only inspects the official plural plugins directories', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(path.join(globalConfigDir, 'plugin'), { recursive: true });
    fs.mkdirSync(path.join(globalConfigDir, 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(globalConfigDir, 'plugin', 'legacy-global.js'), 'export default {};', 'utf-8');
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'global-local.js'), 'export default {};', 'utf-8');

    const configManager = new OpencodeConfigManager(testVault);
    fs.mkdirSync(path.join(configManager.getConfigDir(), 'plugin'), { recursive: true });
    fs.mkdirSync(configManager.getPluginDir(), { recursive: true });
    fs.writeFileSync(
      path.join(configManager.getConfigDir(), 'plugin', 'legacy-project.js'),
      'export default {};',
      'utf-8',
    );
    fs.writeFileSync(path.join(configManager.getPluginDir(), 'project-local.js'), 'export default {};', 'utf-8');

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    expect(snapshot.globalDirectories.map((directory) => directory.path)).toEqual([
      path.join(globalConfigDir, 'plugins'),
    ]);
    expect(snapshot.projectDirectories.map((directory) => directory.path)).toEqual([
      configManager.getPluginDir(),
    ]);
    expect(snapshot.globalDirectoryPlugins.map((item) => item.displayName)).toEqual(['global-local.js']);
    expect(snapshot.projectDirectoryPlugins.map((item) => item.displayName)).toEqual(['project-local.js']);
    expect(snapshot.globalDirectories.map((directory) => directory.disabledFiles)).toEqual([[]]);
    expect(snapshot.projectDirectories.map((directory) => directory.disabledFiles)).toEqual([[]]);
    expect(snapshot.disabledProjectConfigPlugins).toEqual([]);
    expect(snapshot.disabledProjectDirectoryPlugins).toEqual([]);
  });

  it('creates the project OMO config file', async () => {
    const service = new PluginManagementService(testVault, {
      globalConfigDir: path.join(testHome, '.config', 'opencode'),
    });

    const targetPath = await service.ensureProjectOmoConfig();

    expect(fs.existsSync(targetPath)).toBe(true);
    expect(targetPath).toBe(path.join(testVault, '.opencode', 'oh-my-opencode.jsonc'));
  });

  it('parses plain and tuple plugin spec lines', () => {
    const service = new PluginManagementService(testVault, {
      globalConfigDir: path.join(testHome, '.config', 'opencode'),
    });

    expect(
      service.parsePluginSpecLines('opencode-plugin\n["oh-my-opencode", {"profile":"vault"}]'),
    ).toEqual([
      'opencode-plugin',
      ['oh-my-opencode', { profile: 'vault' }],
    ]);
  });
});
