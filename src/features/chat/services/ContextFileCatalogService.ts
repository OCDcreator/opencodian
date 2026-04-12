import type { App, TAbstractFile } from 'obsidian';
import { TFile } from 'obsidian';

import {
  getContextPathExtension,
  isEligibleContextFilePath,
} from '../../../shared';

export interface ContextFileEntry {
  file: TFile;
  lowerPath: string;
  lowerBasename: string;
  lowerExtension: string;
  extension: string;
}

export interface ContextFileExtensionBucket {
  value: string;
  count: number;
}

export interface ContextFileCatalog {
  entries: ContextFileEntry[];
  extensions: ContextFileExtensionBucket[];
}

export class ContextFileCatalogService {
  private catalogCache: ContextFileCatalog | null = null;
  private catalogBuildPromise: Promise<ContextFileCatalog> | null = null;

  constructor(private readonly app: App) {}

  async getCatalog(): Promise<ContextFileCatalog> {
    if (this.catalogCache) {
      return this.catalogCache;
    }

    if (this.catalogBuildPromise) {
      return this.catalogBuildPromise;
    }

    this.catalogBuildPromise = this.buildCatalog();
    try {
      const catalog = await this.catalogBuildPromise;
      this.catalogCache = catalog;
      return catalog;
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

    this.upsertEntry(file);
  }

  handleDelete(file: TAbstractFile): void {
    if (!(file instanceof TFile)) {
      this.invalidate();
      return;
    }

    if (!this.catalogCache) {
      return;
    }

    this.removeEntry(file.path);
  }

  handleRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) {
      this.invalidate();
      return;
    }

    if (!this.catalogCache) {
      return;
    }

    this.removeEntry(oldPath);
    this.upsertEntry(file);
  }

  private async buildCatalog(): Promise<ContextFileCatalog> {
    const files = this.app.vault.getFiles();
    const entries: ContextFileEntry[] = [];
    const extensionCounts = new Map<string, number>();
    const batchSize = 400;

    for (let index = 0; index < files.length; index += batchSize) {
      const batch = files.slice(index, index + batchSize);
      for (const file of batch) {
        const entry = this.createEntry(file);
        if (!entry) {
          continue;
        }

        entries.push(entry);
        extensionCounts.set(entry.extension, (extensionCounts.get(entry.extension) ?? 0) + 1);
      }

      if (index + batchSize < files.length) {
        await this.yieldCatalogBuild();
      }
    }

    entries.sort((left, right) => this.compareEntries(left, right));

    return {
      entries,
      extensions: this.buildExtensionBuckets(extensionCounts),
    };
  }

  private createEntry(file: TFile): ContextFileEntry | null {
    if (!isEligibleContextFilePath(file.path)) {
      return null;
    }

    const extension = getContextPathExtension(file.path);
    if (!extension) {
      return null;
    }

    return {
      file,
      lowerPath: file.path.toLowerCase(),
      lowerBasename: file.basename.toLowerCase(),
      lowerExtension: extension.toLowerCase(),
      extension,
    };
  }

  private buildExtensionBuckets(extensionCounts: Map<string, number>): ContextFileExtensionBucket[] {
    return [...extensionCounts.entries()]
      .sort((left, right) => {
        return left[0].localeCompare(right[0]);
      })
      .map(([value, count]) => ({ value, count }));
  }

  private async yieldCatalogBuild(): Promise<void> {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  private upsertEntry(file: TFile): void {
    if (!this.catalogCache) {
      return;
    }

    const existingIndex = this.catalogCache.entries.findIndex((entry) => entry.file.path === file.path);
    if (existingIndex >= 0) {
      this.catalogCache.entries.splice(existingIndex, 1);
    }

    const nextEntry = this.createEntry(file);
    if (!nextEntry) {
      this.recomputeBuckets();
      return;
    }

    this.catalogCache.entries.push(nextEntry);
    this.catalogCache.entries.sort((left, right) => this.compareEntries(left, right));
    this.recomputeBuckets();
  }

  private removeEntry(targetPath: string): void {
    if (!this.catalogCache) {
      return;
    }

    const nextEntries = this.catalogCache.entries.filter((entry) => entry.file.path !== targetPath);
    if (nextEntries.length === this.catalogCache.entries.length) {
      return;
    }

    this.catalogCache.entries = nextEntries;
    this.recomputeBuckets();
  }

  private recomputeBuckets(): void {
    if (!this.catalogCache) {
      return;
    }

    const extensionCounts = new Map<string, number>();
    for (const entry of this.catalogCache.entries) {
      extensionCounts.set(entry.extension, (extensionCounts.get(entry.extension) ?? 0) + 1);
    }

    this.catalogCache.extensions = this.buildExtensionBuckets(extensionCounts);
  }

  private compareEntries(left: ContextFileEntry, right: ContextFileEntry): number {
    const extensionCompare = left.extension.localeCompare(right.extension);
    if (extensionCompare !== 0) {
      return extensionCompare;
    }

    const basenameCompare = left.file.basename.localeCompare(right.file.basename);
    if (basenameCompare !== 0) {
      return basenameCompare;
    }

    return left.file.path.localeCompare(right.file.path);
  }
}
