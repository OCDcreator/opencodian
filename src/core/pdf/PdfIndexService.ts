/**
 * PdfIndexService: local, page-anchored lexical index over vault PDFs
 * (R-C4 phase 2, flowtext-c4-design §3.2). Storage lives under
 * `.opencodian/pdf-index/` — plugin data Obsidian never lists or searches —
 * and holds the extracted text layer merged into page-anchored chunks plus a
 * `ready` flag so a half built index is never queryable.
 *
 * Scoring, the selection gate and truncation are REUSED from the R-C1
 * retrieval core (`core.memory`) through `pdfIndexScoring` — this service
 * owns scheduling, storage and lifecycle only. The PDF engine is required
 * lazily through the injected `getEngine` port, so with `pdfIndexEnabled`
 * off the service is fully dormant: no engine load, no reads, no writes, no
 * query cost and byte-identical requests.
 *
 * Restart persistence needs no manifest: an index file is named by the PDF's
 * fingerprint, so the rebuild pass recomputes each listed PDF's fingerprint
 * and hydrates a valid ready file instead of re-extracting.
 */

import { createLogger } from '../../shared';
import {
  isIndexablePath,
} from '../memory/vaultRetrievalIndex';
import type { PdfPageText } from '../types';
import {
  mergePageTextsIntoChunks,
  parsePdfIndexFile,
  type PdfIndexFile,
  pdfIndexFileName,
  pdfIndexFingerprint,
} from './pdfIndexFormat';
import { type SelectedPdfSnippet,selectPdfSnippets } from './pdfIndexScoring';
import type { PdfTextEngine } from './pdfTextEngine';

const logger = createLogger('PdfIndexService');

/** One vault PDF as the fs port sees it. */
export interface PdfFileMeta {
  readonly path: string;
  readonly mtimeMs: number;
  readonly size: number;
}

/**
 * Vault + index-storage port (the `VaultIndexFs` pattern). Reads of PDF
 * bytes and index files are injected so the service is unit-testable and
 * Obsidian-free; index writes are constrained to
 * `.opencodian/pdf-index/**` by contract and are atomic (tmp → rename).
 */
export interface PdfIndexFs {
  listPdfFiles(): Promise<readonly PdfFileMeta[]>;
  /** Read a vault PDF's bytes; null when it vanished or is unreadable. */
  readPdfBinary(path: string): Promise<ArrayBuffer | null>;
  /** Atomic index write: writes `<path>.tmp` then renames onto `path`. */
  writeIndexFileAtomic(path: string, data: string): Promise<void>;
  readIndexFile(path: string): Promise<string | null>;
  deleteIndexFile(path: string): Promise<void>;
}

export interface PdfIndexSettingsSlice {
  readonly pdfIndexEnabled: boolean;
  readonly vaultRetrievalTopK: number;
  readonly vaultRetrievalMaxCharsPerNote: number;
  readonly vaultRetrievalExcludedPaths: readonly string[];
}

/** Progress surface for the chat-side status row (acceptance 4). */
export interface PdfIndexProgress {
  readonly total: number;
  readonly done: number;
  readonly currentPath: string | null;
}

/** Storage cap: evict least-recently-hit index files beyond this total size. */
export const PDF_INDEX_MAX_TOTAL_BYTES = 64 * 1024 * 1024;

export class PdfIndexService {
  private fs: PdfIndexFs | null = null;
  private getSettings: (() => PdfIndexSettingsSlice) | null = null;
  private getEngine: (() => Promise<PdfTextEngine>) | null = null;
  private files = new Map<string, PdfIndexFile>();
  private lastHitAt = new Map<string, number>();
  private rebuildGeneration = 0;
  private rebuildRunning = false;
  private disposed = false;

  /** Last observed progress snapshot (debug/settings surfaces). */
  private progress: PdfIndexProgress = { total: 0, done: 0, currentPath: null };

  onProgress(): PdfIndexProgress {
    return this.progress;
  }

  /** True while a background build batch is running (cancellable state). */
  isBuilding(): boolean {
    return this.rebuildRunning;
  }

  /** Number of PDFs with a ready index currently resident. */
  indexedPdfCount(): number {
    return [...this.files.values()].filter((file) => file.ready).length;
  }

  /**
   * Attach ports. Does nothing until `onSettingsChanged()` observes an
   * enabled setting; the engine port is only invoked when a build runs.
   */
  attach(
    fs: PdfIndexFs,
    getSettings: () => PdfIndexSettingsSlice,
    getEngine: () => Promise<PdfTextEngine>,
  ): void {
    this.fs = fs;
    this.getSettings = getSettings;
    this.getEngine = getEngine;
  }

