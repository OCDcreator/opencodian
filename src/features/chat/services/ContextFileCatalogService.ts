import type { App, TAbstractFile } from 'obsidian';
import { TFile } from 'obsidian';

import { ContextFileCatalogBuildRunner } from './ContextFileCatalogBuildRunner';
import {
  ContextFileCatalogIndex,
  type ContextFileCatalog,
} from './ContextFileCatalogIndex';
export type {
  ContextFileCatalog,
  ContextFileEntry,
  ContextFileExtensionBucket,
} from './ContextFileCatalogIndex';

export class ContextFileCatalogService {
  private readonly catalogBuildRunner = new ContextFileCatalogBuildRunner();
  private catalogCache: ContextFileCatalogIndex | null = null;
  private catalogBuildPromise: Promise<ContextFileCatalogIndex> | null = null;

  constructor(private readonly app: App) {}

  async getCatalog(): Promise<ContextFileCatalog> {
    if (this.catalogCache) {
      return this.catalogCache.getCatalog();
    }

    if (this.catalogBuildPromise) {
      const catalogIndex = await this.catalogBuildPromise;
      return catalogIndex.getCatalog();
    }

    this.catalogBuildPromise = this.buildCatalogIndex();
    try {
      const catalogIndex = await this.catalogBuildPromise;
      this.catalogCache = catalogIndex;
      return catalogIndex.getCatalog();
    } finally {
      this.catalogBuildPromise = null;
    }
  }

  invalidate(): void {
    this.catalogCache = null;
    this.catalogBuildPromise = null;
  }

  handleCreate(file: TAbstractFile): void {
    if (!(file instanceof TFile)) {
      this.invalidate();
      return;
    }

    if (!this.catalogCache) {
      return;
    }

    this.catalogCache.upsertFile(file);
  }

  handleDelete(file: TAbstractFile): void {
    if (!(file instanceof TFile)) {
      this.invalidate();
      return;
    }

    if (!this.catalogCache) {
      return;
    }

    this.catalogCache.removePath(file.path);
  }

  handleRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) {
      this.invalidate();
      return;
    }

    if (!this.catalogCache) {
      return;
    }

    this.catalogCache.renameFile(file, oldPath);
  }

  private async buildCatalogIndex(): Promise<ContextFileCatalogIndex> {
    return this.catalogBuildRunner.buildIndex(this.app.vault.getFiles());
  }
}
