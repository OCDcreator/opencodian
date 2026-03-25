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

import { createLogger } from '../../shared';
import type { OpenCodeServerConfig } from './types';

const logger = createLogger('ServerManager');

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

export class ServerManager {
  private config: OpenCodeServerConfig;
  private events: ServerManagerEvents;
  private process: ChildProcess | null = null;
  private status: ServerStatus = 'stopped';
  private startPromise: Promise<void> | null = null;
  private workingDirectory: string | undefined;

  constructor(
    config: OpenCodeServerConfig,
    events: ServerManagerEvents = {}
  ) {
    this.config = { timeout: 30000, ...config };
    this.events = events;
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
    return this.status === 'running' && this.process !== null && !this.process.killed;
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
      // Check if port is already in use
      const portAvailable = await this.isPortAvailable(this.config.port);
      if (!portAvailable) {
        // Check if it's an existing OpenCode server
        const healthy = await this.checkHealth(5000);
        if (healthy) {
          logger.debug('OpenCode server already running on port', this.config.port);
          logger.debug('This server may have been started with different working directory/config');
          this.setStatus('running');
          return;
        }
        throw new Error(`Port ${this.config.port} is already in use by another process`);
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
    if (!this.process) {

      this.setStatus('stopped');
      return;
    }

    if (this.status === 'stopped') {

      return;
    }


    this.setStatus('stopped');

    return new Promise((resolve) => {
      let resolved = false;
      
      const doResolve = () => {
        if (!resolved) {
          resolved = true;
          this.cleanup();
          resolve();
        }
      };

      // Set a timeout to force kill
      const timeout = setTimeout(() => {

        try {
          // Try SIGKILL on Unix, or terminate on Windows
          const killed = this.process?.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
          if (!killed) {
            logger.warn('Process kill returned false, process may have already exited');
          }
        } catch (e) {
          logger.error('Error killing process:', e);
        }
        doResolve();
      }, 5000);

      // Listen for process exit
      this.process?.once('exit', (_code, _signal) => {

        clearTimeout(timeout);
        doResolve();
      });

      // Try graceful shutdown first
      try {
        const terminated = this.process?.kill(process.platform === 'win32' ? undefined : 'SIGTERM');

        
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

      // Note: OpenCode API uses /global/health endpoint
      const healthUrl = `http://${this.config.host}:${this.config.port}/global/health`;
      
      requestUrl({ url: healthUrl, method: 'GET' })
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
        
        this.process = spawn(opencodePath, [
          'serve',
          '--port', String(this.config.port),
          '--hostname', this.config.host,
          '--cors', 'app://obsidian.md',
          '--cors', 'app://obsidian',
        ], {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: this.workingDirectory,
        });

        // Handle process events
        this.process.on('error', (error) => {
          this.events.onError?.(error);
        });

        this.process.on('exit', (code, _signal) => {
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
    // Try common locations
    const candidates = [
      'opencode',
      'opencode-ai',
    ];

    // Platform-specific paths
    if (process.platform === 'win32') {
      // Windows: check for .cmd extension
      candidates.push(
        'opencode.cmd',
        `${process.env.APPDATA}\\npm\\opencode.cmd`,
        `${process.env.LOCALAPPDATA}\\npm\\opencode.cmd`
      );
    } else if (process.platform === 'darwin') {
      // macOS: common Homebrew and npm locations
      candidates.push(
        '/usr/local/bin/opencode',
        '/opt/homebrew/bin/opencode',
        '/usr/bin/opencode',
        `${process.env.HOME}/.npm-global/bin/opencode`,
        `${process.env.HOME}/.nvm/current/bin/opencode`
      );
    } else {
      // Linux
      candidates.push(
        '/usr/local/bin/opencode',
        '/usr/bin/opencode',
        '/opt/bin/opencode'
      );
    }

    // Return first candidate (will be tried by spawn)
    return candidates[0];
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          tester.close();
          resolve(true);
        })
        .listen(port, this.config.host);
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
}
