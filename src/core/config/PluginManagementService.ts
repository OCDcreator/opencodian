import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  OpencodeConfig,
  OpencodePluginOptions,
  OpencodePluginSpec,
  PluginIsolationMode,
  ServerMode,
} from '../types';
import { parseOpencodeConfigText } from './modelConfig';
import { OpencodeConfigManager } from './OpencodeConfigManager';

export type PluginEntryKind = 'npm' | 'local';
export type PluginEntryScope = 'global' | 'project';
export type PluginEntrySource = 'config' | 'directory';

export interface PluginEntryProvenance {
  sourcePath: string;
}

export interface PluginEntry {
  kind: PluginEntryKind;
  scope: PluginEntryScope;
  source: PluginEntrySource;
  specifier: string;
  displayName: string;
  fullPath?: string;
  options?: OpencodePluginOptions;
  disabled: boolean;
  provenance?: PluginEntryProvenance;
}

export type PluginConfigSourceScope = 'global' | 'project';

export interface PluginConfigSourceSnapshot {
  scope: PluginConfigSourceScope;
  path: string;
  exists: boolean;
  editable: boolean;
  specs: OpencodePluginSpec[];
  plugins: PluginEntry[];
  error?: string;
}

export interface PluginDirectorySnapshot {
  scope: PluginEntryScope;
  path: string;
  exists: boolean;
  files: string[];
  disabledFiles: string[];
}

export interface PluginEnvironmentSnapshot {
  serviceMode: ServerMode;
  isolationMode: PluginIsolationMode;
  vaultConfigDir: string;
  globalConfigPath: string;
  projectConfigPath: string;
  globalConfigSpecs: OpencodePluginSpec[];
  projectConfigSpecs: OpencodePluginSpec[];
  globalConfigPlugins: PluginEntry[];
  globalDirectoryPlugins: PluginEntry[];
  projectConfigPlugins: PluginEntry[];
  projectDirectoryPlugins: PluginEntry[];
  disabledProjectConfigPlugins: PluginEntry[];
  disabledProjectDirectoryPlugins: PluginEntry[];
  globalDirectories: PluginDirectorySnapshot[];
  projectDirectories: PluginDirectorySnapshot[];
  globalInfluenceDetected: boolean;
  omoConfigPath: string;
  omoConfigExists: boolean;
  configSources?: PluginConfigSourceSnapshot[];
}

const DIRECTORY_PLUGIN_FOLDERS = ['plugin', 'plugins'] as const;
const DIRECTORY_PLUGIN_EXTENSIONS = new Set(['.js', '.ts']);
const DISABLED_EXTENSION_SUFFIX = '.disabled';
const DEFAULT_OMO_TEMPLATE = `{
  // Project-level oh-my-opencode config
}
`;

export class PluginManagementService {
  private readonly configManager: OpencodeConfigManager;
  private readonly globalConfigDir: string;

  constructor(
    private readonly vaultPath: string,
    options: { globalConfigDir?: string } = {},
  ) {
    this.configManager = new OpencodeConfigManager(vaultPath);
    this.globalConfigDir = options.globalConfigDir ?? path.join(os.homedir(), '.config', 'opencode');
  }

  async inspect(
    serviceMode: ServerMode,
    isolationMode: PluginIsolationMode,
    disabledPluginSpecs: readonly string[] = [],
  ): Promise<PluginEnvironmentSnapshot> {
    const globalConfigPath = this.getGlobalConfigPath();
    const projectConfigPath = this.configManager.getConfigPath();

    const [globalDirectories, projectDirectories, configSources] = await Promise.all([
      this.listDirectoryPlugins(this.globalConfigDir, 'global'),
      this.listDirectoryPlugins(this.configManager.getConfigDir(), 'project'),
      this.inventoryConfigSources(),
    ]);

    const globalSource = configSources.find((source) => source.path === globalConfigPath);
    const projectConfigDir = this.configManager.getConfigDir();
    const projectSources = configSources.filter((source) => source.exists && (
      source.path === path.join(projectConfigDir, 'opencode.json')
      || source.path === path.join(projectConfigDir, 'opencode.jsonc')
    ));
    const projectSource = projectSources.length === 1 ? projectSources[0] : undefined;

    const globalConfigPlugins = globalSource?.plugins ?? [];
    const projectConfigPlugins = projectSource?.plugins ?? [];
    const globalDirectoryPlugins = this.flattenActiveDirectoryPlugins(globalDirectories, 'global');
    const projectDirectoryPlugins = this.flattenActiveDirectoryPlugins(projectDirectories, 'project');
    const disabledProjectDirectoryPlugins = this.flattenDisabledDirectoryPlugins(projectDirectories, 'project');
    const disabledProjectConfigPlugins = this.parseDisabledSpecEntries(disabledPluginSpecs);
    const omoConfigPath = this.getProjectOmoConfigPath();

    return {
      serviceMode,
      isolationMode,
      vaultConfigDir: this.configManager.getConfigDir(),
      globalConfigPath,
      projectConfigPath: projectSource?.path ?? projectConfigPath,
      globalConfigSpecs: globalSource?.specs ?? [],
      projectConfigSpecs: projectSource?.specs ?? [],
      globalConfigPlugins,
      globalDirectoryPlugins,
      projectConfigPlugins,
      projectDirectoryPlugins,
      disabledProjectConfigPlugins,
      disabledProjectDirectoryPlugins,
      globalDirectories,
      projectDirectories,
      globalInfluenceDetected: this.detectGlobalInfluence(configSources, globalDirectories),
      omoConfigPath,
      omoConfigExists: fs.existsSync(omoConfigPath),
      configSources,
    };
  }

