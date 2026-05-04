import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { createLogger, getPerformanceTimestampMs } from '../../shared';
import type { ManagedServerState, OpenCodeServerConfig } from './types';

const logger = createLogger('LocalSidecarLauncher');
const LOCAL_SERVER_LOG_TAIL_LIMIT = 80;
const LOCAL_SERVER_SANITIZED_ENV_KEYS = [
  'OPENCODE_CONFIG',
  'OPENCODE_TUI_CONFIG',
  'OPENCODE_CONFIG_DIR',
  'OPENCODE_CONFIG_CONTENT',
  'OPENCODE_PERMISSION',
  'OPENCODE_DISABLE_PROJECT_CONFIG',
  'OPENCODE_PLUGIN_META_FILE',
] as const;

interface LocalServerLaunch {
  proc: ChildProcess;
  outputTail: string[];
  exited: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
  cleanup: () => void;
}

interface LocalServerLaunchSnapshot {
  outputTail: string[];
  exited: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
}

export interface LocalSidecarLaunchRuntimeOptions {
  timeout: number;
  checkHealth: (timeout: number) => Promise<boolean>;
  managedServerStateSnapshot: ManagedServerState | null;
  onProcessError?: (error: Error) => void;
  onProcessExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export interface LocalSidecarLaunchRuntimeResult {
  process: ChildProcess;
  launchStartedAt: number;
  spawnedAt: number;
  healthyAt: number;
}

export class LocalSidecarLauncher {
  private config: OpenCodeServerConfig;
  private workingDirectory: string | undefined;
  private activeLaunch: LocalServerLaunch | null = null;

  constructor(config: OpenCodeServerConfig) {
    this.config = config;
  }

  updateConfig(config: OpenCodeServerConfig): void {
    this.config = config;
  }

  updateWorkingDirectory(workingDirectory: string | undefined): void {
    this.workingDirectory = workingDirectory;
  }

  clearLaunchState(): void {
    this.activeLaunch?.cleanup();
    this.activeLaunch = null;
  }

  async launchRuntime(options: LocalSidecarLaunchRuntimeOptions): Promise<LocalSidecarLaunchRuntimeResult> {
    const launchStartedAt = getPerformanceTimestampMs();
    const process = this.spawnServer(options);
    const spawnedAt = getPerformanceTimestampMs();
    await this.waitForHealthy(options.timeout, options.checkHealth);
    const healthyAt = getPerformanceTimestampMs();
    return {
      process,
      launchStartedAt,
      spawnedAt,
      healthyAt,
    };
  }

  private spawnServer(options: LocalSidecarLaunchRuntimeOptions): ChildProcess {
    const opencodePath = this.findOpenCodeBinary();
    if (!opencodePath) {
      throw new Error('OpenCode not found. Please install it with: npm install -g opencode-ai');
    }

    logger.debug('Starting OpenCode server:');
    logger.debug(`  Binary: ${opencodePath}`);
    logger.debug(`  Working directory: ${this.workingDirectory || 'current directory'}`);
    logger.debug(`  Config path: ${this.workingDirectory ? `${this.workingDirectory}/.opencode/opencode.json` : 'N/A'}`);
    logger.debug('  Spawn context:', {
      mode: this.config.mode,
      modelSourceMode: this.config.modelSourceMode,
      pluginIsolationMode: this.config.pluginIsolationMode,
      managedServerState: options.managedServerStateSnapshot,
    });

    const spawnEnv = this.getSpawnEnv();
    const spawnViaShell = this.shouldSpawnViaShell(opencodePath);
    logger.debug('  Spawn env summary:', {
      hasDisableProjectConfig: typeof spawnEnv.OPENCODE_DISABLE_PROJECT_CONFIG === 'string',
      disableProjectConfig: spawnEnv.OPENCODE_DISABLE_PROJECT_CONFIG ?? null,
      hasConfigDir: typeof spawnEnv.OPENCODE_CONFIG_DIR === 'string',
      configDir: spawnEnv.OPENCODE_CONFIG_DIR ?? null,
      hasConfigContent: typeof spawnEnv.OPENCODE_CONFIG_CONTENT === 'string',
      configContentLength: spawnEnv.OPENCODE_CONFIG_CONTENT?.length ?? 0,
      disableDefaultPlugins: spawnEnv.OPENCODE_DISABLE_DEFAULT_PLUGINS ?? null,
      disableClaudeCode: spawnEnv.OPENCODE_DISABLE_CLAUDE_CODE ?? null,
      disableClaudeCodeSkills: spawnEnv.OPENCODE_DISABLE_CLAUDE_CODE_SKILLS ?? null,
      disableExternalSkills: spawnEnv.OPENCODE_DISABLE_EXTERNAL_SKILLS ?? null,
      serverUsernameConfigured: typeof spawnEnv.OPENCODE_SERVER_USERNAME === 'string' && spawnEnv.OPENCODE_SERVER_USERNAME.length > 0,
      serverPasswordConfigured: typeof spawnEnv.OPENCODE_SERVER_PASSWORD === 'string' && spawnEnv.OPENCODE_SERVER_PASSWORD.length > 0,
      pureMode: spawnEnv.OPENCODE_PURE ?? null,
      shell: spawnViaShell,
    });

    const localProcess = spawn(opencodePath, [
      'serve',
      '--port', String(this.config.local.port),
      '--hostname', this.config.local.host,
      '--cors', 'app://obsidian.md',
      '--cors', 'app://obsidian',
    ], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this.workingDirectory,
      env: spawnEnv,
      shell: spawnViaShell,
      windowsHide: process.platform === 'win32',
    });

