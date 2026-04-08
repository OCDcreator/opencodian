/**
 * OpenCode Server Manager
 * 
 * Manages the lifecycle of the OpenCode server process.
 * Handles startup, shutdown, health checks, and crash recovery.
 */

import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import { Notice, requestUrl } from 'obsidian';
import * as path from 'path';

import { createLogger } from '../../shared';
import type { ManagedServerState, OpenCodeServerConfig } from './types';

const logger = createLogger('ServerManager');
const MANAGED_SERVER_SIGNATURE_VERSION = 1;
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

/** Server status type */
export type ServerStatus = 
  | 'stopped'
  | 'starting'
  | 'running'
  | 'error'
  | 'restarting';

/** Server manager events */
interface ServerManagerEvents {
  onStatusChange?: (status: ServerStatus) => void;
  onError?: (error: Error) => void;
}

interface ServerManagerRuntimeOptions {
  initialManagedServerState?: ManagedServerState | null;
  onManagedServerStateChange?: (state: ManagedServerState | null) => void;
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

    try {
      if (this.config.mode === 'remote') {
        const healthy = await this.checkHealth(this.config.timeout ?? 30000);
        if (!healthy) {
          throw new Error(`Remote OpenCode server is unreachable: ${this.config.baseUrl}`);
        }

        this.setStatus('running');
        return;
      }

      // Check if port is already in use
      const portAvailable = await this.isPortAvailable(this.config.local.port);
      if (!portAvailable) {
        // Check if it's an existing OpenCode server
        const healthy = await this.checkHealth(5000);
        if (healthy) {
          const adoption = await this.tryAdoptManagedServer();
          if (adoption === 'adopted') {
            logger.debug('Adopted previously managed OpenCode server on port', this.config.local.port);
            this.setStatus('running');
            return;
          }
          if (adoption === 'restart') {
            logger.debug('Restarting stale managed OpenCode server on port', this.config.local.port);
            await this.restartManagedServer();
            await this.spawnServer();
            await this.waitForHealthy(this.config.timeout ?? 30000);
            this.setStatus('running');
            new Notice('OpenCode server started');
            return;
          }

          logger.debug('OpenCode server already running on port', this.config.local.port);
          logger.debug('This server may have been started with different working directory/config');
          this.setStatus('running');
          return;
        }
        throw new Error(`Port ${this.config.local.port} is already in use by another process`);
      }

      // Spawn OpenCode server process
      await this.spawnServer();

      // Wait for server to be healthy
      await this.waitForHealthy(this.config.timeout ?? 30000);

      this.setStatus('running');
      new Notice('OpenCode server started');
    } catch (error) {
      this.setStatus('error');
      const err = error instanceof Error ? error : new Error(String(error));
      this.events.onError?.(err);
      throw err;
    }
  }

  /** Stop the OpenCode server */
  async stop(): Promise<void> {
    if (!this.process && !this.managedServerState) {
      this.setStatus('stopped');
      return;
    }

    if (this.status === 'stopped') {

      return;
    }


    this.setStatus('stopped');

    const managedProcess = this.process;
    const managedPid = this.managedServerState?.pid;

    if (!managedProcess && managedPid) {
      await this.terminateManagedPid(managedPid);
      this.clearManagedServerState();
      this.cleanup();
      return;
    }

    if (!managedProcess) {
      this.clearManagedServerState();
      this.cleanup();
      return;
    }

    return new Promise((resolve) => {
      let resolved = false;
      
      const doResolve = () => {
        if (!resolved) {
          resolved = true;
          this.clearManagedServerState();
          this.cleanup();
          resolve();
        }
      };

      // Set a timeout to force kill
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
        } catch (e) {
          logger.error('Error killing process:', e);
          doResolve();
        }
      }, 5000);

      // Listen for process exit
      managedProcess.once('exit', (_code, _signal) => {

        clearTimeout(timeout);
        doResolve();
      });

      // Try graceful shutdown first
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

        // If kill returns false, the process might already be dead
        if (terminated === false) {
          clearTimeout(timeout);
          doResolve();
        }
      } catch (e) {
        logger.error('Error sending SIGTERM:', e);
        clearTimeout(timeout);
        doResolve();
      }
    });
  }

  /** Restart the server */
  async restart(): Promise<void> {
    this.setStatus('restarting');
    await this.stop();
    await this.start();
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
    return new Promise((resolve, reject) => {
      try {
        // Try to find opencode binary
        const opencodePath = this.findOpenCodeBinary();
        
        if (!opencodePath) {
          reject(new Error(
            'OpenCode not found. Please install it with: npm install -g opencode-ai'
          ));
          return;
        }

        // Spawn server process with CORS enabled for Obsidian
        // Use vault path as working directory so OpenCode reads project config
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

        // Handle process events
        this.process.on('error', (error) => {
          this.events.onError?.(error);
        });

        this.process.on('exit', (code, _signal) => {
          this.clearManagedServerState();
          if (code !== 0 && code !== null) {
            this.events.onError?.(new Error(`Server exited with code ${code}`));
          }
          this.cleanup();
        });

        // Log output for debugging
        this.process.stdout?.on('data', (_data) => {

        });

        this.process.stderr?.on('data', (data) => {
          logger.error(data.toString().trim());
        });

        // Give it a moment to start
        setTimeout(resolve, 1000);
      } catch (error) {
        reject(error);
      }
    });
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
      if (await this.checkHealth(1000)) {
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    throw new Error(`Server failed to start within ${timeout}ms`);
  }

  private setStatus(status: ServerStatus): void {
    if (this.status !== status) {
      logger.debug(`Server status -> ${status}`);
    }
    this.status = status;
    this.events.onStatusChange?.(status);
  }

  private cleanup(): void {
    this.process = null;
    this.setStatus('stopped');
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

  private async tryAdoptManagedServer(): Promise<'adopted' | 'restart' | 'skip'> {
    const state = this.managedServerState;
    if (!state) {
      return 'skip';
    }

    if (state.port !== this.config.local.port || state.host !== this.config.local.host) {
      this.clearManagedServerState();
      return 'skip';
    }

    const commandLine = await this.getProcessCommandLine(state.pid);
    if (!commandLine) {
      this.clearManagedServerState();
      return 'skip';
    }

    const normalizedCommand = commandLine.toLowerCase();
    const host = this.config.local.host.toLowerCase();
    const looksLikeOpenCodeServe =
      normalizedCommand.includes('opencode')
      && normalizedCommand.includes(' serve')
      && (
        normalizedCommand.includes(`--port ${this.config.local.port}`)
        || normalizedCommand.includes(`--port=${this.config.local.port}`)
      )
      && (
        normalizedCommand.includes(`--hostname ${host}`)
        || normalizedCommand.includes(`--hostname=${host}`)
      );

    if (!looksLikeOpenCodeServe) {
      this.clearManagedServerState();
      return 'skip';
    }

    if (!this.matchesManagedServerSignature(state)) {
      return 'restart';
    }

    this.onManagedServerStateChange?.(state);
    return 'adopted';
  }

  private async restartManagedServer(): Promise<void> {
    const state = this.managedServerState;
    if (!state) {
      return;
    }

    await this.terminateManagedPid(state.pid);
    this.clearManagedServerState();

    const released = await this.waitForPortAvailability(5000);
    if (!released) {
      throw new Error(`Port ${this.config.local.port} stayed busy after stopping the stale OpenCode server`);
    }
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
