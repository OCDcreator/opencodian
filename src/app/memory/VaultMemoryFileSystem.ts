import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';

import { App, normalizePath } from 'obsidian';

import { confinedComponentWalk, isWithinRoot, resolveAnchorRealpath } from '../../core/agents/backend/configuration/PathConfinement';
import type { MemoryFileSystem } from '../../core/memory';

/**
 * `MemoryFileSystem` over the Obsidian vault adapter, rooted at the vault
 * base. All writes go through `normalizePath` (repo storage convention).
 * `mtimeMs` resolves through node fs when available (hidden dotfolders are
 * not indexed by Obsidian) and degrades to null.
 */
export class VaultMemoryFileSystem implements MemoryFileSystem {
  constructor(private readonly app: App) {}

  private adapter(): {
    exists(path: string): Promise<boolean>;
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
    remove(path: string): Promise<void>;
  } {
    return this.app.vault.adapter as never;
  }

  private async ensureParent(relativePath: string): Promise<void> {
    const parts = normalizePath(relativePath).split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!(await this.adapter().exists(dir))) {
        await this.adapter().mkdir(dir).catch(() => undefined);
      }
    }
  }

  async readFile(relativePath: string): Promise<string | null> {
    try {
      if (!(await this.adapter().exists(normalizePath(relativePath)))) return null;
      return await this.adapter().read(normalizePath(relativePath));
    } catch {
      return null;
    }
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const normalized = normalizePath(relativePath);
    await this.ensureParent(normalized);
    await this.adapter().write(normalized, content);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      return await this.adapter().exists(normalizePath(relativePath));
    } catch {
      return false;
    }
  }

  async listFiles(relativePath: string): Promise<string[]> {
    // Obsidian's DataAdapter.list() returns full vault-relative path strings
    // (ListedFiles), not TFile objects.
    const listing = await this.adapter().list(normalizePath(relativePath));
    return listing.files.map((f) => nodePath.basename(f));
  }

  async mkdir(relativePath: string): Promise<void> {
    await this.ensureParent(relativePath);
    const normalized = normalizePath(relativePath);
    if (!(await this.adapter().exists(normalized))) await this.adapter().mkdir(normalized);
  }

  async remove(relativePath: string): Promise<void> {
    await this.adapter().remove(normalizePath(relativePath));
  }

  async mtimeMs(relativePath: string): Promise<number | null> {
    try {
      const absolute = this.nativeAbsolutePath(relativePath);
      const stat = await nodeFs.promises.stat(absolute);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  async validatePath(root: string, target: string): Promise<void> {
    const vaultRoot = this.nativeAbsolutePath('');
    const absoluteRoot = this.nativeAbsolutePath(root);
    const absoluteTarget = this.nativeAbsolutePath(target);
    if (!isWithinRoot(vaultRoot, absoluteRoot) || !isWithinRoot(absoluteRoot, absoluteTarget)) throw new Error('memory-path-rejected');
    const anchor = await confinedComponentWalk(await resolveAnchorRealpath(vaultRoot), nodePath.relative(vaultRoot, absoluteRoot).split(nodePath.sep).filter(Boolean));
    await confinedComponentWalk(anchor, nodePath.relative(absoluteRoot, absoluteTarget).split(nodePath.sep).filter(Boolean));
  }

  nativeAbsolutePath(relativePath: string): string {
    const base = (this.app.vault.adapter as { basePath?: string }).basePath ?? '';
    return nodePath.join(base, normalizePath(relativePath));
  }
}
