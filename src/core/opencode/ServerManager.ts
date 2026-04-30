/**
 * OpenCode Server Manager
 *
 * Manages the lifecycle of the OpenCode server process.
 * Handles startup, shutdown, health checks, and crash recovery.
 */

import type { ChildProcess } from 'child_process';
import * as fs from 'fs';
import { Notice, requestUrl } from 'obsidian';
import * as path from 'path';

import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
} from '../../shared';
import {
  type ExistingServerProcessInfo,
  LocalSidecarEndpointResolver,
  type ManagedServerAdoptionOutcome,
  type OccupiedLocalEndpointResolution,
} from './LocalSidecarEndpointResolver';
import { LocalSidecarLauncher } from './LocalSidecarLauncher';
import { LocalProcessProbe } from './LocalSidecarProcessInspector';
import type { ManagedServerState, OpenCodeServerConfig, ServerDiagnostics, ServerStatus } from './types';

const logger = createLogger('ServerManager');
const MANAGED_SERVER_SIGNATURE_VERSION = 1;
const PORT_RELEASE_TIMEOUT_MS = 5_000;

/** Server manager events */
interface ServerManagerEvents {
  onStatusChange?: (status: ServerStatus) => void;
  onError?: (error: Error) => void;
}

interface ServerManagerRuntimeOptions {
  initialManagedServerState?: ManagedServerState | null;
  onManagedServerStateChange?: (state: ManagedServerState | null) => void;
}

