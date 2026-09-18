/**
 * EditRevertStore — disk IO for R-B3 edit-revert checkpoints.
 *
 * Owns the `.opencodian/checkpoints/` layout (content-addressed `blobs/`,
 * per-round JSON under `rounds/`), round-file persistence/loading, and the
 * unreferenced-blob sweep. All filesystem access goes through the Obsidian
 * vault adapter — never the raw filesystem. Retention *planning* is pure
 * (`planRoundEvictions` in shared.editRevertPlan); this class only executes
 * eviction decisions made by `EditRevertService`.
 */

import { createHash } from 'node:crypto';

import { type App, normalizePath } from 'obsidian';

import { createLogger } from '../../shared';
import type { EditRevertRoundMeta } from '../types';

const logger = createLogger('EditRevertStore');

export const CHECKPOINTS_DIR = '.opencodian/checkpoints';
export const CHECKPOINT_BLOBS_DIR = `${CHECKPOINTS_DIR}/blobs`;
export const CHECKPOINT_ROUNDS_DIR = `${CHECKPOINTS_DIR}/rounds`;

export interface StoredImage {
  hash: string;
  bytes: number;
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function roundDirName(conversationId: string): string {
  const slug = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
  const digest = sha256Hex(conversationId).slice(0, 8);
  return `${slug}-${digest}`;
}

export class EditRevertStore {
  private readonly blobBytesByHash = new Map<string, number>();

  constructor(private readonly app: App) {}

  async prepare(): Promise<void> {
    await this.ensureDir(CHECKPOINT_BLOBS_DIR);
    await this.ensureDir(CHECKPOINT_ROUNDS_DIR);
  }

  private async ensureDir(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!(await this.app.vault.adapter.exists(normalized))) {
      await this.app.vault.adapter.mkdir(normalized);
    }
  }

  private blobPath(hash: string): string {
    return `${CHECKPOINT_BLOBS_DIR}/${hash}`;
  }

  roundFilePath(meta: Pick<EditRevertRoundMeta, 'id' | 'conversationId'>): string {
    return `${CHECKPOINT_ROUNDS_DIR}/${roundDirName(meta.conversationId)}/${meta.id}.json`;
  }

  /** Persist the given round meta as JSON (single line; small and schema-less). */
  async saveRound(meta: EditRevertRoundMeta): Promise<void> {
    await this.ensureDir(`${CHECKPOINT_ROUNDS_DIR}/${roundDirName(meta.conversationId)}`);
    await this.app.vault.adapter.write(
      normalizePath(this.roundFilePath(meta)),
      JSON.stringify(meta),
    );
  }

  async removeRound(meta: Pick<EditRevertRoundMeta, 'id' | 'conversationId'>): Promise<void> {
    await this.app.vault.adapter.remove(normalizePath(this.roundFilePath(meta)));
  }

  /** Content-addressed blob write; existing blobs are skipped (dedup). */
  async storeBlob(content: string): Promise<StoredImage> {
    const hash = sha256Hex(content);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (!this.blobBytesByHash.has(hash)) {
      await this.app.vault.adapter.write(normalizePath(this.blobPath(hash)), content);
      this.blobBytesByHash.set(hash, bytes);
    }
    return { hash, bytes };
  }

  async readBlob(hash: string): Promise<string | null> {
    try {
      return await this.app.vault.adapter.read(normalizePath(this.blobPath(hash)));
    } catch {
      return null;
    }
  }

  getBlobBytes(hash: string): number {
    return this.blobBytesByHash.get(hash) ?? 0;
  }

  /** Cache the on-disk size of a blob; `fallback` covers recently written blobs. */
  async statBlob(hash: string, fallback: number): Promise<number> {
    if (this.blobBytesByHash.has(hash)) {
      return this.blobBytesByHash.get(hash) ?? fallback;
    }
    try {
      const stat = await this.app.vault.adapter.stat(normalizePath(this.blobPath(hash)));
      const size = stat?.size ?? fallback;
      this.blobBytesByHash.set(hash, size);
      return size;
    } catch {
      this.blobBytesByHash.set(hash, fallback);
      return fallback;
    }
  }

  forgetBlobBytes(hash: string): void {
    this.blobBytesByHash.delete(hash);
  }

  /** List on-disk blob hashes (best-effort; unreadable/missing dir => empty). */
  async listBlobHashes(): Promise<string[]> {
    try {
      const listed = await this.app.vault.adapter.list(normalizePath(CHECKPOINT_BLOBS_DIR));
      return listed.files
        .map((file) => file.split('/').pop() ?? '')
        .filter((name) => /^[0-9a-f]{64}$/.test(name));
    } catch {
      return [];
    }
  }

  async removeBlob(hash: string): Promise<void> {
    await this.app.vault.adapter.remove(normalizePath(this.blobPath(hash)));
    this.blobBytesByHash.delete(hash);
  }

  /**
   * Load every persisted round meta. Rounds restored from disk are never
   * writable again (`acceptsWritesUntil` is clamped to `now`): a restart ends
   * any in-flight capture window, matching the fail-closed rule that revert
   * requires a settled round.
   */
  async loadRoundMetas(now: number): Promise<EditRevertRoundMeta[]> {
    const rounds: EditRevertRoundMeta[] = [];
    let folders: string[] = [];
    try {
      const listed = await this.app.vault.adapter.list(normalizePath(CHECKPOINT_ROUNDS_DIR));
      folders = listed.folders;
    } catch {
      return rounds;
    }
    for (const folder of folders) {
      let files: string[] = [];
      try {
        const listed = await this.app.vault.adapter.list(normalizePath(folder));
        files = listed.files.filter((file) => file.endsWith('.json'));
      } catch {
        continue;
      }
      for (const file of files) {
        try {
          const raw = await this.app.vault.adapter.read(normalizePath(file));
          const meta = JSON.parse(raw) as EditRevertRoundMeta;
          if (!meta || typeof meta.id !== 'string' || typeof meta.conversationId !== 'string') {
            continue;
          }
          meta.acceptsWritesUntil = Math.min(meta.acceptsWritesUntil ?? 0, now);
          meta.lastActivityAtHint = meta.lastActivityAtHint ?? meta.createdAt;
          rounds.push(meta);
        } catch {
          logger.warn('skipping corrupt edit revert round file', { file });
        }
      }
    }
    return rounds;
  }
}
