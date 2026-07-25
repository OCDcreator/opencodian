/* eslint-disable max-lines-per-function -- Plugin management tests share directory/config fixtures across discovery, provenance, and malformed-source scenarios. */

import * as fs from 'fs';
import * as path from 'path';

import { OpencodeConfigManager } from '../../../../src/core/config/OpencodeConfigManager';
import { PluginManagementService } from '../../../../src/core/config/PluginManagementService';

describe('PluginManagementService', () => {
  const testRoot = path.join(__dirname, 'plugin-management-fixtures');
  const testHome = path.join(testRoot, 'home');
  const testVault = path.join(testRoot, 'vault');
  const createConfigManager = (): OpencodeConfigManager => new OpencodeConfigManager(testVault, {
    archiveRootPath: path.join(testRoot, 'archive'),
  });

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

    const configManager = createConfigManager();
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

  it('discovers both singular plugin/ and plural plugins/ directories', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(path.join(globalConfigDir, 'plugin'), { recursive: true });
    fs.mkdirSync(path.join(globalConfigDir, 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(globalConfigDir, 'plugin', 'singular-global.ts'), 'export default {};', 'utf-8');
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'plural-global.js'), 'export default {};', 'utf-8');

    const configManager = createConfigManager();
    fs.mkdirSync(path.join(configManager.getConfigDir(), 'plugin'), { recursive: true });
    fs.mkdirSync(configManager.getPluginDir(), { recursive: true });
    fs.writeFileSync(
      path.join(configManager.getConfigDir(), 'plugin', 'singular-project.ts'),
      'export default {};',
      'utf-8',
    );
    fs.writeFileSync(path.join(configManager.getPluginDir(), 'plural-project.js'), 'export default {};', 'utf-8');

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    expect(snapshot.globalDirectories.map((directory) => directory.path)).toEqual([
      path.join(globalConfigDir, 'plugin'),
      path.join(globalConfigDir, 'plugins'),
    ]);
    expect(snapshot.projectDirectories.map((directory) => directory.path)).toEqual([
      path.join(configManager.getConfigDir(), 'plugin'),
      configManager.getPluginDir(),
    ]);
    expect(snapshot.globalDirectoryPlugins.map((item) => item.displayName)).toEqual([
      'singular-global.ts',
      'plural-global.js',
    ]);
    expect(snapshot.projectDirectoryPlugins.map((item) => item.displayName)).toEqual([
      'singular-project.ts',
      'plural-project.js',
    ]);
    expect(snapshot.globalDirectories.map((directory) => directory.disabledFiles)).toEqual([[], []]);
    expect(snapshot.projectDirectories.map((directory) => directory.disabledFiles)).toEqual([[], []]);
    expect(snapshot.disabledProjectConfigPlugins).toEqual([]);
    expect(snapshot.disabledProjectDirectoryPlugins).toEqual([]);
  });

  it('ignores .mjs, .cjs, subdirectories, and unrelated disabled files', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(path.join(globalConfigDir, 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'accepted.ts'), 'export default {};', 'utf-8');
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'accepted.js'), 'export default {};', 'utf-8');
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'ignored.mjs'), 'export default {};', 'utf-8');
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'ignored.cjs'), 'module.exports = {};', 'utf-8');
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'active.ts.disabled'), 'export default {};', 'utf-8');
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'active.js.disabled'), 'export default {};', 'utf-8');
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'ignored.mjs.disabled'), 'export default {};', 'utf-8');
    fs.mkdirSync(path.join(globalConfigDir, 'plugins', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'nested', 'ignored.ts'), 'export default {};', 'utf-8');

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    const globalDir = snapshot.globalDirectories[1]; // plugins/
    expect(globalDir.files.map((f) => path.basename(f))).toEqual(['accepted.js', 'accepted.ts']);
    expect(globalDir.disabledFiles.map((f) => path.basename(f))).toEqual([
      'active.js.disabled',
      'active.ts.disabled',
    ]);
    expect(snapshot.globalDirectoryPlugins.map((item) => item.displayName)).toEqual([
      'accepted.js',
      'accepted.ts',
    ]);
  });

  it('inventories all known config source files separately with provenance', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(globalConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalConfigDir, 'config.json'),
      JSON.stringify({ plugin: ['global-config-json'] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(globalConfigDir, 'opencode.json'),
      JSON.stringify({ plugin: ['global-opencode-json'] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(globalConfigDir, 'opencode.jsonc'),
      JSON.stringify({ plugin: ['global-opencode-jsonc'] }),
      'utf-8',
    );

    fs.writeFileSync(
      path.join(testVault, 'opencode.json'),
      JSON.stringify({ plugin: ['vault-root-json'] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(testVault, 'opencode.jsonc'),
      JSON.stringify({ plugin: ['vault-root-jsonc'] }),
      'utf-8',
    );
    fs.mkdirSync(path.join(testVault, '.opencode'), { recursive: true });
    fs.writeFileSync(
      path.join(testVault, '.opencode', 'opencode.jsonc'),
      JSON.stringify({ plugin: ['vault-opencode-jsonc'] }),
      'utf-8',
    );

    const configManager = createConfigManager();
    await configManager.updatePluginConfig(['vault-opencode-json']);

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    expect(snapshot.configSources).toHaveLength(7);
    const byPath = new Map(snapshot.configSources.map((s) => [s.path, s]));

    // Global sources (deterministic order: config.json, opencode.json, opencode.jsonc)
    const globalConfigJson = byPath.get(path.join(globalConfigDir, 'config.json'))!;
    expect(globalConfigJson.scope).toBe('global');
    expect(globalConfigJson.exists).toBe(true);
    expect(globalConfigJson.editable).toBe(false);
    expect(globalConfigJson.specs).toEqual(['global-config-json']);

    const globalOpencodeJson = byPath.get(path.join(globalConfigDir, 'opencode.json'))!;
    expect(globalOpencodeJson.scope).toBe('global');
    expect(globalOpencodeJson.exists).toBe(true);
    expect(globalOpencodeJson.editable).toBe(false);
    expect(globalOpencodeJson.specs).toEqual(['global-opencode-json']);

    const globalOpencodeJsonc = byPath.get(path.join(globalConfigDir, 'opencode.jsonc'))!;
    expect(globalOpencodeJsonc.scope).toBe('global');
    expect(globalOpencodeJsonc.exists).toBe(true);
    expect(globalOpencodeJsonc.editable).toBe(false);
    expect(globalOpencodeJsonc.specs).toEqual(['global-opencode-jsonc']);

    // Vault root sources
    const vaultRootJson = byPath.get(path.join(testVault, 'opencode.json'))!;
    expect(vaultRootJson.scope).toBe('project');
    expect(vaultRootJson.exists).toBe(true);
    expect(vaultRootJson.editable).toBe(false);
    expect(vaultRootJson.specs).toEqual(['vault-root-json']);

    const vaultRootJsonc = byPath.get(path.join(testVault, 'opencode.jsonc'))!;
    expect(vaultRootJsonc.scope).toBe('project');
    expect(vaultRootJsonc.exists).toBe(true);
    expect(vaultRootJsonc.editable).toBe(false);
    expect(vaultRootJsonc.specs).toEqual(['vault-root-jsonc']);

    // Fresh JSONC is the canonical editable source; its legacy JSON sibling is
    // independently inventoried rather than implicitly selected.
    const vaultOpencodeJsonc = byPath.get(configManager.getConfigPath())!;
    expect(vaultOpencodeJsonc.scope).toBe('project');
    expect(vaultOpencodeJsonc.exists).toBe(true);
    expect(vaultOpencodeJsonc.editable).toBe(true);
    expect(vaultOpencodeJsonc.specs).toEqual(['vault-opencode-json']);

    const vaultOpencodeJson = byPath.get(path.join(configManager.getConfigDir(), 'opencode.json'))!;
    expect(vaultOpencodeJson.scope).toBe('project');
    expect(vaultOpencodeJson.exists).toBe(false);
    expect(vaultOpencodeJson.editable).toBe(true);
    expect(vaultOpencodeJson.specs).toEqual([]);

    // Each config-derived plugin entry is attributable to its source path
    expect(vaultOpencodeJsonc.plugins[0].provenance.sourcePath).toBe(configManager.getConfigPath());
    expect(globalConfigJson.plugins[0].provenance.sourcePath).toBe(path.join(globalConfigDir, 'config.json'));
  });

  it('uses the sole project JSONC source for projectConfigSpecs without merging root sources', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(globalConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalConfigDir, 'config.json'),
      JSON.stringify({ plugin: ['global-config-json'] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(globalConfigDir, 'opencode.jsonc'),
      JSON.stringify({ plugin: ['global-opencode-jsonc'] }),
      'utf-8',
    );

    fs.writeFileSync(
      path.join(testVault, 'opencode.json'),
      JSON.stringify({ plugin: ['vault-root-json'] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(testVault, 'opencode.jsonc'),
      JSON.stringify({ plugin: ['vault-root-jsonc'] }),
      'utf-8',
    );
    fs.mkdirSync(path.join(testVault, '.opencode'), { recursive: true });
    fs.writeFileSync(
      path.join(testVault, '.opencode', 'opencode.jsonc'),
      JSON.stringify({ plugin: ['vault-opencode-jsonc'] }),
      'utf-8',
    );

    const configManager = createConfigManager();
    await configManager.updatePluginConfig(['canonical-project-plugin']);

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    expect(snapshot.globalConfigSpecs).toEqual([]);
    expect(snapshot.projectConfigSpecs).toEqual(['canonical-project-plugin']);
    expect(snapshot.globalConfigPlugins.map((p) => p.specifier)).toEqual([]);
    expect(snapshot.projectConfigPlugins.map((p) => p.specifier)).toEqual(['canonical-project-plugin']);

    const byPath = new Map(snapshot.configSources.map((s) => [s.path, s]));
    expect(byPath.get(path.join(testVault, 'opencode.json'))!.specs).toEqual(['vault-root-json']);
    expect(byPath.get(path.join(testVault, 'opencode.jsonc'))!.specs).toEqual(['vault-root-jsonc']);
    expect(byPath.get(configManager.getConfigPath())!.specs).toEqual(['canonical-project-plugin']);
  });

  it('shows coexisting project JSON and JSONC sources without choosing an effective plugin target', async () => {
    const configDir = path.join(testVault, '.opencode');
    fs.mkdirSync(configDir, { recursive: true });
    const legacyPath = path.join(configDir, 'opencode.json');
    const jsoncPath = path.join(configDir, 'opencode.jsonc');
    fs.writeFileSync(legacyPath, JSON.stringify({ plugin: ['legacy-plugin'] }), 'utf-8');
    fs.writeFileSync(jsoncPath, JSON.stringify({ plugin: ['jsonc-plugin'] }), 'utf-8');

    const service = new PluginManagementService(testVault);
    const snapshot = await service.inspect('local', 'default');

    expect(snapshot.projectConfigSpecs).toEqual([]);
    expect(snapshot.projectConfigPlugins).toEqual([]);
    expect(snapshot.configSources?.find((source) => source.path === legacyPath)).toMatchObject({ editable: true, specs: ['legacy-plugin'] });
    expect(snapshot.configSources?.find((source) => source.path === jsoncPath)).toMatchObject({ editable: true, specs: ['jsonc-plugin'] });
    await expect(service.updateProjectConfigPlugins(['must-not-write'])).rejects.toThrow(/ambiguous/i);
    expect(fs.readFileSync(legacyPath, 'utf-8')).toContain('legacy-plugin');
    expect(fs.readFileSync(jsoncPath, 'utf-8')).toContain('jsonc-plugin');
  });

  it('reports a malformed source without hiding valid siblings or crashing inspect', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(globalConfigDir, { recursive: true });
    fs.writeFileSync(path.join(globalConfigDir, 'config.json'), '{ invalid json', 'utf-8');
    fs.writeFileSync(
      path.join(globalConfigDir, 'opencode.json'),
      JSON.stringify({ plugin: ['valid-global-plugin'] }),
      'utf-8',
    );

    const configManager = createConfigManager();
    await configManager.updatePluginConfig(['valid-project-plugin']);

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    const malformedSource = snapshot.configSources.find((s) => s.path === path.join(globalConfigDir, 'config.json'))!;
    expect(malformedSource.exists).toBe(true);
    expect(malformedSource.error).toBeTruthy();
    expect(malformedSource.specs).toEqual([]);
    expect(malformedSource.plugins).toEqual([]);

    const validGlobalSource = snapshot.configSources.find(
      (s) => s.path === path.join(globalConfigDir, 'opencode.json'),
    )!;
    expect(validGlobalSource.error).toBeFalsy();
    expect(validGlobalSource.specs).toEqual(['valid-global-plugin']);

    expect(snapshot.globalConfigSpecs).toEqual(['valid-global-plugin']);
    expect(snapshot.projectConfigSpecs).toEqual(['valid-project-plugin']);
  });

  it('resolves inspect when the legacy global opencode.json is malformed', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(globalConfigDir, { recursive: true });
    fs.writeFileSync(path.join(globalConfigDir, 'opencode.json'), '{ invalid json', 'utf-8');
    fs.writeFileSync(
      path.join(globalConfigDir, 'config.json'),
      JSON.stringify({ plugin: ['fallback-global-plugin'] }),
      'utf-8',
    );

    const configManager = createConfigManager();
    await configManager.updatePluginConfig(['valid-project-plugin']);

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    const malformedLegacyGlobal = snapshot.configSources.find(
      (s) => s.path === path.join(globalConfigDir, 'opencode.json'),
    )!;
    expect(malformedLegacyGlobal.exists).toBe(true);
    expect(malformedLegacyGlobal.error).toBeTruthy();
    expect(malformedLegacyGlobal.specs).toEqual([]);

    // Legacy global arrays are empty because the legacy path is malformed
    expect(snapshot.globalConfigSpecs).toEqual([]);
    expect(snapshot.globalConfigPlugins).toEqual([]);

    // Sibling sources and project sources remain visible
    const fallbackGlobal = snapshot.configSources.find(
      (s) => s.path === path.join(globalConfigDir, 'config.json'),
    )!;
    expect(fallbackGlobal.specs).toEqual(['fallback-global-plugin']);
    expect(snapshot.projectConfigSpecs).toEqual(['valid-project-plugin']);
    expect(snapshot.globalInfluenceDetected).toBe(true);
  });

  it('resolves inspect when the canonical project opencode.json is malformed', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(globalConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalConfigDir, 'opencode.json'),
      JSON.stringify({ plugin: ['valid-global-plugin'] }),
      'utf-8',
    );

    const configManager = createConfigManager();
    await configManager.updatePluginConfig(['canonical-project-plugin']);
    // Corrupt the canonical file after writing it
    fs.writeFileSync(configManager.getConfigPath(), '{ invalid json', 'utf-8');

    // Also write the legacy JSON sibling to prove coexistence stays inventoried
    // without choosing either project source as effective.
    fs.writeFileSync(
      path.join(configManager.getConfigDir(), 'opencode.json'),
      JSON.stringify({ plugin: ['vault-opencode-json'] }),
      'utf-8',
    );

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    const malformedCanonical = snapshot.configSources.find(
      (s) => s.path === configManager.getConfigPath(),
    )!;
    expect(malformedCanonical.exists).toBe(true);
    expect(malformedCanonical.error).toBeTruthy();
    expect(malformedCanonical.specs).toEqual([]);

    expect(snapshot.projectConfigSpecs).toEqual([]);
    expect(snapshot.projectConfigPlugins).toEqual([]);

    const siblingJson = snapshot.configSources.find(
      (s) => s.path === path.join(configManager.getConfigDir(), 'opencode.json'),
    )!;
    expect(siblingJson.specs).toEqual(['vault-opencode-json']);
    expect(snapshot.globalConfigSpecs).toEqual(['valid-global-plugin']);
    expect(snapshot.globalInfluenceDetected).toBe(true);
  });

  it('does not treat disabled-only directory files as global influence', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(path.join(globalConfigDir, 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'active.ts.disabled'), 'export default {};', 'utf-8');
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'active.js.disabled'), 'export default {};', 'utf-8');

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    expect(snapshot.globalDirectories[1].disabledFiles).toHaveLength(2);
    expect(snapshot.globalDirectoryPlugins).toEqual([]);
    expect(snapshot.globalInfluenceDetected).toBe(false);
  });

  it('treats active directory files as global influence', async () => {
    const globalConfigDir = path.join(testHome, '.config', 'opencode');
    fs.mkdirSync(path.join(globalConfigDir, 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(globalConfigDir, 'plugins', 'active.ts'), 'export default {};', 'utf-8');

    const service = new PluginManagementService(testVault, { globalConfigDir });
    const snapshot = await service.inspect('local', 'default');

    expect(snapshot.globalDirectoryPlugins.map((p) => p.displayName)).toEqual(['active.ts']);
    expect(snapshot.globalInfluenceDetected).toBe(true);
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