interface ManagedServerShutdownPlan {
  process: ChildProcess | null;
  pids: number[];
  clearManagedState: boolean;
  cleanup: boolean;
  waitForPortReleaseMessage?: string;
}

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
  private processProbe = new LocalProcessProbe();
  private endpointResolver: LocalSidecarEndpointResolver;
  private localSidecarLauncher: LocalSidecarLauncher;

  constructor(
    config: OpenCodeServerConfig,
    events: ServerManagerEvents = {},
    runtimeOptions: ServerManagerRuntimeOptions = {},
  ) {
    this.config = { timeout: 30000, ...config };
    this.events = events;
    this.managedServerState = runtimeOptions.initialManagedServerState ?? null;
    this.onManagedServerStateChange = runtimeOptions.onManagedServerStateChange;
    this.endpointResolver = new LocalSidecarEndpointResolver(this.config);
    this.localSidecarLauncher = new LocalSidecarLauncher(this.config);
  }

  /** Set the working directory for the server (vault path) */
  setWorkingDirectory(path: string): void {
    this.workingDirectory = path;
    this.localSidecarLauncher.updateWorkingDirectory(path);
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
    this.endpointResolver = new LocalSidecarEndpointResolver(this.config);
    this.localSidecarLauncher.updateConfig(this.config);
  }

  async canBindLocalEndpoint(host: string, port: number): Promise<boolean> {
    return this.processProbe.canBindLocalEndpoint(host, port);
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

    const startedAt = getPerformanceTimestampMs();
    this.startPromise = this.doStart();

    try {
      await this.startPromise;
      logger.debug(
        `ServerManager.start completed in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)}`,
        {
          mode: this.config.mode,
          status: this.status,
          host: this.config.local.host,
          port: this.config.local.port,
        },
      );
    } catch (error) {
      logger.error(
        `ServerManager.start failed after ${formatDurationMs(getPerformanceTimestampMs() - startedAt)}`,
        error,
      );
      throw error;
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

      const portAvailable = await this.processProbe.canBindLocalEndpoint(
        this.config.local.host,
        this.config.local.port,
      );
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
    if (!shutdownPlan.process && shutdownPlan.pids.length === 0) {
      this.localSidecarLauncher.clearLaunchState();
      this.setDiagnostics({ reason: 'none' });
      this.setStatus('stopped');
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
    const managedState = this.managedServerState;
    const currentListenerPid = this.processProbe.getCurrentPluginManagedListenerPidSync(
      this.config.local.port,
      (commandLine) => this.endpointResolver.looksLikePluginManagedSidecarCommand(commandLine),
    );
    return {
      process: this.process,
      pids: this.collectManagedPidCandidates(
        managedState,
        this.process?.pid ?? undefined,
        currentListenerPid,
      ),
      clearManagedState: true,
      cleanup: true,
      waitForPortReleaseMessage: this.config.mode === 'local'
        ? `Port ${this.config.local.port} stayed busy after stopping the managed OpenCode server`
        : undefined,
    };
  }

  private async runManagedShutdownLifecycle(plan: ManagedServerShutdownPlan): Promise<void> {
    if (plan.process) {
      await this.terminateManagedProcess(plan.process);
    }

    const shouldSkipAdditionalPids = process.platform === 'win32' && Boolean(plan.process?.pid);
    if (!shouldSkipAdditionalPids) {
      for (const pid of plan.pids) {
        if (pid === plan.process?.pid) {
          continue;
        }
        await this.processProbe.terminateManagedPid(pid);
      }
    }

    if (plan.waitForPortReleaseMessage) {
      const released = await this.processProbe.waitForPortAvailability(
        this.config.local.host,
        this.config.local.port,
        PORT_RELEASE_TIMEOUT_MS,
      );
      if (!released) {
        throw new Error(plan.waitForPortReleaseMessage);
      }
    }

    if (plan.clearManagedState) {
      this.clearManagedServerState();
    }

    if (plan.cleanup) {
      this.cleanup();
    }
  }

  private runManagedShutdownLifecycleSync(plan: ManagedServerShutdownPlan): void {
    if (plan.process?.pid) {
      this.processProbe.terminateManagedPidSync(plan.process.pid);
    }

    const shouldSkipAdditionalPids = process.platform === 'win32' && Boolean(plan.process?.pid);
    if (!shouldSkipAdditionalPids) {
      for (const pid of plan.pids) {
        if (pid === plan.process?.pid) {
          continue;
        }
        this.processProbe.terminateManagedPidSync(pid);
      }
    }

    if (plan.waitForPortReleaseMessage && !this.processProbe.isLocalPortAvailableSync(this.config.local.port)) {
      logger.warn(plan.waitForPortReleaseMessage);
      return;
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
            if (managedProcess.pid) {
              void this.processProbe.terminateManagedPid(managedProcess.pid).finally(doResolve);
            } else {
              doResolve();
            }
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
        if (managedProcess.pid) {
          void this.processProbe.terminateManagedPid(managedProcess.pid);
        } else {
          clearTimeout(timeout);
          doResolve();
        }
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

  private async launchLocalServerRuntime(successDiagnostics?: ServerDiagnostics): Promise<void> {
    const launchResult = await this.localSidecarLauncher.launchRuntime({
      timeout: this.config.timeout ?? 30000,
      checkHealth: (timeout) => this.checkHealth(timeout),
      managedServerStateSnapshot: this.getManagedServerStateSnapshot(),
      onProcessError: (error) => {
        if (this.status === 'running') {
          this.events.onError?.(error);
        }
      },
      onProcessExit: (code) => {
        this.clearManagedServerState();
        if (code !== 0 && code !== null && this.status !== 'stopped') {
          this.events.onError?.(new Error(`Server exited with code ${code}`));
        }
        this.cleanup();
      },
    });
    this.process = launchResult.process;
    this.setManagedServerState(this.process.pid);
    await this.refreshManagedListenerPid();

    if (successDiagnostics) {
      this.setDiagnostics(successDiagnostics);
    }

    logger.info(
      `[startup] local OpenCode server ready in ${formatDurationMs(launchResult.healthyAt - launchResult.launchStartedAt)} (spawn ${formatDurationMs(launchResult.spawnedAt - launchResult.launchStartedAt)}, health ${formatDurationMs(launchResult.healthyAt - launchResult.spawnedAt)})`,
    );
    this.setStatus('running');
    new Notice('OpenCode server started');
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
    this.localSidecarLauncher.clearLaunchState();
    if (this.status !== 'stopped') {
      this.setStatus('stopped');
    }
  }

  private setManagedServerState(launcherPid: number | undefined, listenerPid?: number | null): void {
    const nextListenerPid = listenerPid ?? undefined;
    const primaryPid = nextListenerPid ?? launcherPid;
    if (!primaryPid) {
      this.clearManagedServerState();
      return;
    }

    this.managedServerState = {
      pid: primaryPid,
      launcherPid,
      listenerPid: nextListenerPid,
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

  private isLegacyManagedServerState(state: ManagedServerState | null | undefined = this.managedServerState): boolean {
    return Boolean(
      state
      && (typeof state.launcherPid !== 'number' || state.launcherPid <= 0)
      && (typeof state.listenerPid !== 'number' || state.listenerPid <= 0),
    );
  }

  private getManagedLauncherPid(state: ManagedServerState | null | undefined = this.managedServerState): number | null {
    if (!state) {
      return null;
    }

    if (typeof state.launcherPid === 'number' && state.launcherPid > 0) {
      return state.launcherPid;
    }

    if (typeof state.listenerPid === 'number' && state.listenerPid > 0 && state.pid !== state.listenerPid) {
      return state.pid;
    }

    return typeof state.pid === 'number' && state.pid > 0 ? state.pid : null;
  }

  private getManagedListenerPid(state: ManagedServerState | null | undefined = this.managedServerState): number | null {
    if (!state) {
      return null;
    }

    if (typeof state.listenerPid === 'number' && state.listenerPid > 0) {
      return state.listenerPid;
    }

    if (!this.isLegacyManagedServerState(state) && typeof state.pid === 'number' && state.pid > 0) {
      return state.pid;
    }

    return null;
  }

  private collectManagedPidCandidates(
    state: ManagedServerState | null | undefined,
    ...fallbackPids: Array<number | null | undefined>
  ): number[] {
    const candidates = [
      this.getManagedListenerPid(state),
      this.getManagedLauncherPid(state),
      ...fallbackPids,
    ]
      .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0);

    return [...new Set(candidates)];
  }

  private async refreshManagedListenerPid(): Promise<void> {
    const state = this.managedServerState;
    if (!state) {
      return;
    }

    const listenerPid = await this.processProbe.getListeningProcessId(this.config.local.port);
    if (!listenerPid) {
      logger.warn('Unable to resolve live OpenCode listener pid after startup; preserving launcher pid only');
      return;
    }

    this.setManagedServerState(this.getManagedLauncherPid(state) ?? undefined, listenerPid);
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
        await this.launchLocalServerRuntime(this.endpointResolver.buildOrphanRestartDiagnostics(resolution.existingServer));
        return;
      case 'conflict':
        this.setDiagnostics(resolution.diagnostics);
        this.setStatus('conflict');
        throw new Error(this.endpointResolver.buildConflictMessage(resolution.existingServer, true));
    }
  }

  private async resolveOccupiedHealthyLocalEndpoint(): Promise<OccupiedLocalEndpointResolution> {
    return this.endpointResolver.resolveOccupiedHealthyLocalEndpoint({
      tryAdoptManagedServer: () => this.tryAdoptManagedServer(),
      inspectExistingHealthyServer: () => this.inspectExistingHealthyServer(),
      getManagedServerState: () => this.managedServerState,
    });
  }

  private async tryAdoptManagedServer(): Promise<ManagedServerAdoptionOutcome> {
    const liveListenerPid = await this.processProbe.getListeningProcessId(this.config.local.port);
    const persistedListenerPid = this.getManagedListenerPid(this.managedServerState);
    if (persistedListenerPid && liveListenerPid && persistedListenerPid !== liveListenerPid) {
      return 'restart';
    }

    const state = await this.getAdoptableManagedServerState();
    if (!state) {
      return 'skip';
    }

    if (!this.matchesManagedServerSignature(state)) {
      return 'restart';
    }

    this.managedServerState = state;
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

    const liveListenerPid = await this.processProbe.getListeningProcessId(this.config.local.port);
    const commandLine = await this.processProbe.getProcessCommandLine(liveListenerPid ?? state.pid);
    if (!commandLine) {
      this.clearManagedServerState();
      return null;
    }

    if (!this.endpointResolver.looksLikeOpenCodeServeCommand(commandLine)) {
      this.clearManagedServerState();
      return null;
    }

    return {
      ...state,
      pid: liveListenerPid ?? this.getManagedListenerPid(state) ?? state.pid,
      launcherPid: this.getManagedLauncherPid(state) ?? state.pid,
      listenerPid: liveListenerPid ?? this.getManagedListenerPid(state) ?? undefined,
    };
  }

  private async inspectExistingHealthyServer(): Promise<ExistingServerProcessInfo> {
    const pid = await this.processProbe.getListeningProcessId(this.config.local.port);
    const commandLine = pid ? await this.processProbe.getProcessCommandLine(pid) : null;
    return {
      pid,
      commandLine,
      ...this.endpointResolver.classifyCommandLine(commandLine),
    };
  }

  private async recycleUnknownLocalServer(existingServer: ExistingServerProcessInfo): Promise<void> {
    if (existingServer.pid === null) {
      throw new Error(
        `Cannot recycle orphaned OpenCode sidecar on ${this.config.local.host}:${this.config.local.port} because its PID could not be determined`,
      );
    }

    await this.runManagedShutdownLifecycle({
      process: null,
      pids: [existingServer.pid],
      clearManagedState: false,
      cleanup: false,
      waitForPortReleaseMessage: `Port ${this.config.local.port} stayed busy after stopping the orphaned OpenCode sidecar`,
    });
  }

  private async restartManagedServer(): Promise<void> {
    const state = this.managedServerState;
    if (!state) {
      return;
    }

    const currentListenerPid = await this.processProbe.getCurrentPluginManagedListenerPid(
      this.config.local.port,
      (commandLine) => this.endpointResolver.looksLikePluginManagedSidecarCommand(commandLine),
    );

    await this.runManagedShutdownLifecycle({
      process: null,
      pids: this.collectManagedPidCandidates(state, currentListenerPid),
      clearManagedState: true,
      cleanup: false,
      waitForPortReleaseMessage: `Port ${this.config.local.port} stayed busy after stopping the stale OpenCode server`,
    });
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

}