    this.attachLaunchTracking(localProcess, options);
    return localProcess;
  }

  private attachLaunchTracking(proc: ChildProcess, options: LocalSidecarLaunchRuntimeOptions): void {
    this.clearLaunchState();

    const launch: LocalServerLaunch = {
      proc,
      outputTail: [],
      exited: false,
      exitCode: null,
      signal: null,
      error: null,
      cleanup: () => undefined,
    };

    const handleStdout = this.createLaunchOutputHandler(launch, (text) => logger.debug(text));
    const handleStderr = this.createLaunchOutputHandler(launch, (text) => logger.error(text));

    const handleError = (error: Error) => {
      launch.error = error;
      options.onProcessError?.(error);
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      launch.exited = true;
      launch.exitCode = code;
      launch.signal = signal;
      options.onProcessExit?.(code, signal);
    };

    launch.cleanup = () => {
      proc.removeListener('error', handleError);
      proc.removeListener('exit', handleExit);
      proc.stdout?.removeListener('data', handleStdout);
      proc.stderr?.removeListener('data', handleStderr);
    };

    proc.stdout?.on('data', handleStdout);
    proc.stderr?.on('data', handleStderr);
    proc.on('error', handleError);
    proc.on('exit', handleExit);

    this.activeLaunch = launch;
  }

  private createLaunchOutputHandler(
    launch: LocalServerLaunch,
    logOutput: (message: string) => void,
  ): (data: unknown) => void {
    return (data: unknown) => {
      const text = String(data);
      this.pushLaunchOutput(launch, text);
      const trimmed = text.trim();
      if (trimmed) {
        logOutput(trimmed);
      }
    };
  }

  private pushLaunchOutput(launch: LocalServerLaunch, chunk: string): void {
    if (!chunk) {
      return;
    }

    launch.outputTail.push(chunk);
    while (launch.outputTail.length > LOCAL_SERVER_LOG_TAIL_LIMIT) {
      launch.outputTail.shift();
    }
  }

