/**
 * `VaultEmbeddingFileSystem`: `VaultEmbeddingFsAdapter` over the Obsidian
 * vault API for the R-E4 embedding index (app.memory-runtime owner, sibling
 * of `VaultIndexFileSystem`).
 *
 * Notes are listed/read read-only; the only writes land under
 * `.opencodian/vault-embeddings/**` (dot-prefixed, invisible in the vault
 * surface). Vault change events feed the incremental re-embed pass, debounced
 * here so edit storms do not spam the embedding endpoint.
 */

import type { App } from 'obsidian';

import type { VaultEmbeddingFsAdapter } from '../../core/memory';

const EMBEDDINGS_ROOT = '.opencodian/vault-embeddings';
const CHANGE_DEBOUNCE_MS = 2000;

function isDotHidden(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'));
}

export class VaultEmbeddingFileSystem implements VaultEmbeddingFsAdapter {
  private debounceTimer: number | null = null;

  constructor(private readonly app: App) {}

  async listMarkdownFiles(): Promise<Array<{ path: string; content: string; title: string }>> {
    const files = this.app.vault
      .getFiles()
      .filter((file) => file.extension.toLowerCase() === 'md' && !isDotHidden(file.path));
    const out: Array<{ path: string; content: string; title: string }> = [];
    for (const file of files) {
      try {
        const content = await this.app.vault.cachedRead(file);
        out.push({
          path: file.path,
          content,
          title: file.basename,
        });
      } catch {
        // Unreadable note: skip (the index pass reports its own totals).
      }
    }
    return out;
  }

  async readFile(path: string): Promise<string | null> {
    this.assertEmbeddingsPath(path);
    try {
      return await this.app.vault.adapter.read(path);
    } catch {
      return null;
    }
  }

  async writeFile(path: string, data: string): Promise<void> {
    this.assertEmbeddingsPath(path);
    await this.ensureDir();
    await this.app.vault.adapter.write(path, data);
  }

  async exists(path: string): Promise<boolean> {
    try {
      return await this.app.vault.adapter.exists(path);
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    if (path !== EMBEDDINGS_ROOT) {
      throw new Error(`VaultEmbeddingFileSystem: refused mkdir outside ${EMBEDDINGS_ROOT}: ${path}`);
    }
    if (!(await this.exists(EMBEDDINGS_ROOT))) {
      try {
        await this.app.vault.adapter.mkdir(EMBEDDINGS_ROOT);
      } catch {
        // Concurrent creation is fine.
      }
    }
  }

  onFilesChanged(callback: () => void): void {
    const schedule = () => {
      if (this.debounceTimer !== null) {
        window.clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = window.setTimeout(() => {
        this.debounceTimer = null;
        callback();
      }, CHANGE_DEBOUNCE_MS);
    };
    const refs = [
      this.app.vault.on('modify', (file) => {
        if (this.isEmbeddableNote(file.path)) {
          schedule();
        }
      }),
      this.app.vault.on('create', (file) => {
        if (this.isEmbeddableNote(file.path)) {
          schedule();
        }
      }),
      this.app.vault.on('delete', (file) => {
        if (this.isEmbeddableNote(file.path)) {
          schedule();
        }
      }),
      this.app.vault.on('rename', (file, oldPath) => {
        void file;
        if (this.isEmbeddableNote(oldPath) || this.isEmbeddableNote(file.path)) {
          schedule();
        }
      }),
    ];
    void refs;
  }

  private isEmbeddableNote(path: string): boolean {
    return path.toLowerCase().endsWith('.md') && !isDotHidden(path);
  }

  private assertEmbeddingsPath(path: string): void {
    const normalized = path.replace(/\\/gu, '/');
    if (!normalized.startsWith(`${EMBEDDINGS_ROOT}/`)) {
      throw new Error(
        `VaultEmbeddingFileSystem: refused access outside ${EMBEDDINGS_ROOT}: ${path}`,
      );
    }
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.exists(EMBEDDINGS_ROOT))) {
      try {
        await this.app.vault.adapter.mkdir(EMBEDDINGS_ROOT);
      } catch {
        // Concurrent creation is fine.
      }
    }
  }
}
