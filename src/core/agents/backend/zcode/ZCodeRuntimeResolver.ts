/**
 * ZCodeRuntimeResolver — locate the official ZCode runtime and produce the
 * exact spawn shape for its `app-server --stdio` structured protocol.
 *
 * Resolution mirrors the official host's command resolution
 * (`resolveZCodeAgentCommand` in the ZCode desktop): a full command override,
 * a deployed native binary, or the `electron-node` bundle run under an
 * Electron runtime. Nothing here spawns a process or touches ZCode desktop
 * UI; the adapter owns the process, this module only decides what to run.
 */

import * as os from 'node:os';

import * as fs from 'fs';
import * as path from 'path';

/** How the resolved entry must be executed. */
export type ZCodeRuntimeEntryKind =
  /** Native `zcode-agent(.exe)` binary — spawn it directly. */
  | 'native-binary'
  /** `zcode.cjs` node bundle — run under an Electron/Node JS runtime. */
  | 'node-bundle';

/** Where the resolved runtime came from (for honest diagnostics). */
export type ZCodeRuntimeSource =
  | 'configured'
  | 'agent-server-command'
  | 'glm-binary-path'
  | 'agent-workdir'
  | 'app-bundled';

/** Everything the transport needs to spawn the official app-server. */
export interface ZCodeRuntimeLaunch {
  readonly command: string;
  readonly args: readonly string[];
  readonly entryKind: ZCodeRuntimeEntryKind;
  readonly entryPath: string;
  readonly source: ZCodeRuntimeSource;
  readonly extraEnv: Record<string, string>;
}

export type ZCodeRuntimeResolution =
  | { readonly mode: 'ready'; readonly launch: ZCodeRuntimeLaunch }
  | {
      readonly mode: 'missing';
      readonly reason: 'configured-path-not-found' | 'runtime-not-found';
      readonly configuredPath?: string;
      readonly searched: readonly string[];
    }
  | {
      readonly mode: 'incompatible';
      readonly reason: 'entry-shape-unsupported' | 'invalid-server-command-args';
      readonly detail: string;
    };

export interface ZCodeRuntimeResolverOptions {
  /** Settings `executablePath` override: binary, `zcode.cjs`, or a directory. */
  executablePath?: string;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  homedir?: string;
  existsSync?: (candidate: string) => boolean;
  /** JS runtime fallback for node bundles when no app Electron host is found. */
  nodeCommand?: string;
}

const SPAWN_ARGS = ['app-server', '--stdio'] as const;
const NATIVE_BINARY_NAME = 'zcode-agent';
const NODE_BUNDLE_NAME = 'zcode.cjs';

function getPathApi(platform: NodeJS.Platform): typeof path {
  return platform === 'win32' ? path.win32 : path;
}

function expandHomeDirectory(candidate: string, env: Record<string, string | undefined>, home: string, pathApi: typeof path): string {
  if (candidate === '~') {
    return home;
  }
  if (candidate.startsWith('~/') || candidate.startsWith('~\\')) {
    return pathApi.join(home, candidate.slice(2));
  }
  return candidate;
}

function platformBinaryName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? `${NATIVE_BINARY_NAME}.exe` : NATIVE_BINARY_NAME;
}

/**
 * Order inside one directory mirrors `resolveEntrySegments` /
 * `resolveNodeBundleSegments`: the native binary first, then the node bundle.
 */
function findEntryInDirectory(
  directory: string,
  options: { platform: NodeJS.Platform; pathApi: typeof path; existsSync: (candidate: string) => boolean },
): { entryPath: string; entryKind: ZCodeRuntimeEntryKind } | null {
  const nativeCandidate = options.pathApi.join(directory, platformBinaryName(options.platform));
  if (options.existsSync(nativeCandidate)) {
    return { entryPath: nativeCandidate, entryKind: 'native-binary' };
  }
  const bundleCandidate = options.pathApi.join(directory, NODE_BUNDLE_NAME);
  if (options.existsSync(bundleCandidate)) {
    return { entryPath: bundleCandidate, entryKind: 'node-bundle' };
  }
  return null;
}

