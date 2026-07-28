import * as fs from 'fs';
import * as path from 'path';

export interface CodexCliResolverEnv {
  PATH?: string;
  Path?: string;
  path?: string;
  HOME?: string;
  USERPROFILE?: string;
  APPDATA?: string;
}

export interface CodexCliResolverOptions {
  executablePath: string;
  env?: CodexCliResolverEnv;
  platform?: NodeJS.Platform;
  arch?: string;
  existsSync?: (candidate: string) => boolean;
}

export type CodexCliResolution =
  | {
    mode: 'available';
    executablePath: string;
    source: 'configured' | 'path' | 'windows-npm-shim';
  }
  | {
    mode: 'missing';
    reason: 'configured-path-not-found' | 'cli-not-on-path';
    configuredPath?: string;
  };

function getPathApi(platform: NodeJS.Platform): typeof path {
  return platform === 'win32' ? path.win32 : path;
}

function getPathValue(env: CodexCliResolverEnv): string {
  return [env.PATH, env.Path, env.path]
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?? '';
}

function getPathDelimiter(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : ':';
}

function expandHomeDirectory(candidate: string, env: CodexCliResolverEnv, pathApi: typeof path): string {
  const home = env.HOME || env.USERPROFILE;
  if (!home || (candidate !== '~' && !candidate.startsWith('~/') && !candidate.startsWith('~\\'))) {
    return candidate;
  }
  return candidate === '~' ? home : pathApi.join(home, candidate.slice(2));
}

function getPathFallbacks(
  env: CodexCliResolverEnv,
  platform: NodeJS.Platform,
  pathApi: typeof path,
): string[] {
  const home = env.HOME || env.USERPROFILE || '';
  if (platform === 'win32') {
    return [
      env.APPDATA ? pathApi.join(env.APPDATA, 'npm') : '',
      home ? pathApi.join(home, 'AppData', 'Roaming', 'npm') : '',
    ].filter(Boolean);
  }
  return [
    home ? pathApi.join(home, '.local', 'bin') : '',
    home ? pathApi.join(home, '.npm-global', 'bin') : '',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
  ].filter(Boolean);
}

function getSearchDirectories(
  env: CodexCliResolverEnv,
  platform: NodeJS.Platform,
  pathApi: typeof path,
): string[] {
  const pathEntries = getPathValue(env)
    .split(getPathDelimiter(platform))
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set([...pathEntries, ...getPathFallbacks(env, platform, pathApi)])];
}

function getWindowsPlatformPackage(arch: string): { packageName: string; targetTriple: string } | null {
  if (arch === 'x64') {
    return { packageName: '@openai/codex-win32-x64', targetTriple: 'x86_64-pc-windows-msvc' };
  }
  if (arch === 'arm64') {
    return { packageName: '@openai/codex-win32-arm64', targetTriple: 'aarch64-pc-windows-msvc' };
  }
  return null;
}

function resolveWindowsNpmShim(
  shimPath: string,
  arch: string,
  existsSync: (candidate: string) => boolean,
  pathApi: typeof path,
): string | null {
  const platformPackage = getWindowsPlatformPackage(arch);
  if (!platformPackage || !existsSync(shimPath)) {
    return null;
  }

  const npmBin = pathApi.dirname(shimPath);
  const packageRoot = pathApi.join(npmBin, 'node_modules', '@openai', 'codex');
  if (!existsSync(pathApi.join(packageRoot, 'package.json'))) {
    return null;
  }

  const nativeExecutable = pathApi.join(
    npmBin,
    'node_modules',
    ...platformPackage.packageName.split('/'),
    'vendor',
    platformPackage.targetTriple,
    'bin',
    'codex.exe',
  );
  return existsSync(nativeExecutable) ? nativeExecutable : null;
}

function resolveConfiguredPath(
  configuredPath: string,
  options: {
    env: CodexCliResolverEnv;
    platform: NodeJS.Platform;
    arch: string;
    existsSync: (candidate: string) => boolean;
    pathApi: typeof path;
  },
): string | null {
  const expanded = expandHomeDirectory(configuredPath, options.env, options.pathApi);
  const candidates = options.pathApi.isAbsolute(expanded)
    ? [expanded]
    : getSearchDirectories(options.env, options.platform, options.pathApi)
      .map((directory) => options.pathApi.join(directory, expanded));

  for (const candidate of candidates) {
    if (options.platform === 'win32' && /\.cmd$/i.test(candidate)) {
      const nativeExecutable = resolveWindowsNpmShim(candidate, options.arch, options.existsSync, options.pathApi);
      if (nativeExecutable) {
        return nativeExecutable;
      }
      continue;
    }
    if (options.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveCodexCli(options: CodexCliResolverOptions): CodexCliResolution {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const env = options.env ?? process.env;
  const existsSync = options.existsSync ?? fs.existsSync;
  const pathApi = getPathApi(platform);
  const configuredPath = options.executablePath.trim();

  if (configuredPath) {
    const executablePath = resolveConfiguredPath(configuredPath, {
      env,
      platform,
      arch,
      existsSync,
      pathApi,
    });
    return executablePath
      ? { mode: 'available', executablePath, source: configuredPath.toLowerCase().endsWith('.cmd') ? 'windows-npm-shim' : 'configured' }
      : { mode: 'missing', reason: 'configured-path-not-found', configuredPath };
  }

  const directories = getSearchDirectories(env, platform, pathApi);
  for (const directory of directories) {
    if (platform === 'win32') {
      const nativeExecutable = pathApi.join(directory, 'codex.exe');
      if (existsSync(nativeExecutable)) {
        return { mode: 'available', executablePath: nativeExecutable, source: 'path' };
      }
      const shimExecutable = resolveWindowsNpmShim(pathApi.join(directory, 'codex.cmd'), arch, existsSync, pathApi);
      if (shimExecutable) {
        return { mode: 'available', executablePath: shimExecutable, source: 'windows-npm-shim' };
      }
      continue;
    }

    const executablePath = pathApi.join(directory, 'codex');
    if (existsSync(executablePath)) {
      return { mode: 'available', executablePath, source: 'path' };
    }
  }

  return { mode: 'missing', reason: 'cli-not-on-path' };
}

export function getCodexCliErrorMessage(resolution: Extract<CodexCliResolution, { mode: 'missing' }>): string {
  if (resolution.reason === 'configured-path-not-found') {
    return `Configured Codex executable was not found: ${resolution.configuredPath ?? '(empty path)'}. Correct the path or clear it to auto-detect Codex.`;
  }
  return 'Codex CLI was not found. Install it with "npm install -g @openai/codex", then reload OpenCodian.';
}
