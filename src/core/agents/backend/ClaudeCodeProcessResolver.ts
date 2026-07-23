import * as fs from 'fs';
import * as path from 'path';

import type { ClaudeCodeBackendSettings } from '../../types';

export interface ClaudeCodeProcessResolverEnv {
  PATH?: string;
  Path?: string;
  path?: string;
  HOME?: string;
  USERPROFILE?: string;
  APPDATA?: string;
  LOCALAPPDATA?: string;
}

export interface ClaudeCodeProcessResolverOptions {
  settings: ClaudeCodeBackendSettings;
  env?: ClaudeCodeProcessResolverEnv;
  platform?: NodeJS.Platform;
  existsSync?: (candidate: string) => boolean;
}

export interface ClaudeCodeProcessResolution {
  mode: 'external' | 'missing';
  pathToClaudeCodeExecutable?: string;
  env: NodeJS.ProcessEnv;
  shell: boolean;
  diagnostics: {
    configuredPath: string | null;
    resolvedExternalPath: string | null;
    pathAugmented: boolean;
    /**
     * Actionable reason for the current mode. Lets status surfaces tell the
     * user exactly what to do next (configure a path, enable a source, install
     * the CLI). Only populated for actionable situations.
     */
    reason?: ClaudeCodeProcessMissingReason;
  };
}

/**
 * Why the Claude process could not be resolved to an external CLI. Consumers
 * map these to actionable status/settings copy. This never reports a path the
 * plugin could write to under `~/.claude`, `~/.agents`, or `~/.codex` — the
 * plugin must not manage global Claude resources.
 */
export type ClaudeCodeProcessMissingReason =
  /** A path was configured in settings but the file does not exist there. */
  | 'configured-path-not-found'
  /** No path configured and the `claude` CLI was not found on the augmented PATH. */
  | 'cli-not-on-path';

function expandHomeDirectory(candidate: string, env: ClaudeCodeProcessResolverEnv): string {
  const home = env.HOME || env.USERPROFILE;
  if (!home) {
    return candidate;
  }
  if (candidate === '~') {
    return home;
  }
  if (candidate.startsWith('~/') || candidate.startsWith('~\\')) {
    return path.join(home, candidate.slice(2));
  }
  return candidate;
}

function getPathDelimiter(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : path.delimiter;
}

function getPathValue(env: ClaudeCodeProcessResolverEnv): string {
  return [env.PATH, env.Path, env.path]
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?? '';
}

function getPathFallbacks(env: ClaudeCodeProcessResolverEnv, platform: NodeJS.Platform): string[] {
  const home = env.HOME || env.USERPROFILE || '';
  if (platform === 'win32') {
    return [
      env.APPDATA ? path.join(env.APPDATA, 'npm') : '',
      env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Programs', 'Claude') : '',
      env.USERPROFILE ? path.join(env.USERPROFILE, 'bin') : '',
    ].filter(Boolean);
  }

  return [
    home ? path.join(home, '.claude', 'local') : '',
    home ? path.join(home, '.local', 'bin') : '',
    home ? path.join(home, '.npm-global', 'bin') : '',
    home ? path.join(home, '.nvm', 'current', 'bin') : '',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
  ].filter(Boolean);
}

function getAugmentedPath(env: ClaudeCodeProcessResolverEnv, platform: NodeJS.Platform): string {
  const delimiter = getPathDelimiter(platform);
  const entries = getPathValue(env)
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  entries.push(...getPathFallbacks(env, platform));
  return [...new Set(entries)].join(delimiter);
}

function getDefaultClaudeCliCandidates(platform: NodeJS.Platform): string[] {
  return platform === 'win32'
    ? ['claude', 'claude.exe']
    : ['claude'];
}

export function resolveExecutableCandidate(
  configuredPath: string,
  options: {
    env: ClaudeCodeProcessResolverEnv;
    existsSync: (candidate: string) => boolean;
    platform: NodeJS.Platform;
  },
): string | null {
  const candidate = expandHomeDirectory(configuredPath.trim(), options.env);
  if (!candidate) {
    return null;
  }

  if (path.isAbsolute(candidate)) {
    return options.existsSync(candidate) ? candidate : null;
  }

  const delimiter = getPathDelimiter(options.platform);
  const entries = getAugmentedPath(options.env, options.platform)
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const extensions = options.platform === 'win32' && !path.extname(candidate)
    ? ['.cmd', '.exe', '.bat', '']
    : [''];

  for (const entry of entries) {
    for (const extension of extensions) {
      const resolved = path.join(entry, `${candidate}${extension}`);
      if (options.existsSync(resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

export function resolveClaudeCodeProcess(
  options: ClaudeCodeProcessResolverOptions,
): ClaudeCodeProcessResolution {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const existsSync = options.existsSync ?? fs.existsSync;
  const configuredPath = options.settings.executablePath.trim();
  const augmentedPath = getAugmentedPath(env, platform);
  const spawnEnv: NodeJS.ProcessEnv = { ...env };
  if (augmentedPath) {
    spawnEnv.PATH = augmentedPath;
  }

  const resolvedExternalPath = configuredPath
    ? resolveExecutableCandidate(configuredPath, { env, existsSync, platform })
    : getDefaultClaudeCliCandidates(platform)
      .map((candidate) => resolveExecutableCandidate(candidate, { env, existsSync, platform }))
      .find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
      ?? null;

  let reason: ClaudeCodeProcessMissingReason | undefined;
  if (!resolvedExternalPath) {
    reason = configuredPath ? 'configured-path-not-found' : 'cli-not-on-path';
  }

  return {
    mode: resolvedExternalPath ? 'external' : 'missing',
    ...(resolvedExternalPath ? { pathToClaudeCodeExecutable: resolvedExternalPath } : {}),
    env: spawnEnv,
    shell: platform === 'win32'
      && typeof resolvedExternalPath === 'string'
      && /\.(cmd|bat)$/i.test(resolvedExternalPath),
    diagnostics: {
      configuredPath: configuredPath || null,
      resolvedExternalPath,
      pathAugmented: augmentedPath !== getPathValue(env),
      ...(reason ? { reason } : {}),
    },
  };
}
