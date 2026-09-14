/**
 * `ExternalMemoryFileSystem`: `MemoryFileSystem` over node fs for a shared
 * external store root (opencode-zmem / ZCode workspace-memory tree). Paths are
 * absolute native paths — the vault-relative contract of
 * `VaultMemoryFileSystem` does not apply; this adapter owns the root and
 * resolves everything against it.
 *
 * The root may be given with a leading `~` (expanded against the user home
 * dir) so one settings value (for example `~/.zcode/cli/memories`) survives
 * cross-machine settings sync between Windows and macOS hosts.
 */

import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import type { MemoryFileSystem } from '../../core/memory';

/** Expand a leading `~` / `~/segment` against the user home directory. */
export function expandHomeDir(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (trimmed === '~') return nodeOs.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    // Split on either separator: nodePath.join only treats `\` as a
    // separator on Windows, so `~\a\b` would become a literal-backslash
    // directory on macOS/Linux without this.
    return nodePath.join(nodeOs.homedir(), ...trimmed.slice(2).split(/[\\/]+/u));
  }
  return trimmed;
}

export class ExternalMemoryFileSystem implements MemoryFileSystem {
  private readonly root: string;

  constructor(rootPath: string) {
    this.root = nodePath.resolve(expandHomeDir(rootPath));
  }

  /** Resolved absolute store root. */
  get resolvedRoot(): string {
    return this.root;
  }

  private abs(absolutePath: string): string {
    return nodePath.resolve(absolutePath);
  }

  async readFile(absolutePath: string): Promise<string | null> {
    try {
      return await nodeFs.promises.readFile(this.abs(absolutePath), 'utf8');
    } catch {
      return null;
    }
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    const target = this.abs(absolutePath);
    await nodeFs.promises.mkdir(nodePath.dirname(target), { recursive: true });
    await nodeFs.promises.writeFile(target, content, 'utf8');
  }

  async exists(absolutePath: string): Promise<boolean> {
    try {
      await nodeFs.promises.access(this.abs(absolutePath));
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(absolutePath: string): Promise<string[]> {
    const entries = await nodeFs.promises.readdir(this.abs(absolutePath), { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  }

  async mkdir(absolutePath: string): Promise<void> {
    await nodeFs.promises.mkdir(this.abs(absolutePath), { recursive: true });
  }

  async remove(absolutePath: string): Promise<void> {
    await nodeFs.promises.rm(this.abs(absolutePath), { force: true });
  }

  async mtimeMs(absolutePath: string): Promise<number | null> {
    try {
      const stat = await nodeFs.promises.stat(this.abs(absolutePath));
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  nativeAbsolutePath(absolutePath: string): string {
    return nodePath.resolve(absolutePath);
  }
}
