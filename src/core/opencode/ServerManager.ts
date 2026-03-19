/**
 * OpenCode Server Manager
 * 
 * Manages the lifecycle of the OpenCode server process.
 * Handles startup, shutdown, health checks, and crash recovery.
 */

import { spawn, type ChildProcess } from 'child_process';
import { Notice } from 'obsidian';
import * as net from 'net';

import type { OpenCodeServerConfig } from './types';

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

  constructor(
    config: OpenCodeServerConfig,
    events: ServerManagerEvents = {}
  ) {
    this.config = { timeout: 30000, ...config };
    this.events = events;
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
          this.setStatus('running');
          return;
        }
        throw new Error(`Port ${this.config.port} is already in use by another process`);
      }

      // Spawn OpenCode server process
      await this.spawnServer();

      // Wait for server to be healthy
      await this.waitForHealthy(this.config.timeout);

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
    if (!this.process || this.status === 'stopped') {
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful shutdown fails
        this.process?.kill('SIGKILL');
        this.cleanup();
        resolve();
      }, 10000);

      this.process?.once('exit', () => {
        clearTimeout(timeout);
        this.cleanup();
        resolve();
      });

      // Try graceful shutdown first
      this.process?.kill('SIGTERM');
    });
  }

  /** Restart the server */
  async restart(): Promise<void> {
    this.setStatus('restarting');
    await this.stop();
    await this.start();
  }

  /** Check if server is healthy */
  async checkHealth(timeout = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeout);

      const healthUrl = `http://${this.config.host}:${this.config.port}/health`;
      
      fetch(healthUrl)
        .then((res) => {
          clearTimeout(timer);
          resolve(res.ok);
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

        // Spawn server process
        this.process = spawn(opencodePath, [
          'server',
          '--port', String(this.config.port),
          '--host', this.config.host,
        ], {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Handle process events
        this.process.on('error', (error) => {
          this.events.onError?.(error);
        });

        this.process.on('exit', (code, signal) => {
          if (code !== 0 && code !== null) {
            this.events.onError?.(new Error(`Server exited with code ${code}`));
          }
          this.cleanup();
        });

        // Log output for debugging
        this.process.stdout?.on('data', (data) => {
          console.log('[OpenCode]', data.toString().trim());
        });

        this.process.stderr?.on('data', (data) => {
          console.error('[OpenCode]', data.toString().trim());
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
      '/usr/local/bin/opencode',
      '/usr/bin/opencode',
    ];

    // On Windows, check for .cmd extension
    if (process.platform === 'win32') {
      candidates.push(
        'opencode.cmd',
        `${process.env.APPDATA}\\npm\\opencode.cmd`
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
    this.status = status;
    this.events.onStatusChange?.(status);
  }

  private cleanup(): void {
    this.process = null;
    this.setStatus('stopped');
  }
}
