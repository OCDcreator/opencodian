/**
 * ZCodeProviderConfigDiscovery — discover and inject the provider
 * configuration the official ZCode runtime requires at startup.
 *
 * The runtime's own entry-based lookup only checks
 * `<entry-dir>/provider/zcode-builtin.json` and a source-tree-relative
 * `config/provider/` path — neither exists in a packaged install (the real
 * file lives at `<resources>/config/provider/zcode-builtin.json`). The
 * official host contract therefore injects the pair
 * `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` + `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`
 * (the runtime rejects providing only one of the two). OpenCodian discovers
 * those paths rather than hard-coding a machine-only location, validates the
 * builtin file read-only, and never writes the user's configuration.
 */

import * as os from 'node:os';

import * as fs from 'fs';
import * as path from 'path';

export type ZCodeProviderConfigState =
  /** Builtin config validated; personal config validated or absent (runtime-managed). */
  | 'validated'
  /** No builtin provider config discoverable — the pair cannot be injected. */
  | 'missing'
  /** A config file exists but could not be read. */
  | 'unreadable'
  /** A config file exists but is not a JSON object. */
  | 'malformed';

export interface ZCodeProviderConfigSnapshot {
  readonly dataRoot: string;
  /** Personal provider config path (the runtime's own file; may not exist yet). */
  readonly configPath: string;
  readonly builtinConfigPath: string | null;
  readonly state: ZCodeProviderConfigState;
  /** Count of provider entries in the personal config, only when it is readable. */
  readonly providerCount: number | null;
  /** Actionable diagnostic for non-validated states. */
  readonly detail: string | null;
  /** Environment to inject into the owned app-server process. */
  readonly env: Record<string, string>;
}

export interface ZCodeProviderConfigDiscoveryOptions {
  env?: Record<string, string | undefined>;
  homedir?: string;
  platform?: NodeJS.Platform;
  readFile?: (filePath: string) => string;
  existsSync?: (candidate: string) => boolean;
  /** Resolved runtime entry path (bundle or native binary); anchors app-relative discovery. */
  entryPath?: string;
}

/**
 * Resolve the ZCode data root exactly like the official runtime does:
 * `ZCODE_STORAGE_DIR` when set, otherwise `~/.zcode` (beta channel uses
 * `~/.zcode-beta`).
 */
export function resolveZCodeDataRoot(options: Pick<ZCodeProviderConfigDiscoveryOptions, 'env' | 'homedir'> = {}): string {
  const env = options.env ?? process.env;
  const home = options.homedir ?? os.homedir();
  const explicit = (env['ZCODE_STORAGE_DIR'] ?? '').trim();
  if (explicit) {
    return explicit;
  }
  const isBeta = env['ZCODE_BETA'] === '1' || env['ZCODE_ENV'] === 'beta';
  return path.join(home, isBeta ? '.zcode-beta' : '.zcode');
}

/**
 * Candidates for the builtin provider config, app-relative first:
 * an entry inside `<resources>/glm/` anchors `<resources>/config/provider/`,
 * then the standard install roots per platform.
 */
function getBuiltinConfigCandidates(options: {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
  pathApi: typeof path;
  entryPath?: string;
}): string[] {
  const { platform, home, env, pathApi, entryPath } = options;
  const candidates: string[] = [];
  const explicit = (env['ZCODE_BUILTIN_PROVIDER_CONFIG_FILE'] ?? '').trim();
  if (explicit) {
    candidates.push(explicit);
  }
  if (entryPath) {
    const entryDir = pathApi.dirname(entryPath);
    // `<resources>/glm/<entry>` → `<resources>/config/provider/zcode-builtin.json`
    candidates.push(pathApi.join(entryDir, '..', 'config', 'provider', 'zcode-builtin.json'));
    candidates.push(pathApi.join(entryDir, 'provider', 'zcode-builtin.json'));
  }
  if (platform === 'darwin') {
    candidates.push('/Applications/ZCode.app/Contents/Resources/config/provider/zcode-builtin.json');
    candidates.push(pathApi.join(home, 'Applications', 'ZCode.app', 'Contents', 'Resources', 'config', 'provider', 'zcode-builtin.json'));
  } else if (platform === 'win32') {
    const localAppData = env['LOCALAPPDATA'] ?? pathApi.join(home, 'AppData', 'Local');
    const programFiles = env['PROGRAMFILES'] ?? 'C:\\Program Files';
    const programFilesX86 = env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    candidates.push(pathApi.join(localAppData, 'Programs', 'ZCode', 'resources', 'config', 'provider', 'zcode-builtin.json'));
    candidates.push(pathApi.join(programFiles, 'ZCode', 'resources', 'config', 'provider', 'zcode-builtin.json'));
    candidates.push(pathApi.join(programFilesX86, 'ZCode', 'resources', 'config', 'provider', 'zcode-builtin.json'));
  } else {
    candidates.push('/opt/ZCode/resources/config/provider/zcode-builtin.json');
    candidates.push('/usr/lib/zcode/resources/config/provider/zcode-builtin.json');
    candidates.push(pathApi.join(home, '.local', 'opt', 'zcode', 'resources', 'config', 'provider', 'zcode-builtin.json'));
    candidates.push(pathApi.join(home, '.local', 'share', 'zcode', 'resources', 'config', 'provider', 'zcode-builtin.json'));
  }
  return candidates;
}

