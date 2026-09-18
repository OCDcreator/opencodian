/**
 * `PdfIndexFileSystem`: `PdfIndexFs` over the Obsidian vault API/adapter for
 * the R-C4 local PDF index (app.pdf-runtime owner). Mirrors the R-C1
 * `VaultIndexFileSystem` pattern: PDFs are listed/read read-only, the only
 * writes land under `.opencodian/pdf-index/**` — a dot-prefixed directory
 * Obsidian never lists or searches — and index writes are atomic
 * (tmp file → rename) so a crash never leaves a half written index at the
 * final path.
 */

import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { PDF_INDEX_ROOT, type PdfFileMeta, type PdfIndexFs } from '../../core/pdf';

function isDotHidden(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'));
}

export class PdfIndexFileSystem implements PdfIndexFs {
  constructor(private readonly app: App) {}

  async listPdfFiles(): Promise<readonly PdfFileMeta[]> {
    return this.app.vault
      .getFiles()
      .filter((file) => file.extension.toLowerCase() === 'pdf' && !isDotHidden(file.path))
      .map((file) => ({
        path: file.path,
        mtimeMs: file.stat.mtime,
        size: file.stat.size,
      }));
  }

  async readPdfBinary(path: string): Promise<ArrayBuffer | null> {
    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        return null;
      }
      return await this.app.vault.readBinary(file);
    } catch {
      return null;
    }
  }

  async writeIndexFileAtomic(path: string, data: string): Promise<void> {
    this.assertIndexPath(path);
    await this.ensureIndexDir();
    const tmpPath = `${path}.tmp`;
    await this.app.vault.adapter.write(tmpPath, data);
    try {
      await this.app.vault.adapter.rename(tmpPath, path);
    } catch (error) {
      // Never leave the tmp file behind on a failed rename.
      await this.app.vault.adapter.remove(tmpPath).catch(() => undefined);
      throw error;
    }
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

  private assertIndexPath(path: string): void {
    const normalized = path.replace(/\\/gu, '/');
    if (!normalized.startsWith(`${PDF_INDEX_ROOT}/`)) {
      throw new Error(`PdfIndexFileSystem: refused write outside ${PDF_INDEX_ROOT}: ${path}`);
    }
  }

  private async ensureIndexDir(): Promise<void> {
    if (!(await this.app.vault.adapter.exists(PDF_INDEX_ROOT))) {
      try {
        await this.app.vault.adapter.mkdir(PDF_INDEX_ROOT);
      } catch {
        // Concurrent creation is fine.
      }
    }
  }
}
