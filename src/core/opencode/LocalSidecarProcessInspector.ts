/**
 * Local Sidecar Process Inspector
 *
 * Queries OS-level process information needed for local OpenCode sidecar
 * management: port ownership, command lines, process status, and port
 * availability. This is a durable protocol boundary over platform-specific
 * process inspection APIs (lsof, netstat, ps, PowerShell).
 */

import { spawn, spawnSync } from 'child_process';
import * as net from 'net';

import { createLogger } from '../../shared';

const logger = createLogger('LocalProcessProbe');

export class LocalSidecarProcessInspector {
  /** Return the PID currently listening on the given local port. */
  async getListeningProcessId(port: number): Promise<number | null> {
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

  /** Synchronous version of {@link getListeningProcessId}. */
  getListeningProcessIdSync(port: number): number | null {
    const result = process.platform === 'win32'
      ? spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `$conn = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { $conn.OwningProcess }`,
        ],
        {
          encoding: 'utf-8',
          windowsHide: true,
        },
      )
      : spawnSync(
        'sh',
        [
          '-lc',
          `lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null | head -n 1`,
        ],
        {
          encoding: 'utf-8',
          windowsHide: true,
        },
      );

    if (result.error || result.status !== 0) {
      return null;
    }

    const output = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const parsed = Number.parseInt(output, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  /** Return the command line for the process with the given PID. */
  async getProcessCommandLine(pid: number): Promise<string | null> {
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

  /** Synchronous version of {@link getProcessCommandLine}. */
  getProcessCommandLineSync(pid: number): string | null {
    const result = process.platform === 'win32'
      ? spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue; if ($p) { $p.CommandLine }`,
        ],
        {
          encoding: 'utf-8',
          windowsHide: true,
        },
      )
      : spawnSync(
        'ps',
        ['-p', String(pid), '-o', 'command='],
        {
          encoding: 'utf-8',
          windowsHide: true,
        },
      );

    if (result.error || result.status !== 0) {
      return null;
    }

    const output = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    return output || null;
  }

  /** Check whether a process with the given PID is still running. */
  async isPidRunning(pid: number): Promise<boolean> {
    const commandLine = await this.getProcessCommandLine(pid);
    return Boolean(commandLine);
  }

  /** Synchronous version of {@link isPidRunning}. */
  isPidRunningSync(pid: number): boolean {
    return Boolean(this.getProcessCommandLineSync(pid));
  }

  /**
   * Check whether a local port is available using platform-specific commands.
   * This is a synchronous alternative to the net-based port check.
   */
  isLocalPortAvailableSync(port: number): boolean {
    const result = process.platform === 'win32'
      ? spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `$conn = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { exit 1 } else { exit 0 }`,
        ],
        {
          stdio: 'ignore',
          windowsHide: true,
        },
      )
      : spawnSync(
        'sh',
        [
          '-lc',
          `if lsof -nP -iTCP:${port} -sTCP:LISTEN -t >/dev/null 2>&1; then exit 1; else exit 0; fi`,
        ],
        {
          stdio: 'ignore',
          windowsHide: true,
        },
      );

    if (result.error) {
      return false;
    }

    return result.status === 0;
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
}

/**
 * Local process/port probe owner used by ServerManager shutdown and probe flows.
 * It composes OS-level inspection with bind probing and managed-pid termination.
 */
export class LocalProcessProbe {
  private inspector: LocalSidecarProcessInspector;

  constructor(inspector: LocalSidecarProcessInspector = new LocalSidecarProcessInspector()) {
    this.inspector = inspector;
  }

  async canBindLocalEndpoint(host: string, port: number): Promise<boolean> {
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

  async waitForPortAvailability(host: string, port: number, timeout: number): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.canBindLocalEndpoint(host, port)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return false;
  }

  isLocalPortAvailableSync(port: number): boolean {
    return this.inspector.isLocalPortAvailableSync(port);
  }

  async getListeningProcessId(port: number): Promise<number | null> {
    return this.inspector.getListeningProcessId(port);
  }

  getListeningProcessIdSync(port: number): number | null {
    return this.inspector.getListeningProcessIdSync(port);
  }

  async getProcessCommandLine(pid: number): Promise<string | null> {
    return this.inspector.getProcessCommandLine(pid);
  }

  getProcessCommandLineSync(pid: number): string | null {
    return this.inspector.getProcessCommandLineSync(pid);
  }

  async getCurrentPluginManagedListenerPid(
    port: number,
    isPluginManagedCommand: (commandLine: string | null) => boolean,
  ): Promise<number | null> {
    const pid = await this.getListeningProcessId(port);
    if (!pid) {
      return null;
    }

    const commandLine = await this.getProcessCommandLine(pid);
    return isPluginManagedCommand(commandLine) ? pid : null;
  }

  getCurrentPluginManagedListenerPidSync(
    port: number,
    isPluginManagedCommand: (commandLine: string | null) => boolean,
  ): number | null {
    const pid = this.getListeningProcessIdSync(port);
    if (!pid) {
      return null;
    }

    const commandLine = this.getProcessCommandLineSync(pid);
    return isPluginManagedCommand(commandLine) ? pid : null;
  }

  async terminateManagedPid(pid: number): Promise<void> {
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

  terminateManagedPidSync(pid: number): void {
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
          void this.inspector.isPidRunning(pid).then((stillRunning) => {
            if (!stillRunning) {
              resolve(true);
              return;
            }
            logger.warn(`taskkill exited with code ${code} while stopping OpenCode`);
            resolve(false);
          });
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
      if (!this.inspector.isPidRunningSync(pid)) {
        return true;
      }
      logger.warn('Failed to synchronously terminate OpenCode process tree during dispose', {
        pid,
        error: result.error ?? null,
        status: result.status ?? null,
      });
      return false;
    }

    return true;
  }
}