type JsonConfigCheck = 'ok' | 'unreadable' | 'malformed';

function checkJsonObjectConfig(
  readFile: (filePath: string) => string,
  existsSync: (candidate: string) => boolean,
  filePath: string,
): JsonConfigCheck {
  if (!existsSync(filePath)) {
    return 'unreadable';
  }
  let contents: string;
  try {
    contents = readFile(filePath);
  } catch {
    return 'unreadable';
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return 'malformed';
  }
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? 'ok' : 'malformed';
}

interface PersonalConfigReport {
  state: 'validated' | 'missing' | 'unreadable' | 'malformed';
  providerCount: number | null;
}

/**
 * Count provider rules via the formal schema
 * (`config.providerConfigRules.providerRules`). Unrecognized shapes report
 * `null` (count unavailable) — an unknown must never surface as a fabricated
 * count like 0.
 */
function countProviderRules(parsed: Record<string, unknown>): number | null {
  const config = parsed['config'];
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return null;
  }
  const rules = (config as Record<string, unknown>)['providerConfigRules'];
  if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
    return null;
  }
  const providerRules = (rules as Record<string, unknown>)['providerRules'];
  return Array.isArray(providerRules) ? providerRules.length : null;
}

function describePersonalConfig(
  readFile: (filePath: string) => string,
  existsSync: (candidate: string) => boolean,
  personalPath: string,
): PersonalConfigReport {
  // Absent is a supported first-run state (the runtime manages the file
  // itself); unreadable/malformed blocks the pair injection.
  if (!existsSync(personalPath)) {
    return { state: 'missing', providerCount: null };
  }
  let contents: string;
  try {
    contents = readFile(personalPath);
  } catch {
    return { state: 'unreadable', providerCount: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { state: 'malformed', providerCount: null };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { state: 'malformed', providerCount: null };
  }
  return { state: 'validated', providerCount: countProviderRules(parsed as Record<string, unknown>) };
}

/**
 * Discover and validate the provider configuration. Read-only: this never
 * creates, mutates, or repairs the user's configuration. The injection pair
 * is emitted only complete — the runtime rejects half of it.
 */
export function discoverZCodeProviderConfig(options: ZCodeProviderConfigDiscoveryOptions = {}): ZCodeProviderConfigSnapshot {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homedir ?? os.homedir();
  const pathApi = platform === 'win32' ? path.win32 : path;
  const readFile = options.readFile ?? ((filePath: string) => fs.readFileSync(filePath, 'utf8'));
  const existsSync = options.existsSync ?? fs.existsSync;

  const dataRoot = resolveZCodeDataRoot({ env, homedir: home });
  const dataBaseDir = (env['ZCODE_DATA_BASE_DIR'] ?? '').trim() || home;
  const personalPath = (env['ZCODE_PERSONAL_PROVIDER_CONFIG_FILE'] ?? '').trim()
    || pathApi.join(dataBaseDir, '.zcode', 'v2', 'provider_config.json');
  const storageEnv = { ZCODE_STORAGE_DIR: dataRoot };

  const builtinCandidates = getBuiltinConfigCandidates({
    platform,
    home,
    env,
    pathApi,
    ...(options.entryPath ? { entryPath: options.entryPath } : {}),
  });
  const builtinPath = builtinCandidates.find((candidate) => existsSync(candidate)) ?? null;

  if (!builtinPath) {
    return {
      dataRoot,
      configPath: personalPath,
      builtinConfigPath: null,
      state: 'missing',
      providerCount: null,
      detail: `ZCode builtin provider configuration not found (looked in: ${builtinCandidates.join(', ')}). Point ZCODE_BUILTIN_PROVIDER_CONFIG_FILE at zcode-builtin.json or install the official ZCode app.`,
      env: storageEnv,
    };
  }

  const builtinCheck = checkJsonObjectConfig(readFile, existsSync, builtinPath);
  if (builtinCheck !== 'ok') {
    return {
      dataRoot,
      configPath: personalPath,
      builtinConfigPath: builtinPath,
      state: builtinCheck === 'malformed' ? 'malformed' : 'unreadable',
      providerCount: null,
      detail: `ZCode builtin provider configuration is not readable JSON: ${builtinPath}. Repair the ZCode installation; OpenCodian never rewrites this file.`,
      env: storageEnv,
    };
  }

  const personal = describePersonalConfig(readFile, existsSync, personalPath);
  if (personal.state === 'malformed' || personal.state === 'unreadable') {
    return {
      dataRoot,
      configPath: personalPath,
      builtinConfigPath: builtinPath,
      state: personal.state,
      providerCount: null,
      detail: `ZCode personal provider configuration is ${personal.state}: ${personalPath}. Fix or regenerate it from the official ZCode app; OpenCodian never rewrites this file.`,
      env: storageEnv,
    };
  }

  return {
    dataRoot,
    configPath: personalPath,
    builtinConfigPath: builtinPath,
    state: 'validated',
    providerCount: personal.providerCount,
    detail: null,
    env: {
      ...storageEnv,
      // The runtime requires both halves of the pair or neither.
      ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: builtinPath,
      ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: personalPath,
    },
  };
}
