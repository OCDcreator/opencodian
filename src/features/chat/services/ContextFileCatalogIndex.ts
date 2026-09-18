import type { TFile, TFolder } from 'obsidian';
import { TFile as TFileClass } from 'obsidian';

import {
  getContextPathExtension,
  isEligibleContextFilePath,
  isHiddenContextPath,
} from '../../../shared';

export interface ContextFileEntry {
  /** Backing vault entry; folders (R-A7) carry a `TFolder`. */
  file: TFile | TFolder;
  /** Entry kind: folders render and resolve differently from files. */
  kind: 'file' | 'folder';
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

  appendBuildFile(file: TFile | TFolder): void {
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

  upsertFile(file: TFile | TFolder): void {
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

  renameFile(file: TFile | TFolder, oldPath: string): void {
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
      // Folder entries only render under the "all" filter (R-A7) and never
      // join the extension buckets.
      if (entry.kind !== 'file' || !entry.extension) continue;
      extensionCounts.set(entry.extension, (extensionCounts.get(entry.extension) ?? 0) + 1);
    }

    this.catalog.extensions = [...extensionCounts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([value, count]) => ({ value, count }));
  }
}

function createContextFileEntry(file: TFile | TFolder): ContextFileEntry | null {
  if (!isTFile(file)) {
    // Directory entries (R-A7) join the catalog without an extension bucket;
    // they only render under the "all" filter and carry no extension. Only
    // the hidden-path rule applies — the file-extension rule is meaningless
    // for directories.
    if (isHiddenContextFilePath(file.path)) {
      return null;
    }
    const name = typeof file.name === 'string' && file.name ? file.name : file.path;
    return {
      file,
      kind: 'folder',
      lowerPath: file.path.toLowerCase(),
      lowerBasename: name.toLowerCase(),
      lowerExtension: '',
      extension: '',
    };
  }

  if (!isEligibleContextFilePath(file.path)) {
    return null;
  }

  const extension = getContextPathExtension(file.path);
  if (!extension) {
    return null;
  }

  return {
    file,
    kind: 'file',
    lowerPath: file.path.toLowerCase(),
    lowerBasename: file.basename.toLowerCase(),
    lowerExtension: extension.toLowerCase(),
    extension,
  };
}

function compareContextFileEntries(left: ContextFileEntry, right: ContextFileEntry): number {
  // Folders sort before files so a directory is findable without typing.
  if (left.kind !== right.kind) {
    return left.kind === 'folder' ? -1 : 1;
  }
  const extensionCompare = left.extension.localeCompare(right.extension);
  if (extensionCompare !== 0) {
    return extensionCompare;
  }

  const basenameCompare = entryName(left).localeCompare(entryName(right));
  if (basenameCompare !== 0) {
    return basenameCompare;
  }

  return left.file.path.localeCompare(right.file.path);
}

/** Display name: folders have no `basename` in the Obsidian API. */
function entryName(entry: ContextFileEntry): string {
  return isTFile(entry.file) ? entry.file.basename : entry.file.name;
}

/** Hidden segments rule, shared with files (`.`-prefixed path parts). */
function isHiddenContextFilePath(path: string): boolean {
  return isHiddenContextPath(path);
}

/** Narrowing helper: the catalog only holds files and folders. */
function isTFile(file: TFile | TFolder): file is TFile {
  return file instanceof TFileClass;
}
