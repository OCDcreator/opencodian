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

export class ContextFileCatalogIndex {
  private readonly catalog: ContextFileCatalog = {
    entries: [],
    extensions: [],
  };

  getCatalog(): ContextFileCatalog {
    return this.catalog;
  }

  appendBuildFile(file: TFile): void {
    const entry = createContextFileEntry(file);
    if (!entry) {
      return;
    }

    this.catalog.entries.push(entry);
  }

  finalizeBuild(): void {
    this.catalog.entries.sort(compareContextFileEntries);
    this.recomputeBuckets();
  }

  upsertFile(file: TFile): void {
    const removedCount = this.removeEntriesForPaths([file.path]);
    const nextEntry = createContextFileEntry(file);
    if (!nextEntry) {
      if (removedCount > 0) {
        this.recomputeBuckets();
      }
      return;
    }

    this.catalog.entries.push(nextEntry);
    this.catalog.entries.sort(compareContextFileEntries);
    this.recomputeBuckets();
  }

  removePath(targetPath: string): void {
    if (this.removeEntriesForPaths([targetPath]) === 0) {
      return;
    }

    this.recomputeBuckets();
  }

  renameFile(file: TFile, oldPath: string): void {
    const targetPaths = oldPath === file.path
      ? [oldPath]
      : [oldPath, file.path];
    const removedCount = this.removeEntriesForPaths(targetPaths);
    const nextEntry = createContextFileEntry(file);

    if (!nextEntry) {
      if (removedCount > 0) {
        this.recomputeBuckets();
      }
      return;
    }

    this.catalog.entries.push(nextEntry);
    this.catalog.entries.sort(compareContextFileEntries);
    this.recomputeBuckets();
  }

  private removeEntriesForPaths(targetPaths: string[]): number {
    const pathSet = new Set(targetPaths);
    const nextEntries = this.catalog.entries.filter((entry) => !pathSet.has(entry.file.path));
    const removedCount = this.catalog.entries.length - nextEntries.length;

    if (removedCount > 0) {
      this.catalog.entries = nextEntries;
    }

    return removedCount;
  }

  private recomputeBuckets(): void {
    const extensionCounts = new Map<string, number>();
    for (const entry of this.catalog.entries) {
      extensionCounts.set(entry.extension, (extensionCounts.get(entry.extension) ?? 0) + 1);
    }

    this.catalog.extensions = [...extensionCounts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([value, count]) => ({ value, count }));
  }
}

function createContextFileEntry(file: TFile): ContextFileEntry | null {
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

function compareContextFileEntries(left: ContextFileEntry, right: ContextFileEntry): number {
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