/**
 * App-bundled runtime locations per platform (the `glm` resource directory
 * the official desktop ships next to its app). Not machine-specific: the
 * platform home / standard install roots only.
 */
function getAppBundledSearchDirectories(options: {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
  pathApi: typeof path;
}): string[] {
  const { platform, home, env, pathApi } = options;
  if (platform === 'darwin') {
    return [
      '/Applications/ZCode.app/Contents/Resources/glm',
      pathApi.join(home, 'Applications', 'ZCode.app', 'Contents', 'Resources', 'glm'),
    ];
  }
  if (platform === 'win32') {
    const localAppData = env['LOCALAPPDATA'] ?? pathApi.join(home, 'AppData', 'Local');
    const programFiles = env['PROGRAMFILES'] ?? 'C:\\Program Files';
    const programFilesX86 = env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    return [
      pathApi.join(localAppData, 'Programs', 'ZCode', 'resources', 'glm'),
      pathApi.join(programFiles, 'ZCode', 'resources', 'glm'),
      pathApi.join(programFilesX86, 'ZCode', 'resources', 'glm'),
    ];
  }
  return [
    '/opt/ZCode/resources/glm',
    '/usr/lib/zcode/resources/glm',
    pathApi.join(home, '.local', 'opt', 'zcode', 'resources', 'glm'),
    pathApi.join(home, '.local', 'share', 'zcode', 'resources', 'glm'),
  ];
}

/** Resolve the installed desktop bundle that owns TaskIndexRepo, separately from
 * a user-selected app-server CLI. The index remains the official desktop DB. */
export function resolveOfficialZCodeDesktopBundle(
  options: Pick<ZCodeRuntimeResolverOptions, 'env' | 'platform' | 'homedir' | 'existsSync'> = {},
): string | null {
  const platform = options.platform ?? process.platform;
  const pathApi = getPathApi(platform);
  const home = options.homedir ?? os.homedir();
  const env = options.env ?? process.env;
  const existsSync = options.existsSync ?? fs.existsSync;
  for (const directory of getAppBundledSearchDirectories({ platform, home, env, pathApi })) {
    const entry = pathApi.join(directory, NODE_BUNDLE_NAME);
    if (existsSync(entry)) return entry;
  }
  return null;
}

/**
 * Runner for a node-bundle entry. The official `electron-node` runtime is the
 * bundle's own app Electron binary (`ELECTRON_RUN_AS_NODE=1`); plain `node` is
 * the proven fallback. A foreign Electron host (for example the embedding
 * Obsidian binary) must never be used: it ignores `ELECTRON_RUN_AS_NODE` and
 * never reaches the bundle.
 */