  private findOpenCodeBinary(): string | null {
    const candidates: string[] = [];

    if (process.platform === 'win32') {
      if (process.env.APPDATA) {
        candidates.push(path.join(process.env.APPDATA, 'npm', 'opencode.cmd'));
      }
      if (process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, 'npm', 'opencode.cmd'));
        candidates.push(path.join(process.env.LOCALAPPDATA, 'OpenCode', 'opencode-cli.exe'));
        candidates.push(path.join(process.env.LOCALAPPDATA, 'OpenCode', 'opencode.exe'));
      }
      if (process.env.USERPROFILE) {
        candidates.push(path.join(process.env.USERPROFILE, 'bin', 'opencode.cmd'));
      }
      candidates.push(
        'opencode.cmd',
        'opencode',
        'opencode-ai',
      );
    } else if (process.platform === 'darwin') {
      candidates.push(
        '/usr/local/bin/opencode',
        '/opt/homebrew/bin/opencode',
        '/usr/bin/opencode',
        process.env.HOME ? path.join(process.env.HOME, '.npm-global', 'bin', 'opencode') : '',
        process.env.HOME ? path.join(process.env.HOME, '.nvm', 'current', 'bin', 'opencode') : '',
        'opencode',
        'opencode-ai',
      );
    } else {
      candidates.push(
        '/usr/local/bin/opencode',
        '/usr/bin/opencode',
        '/opt/bin/opencode',
        'opencode',
        'opencode-ai',
      );
    }

    for (const candidate of candidates) {
      const resolved = this.resolveExecutableCandidate(candidate);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  private resolveExecutableCandidate(candidate: string): string | null {
    if (!candidate) {
      return null;
    }

    if (path.isAbsolute(candidate)) {
      return fs.existsSync(candidate) ? candidate : null;
    }

    const pathEntries = this.getPathEnvironmentValue()
      .split(this.getPathEnvironmentDelimiter())
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (pathEntries.length === 0) {
      return null;
    }

    if (process.platform === 'win32') {
      const hasExtension = path.extname(candidate).length > 0;
      const pathExts = hasExtension
        ? ['']
        : (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .map((ext) => ext.trim())
          .filter(Boolean);

      for (const entry of pathEntries) {
        for (const extension of pathExts) {
          const resolvedPath = path.join(entry, `${candidate}${extension}`);
          if (fs.existsSync(resolvedPath)) {
            return resolvedPath;
          }
        }
      }

      return null;
    }

    for (const entry of pathEntries) {
      const resolvedPath = path.join(entry, candidate);
      if (fs.existsSync(resolvedPath)) {
        return resolvedPath;
      }
    }

    return null;
  }

  private getPathEnvironmentValue(): string {
    return process.env.PATH ?? process.env.Path ?? process.env.path ?? '';
  }

  private getPathEnvironmentDelimiter(): string {
    return process.platform === 'win32' ? ';' : path.delimiter;
  }

  private shouldSpawnViaShell(opencodePath: string): boolean {
    return process.platform === 'win32' && /\.(cmd|bat)$/i.test(opencodePath);
  }

  private async waitForHealthy(timeout: number, checkHealth: (timeout: number) => Promise<boolean>): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      this.throwIfLaunchFailed('Server exited before becoming healthy');
      if (await checkHealth(1000)) {
        return;
      }
      this.throwIfLaunchFailed('Server exited before becoming healthy');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    this.throwIfLaunchFailed(`Server failed to start within ${timeout}ms`);
    throw this.buildLaunchFailureError(`Server failed to start within ${timeout}ms`);
  }

  private throwIfLaunchFailed(prefix: string): void {
    const launch = this.getActiveLaunchSnapshot();
    if (!launch) {
      return;
    }

    if (launch.error) {
      throw this.buildLaunchFailureError(`${prefix}: ${launch.error.message}`, launch);
    }

    if (launch.exited) {
      throw this.buildLaunchFailureError(`${prefix}${this.getLaunchExitSuffix(launch)}`, launch);
    }
  }

  private getActiveLaunchSnapshot(): LocalServerLaunchSnapshot | null {
    if (!this.activeLaunch) {
      return null;
    }

    return {
      outputTail: [...this.activeLaunch.outputTail],
      exited: this.activeLaunch.exited,
      exitCode: this.activeLaunch.exitCode,
      signal: this.activeLaunch.signal,
      error: this.activeLaunch.error,
    };
  }

  private getLaunchExitSuffix(launch: LocalServerLaunchSnapshot): string {
    if (launch.exitCode !== null) {
      return ` (exit code ${launch.exitCode})`;
    }

    if (launch.signal) {
      return ` (signal ${launch.signal})`;
    }

    return '';
  }

  private buildLaunchFailureError(
    message: string,
    launch: LocalServerLaunchSnapshot | null = this.getActiveLaunchSnapshot(),
  ): Error {
    const output = this.formatLaunchOutputTail(launch);
    if (!output) {
      return new Error(message);
    }

    return new Error(`${message}\nServer output:\n${output}`);
  }

  private formatLaunchOutputTail(launch: LocalServerLaunchSnapshot | null = this.getActiveLaunchSnapshot()): string {
    const output = launch?.outputTail.join('').trim() ?? '';
    if (!output) {
      return '';
    }

    return output.length > 4000 ? output.slice(output.length - 4000) : output;
  }

  private getSpawnEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    for (const key of LOCAL_SERVER_SANITIZED_ENV_KEYS) {
      delete env[key];
    }

    if (this.config.pluginIsolationMode === 'pure') {
      env.OPENCODE_PURE = 'true';
    }

    if (this.config.auth.type === 'basic' && this.config.auth.password.trim()) {
      env.OPENCODE_SERVER_USERNAME = this.config.auth.username.trim() || 'opencode';
      env.OPENCODE_SERVER_PASSWORD = this.config.auth.password;
    } else {
      delete env.OPENCODE_SERVER_USERNAME;
      delete env.OPENCODE_SERVER_PASSWORD;
    }

    if (this.config.modelSourceMode === 'server') {
      env.OPENCODE_DISABLE_PROJECT_CONFIG = 'true';
      delete env.OPENCODE_CONFIG_DIR;
      delete env.OPENCODE_CONFIG_CONTENT;
      return env;
    }

    if (this.config.modelSourceMode === 'merge') {
      delete env.OPENCODE_DISABLE_PROJECT_CONFIG;
      delete env.OPENCODE_CONFIG_DIR;
      delete env.OPENCODE_CONFIG_CONTENT;
      return env;
    }

    delete env.OPENCODE_DISABLE_PROJECT_CONFIG;
    delete env.OPENCODE_CONFIG_DIR;
    delete env.OPENCODE_CONFIG_CONTENT;

    return env;
  }
}