  async updateProjectConfigPlugins(plugins: OpencodePluginSpec[]): Promise<void> {
    await this.configManager.updatePluginConfig(plugins);
  }

  async ensureProjectPluginDirectory(): Promise<string> {
    const targetDir = path.join(this.configManager.getConfigDir(), 'plugins');
    await fs.promises.mkdir(targetDir, { recursive: true });
    return targetDir;
  }

  async ensureProjectOmoConfig(): Promise<string> {
    const targetPath = this.getProjectOmoConfigPath();
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    if (!fs.existsSync(targetPath)) {
      await fs.promises.writeFile(targetPath, DEFAULT_OMO_TEMPLATE, 'utf-8');
    }
    return targetPath;
  }

  getProjectOmoConfigPath(): string {
    return path.join(this.configManager.getConfigDir(), 'oh-my-opencode.jsonc');
  }

  getProjectOmoConfigRelativePath(): string { return '.opencode/oh-my-opencode.jsonc'; }

  formatPluginSpec(spec: OpencodePluginSpec): string {
    return typeof spec === 'string' ? spec : JSON.stringify(spec);
  }

  parsePluginSpecLines(text: string): OpencodePluginSpec[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        if (!line.startsWith('[')) {
          return line;
        }

        const parsed = JSON.parse(line) as unknown;
        if (
          Array.isArray(parsed)
          && parsed.length === 2
          && typeof parsed[0] === 'string'
          && parsed[1]
          && typeof parsed[1] === 'object'
          && !Array.isArray(parsed[1])
        ) {
          return [parsed[0], parsed[1] as OpencodePluginOptions];
        }

        throw new Error(`Invalid plugin tuple: ${line}`);
      });
  }

  // ---------------------------------------------------------------------------
  // Enable / disable / install / uninstall
  // ---------------------------------------------------------------------------

  /**
   * Compute the next `disabledPluginSpecs` array after toggling config-based
   * plugin entries.  Callers should persist the returned array into settings
   * and separately call `updateProjectConfigPlugins()` to keep the config
   * file in sync.
   */
  applyConfigPluginAvailabilityChange(
    disabledPluginSpecs: readonly string[],
    serializedSpecs: readonly string[],
    enabled: boolean,
  ): string[] {
    const next = new Set(disabledPluginSpecs);
    for (const spec of serializedSpecs) {
      if (enabled) {
        next.delete(spec);
      } else {
        next.add(spec);
      }
    }
    return [...next].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Toggle a directory-based plugin by renaming its file extension.
   *
   * - To **disable**: append `.disabled` to the file.
   * - To **enable**: strip the `.disabled` suffix.
   *
   * Throws if the destination path already exists (collision guard).
   */
  async toggleDirectoryPlugin(filePath: string, enabled: boolean): Promise<string> {
    if (enabled) {
      // Enable: strip .disabled suffix
      if (!filePath.endsWith(DISABLED_EXTENSION_SUFFIX)) {
        return filePath;
      }
      const activePath = filePath.slice(0, -DISABLED_EXTENSION_SUFFIX.length);
      if (fs.existsSync(activePath)) {
        throw new Error(`Cannot enable plugin: ${path.basename(activePath)} already exists`);
      }
      await fs.promises.rename(filePath, activePath);
      return activePath;
    }

    // Disable: append .disabled suffix
    if (filePath.endsWith(DISABLED_EXTENSION_SUFFIX)) {
      return filePath;
    }
    const disabledPath = filePath + DISABLED_EXTENSION_SUFFIX;
    if (fs.existsSync(disabledPath)) {
      throw new Error(`Cannot disable plugin: ${path.basename(disabledPath)} already exists`);
    }
    await fs.promises.rename(filePath, disabledPath);
    return disabledPath;
  }

  /**
   * Install a plugin by adding its spec to the project config's `plugin[]`
   * array.  The caller should also remove it from `disabledPluginSpecs` if
   * it was previously disabled.
   */
  async installConfigPlugin(spec: OpencodePluginSpec): Promise<void> {
    const config = await this.configManager.read();
    const plugins: OpencodePluginSpec[] = Array.isArray(config.plugin) ? [...config.plugin] : [];

    // Avoid duplicates (compare serialized form)
    const serialized = this.formatPluginSpec(spec);
    const alreadyPresent = plugins.some((p) => this.formatPluginSpec(p) === serialized);
    if (!alreadyPresent) {
      plugins.push(spec);
    }
    await this.configManager.updatePluginConfig(plugins);
  }

  /**
   * Uninstall a config-based plugin by removing its spec from the project
   * config's `plugin[]` array.  The caller should also remove it from
   * `disabledPluginSpecs`.
   */
  async uninstallConfigPlugin(serializedSpec: string): Promise<void> {
    const config = await this.configManager.read();
    if (!Array.isArray(config.plugin)) {
      return;
    }

    const plugins = config.plugin.filter(
      (p) => this.formatPluginSpec(p) !== serializedSpec,
    );
    await this.configManager.updatePluginConfig(plugins);
  }

  /**
   * Delete a directory-based plugin file from disk.
   */
  async deleteDirectoryPlugin(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getGlobalConfigPath(): string { return path.join(this.globalConfigDir, 'opencode.json'); }

  private getGlobalConfigCandidatePaths(): string[] {
    return [
      path.join(this.globalConfigDir, 'config.json'),
      path.join(this.globalConfigDir, 'opencode.json'),
      path.join(this.globalConfigDir, 'opencode.jsonc'),
    ];
  }

  private getProjectConfigCandidatePaths(): Array<{ path: string; editable: boolean }> {
    const configDir = this.configManager.getConfigDir();
    return [
      { path: path.join(this.vaultPath, 'opencode.json'), editable: false },
      { path: path.join(this.vaultPath, 'opencode.jsonc'), editable: false },
      { path: path.join(configDir, 'opencode.json'), editable: true },
      { path: path.join(configDir, 'opencode.jsonc'), editable: true },
    ];
  }

  private async inventoryConfigSources(): Promise<PluginConfigSourceSnapshot[]> {
    const globalSources = await Promise.all(
      this.getGlobalConfigCandidatePaths().map((candidatePath) =>
        this.readConfigSource(candidatePath, 'global', false),
      ),
    );

    const projectSources = await Promise.all(
      this.getProjectConfigCandidatePaths().map((candidate) =>
        this.readConfigSource(candidate.path, 'project', candidate.editable),
      ),
    );

    return [...globalSources, ...projectSources];
  }

  private async readConfigSource(
    targetPath: string,
    scope: PluginConfigSourceScope,
    editable: boolean,
  ): Promise<PluginConfigSourceSnapshot> {
    if (!fs.existsSync(targetPath)) {
      return {
        scope,
        path: targetPath,
        exists: false,
        editable,
        specs: [],
        plugins: [],
      };
    }

    try {
      const content = await fs.promises.readFile(targetPath, 'utf-8');
      const config = parseOpencodeConfigText(content);
      const specs = Array.isArray(config.plugin) ? [...config.plugin] : [];
      const plugins = this.extractConfigPlugins(config, scope as PluginEntryScope, targetPath);
      return {
        scope,
        path: targetPath,
        exists: true,
        editable,
        specs,
        plugins,
      };
    } catch (error) {
      return {
        scope,
        path: targetPath,
        exists: true,
        editable,
        specs: [],
        plugins: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private detectGlobalInfluence(
    configSources: PluginConfigSourceSnapshot[],
    globalDirectories: PluginDirectorySnapshot[],
  ): boolean {
    const anyGlobalConfigPlugin = configSources.some(
      (source) => source.scope === 'global' && source.plugins.length > 0,
    );
    const anyGlobalDirectoryPlugin = globalDirectories.some(
      (directory) => directory.files.length > 0,
    );
    return anyGlobalConfigPlugin || anyGlobalDirectoryPlugin;
  }

  private async listDirectoryPlugins(
    configDir: string,
    scope: PluginEntryScope,
  ): Promise<PluginDirectorySnapshot[]> {
    const snapshots = await Promise.all(
      DIRECTORY_PLUGIN_FOLDERS.map(async (folderName) => {
        const folderPath = path.join(configDir, folderName);
        if (!fs.existsSync(folderPath)) {
          return {
            scope,
            path: folderPath,
            exists: false,
            files: [],
            disabledFiles: [],
          };
        }

        const directoryEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
        const files: string[] = [];
        const disabledFiles: string[] = [];

        for (const entry of directoryEntries) {
          if (!entry.isFile()) {
            continue;
          }
          const fullPath = path.join(folderPath, entry.name);
          const ext = path.extname(entry.name).toLowerCase();

          if (DIRECTORY_PLUGIN_EXTENSIONS.has(ext)) {
            files.push(fullPath);
          } else if (ext === DISABLED_EXTENSION_SUFFIX || entry.name.includes(DISABLED_EXTENSION_SUFFIX)) {
            // Only treat as a disabled plugin if the base name (before
            // `.disabled`) has a recognized plugin extension.
            const disabledSuffixIndex = entry.name.lastIndexOf(DISABLED_EXTENSION_SUFFIX);
            if (disabledSuffixIndex > 0) {
              const baseName = entry.name.slice(0, disabledSuffixIndex);
              const baseExt = path.extname(baseName).toLowerCase();
              if (DIRECTORY_PLUGIN_EXTENSIONS.has(baseExt)) {
                disabledFiles.push(fullPath);
              }
            }
          }
        }

        files.sort((a, b) => a.localeCompare(b));
        disabledFiles.sort((a, b) => a.localeCompare(b));

        return {
          scope,
          path: folderPath,
          exists: true,
          files,
          disabledFiles,
        };
      }),
    );

    return snapshots;
  }

  private extractConfigPlugins(
    config: OpencodeConfig,
    scope: PluginEntryScope,
    sourcePath: string,
  ): PluginEntry[] {
    if (!Array.isArray(config.plugin)) {
      return [];
    }

    return config.plugin.flatMap((pluginSpec) => {
      const parsed = this.parseConfigPlugin(pluginSpec);
      if (!parsed) {
        return [];
      }

      return [{
        kind: this.classifySpecifier(parsed.specifier),
        scope,
        source: 'config' as const,
        specifier: parsed.specifier,
        displayName: parsed.specifier,
        options: parsed.options,
        disabled: false,
        provenance: { sourcePath },
      }];
    });
  }

  private flattenActiveDirectoryPlugins(
    directories: PluginDirectorySnapshot[],
    scope: PluginEntryScope,
  ): PluginEntry[] {
    return directories.flatMap((directory) =>
      directory.files.map((filePath) => ({
        kind: 'local' as const,
        scope,
        source: 'directory' as const,
        specifier: filePath,
        displayName: path.basename(filePath),
        fullPath: filePath,
        disabled: false,
      }))
    );
  }

  private flattenDisabledDirectoryPlugins(
    directories: PluginDirectorySnapshot[],
    scope: PluginEntryScope,
  ): PluginEntry[] {
    return directories.flatMap((directory) =>
      directory.disabledFiles.map((filePath) => ({
        kind: 'local' as const,
        scope,
        source: 'directory' as const,
        specifier: filePath,
        displayName: path.basename(filePath).replace(/\.disabled$/, ''),
        fullPath: filePath,
        disabled: true,
      }))
    );
  }

  private parseDisabledSpecEntries(disabledPluginSpecs: readonly string[]): PluginEntry[] {
    return disabledPluginSpecs.map((serialized) => {
      let specifier = serialized;
      let options: OpencodePluginOptions | undefined;

      if (serialized.startsWith('[')) {
        try {
          const parsed = JSON.parse(serialized) as unknown;
          if (
            Array.isArray(parsed)
            && parsed.length === 2
            && typeof parsed[0] === 'string'
            && parsed[1]
            && typeof parsed[1] === 'object'
            && !Array.isArray(parsed[1])
          ) {
            specifier = parsed[0];
            options = parsed[1] as OpencodePluginOptions;
          }
        } catch {
          // Invalid JSON tuple – treat entire string as specifier
        }
      }

      return {
        kind: this.classifySpecifier(specifier),
        scope: 'project' as const,
        source: 'config' as const,
        specifier,
        displayName: specifier,
        options,
        disabled: true,
      };
    });
  }

  private parseConfigPlugin(
    pluginSpec: unknown,
  ): { specifier: string; options?: OpencodePluginOptions } | null {
    if (typeof pluginSpec === 'string') {
      return { specifier: pluginSpec };
    }

    if (
      Array.isArray(pluginSpec)
      && pluginSpec.length === 2
      && typeof pluginSpec[0] === 'string'
      && pluginSpec[1]
      && typeof pluginSpec[1] === 'object'
      && !Array.isArray(pluginSpec[1])
    ) {
      return {
        specifier: pluginSpec[0],
        options: pluginSpec[1] as OpencodePluginOptions,
      };
    }

    return null;
  }

  private classifySpecifier(specifier: string): PluginEntryKind {
    if (
      specifier.startsWith('file://')
      || specifier.startsWith('./')
      || specifier.startsWith('../')
      || specifier.startsWith('~/')
      || specifier.startsWith('~\\')
      || path.isAbsolute(specifier)
      || /^[A-Za-z]:[\\/]/.test(specifier)
    ) {
      return 'local';
    }

    return 'npm';
  }
}
