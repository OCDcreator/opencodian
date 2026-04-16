/**
 * OpenCode Server Manager
 *
 * Manages the lifecycle of the OpenCode server process.
 * Handles startup, shutdown, health checks, and crash recovery.
 */

import { type ChildProcess, spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import { Notice, requestUrl } from 'obsidian';
import * as path from 'path';

import { createLogger } from '../../shared';
import {
  OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST,
  OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT,
} from '../types/settings';
import type { ManagedServerState, OpenCodeServerConfig, ServerDiagnostics, ServerStatus } from './types';

const logger = createLogger('ServerManager');
const MANAGED_SERVER_SIGNATURE_VERSION = 1;
const LOCAL_SERVER_LOG_TAIL_LIMIT = 80;
const PORT_RELEASE_TIMEOUT_MS = 5_000;
const LOCAL_SERVER_SANITIZED_ENV_KEYS = [
  'OPENCODE_CONFIG',
  'OPENCODE_TUI_CONFIG',
  'OPENCODE_CONFIG_DIR',
  'OPENCODE_CONFIG_CONTENT',
  'OPENCODE_PERMISSION',
  'OPENCODE_DISABLE_PROJECT_CONFIG',
  'OPENCODE_DISABLE_DEFAULT_PLUGINS',
  'OPENCODE_DISABLE_CLAUDE_CODE',
  'OPENCODE_DISABLE_CLAUDE_CODE_PROMPT',
  'OPENCODE_DISABLE_CLAUDE_CODE_SKILLS',
  'OPENCODE_DISABLE_EXTERNAL_SKILLS',
  'OPENCODE_PLUGIN_META_FILE',
  'OPENCODE_PURE',
] as const;

/** Server manager events */
interface ServerManagerEvents {
  onStatusChange?: (status: ServerStatus) => void;
  onError?: (error: Error) => void;
}

interface ServerManagerRuntimeOptions {
  initialManagedServerState?: ManagedServerState | null;
  onManagedServerStateChange?: (state: ManagedServerState | null) => void;
}

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

interface ExistingServerProcessInfo {
  pid: number | null;
  commandLine: string | null;
  looksLikeOpenCodeServe: boolean;
}

interface ManagedServerShutdownPlan {
  process: ChildProcess | null;
  pid: number | null;
  clearManagedState: boolean;
  cleanup: boolean;
  waitForPortReleaseMessage?: string;
}

type ManagedServerAdoptionOutcome = 'adopted' | 'restart' | 'skip';

type OccupiedLocalEndpointResolution =
  | { action: 'adopt-managed' }
  | { action: 'restart-managed' }
  | { action: 'recycle-orphan'; existingServer: ExistingServerProcessInfo }
  | {
      action: 'conflict';
      existingServer: ExistingServerProcessInfo;
      diagnostics: ServerDiagnostics;
    };

export class ServerManager {
  private config: OpenCodeServerConfig;
  private events: ServerManagerEvents;
  private process: ChildProcess | null = null;
  private status: ServerStatus = 'stopped';
  private startPromise: Promise<void> | null = null;
  private workingDirectory: string | undefined;
  private managedServerState: ManagedServerState | null;
  private onManagedServerStateChange?: (state: ManagedServerState | null) => void;
  private diagnostics: ServerDiagnostics = { reason: 'none' };
  private activeLaunch: LocalServerLaunch | null = null;

  constructor(
    config: OpenCodeServerConfig,
    events: ServerManagerEvents = {},
    runtimeOptions: ServerManagerRuntimeOptions = {},
  ) {
    this.config = { timeout: 30000, ...config };
    this.events = events;
    this.managedServerState = runtimeOptions.initialManagedServerState ?? null;
    this.onManagedServerStateChange = runtimeOptions.onManagedServerStateChange;
  }

  /** Set the working directory for the server (vault path) */
  setWorkingDirectory(path: string): void {
    this.workingDirectory = path;
    logger.debug(`Working directory set to: ${path}`);

    // Check if config file exists in this directory
    const configPath = `${path}/.opencode/opencode.json`;
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        logger.debug('Found OpenCode config:', JSON.stringify(config.permission, null, 2));
      } catch (e) {
        logger.error('Failed to read config:', e);
      }
    } else {
      logger.warn(`No OpenCode config found at: ${configPath}`);
    }
  }

  /** Get current server status */
  getStatus(): ServerStatus {
    return this.status;
  }

  /** Check if server is running */
  isRunning(): boolean {
    return this.status === 'running' && this.managedServerState !== null;
  }

  getManagedServerStateSnapshot(): ManagedServerState | null {
    return this.managedServerState ? { ...this.managedServerState } : null;
  }

  getServerDiagnosticsSnapshot(): ServerDiagnostics {
    return { ...this.diagnostics };
  }

  /** Update server configuration */
  updateConfig(config: OpenCodeServerConfig): void {
    this.config = {
      timeout: this.config.timeout ?? 30000,
      ...config,
    };
  }

  async canBindLocalEndpoint(host: string, port: number): Promise<boolean> {
    return this.isPortAvailable(port, host);
  }

  /** Start the OpenCode server */
  async start(): Promise<void> {
    // Return existing promise if already starting
    if (this.startPromise) {
      return this.startPromise;
    }

    // If already running, do nothing
    if (this.isRunning()) {
      return;
    }

    this.startPromise = this.doStart();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async doStart(): Promise<void> {
    this.setStatus('starting');
    this.setDiagnostics({ reason: 'none' });

    try {
      if (this.config.mode === 'remote') {
        const healthy = await this.checkHealth(this.config.timeout ?? 30000);
        if (!healthy) {
          throw new Error(`Remote OpenCode server is unreachable: ${this.config.baseUrl}`);
        }

        this.setStatus('running');
        return;
      }

      const portAvailable = await this.isPortAvailable(this.config.local.port);
      if (!portAvailable) {
        const healthy = await this.checkHealth(5000);
        if (healthy) {
          await this.handleHealthyOccupiedLocalEndpoint();
          return;
        }
        this.setDiagnostics({
          reason: 'local-conflict',
          host: this.config.local.host,
          port: this.config.local.port,
          message: 'Another process already occupies the configured local endpoint.',
        });
        this.setStatus('conflict');
        throw new Error(`Port ${this.config.local.port} is already in use by another process`);
      }

      await this.launchLocalServerRuntime();
    } catch (error) {
      if (this.config.mode === 'local' && (this.process || this.managedServerState)) {
        try {
          await this.stop();
        } catch (stopError) {
          logger.warn('Failed to clean up local OpenCode process after start failure:', stopError);
        }
      }

      if (this.status !== 'conflict') {
        this.setStatus('error');
      }
      const err = error instanceof Error ? error : new Error(String(error));
      this.events.onError?.(err);
      throw err;
    }
  }

  /** Stop the OpenCode server */
  async stop(): Promise<void> {
    const shutdownPlan = this.createCurrentManagedShutdownPlan();
    if (!shutdownPlan.process && !shutdownPlan.pid) {
      this.clearLaunchState();
      this.setDiagnostics({ reason: 'none' });
      this.setStatus('stopped');
      return;
    }

    if (this.status === 'stopped') {
      return;
    }

    this.setStatus('stopped');
    this.setDiagnostics({ reason: 'none' });

    await this.runManagedShutdownLifecycle(shutdownPlan);
  }

  dispose(): void {
    this.setDiagnostics({ reason: 'none' });
    this.runManagedShutdownLifecycleSync(this.createCurrentManagedShutdownPlan());
  }

  /** Restart the server */
  async restart(): Promise<void> {
    this.setStatus('restarting');
    await this.stop();
    await this.start();
  }

  private createCurrentManagedShutdownPlan(): ManagedServerShutdownPlan {
    return {
      process: this.process,
      pid: this.managedServerState?.pid ?? this.process?.pid ?? null,
      clearManagedState: true,
      cleanup: true,
    };
  }

  private async runManagedShutdownLifecycle(plan: ManagedServerShutdownPlan): Promise<void> {
    if (plan.process) {
      await this.terminateManagedProcess(plan.process);
    } else if (plan.pid) {
      await this.terminateManagedPid(plan.pid);
    }

    if (plan.clearManagedState) {
      this.clearManagedServerState();
    }

    if (plan.waitForPortReleaseMessage) {
      const released = await this.waitForPortAvailability(PORT_RELEASE_TIMEOUT_MS);
      if (!released) {
        throw new Error(plan.waitForPortReleaseMessage);
      }
    }

    if (plan.cleanup) {
      this.cleanup();
    }
  }

  private runManagedShutdownLifecycleSync(plan: ManagedServerShutdownPlan): void {
    const pid = plan.process?.pid ?? plan.pid;
    if (pid) {
      this.terminateManagedPidSync(pid);
    }

    if (plan.clearManagedState) {
      this.clearManagedServerState();
    }

    if (plan.cleanup) {
      this.cleanup();
    }
  }

  private async terminateManagedProcess(managedProcess: ChildProcess): Promise<void> {
    await new Promise<void>((resolve) => {
      let resolved = false;

      const doResolve = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        try {
          if (process.platform === 'win32') {
            void this.killWindowsProcessTree(managedProcess.pid).finally(doResolve);
            return;
          }

          const killed = managedProcess.kill('SIGKILL');
          if (!killed) {
            logger.warn('Process kill returned false, process may have already exited');
          }
        } catch (error) {
          logger.error('Error killing process:', error);
          doResolve();
        }
      }, 5000);

      managedProcess.once('exit', () => {
        clearTimeout(timeout);
        doResolve();
      });

      if (process.platform === 'win32') {
        void this.killWindowsProcessTree(managedProcess.pid).then((terminated) => {
          if (!terminated) {
            clearTimeout(timeout);
            doResolve();
          }
        });
        return;
      }

      try {
        const terminated = managedProcess.kill('SIGTERM');
        if (terminated === false) {
          clearTimeout(timeout);
          doResolve();
        }
      } catch (error) {
        logger.error('Error sending SIGTERM:', error);
        clearTimeout(timeout);
        doResolve();
      }
    });
  }

  /** Check if server is healthy using Obsidian's requestUrl (bypasses CORS) */
  async checkHealth(timeout = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeout);

      requestUrl({
        url: `${this.config.baseUrl}/global/health`,
        method: 'GET',
        headers: this.getAuthHeaders(),
      })
        .then((res) => {
          clearTimeout(timer);
          resolve(res.status === 200);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(false);
        });
    });
  }

  private async spawnServer(): Promise<void> {
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
      managedServerState: this.getManagedServerStateSnapshot(),
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
      serverUsernameConfigured: typeof spawnEnv.OPENCODE_SERVER_USERNAME === 'string' && spawnEnv.OPENCODE_SERVER_USERNAME.length > 0,
      serverPasswordConfigured: typeof spawnEnv.OPENCODE_SERVER_PASSWORD === 'string' && spawnEnv.OPENCODE_SERVER_PASSWORD.length > 0,
      pureMode: spawnEnv.OPENCODE_PURE ?? null,
      shell: spawnViaShell,
    });

    this.process = spawn(opencodePath, [
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
    this.setManagedServerState(this.process.pid);
    this.attachLaunchTracking(this.process);
  }

  private async launchLocalServerRuntime(successDiagnostics?: ServerDiagnostics): Promise<void> {
    await this.spawnServer();
    await this.waitForHealthy(this.config.timeout ?? 30000);

    if (successDiagnostics) {
      this.setDiagnostics(successDiagnostics);
    }

    this.setStatus('running');
    new Notice('OpenCode server started');
  }

  private attachLaunchTracking(proc: ChildProcess): void {
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
      if (this.status === 'running') {
        this.events.onError?.(error);
      }
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      launch.exited = true;
      launch.exitCode = code;
      launch.signal = signal;
      this.clearManagedServerState();
      if (code !== 0 && code !== null && this.status !== 'stopped') {
        this.events.onError?.(new Error(`Server exited with code ${code}`));
      }
      this.cleanup();
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

    const pathEntries = (process.env.PATH ?? '')
      .split(path.delimiter)
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

  private shouldSpawnViaShell(opencodePath: string): boolean {
    return process.platform === 'win32' && /\.(cmd|bat)$/i.test(opencodePath);
  }

  private async isPortAvailable(port: number, host = this.config.local.host): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          tester.close();
          resolve(true);
        })
        .listen(port, host);
    });
  }

  private async waitForHealthy(timeout: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      this.throwIfLaunchFailed('Server exited before becoming healthy');
      if (await this.checkHealth(1000)) {
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

  private setStatus(status: ServerStatus): void {
    if (this.status !== status) {
      logger.debug(`Server status -> ${status}`);
    }
    this.status = status;
    this.events.onStatusChange?.(status);
  }

  private setDiagnostics(diagnostics: ServerDiagnostics): void {
    this.diagnostics = { ...diagnostics };
  }

  private cleanup(): void {
    this.process = null;
    this.clearLaunchState();
    if (this.status !== 'stopped') {
      this.setStatus('stopped');
    }
  }

  private clearLaunchState(): void {
    this.activeLaunch?.cleanup();
    this.activeLaunch = null;
  }

  private setManagedServerState(pid: number | undefined): void {
    if (!pid) {
      this.clearManagedServerState();
      return;
    }

    this.managedServerState = {
      pid,
      host: this.config.local.host,
      port: this.config.local.port,
      signatureVersion: MANAGED_SERVER_SIGNATURE_VERSION,
      workingDirectory: this.normalizeManagedWorkingDirectory(this.workingDirectory),
      modelSourceMode: this.config.modelSourceMode,
      pluginIsolationMode: this.config.pluginIsolationMode,
      configFingerprint: this.getConfigFingerprint(),
    };
    this.onManagedServerStateChange?.(this.managedServerState);
  }

  private clearManagedServerState(): void {
    if (!this.managedServerState) {
      return;
    }

    this.managedServerState = null;
    this.onManagedServerStateChange?.(null);
  }

  private async handleHealthyOccupiedLocalEndpoint(): Promise<void> {
    const resolution = await this.resolveOccupiedHealthyLocalEndpoint();

    switch (resolution.action) {
      case 'adopt-managed':
        logger.debug('Adopted previously managed OpenCode server on port', this.config.local.port);
        this.setStatus('running');
        return;
      case 'restart-managed':
        logger.debug('Restarting stale managed OpenCode server on port', this.config.local.port);
        await this.restartManagedServer();
        await this.launchLocalServerRuntime();
        return;
      case 'recycle-orphan':
        logger.warn('Recycling orphaned OpenCode sidecar on default plugin endpoint', {
          host: this.config.local.host,
          port: this.config.local.port,
          pid: resolution.existingServer.pid,
        });
        await this.recycleUnknownLocalServer(resolution.existingServer);
        await this.launchLocalServerRuntime(this.buildOrphanRestartDiagnostics(resolution.existingServer));
        return;
      case 'conflict':
        this.setDiagnostics(resolution.diagnostics);
        this.setStatus('conflict');
        throw new Error(this.buildConflictMessage(resolution.existingServer, true));
    }
  }

  private async resolveOccupiedHealthyLocalEndpoint(): Promise<OccupiedLocalEndpointResolution> {
    const adoption = await this.tryAdoptManagedServer();
    if (adoption === 'adopted') {
      return { action: 'adopt-managed' };
    }

    if (adoption === 'restart') {
      return { action: 'restart-managed' };
    }

    const existingServer = await this.inspectExistingHealthyServer();
    if (await this.shouldRecycleUnknownLocalServer(existingServer)) {
      return {
        action: 'recycle-orphan',
        existingServer,
      };
    }

    return {
      action: 'conflict',
      existingServer,
      diagnostics: this.buildHealthyLocalConflictDiagnostics(existingServer),
    };
  }

  private buildOrphanRestartDiagnostics(existingServer: ExistingServerProcessInfo): ServerDiagnostics {
    return {
      reason: 'local-orphan-restarted',
      host: this.config.local.host,
      port: this.config.local.port,
      pid: existingServer.pid ?? undefined,
      commandLine: existingServer.commandLine ?? undefined,
      message: 'Detected and restarted an orphaned plugin sidecar.',
    };
  }

  private buildHealthyLocalConflictDiagnostics(existingServer: ExistingServerProcessInfo): ServerDiagnostics {
    return {
      reason: 'local-conflict',
      host: this.config.local.host,
      port: this.config.local.port,
      pid: existingServer.pid ?? undefined,
      commandLine: existingServer.commandLine ?? undefined,
      message: 'Another healthy OpenCode server already occupies the configured local endpoint.',
    };
  }

  private async tryAdoptManagedServer(): Promise<ManagedServerAdoptionOutcome> {
    const state = await this.getAdoptableManagedServerState();
    if (!state) {
      return 'skip';
    }

    if (!this.matchesManagedServerSignature(state)) {
      return 'restart';
    }

    this.onManagedServerStateChange?.(state);
    return 'adopted';
  }

  private async getAdoptableManagedServerState(): Promise<ManagedServerState | null> {
    const state = this.managedServerState;
    if (!state) {
      return null;
    }

    if (state.port !== this.config.local.port || state.host !== this.config.local.host) {
      this.clearManagedServerState();
      return null;
    }

    const commandLine = await this.getProcessCommandLine(state.pid);
    if (!commandLine) {
      this.clearManagedServerState();
      return null;
    }

    if (!this.looksLikeOpenCodeServeCommand(commandLine)) {
      this.clearManagedServerState();
      return null;
    }

    return state;
  }

  private async inspectExistingHealthyServer(): Promise<ExistingServerProcessInfo> {
    const pid = await this.getListeningProcessId(this.config.local.port);
    const commandLine = pid ? await this.getProcessCommandLine(pid) : null;
    return {
      pid,
      commandLine,
      looksLikeOpenCodeServe: this.looksLikeOpenCodeServeCommand(commandLine),
    };
  }

  private looksLikeOpenCodeServeCommand(commandLine: string | null): boolean {
    if (!commandLine) {
      return false;
    }

    const normalizedCommand = commandLine.toLowerCase();
    const host = this.config.local.host.toLowerCase();
    return normalizedCommand.includes('opencode')
      && normalizedCommand.includes(' serve')
      && (
        normalizedCommand.includes(`--port ${this.config.local.port}`)
        || normalizedCommand.includes(`--port=${this.config.local.port}`)
      )
      && (
        normalizedCommand.includes(`--hostname ${host}`)
        || normalizedCommand.includes(`--hostname=${host}`)
      );
  }

  private async shouldRecycleUnknownLocalServer(existingServer: ExistingServerProcessInfo): Promise<boolean> {
    if (this.managedServerState) {
      return false;
    }

    if (!this.isDefaultManagedLocalEndpoint()) {
      return false;
    }

    return existingServer.pid !== null && existingServer.looksLikeOpenCodeServe;
  }

  private isDefaultManagedLocalEndpoint(): boolean {
    return this.config.local.host === OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST
      && this.config.local.port === OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT;
  }

  private async recycleUnknownLocalServer(existingServer: ExistingServerProcessInfo): Promise<void> {
    if (existingServer.pid === null) {
      throw new Error(
        `Cannot recycle orphaned OpenCode sidecar on ${this.config.local.host}:${this.config.local.port} because its PID could not be determined`,
      );
    }

    await this.runManagedShutdownLifecycle({
      process: null,
      pid: existingServer.pid,
      clearManagedState: false,
      cleanup: false,
      waitForPortReleaseMessage: `Port ${this.config.local.port} stayed busy after stopping the orphaned OpenCode sidecar`,
    });
  }

  private buildConflictMessage(existingServer: ExistingServerProcessInfo, healthy: boolean): string {
    const endpoint = `${this.config.local.host}:${this.config.local.port}`;
    const pidLabel = existingServer.pid ? ` (PID ${existingServer.pid})` : '';
    if (!healthy) {
      return `Local endpoint ${endpoint} is already in use by another process${pidLabel}.`;
    }

    if (existingServer.looksLikeOpenCodeServe) {
      return `Another OpenCode server already occupies local endpoint ${endpoint}${pidLabel}. Configure a different plugin port or stop the conflicting process.`;
    }

    return `A healthy server already occupies local endpoint ${endpoint}${pidLabel}. Configure a different plugin port or stop the conflicting process.`;
  }

  private async restartManagedServer(): Promise<void> {
    const state = this.managedServerState;
    if (!state) {
      return;
    }

    await this.runManagedShutdownLifecycle({
      process: null,
      pid: state.pid,
      clearManagedState: true,
      cleanup: false,
      waitForPortReleaseMessage: `Port ${this.config.local.port} stayed busy after stopping the stale OpenCode server`,
    });
  }

  private async waitForPortAvailability(timeout: number): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.isPortAvailable(this.config.local.port)) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return false;
  }

  private matchesManagedServerSignature(state: ManagedServerState): boolean {
    return (
      state.signatureVersion === MANAGED_SERVER_SIGNATURE_VERSION
      && this.normalizeManagedWorkingDirectory(state.workingDirectory) === this.normalizeManagedWorkingDirectory(this.workingDirectory)
      && state.modelSourceMode === this.config.modelSourceMode
      && state.pluginIsolationMode === this.config.pluginIsolationMode
      && state.configFingerprint === this.getConfigFingerprint()
    );
  }

  private normalizeManagedWorkingDirectory(value: string | undefined): string | undefined {
    if (!value?.trim()) {
      return undefined;
    }

    return path.resolve(value);
  }

  private getConfigFingerprint(): string {
    return this.getRelevantConfigPaths()
      .map((candidate) => {
        const normalized = path.resolve(candidate);
        if (!fs.existsSync(normalized)) {
          return `${normalized}:missing`;
        }

        try {
          const stat = fs.statSync(normalized);
          return `${normalized}:${stat.size}:${Math.trunc(stat.mtimeMs)}`;
        } catch (error) {
          logger.warn('Failed to stat OpenCode config candidate for server fingerprint', {
            path: normalized,
            error,
          });
          return `${normalized}:error`;
        }
      })
      .join('|');
  }

  private getRelevantConfigPaths(): string[] {
    const candidates = new Set<string>();
    const add = (candidate: string | undefined) => {
      if (candidate?.trim()) {
        candidates.add(candidate);
      }
    };
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || (homeDir ? path.join(homeDir, '.config') : '');
    const managedDir = this.getManagedConfigDir();

    if (this.workingDirectory) {
      add(path.join(this.workingDirectory, '.opencode', 'opencode.json'));
      add(path.join(this.workingDirectory, '.opencode', 'opencode.jsonc'));
    }

    if (xdgConfigHome) {
      add(path.join(xdgConfigHome, 'opencode', 'opencode.jsonc'));
      add(path.join(xdgConfigHome, 'opencode', 'opencode.json'));
      add(path.join(xdgConfigHome, 'opencode', 'config.json'));
    }

    if (homeDir) {
      add(path.join(homeDir, '.opencode', 'opencode.json'));
      add(path.join(homeDir, '.opencode', 'opencode.jsonc'));
    }

    add(path.join(managedDir, 'opencode.json'));
    add(path.join(managedDir, 'opencode.jsonc'));

    return [...candidates];
  }

  private getManagedConfigDir(): string {
    switch (process.platform) {
      case 'darwin':
        return '/Library/Application Support/opencode';
      case 'win32':
        return path.join(process.env.ProgramData || 'C:\\ProgramData', 'opencode');
      default:
        return '/etc/opencode';
    }
  }

  private killWindowsProcessTree(pid: number | undefined): Promise<boolean> {
    if (!pid) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });

      killer.once('error', (error) => {
        logger.error('Failed to run taskkill for OpenCode process tree:', error);
        resolve(false);
      });

      killer.once('exit', (code) => {
        if (code !== 0) {
          logger.warn(`taskkill exited with code ${code} while stopping OpenCode`);
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  private killWindowsProcessTreeSync(pid: number | undefined): boolean {
    if (!pid) {
      return false;
    }

    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    if (result.error || result.status !== 0) {
      logger.warn('Failed to synchronously terminate OpenCode process tree during dispose', {
        pid,
        error: result.error ?? null,
        status: result.status ?? null,
      });
      return false;
    }

    return true;
  }

  private async terminateManagedPid(pid: number): Promise<void> {
    if (process.platform === 'win32') {
      await this.killWindowsProcessTree(pid);
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      logger.error('Error sending SIGTERM to adopted OpenCode process:', error);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process already exited after SIGTERM.
    }
  }

  private terminateManagedPidSync(pid: number): void {
    if (process.platform === 'win32') {
      this.killWindowsProcessTreeSync(pid);
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }

    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process already exited.
    }
  }

  private async getListeningProcessId(port: number): Promise<number | null> {
    const output = process.platform === 'win32'
      ? await this.captureCommandOutput(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `$conn = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { $conn.OwningProcess }`,
        ],
      )
      : await this.captureCommandOutput(
        'sh',
        [
          '-lc',
          `lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null | head -n 1`,
        ],
      );

    if (!output) {
      return null;
    }

    const parsed = Number.parseInt(output.trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private getProcessCommandLine(pid: number): Promise<string | null> {
    if (process.platform === 'win32') {
      return this.captureCommandOutput(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue; if ($p) { $p.CommandLine }`,
        ],
      );
    }

    return this.captureCommandOutput('ps', ['-p', String(pid), '-o', 'command=']);
  }

  private captureCommandOutput(command: string, args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      let stdout = '';
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.once('error', () => resolve(null));
      child.once('exit', (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }

        resolve(stdout.trim() || null);
      });
    });
  }

  private getAuthHeaders(): Record<string, string> | undefined {
    if (this.config.auth.type === 'basic') {
      const credentials = Buffer.from(
        `${this.config.auth.username}:${this.config.auth.password}`
      ).toString('base64');

      return {
        Authorization: `Basic ${credentials}`,
      };
    }

    if (this.config.auth.type === 'bearer' && this.config.auth.token.trim()) {
      return {
        Authorization: `Bearer ${this.config.auth.token.trim()}`,
      };
    }

    return undefined;
  }

  private getSpawnEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    for (const key of LOCAL_SERVER_SANITIZED_ENV_KEYS) {
      delete env[key];
    }

    if (this.config.pluginIsolationMode === 'pure') {
      env.OPENCODE_PURE = 'true';
    } else {
      delete env.OPENCODE_PURE;
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