  /** React to settings changes: start or cancel the background build. */
  async onSettingsChanged(): Promise<void> {
    if (!this.fs || !this.getSettings || this.disposed) {
      return;
    }
    if (!this.getSettings().pdfIndexEnabled) {
      // Off: cancel any in-flight build; nothing new is indexed or served.
      this.rebuildGeneration += 1;
      this.rebuildRunning = false;
      this.progress = { total: 0, done: 0, currentPath: null };
      return;
    }
    void this.rebuildAll();
  }

  /** Drop every index file (memory + disk) and rebuild from scratch. */
  async invalidateAll(): Promise<void> {
    if (!this.fs) {
      return;
    }
    this.rebuildGeneration += 1;
    for (const path of [...this.files.keys()]) {
      try {
        await this.fs.deleteIndexFile(path);
      } catch (error) {
        logger.debug('failed to delete pdf index during invalidate', { path, error });
      }
    }
    this.files.clear();
    this.lastHitAt.clear();
  }

  /**
   * Background pass: index missing/stale PDFs in yielding batches, prune
   * stale-fingerprint and orphaned indexes, then enforce the storage cap
   * (design §3.2). A generation bump (settings off / invalidateAll / dispose)
   * cancels an in-flight pass — nothing partial is ever marked ready.
   */
  async rebuildAll(): Promise<void> {
    if (!this.fs || !this.getSettings || !this.getEngine || this.rebuildRunning) {
      return;
    }
    // Structural off state: a disabled feature never reads PDFs, never
    // writes index files and never loads the engine — even on a direct call.
    if (!this.getSettings().pdfIndexEnabled) {
      return;
    }
    const generation = ++this.rebuildGeneration;
    this.rebuildRunning = true;
    try {
      const settings = this.getSettings();
      const pdfs = await this.fs.listPdfFiles();
      const indexable = pdfs.filter((pdf) =>
        pdf.path.toLowerCase().endsWith('.pdf')
        && isIndexablePath(pdf.path, settings.vaultRetrievalExcludedPaths));
      this.progress = { total: indexable.length, done: 0, currentPath: null };
      const indexedPaths = new Set<string>();
      let done = 0;
      for (const pdf of indexable) {
        if (generation !== this.rebuildGeneration || this.disposed) {
          return; // Cancelled.
        }
        indexedPaths.add(pdf.path);
        const fingerprint = pdfIndexFingerprint(pdf);
        const indexPath = pdfIndexFileName(fingerprint);
        const known = await this.hydrateOrReuse(indexPath, pdf.path, fingerprint);
        if (known) {
          done += 1;
          continue;
        }
        this.progress = { total: indexable.length, done, currentPath: pdf.path };
        const built = await this.buildIndexFor(pdf, fingerprint, generation);
        if (generation !== this.rebuildGeneration || this.disposed) {
          return;
        }
        if (built) {
          this.files.set(indexPath, built);
        }
        done += 1;
        this.progress = { total: indexable.length, done, currentPath: null };
        // Yield between documents so the UI never blocks (acceptance 4).
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      // Prune: stale-fingerprint files (same PDF, superseded build) and
      // orphans whose PDF vanished or became excluded since the last pass.
      for (const [indexPath, file] of [...this.files.entries()]) {
        if (!indexedPaths.has(file.pdfPath)) {
          await this.deleteIndexQuietly(indexPath);
        }
      }
      await this.evictOverCapacity();
    } catch (error) {
      // Fail-soft: a failed build pass never breaks the chat path, and the
      // files map only ever holds fully written, ready indexes.
      logger.warn('pdf index rebuild failed', { error });
    } finally {
      if (generation === this.rebuildGeneration) {
        this.rebuildRunning = false;
        this.progress = { total: 0, done: 0, currentPath: null };
      }
    }
  }

  /**
   * Query the index: R-C1 scoring over ready chunk tables. Returns the hit
   * fragments only — never a whole document — and stays fail-soft (any error
   * yields no snippets). Off state returns [] without touching storage.
   */
  async select(query: string): Promise<readonly SelectedPdfSnippet[]> {
    if (!this.getSettings || !this.getSettings().pdfIndexEnabled || query.trim() === '') {
      return [];
    }
    const settings = this.getSettings();
    const ready = [...this.files.values()].filter((file) => file.ready);
    if (ready.length === 0) {
      return [];
    }
    try {
      const snippets = selectPdfSnippets({
        query,
        files: ready,
        topK: settings.vaultRetrievalTopK,
        maxCharsPerPdf: settings.vaultRetrievalMaxCharsPerNote,
      });
      const now = Date.now();
      for (const snippet of snippets) {
        this.lastHitAt.set(snippet.pdfPath, now);
      }
      return snippets;
    } catch (error) {
      logger.warn('pdf index select failed; injecting nothing this turn', { error });
      return [];
    }
  }

  /**
   * Build (or rebuild) one PDF's index and write it atomically: the tmp file
   * is renamed onto the final path only when the complete chunk table is
   * serialized, with `ready: true` in that same write — a crash leaves
   * either the old index or no index, never a queryable half build.
   */
  private async buildIndexFor(
    pdf: PdfFileMeta,
    fingerprint: string,
    generation: number,
  ): Promise<PdfIndexFile | null> {
    if (!this.fs || !this.getEngine) {
      return null;
    }
    let engine: PdfTextEngine;
    try {
      engine = await this.getEngine();
    } catch (error) {
      // Fail-closed: without the engine there is no index, no partial file.
      logger.warn('pdf index build skipped: engine unavailable', { path: pdf.path, error });
      return null;
    }
    let binary: ArrayBuffer | null;
    try {
      binary = await this.fs.readPdfBinary(pdf.path);
    } catch (error) {
      logger.warn('pdf index build failed to read pdf bytes', { path: pdf.path, error });
      return null;
    }
    if (binary === null) {
      return null;
    }
    let pages: PdfPageText[] = [];
    try {
      const extracted = await engine.extractPages(binary, { maxPages: Number.MAX_SAFE_INTEGER });
      pages = extracted.pages;
    } catch (error) {
      // Encrypted/unreadable PDFs are skipped honestly — no empty index.
      logger.warn('pdf index build extraction failed', { path: pdf.path, error });
      return null;
    }
    if (generation !== this.rebuildGeneration || this.disposed) {
      return null;
    }

    const chunks = mergePageTextsIntoChunks(pdf.path, pages);
    const indexFile: PdfIndexFile = {
      version: 1,
      pdfPath: pdf.path,
      fingerprint,
      ready: true,
      chunks,
    };
    try {
      await this.fs.writeIndexFileAtomic(pdfIndexFileName(fingerprint), JSON.stringify(indexFile));
    } catch (error) {
      logger.warn('pdf index write failed; nothing marked ready', { path: pdf.path, error });
      return null;
    }
    return indexFile;
  }

  /**
   * Restart hydration: a valid, ready on-disk index for the CURRENT
   * fingerprint is loaded into memory instead of re-extracting the PDF.
   * Returns null when anything fails (then the caller rebuilds).
   */
  private async hydrateOrReuse(
    indexPath: string,
    pdfPath: string,
    fingerprint: string,
  ): Promise<boolean> {
    const resident = this.files.get(indexPath);
    if (resident?.ready && resident.fingerprint === fingerprint && resident.pdfPath === pdfPath) {
      return true;
    }
    let raw: string | null = null;
    try {
      raw = await this.fs?.readIndexFile(indexPath) ?? null;
    } catch (error) {
      logger.debug('failed to read pdf index during hydrate', { indexPath, error });
      return false;
    }
    if (!raw) {
      return false;
    }
    const parsed = parsePdfIndexFile(raw, fingerprint);
    if (!parsed || parsed.pdfPath !== pdfPath) {
      return false;
    }
    this.files.set(indexPath, parsed);
    return true;
  }

  private async deleteIndexQuietly(indexPath: string): Promise<void> {
    try {
      await this.fs?.deleteIndexFile(indexPath);
    } catch (error) {
      logger.debug('failed to prune pdf index', { indexPath, error });
    }
    this.files.delete(indexPath);
  }

  /**
   * Capacity governance (R-B3 style): when the resident index exceeds
   * `PDF_INDEX_MAX_TOTAL_BYTES`, evict least-recently-hit PDFs first.
   */
  private async evictOverCapacity(): Promise<void> {
    const sizes = new Map<string, number>();
    let total = 0;
    for (const [indexPath, file] of this.files.entries()) {
      const size = Buffer.byteLength(JSON.stringify(file), 'utf8');
      sizes.set(indexPath, size);
      total += size;
    }
    if (total <= PDF_INDEX_MAX_TOTAL_BYTES) {
      return;
    }
    const ordered = [...this.files.keys()].sort((a, b) =>
      (this.lastHitAt.get(this.files.get(a)?.pdfPath ?? '') ?? 0)
      - (this.lastHitAt.get(this.files.get(b)?.pdfPath ?? '') ?? 0));
    for (const indexPath of ordered) {
      if (total <= PDF_INDEX_MAX_TOTAL_BYTES) {
        break;
      }
      const size = sizes.get(indexPath) ?? 0;
      const existed = this.files.has(indexPath);
      await this.deleteIndexQuietly(indexPath);
      if (existed) {
        total -= size;
      }
    }
  }

  /** Release caches (plugin unload); an in-flight build observes disposal. */
  dispose(): void {
    this.disposed = true;
    this.rebuildGeneration += 1;
    this.files.clear();
    this.lastHitAt.clear();
    this.fs = null;
    this.getSettings = null;
    this.getEngine = null;
  }
}