function buildNodeBundleLaunch(
  entryPath: string,
  source: ZCodeRuntimeSource,
  options: { platform: NodeJS.Platform; pathApi: typeof path; existsSync: (candidate: string) => boolean },
  resolver: Pick<ZCodeRuntimeResolverOptions, 'nodeCommand'>,
): ZCodeRuntimeLaunch {
  const electronBinary = findAppElectronBinary(entryPath, options);
  if (electronBinary) {
    return {
      command: electronBinary,
      args: [entryPath, ...SPAWN_ARGS],
      entryKind: 'node-bundle',
      entryPath,
      source,
      extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }
  return {
    command: resolver.nodeCommand ?? 'node',
    args: [entryPath, ...SPAWN_ARGS],
    entryKind: 'node-bundle',
    entryPath,
    source,
    extraEnv: {},
  };
}

/**
 * Derive the host app's Electron binary from the bundle location
 * (`<App>.app/Contents/Resources/glm/zcode.cjs` on macOS,
 * `<install>/resources/glm/zcode.cjs` on Windows/Linux).
 */
function findAppElectronBinary(
  entryPath: string,
  options: { platform: NodeJS.Platform; pathApi: typeof path; existsSync: (candidate: string) => boolean },
): string | null {
  const { pathApi, existsSync, platform } = options;
  let root = pathApi.dirname(entryPath); // .../glm
  if (pathApi.basename(root) === 'glm') {
    root = pathApi.dirname(root); // .../Resources or .../resources
  }
  if (platform === 'darwin') {
    if (pathApi.basename(root) !== 'Resources') {
      return null;
    }
    const contentsDir = pathApi.dirname(root); // ZCode.app/Contents
    const appRoot = pathApi.dirname(contentsDir); // ZCode.app
    const appName = pathApi.basename(appRoot).replace(/\.app$/i, '');
    const candidate = pathApi.join(contentsDir, 'MacOS', appName);
    return existsSync(candidate) ? candidate : null;
  }
  if (pathApi.basename(root) === 'resources') {
    const installRoot = pathApi.dirname(root);
    const baseName = pathApi.basename(installRoot);
    const names = platform === 'win32'
      ? [`${baseName}.exe`, 'ZCode.exe', 'zcode.exe']
      : [baseName, 'ZCode', 'zcode'];
    for (const name of names) {
      const candidate = pathApi.join(installRoot, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function buildNativeBinaryLaunch(
  entryPath: string,
  source: ZCodeRuntimeSource,
): ZCodeRuntimeLaunch {
  return {
    command: entryPath,
    args: [...SPAWN_ARGS],
    entryKind: 'native-binary',
    entryPath,
    source,
    extraEnv: {},
  };
}

type AgentServerCommandOverride =
  | { readonly kind: 'none' }
  | { readonly kind: 'override'; readonly launch: ZCodeRuntimeLaunch }
  | { readonly kind: 'invalid'; readonly resolution: ZCodeRuntimeResolution };

function parseAgentServerCommandOverride(
  env: Record<string, string | undefined>,
): AgentServerCommandOverride {
  const command = (env['ZCODE_AGENT_SERVER_COMMAND'] ?? '').trim();
  if (!command) {
    return { kind: 'none' };
  }
  const argsJson = (env['ZCODE_AGENT_SERVER_ARGS_JSON'] ?? '').trim();
  let args: string[] = [...SPAWN_ARGS];
  if (argsJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(argsJson);
    } catch {
      return { kind: 'invalid', resolution: { mode: 'incompatible', reason: 'invalid-server-command-args', detail: 'ZCODE_AGENT_SERVER_ARGS_JSON is not valid JSON.' } };
    }
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
      return { kind: 'invalid', resolution: { mode: 'incompatible', reason: 'invalid-server-command-args', detail: 'ZCODE_AGENT_SERVER_ARGS_JSON must be a JSON array of strings.' } };
    }
    args = parsed as string[];
  }
  return {
    kind: 'override',
    launch: {
      command,
      args,
      entryKind: 'native-binary',
      entryPath: command,
      source: 'agent-server-command',
      extraEnv: {},
    },
  };
}

function isNodeBundlePath(candidate: string, pathApi: typeof path): boolean {
  const extension = pathApi.extname(candidate).toLowerCase();
  return extension === '.cjs' || extension === '.mjs' || extension === '.js';
}

interface ResolutionContext {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
  pathApi: typeof path;
  existsSync: (candidate: string) => boolean;
}

function resolveConfiguredOverride(
  configuredPath: string,
  context: ResolutionContext,
  resolver: ZCodeRuntimeResolverOptions,
  searched: string[],
): ZCodeRuntimeResolution {
  const { env, home, pathApi, existsSync } = context;
  const expanded = expandHomeDirectory(configuredPath, env, home, pathApi);
  if (!existsSync(expanded)) {
    searched.push(expanded);
    return { mode: 'missing', reason: 'configured-path-not-found', configuredPath, searched };
  }
  const entry = findEntryInDirectory(expanded, context)
    ?? (isNodeBundlePath(expanded, pathApi)
      ? { entryPath: expanded, entryKind: 'node-bundle' as const }
      // Any other existing file is treated as the native runtime entry.
      : { entryPath: expanded, entryKind: 'native-binary' as const });
  return { mode: 'ready', launch: entry.entryKind === 'native-binary'
    ? buildNativeBinaryLaunch(entry.entryPath, 'configured')
    : buildNodeBundleLaunch(entry.entryPath, 'configured', context, resolver) };
}

function resolveDirectoryEntryLaunch(
  directory: string,
  source: ZCodeRuntimeSource,
  context: ResolutionContext,
  resolver: ZCodeRuntimeResolverOptions,
): ZCodeRuntimeLaunch | null {
  const entry = findEntryInDirectory(directory, context);
  if (!entry) {
    return null;
  }
  return entry.entryKind === 'native-binary'
    ? buildNativeBinaryLaunch(entry.entryPath, source)
    : buildNodeBundleLaunch(entry.entryPath, source, context, resolver);
}

/**
 * Resolve the ZCode runtime. Never spawns a process; the adapter owns the
 * process lifecycle and all protocol traffic.
 */
export function resolveZCodeRuntime(options: ZCodeRuntimeResolverOptions = {}): ZCodeRuntimeResolution {
  const context: ResolutionContext = {
    platform: options.platform ?? process.platform,
    env: options.env ?? process.env,
    home: options.homedir ?? os.homedir(),
    pathApi: getPathApi(options.platform ?? process.platform),
    existsSync: options.existsSync ?? fs.existsSync,
  };
  const { env, home, pathApi, existsSync } = context;
  const searched: string[] = [];

  // 1. Settings override: native binary, node bundle, or directory of either.
  // An explicit user choice outranks inherited environment overrides.
  const configuredPath = (options.executablePath ?? '').trim();
  if (configuredPath) {
    return resolveConfiguredOverride(configuredPath, context, options, searched);
  }

  // 2. Official full command override.
  const commandOverride = parseAgentServerCommandOverride(env);
  if (commandOverride.kind === 'override') {
    return { mode: 'ready', launch: commandOverride.launch };
  }
  if (commandOverride.kind === 'invalid') {
    return commandOverride.resolution;
  }

  // 3. Deployed native binary override.
  const glmBinaryPath = (env['GLM_BINARY_PATH'] ?? '').trim();
  if (glmBinaryPath) {
    const expanded = expandHomeDirectory(glmBinaryPath, env, home, pathApi);
    if (existsSync(expanded)) {
      return { mode: 'ready', launch: buildNativeBinaryLaunch(expanded, 'glm-binary-path') };
    }
    searched.push(expanded);
  }

  // 4. Prepared agent workdir, then 5. app-bundled `glm` resource directories.
  const agentWorkdir = (env['ZCODE_AGENT_WORKDIR'] ?? '').trim();
  const directoryCandidates: Array<{ directory: string; source: ZCodeRuntimeSource }> = [];
  if (agentWorkdir) {
    directoryCandidates.push({
      directory: expandHomeDirectory(agentWorkdir, env, home, pathApi),
      source: 'agent-workdir',
    });
  }
  for (const directory of getAppBundledSearchDirectories({ platform: context.platform, home, env, pathApi })) {
    directoryCandidates.push({ directory, source: 'app-bundled' });
  }
  for (const { directory, source } of directoryCandidates) {
    searched.push(directory);
    const launch = resolveDirectoryEntryLaunch(directory, source, context, options);
    if (launch) {
      return { mode: 'ready', launch };
    }
  }

  return { mode: 'missing', reason: 'runtime-not-found', searched };
}

/** Actionable diagnostic for a failed resolution (same spirit as the official runtime's missing-binary guidance). */
export function getZCodeRuntimeErrorMessage(resolution: Extract<ZCodeRuntimeResolution, { mode: 'missing' | 'incompatible' }>): string {
  if (resolution.mode === 'incompatible') {
    return `ZCode runtime is present but incompatible: ${resolution.detail}`;
  }
  if (resolution.reason === 'configured-path-not-found') {
    return `Configured ZCode runtime was not found: ${resolution.configuredPath ?? '(empty path)'}. Correct the path or clear it to auto-detect the official ZCode installation.`;
  }
  return 'ZCode runtime was not found. Install the official ZCode app (or set ZCODE_AGENT_WORKDIR / GLM_BINARY_PATH), then reload OpenCodian.';
}
