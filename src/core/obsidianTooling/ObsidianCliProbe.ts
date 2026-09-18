/**
 * Availability probe for the Obsidian desktop CLI (R-B4).
 *
 * The CLI bundled with the desktop app is an app-control surface: it drives
 * the currently running Obsidian instance. "Available" therefore means both
 * "installed / on PATH" and "answered a version query", which is what this
 * probe checks (`<cli> version`, short timeout, no vault mutation).
 *
 * Injectable: tests supply a fake spawn implementation; the production
 * default uses node:child_process. Never throws — a probe failure is a
 * structured result, not an exception (fail-closed honesty in the UI).
 */

import { spawn as nodeSpawn } from 'child_process';

export type CliSpawnFn = (
  command: string,
  args: readonly string[],
  onTimeout: (kill: () => void) => void,
) => Promise<{ code: number | null; stdout: string; stderr: string; error?: NodeJS.ErrnoException }>;

export type ObsidianCliProbeResult =
  | { status: 'available'; version: string; detail?: string }
  | { status: 'not-found'; detail?: string }
  | { status: 'timeout'; detail?: string }
  | { status: 'error'; detail: string };

export interface ProbeObsidianCliInput {
  /** CLI command to probe (default `obsidian`). */
  readonly command?: string;
  /** Probe timeout in ms (default 5000). */
  readonly timeoutMs?: number;
  /** Injectable spawn implementation (tests). */
  readonly spawn?: CliSpawnFn;
}

export const OBSIDIAN_CLI_DEFAULT_COMMAND = 'obsidian';
export const OBSIDIAN_CLI_PROBE_TIMEOUT_MS = 5000;

function defaultSpawn(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  onTimeout: (kill: () => void) => void,
): Promise<{ code: number | null; stdout: string; stderr: string; error?: NodeJS.ErrnoException }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child: ReturnType<typeof nodeSpawn>;
    try {
      child = nodeSpawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: '', error: error as NodeJS.ErrnoException });
      return;
    }
    const finish = (result: { code: number | null; error?: NodeJS.ErrnoException }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr });
    };
    const kill = (): void => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    };
    const timer = setTimeout(() => {
      onTimeout(kill);
    }, timeoutMs);
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish({ code: null, error });
    });
    child.on('close', (code) => {
      finish({ code });
    });
  });
}

/**
 * Probe the CLI. Resolves with a structured result; rejects nothing except
 * programmer error.
 */
export async function probeObsidianCli(input: ProbeObsidianCliInput = {}): Promise<ObsidianCliProbeResult> {
  const command = input.command ?? OBSIDIAN_CLI_DEFAULT_COMMAND;
  const timeoutMs = input.timeoutMs ?? OBSIDIAN_CLI_PROBE_TIMEOUT_MS;
  const spawnImpl = input.spawn
    ?? ((cmd: string, args: readonly string[], onTimeout: (kill: () => void) => void) =>
      defaultSpawn(cmd, args, timeoutMs, onTimeout));
  let timedOut = false;
  const timeoutGuard = setTimeout(() => {
    timedOut = true;
  }, timeoutMs + 50);
  try {
    const outcome = await spawnImpl(command, ['version'], () => {
      timedOut = true;
    });
    if (timedOut) {
      return { status: 'timeout', ...(outcome.stderr.trim() ? { detail: outcome.stderr.trim() } : {}) };
    }
    if (outcome.error) {
      if (outcome.error.code === 'ENOENT') {
        return { status: 'not-found', detail: `${command}: command not found` };
      }
      return { status: 'error', detail: outcome.error.message };
    }
    if (outcome.code !== 0) {
      const detail = (outcome.stderr || outcome.stdout).trim();
      return { status: 'error', detail: detail || `${command} exited with code ${outcome.code}` };
    }
    const version = outcome.stdout.trim().split(/\r?\n/)[0]?.trim() ?? '';
    if (!version) {
      return { status: 'error', detail: `${command} version produced no output` };
    }
    return { status: 'available', version };
  } catch (error) {
    return { status: 'error', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeoutGuard);
  }
}
