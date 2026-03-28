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

export interface PluginEntry {
  kind: PluginEntryKind;
  scope: PluginEntryScope;
  source: PluginEntrySource;
  specifier: string;
  displayName: string;
  fullPath?: string;
  options?: OpencodePluginOptions;
}

export interface PluginDirectorySnapshot {
  scope: PluginEntryScope;
  path: string;
  exists: boolean;
  files: string[];
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
  globalDirectories: PluginDirectorySnapshot[];
  projectDirectories: PluginDirectorySnapshot[];
  globalInfluenceDetected: boolean;
  omoConfigPath: string;
  omoConfigExists: boolean;
}

const DIRECTORY_PLUGIN_FOLDERS = ['plugin', 'plugins'] as const;
const DIRECTORY_PLUGIN_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs']);
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
  ): Promise<PluginEnvironmentSnapshot> {
    const [globalConfig, projectConfig, globalDirectories, projectDirectories] = await Promise.all([
      this.readConfigFile(this.getGlobalConfigPath()),
      this.configManager.read(),
      this.listDirectoryPlugins(this.globalConfigDir, 'global'),
      this.listDirectoryPlugins(this.configManager.getConfigDir(), 'project'),
    ]);

    const globalConfigPlugins = this.extractConfigPlugins(globalConfig, 'global');
    const projectConfigPlugins = this.extractConfigPlugins(projectConfig, 'project');
    const globalDirectoryPlugins = this.flattenDirectoryPlugins(globalDirectories, 'global');
    const projectDirectoryPlugins = this.flattenDirectoryPlugins(projectDirectories, 'project');
    const omoConfigPath = this.getProjectOmoConfigPath();

    return {
      serviceMode,
      isolationMode,
      vaultConfigDir: this.configManager.getConfigDir(),
      globalConfigPath: this.getGlobalConfigPath(),
      projectConfigPath: this.configManager.getConfigPath(),
      globalConfigSpecs: Array.isArray(globalConfig.plugin) ? [...globalConfig.plugin] : [],
      projectConfigSpecs: Array.isArray(projectConfig.plugin) ? [...projectConfig.plugin] : [],
      globalConfigPlugins,
      globalDirectoryPlugins,
      projectConfigPlugins,
      projectDirectoryPlugins,
      globalDirectories,
      projectDirectories,
      globalInfluenceDetected: globalConfigPlugins.length > 0 || globalDirectoryPlugins.length > 0,
      omoConfigPath,
      omoConfigExists: fs.existsSync(omoConfigPath),
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

  getProjectOmoConfigRelativePath(): string {
    return '.opencode/oh-my-opencode.jsonc';
  }

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

  private getGlobalConfigPath(): string {
    return path.join(this.globalConfigDir, 'opencode.json');
  }

  private async readConfigFile(targetPath: string): Promise<OpencodeConfig> {
    if (!fs.existsSync(targetPath)) {
      return {};
    }

    const content = await fs.promises.readFile(targetPath, 'utf-8');
    return parseOpencodeConfigText(content);
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
          };
        }

        const directoryEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
        const files = directoryEntries
          .filter((entry) => entry.isFile() && DIRECTORY_PLUGIN_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
          .map((entry) => path.join(folderPath, entry.name))
          .sort((left, right) => left.localeCompare(right));

        return {
          scope,
          path: folderPath,
          exists: true,
          files,
        };
      }),
    );

    return snapshots;
  }

  private extractConfigPlugins(config: OpencodeConfig, scope: PluginEntryScope): PluginEntry[] {
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
      }];
    });
  }

  private flattenDirectoryPlugins(
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
      }))
    );
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
