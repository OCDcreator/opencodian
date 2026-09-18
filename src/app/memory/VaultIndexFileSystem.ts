/**
 * `VaultIndexFileSystem`: `VaultIndexFs` over the Obsidian vault API/adapter
 * for the R-C1 whole-vault retrieval index (app.memory-runtime owner).
 *
 * Notes are listed/read read-only; the only writes land under
 * `.opencodian/vault-index/**` — a dot-prefixed directory Obsidian never
 * shows in the file list, quick switcher or search, so the index cannot
 * pollute the user's vault surface. Vault change events (modify/create/
 * delete/rename) feed the service's incremental indexer; renames are
 * reported as delete(old)+create(new) so shards never go stale.
 */

import type { App } from 'obsidian';

import type {
  VaultChangeKind,
  VaultFileMeta,
  VaultIndexFs,
} from '../../core/memory';

const INDEX_ROOT = '.opencodian/vault-index';
const MANIFEST_PATH = `${INDEX_ROOT}/manifest.json`;

function isDotHidden(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'));
}

export class VaultIndexFileSystem implements VaultIndexFs {
  constructor(private readonly app: App) {}

  async listMarkdownFiles(): Promise<readonly VaultFileMeta[]> {
    return this.app.vault
      .getFiles()
      .filter((file) => file.extension.toLowerCase() === 'md' && !isDotHidden(file.path))
      .map((file) => ({ path: file.path, mtimeMs: file.stat.mtime }));
  }

  async read(path: string): Promise<string | null> {
    try {
      return await this.app.vault.adapter.read(path);
    } catch {
      return null;
    }
  }

  async writeIndexFile(path: string, data: string): Promise<void> {
    this.assertIndexPath(path);
    await this.ensureIndexDir(path);
    await this.app.vault.adapter.write(path, data);
  }

  async readIndexFile(path: string): Promise<string | null> {
    this.assertIndexPath(path);
    try {
      return await this.app.vault.adapter.read(path);
    } catch {
      return null;
    }
  }

  async deleteIndexFile(path: string): Promise<void> {
    this.assertIndexPath(path);
    try {
      await this.app.vault.adapter.remove(path);
    } catch {
      // Missing file is the common end state; nothing to do.
    }
  }

  onVaultChanged(handler: (path: string, kind: VaultChangeKind) => void): () => void {
    const refs = [
      this.app.vault.on('modify', (file) => {
        if (this.isIndexedNote(file.path)) {
          handler(file.path, 'modify');
        }
      }),
      this.app.vault.on('create', (file) => {
        if (this.isIndexedNote(file.path)) {
          handler(file.path, 'create');
        }
      }),
      this.app.vault.on('delete', (file) => {
        if (this.isIndexedNote(file.path)) {
          handler(file.path, 'delete');
        }
      }),
      this.app.vault.on('rename', (file, oldPath) => {
        if (this.isIndexedNote(oldPath)) {
          handler(oldPath, 'delete');
        }
        if (this.isIndexedNote(file.path)) {
          handler(file.path, 'create');
        }
      }),
    ];
    return () => {
      for (const ref of refs) {
        this.app.vault.offref(ref);
      }
    };
  }

  private isIndexedNote(path: string): boolean {
    return path.toLowerCase().endsWith('.md') && !isDotHidden(path);
  }

  private assertIndexPath(path: string): void {
    const normalized = path.replace(/\\/gu, '/');
    if (normalized !== MANIFEST_PATH && !normalized.startsWith(`${INDEX_ROOT}/`)) {
      throw new Error(`VaultIndexFileSystem: refused write outside ${INDEX_ROOT}: ${path}`);
    }
  }

  private async ensureIndexDir(path: string): Promise<void> {
    const dir = path.replace(/\\/gu, '/').split('/').slice(0, -1).join('/');
    if (dir === '' || dir === INDEX_ROOT) {
      if (dir === INDEX_ROOT && !(await this.app.vault.adapter.exists(INDEX_ROOT))) {
        try {
          await this.app.vault.adapter.mkdir(INDEX_ROOT);
        } catch {
          // Concurrent creation is fine.
        }
      }
      return;
    }
    if (!(await this.app.vault.adapter.exists(dir))) {
      try {
        await this.app.vault.adapter.mkdir(dir);
      } catch {
        // Concurrent creation is fine.
      }
    }
  }
}
