/**
 * Local Sidecar Process Inspector
 *
 * Queries OS-level process information needed for local OpenCode sidecar
 * management: port ownership, command lines, process status, and port
 * availability. This is a durable protocol boundary over platform-specific
 * process inspection APIs (lsof, netstat, ps, PowerShell).
 */

import { spawn, spawnSync } from 'child_process';

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
