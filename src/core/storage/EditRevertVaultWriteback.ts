/**
 * EditRevertVaultWriteback — the ONLY vault write path for R-B3 revert ops.
 *
 * Isolated from `EditRevertService` because this is the plugin's one
 * destructive-write seam: revert/restore write file contents back, and
 * reverting a turn-created file moves it to the Obsidian trash. Every write
 * goes through `vault.process` / `vault.create` / `vault.trash` — never the
 * raw filesystem — and every write arms a self-write guard so the service's
 * vault-event funnel does not record the revert itself as a new agent edit.
 */

import { type App, normalizePath, TFile } from 'obsidian';

import type { EditRevertActionResult, EditRevertFileEntry } from '../types';
import type { EditRevertStore, StoredImage } from './EditRevertStore';

const SELF_WRITE_GUARD_MS = 5000;

export class EditRevertVaultWriteback {
  private readonly selfWrites = new Map<string, number>();

  constructor(
    private readonly app: App,
    private readonly store: EditRevertStore,
    private readonly now: () => number,
  ) {}

  /** Read the current vault content and store it as the restore blob. */
  async captureCurrentContent(path: string): Promise<StoredImage | null> {
    const content = await this.readVaultFile(path);
    if (content === null) {
      return null;
    }
    return this.store.storeBlob(content);
  }

  /**
   * Revert one entry to its pre-turn state: turn-created files go to the
   * Obsidian trash; modified/deleted files get their pre-image content back
   * (re-creating the file when the current one vanished). The pre-revert
   * content is kept as `restoreHash` so the revert itself is undoable.
   */
  async applyRevert(entry: EditRevertFileEntry): Promise<EditRevertActionResult> {
    if (entry.status === 'moved') {
      // A recorded move reverts by renaming the file back; renameFile also
      // restores the references Obsidian rewrote when the batch moved it.
      if (!entry.movedTo) {
        return { ok: false, changed: 0, skipped: [entry.path], error: 'no-move-target' };
      }
      const renamed = await this.renameVaultFile(entry.movedTo, entry.path);
      if (!renamed.ok) {
        entry.lastError = renamed.error;
        return { ok: false, changed: 0, skipped: [entry.path], error: renamed.error };
      }
      entry.state = 'reverted';
      entry.lastError = undefined;
      return { ok: true, changed: 1, skipped: [] };
    }

    if (entry.status === 'created') {
      const restore = await this.captureCurrentContent(entry.path);
      if (restore) {
        entry.restoreHash = restore.hash;
        entry.restoreBytes = restore.bytes;
      }
      const trashed = await this.trashVaultFile(entry.path);
      if (!trashed.ok) {
        entry.lastError = trashed.error;
        return { ok: false, changed: 0, skipped: [entry.path], error: trashed.error };
      }
      entry.state = 'reverted';
      entry.lastError = undefined;
      return { ok: true, changed: 1, skipped: [] };
    }

    if (!entry.preImageHash) {
      return { ok: false, changed: 0, skipped: [entry.path], error: 'no-preimage' };
    }
    const preImage = await this.store.readBlob(entry.preImageHash);
    if (preImage === null) {
      entry.lastError = 'preimage-blob-missing';
      return { ok: false, changed: 0, skipped: [entry.path], error: 'preimage-blob-missing' };
    }
    const restore = await this.captureCurrentContent(entry.path);
    if (restore) {
      entry.restoreHash = restore.hash;
      entry.restoreBytes = restore.bytes;
    }
    const write = await this.writeVaultContent(entry.path, preImage, !restore);
    if (!write.ok) {
      entry.lastError = write.error;
      return { ok: false, changed: 0, skipped: [entry.path], error: write.error };
    }
    entry.state = 'reverted';
    entry.lastError = undefined;
    return { ok: true, changed: 1, skipped: [] };
  }

  /** Undo a revert by writing the captured restore content back. */
  async applyRestore(entry: EditRevertFileEntry): Promise<EditRevertActionResult> {
    if (entry.status === 'moved') {
      // Re-do the move the revert undid (same reference-updating path).
      if (!entry.movedTo) {
        return { ok: false, changed: 0, skipped: [entry.path], error: 'no-move-target' };
      }
      const renamed = await this.renameVaultFile(entry.path, entry.movedTo);
      if (!renamed.ok) {
        entry.lastError = renamed.error;
        return { ok: false, changed: 0, skipped: [entry.path], error: renamed.error };
      }
      entry.state = 'active';
      entry.lastError = undefined;
      return { ok: true, changed: 1, skipped: [] };
    }
    if (!entry.restoreHash) {
      return { ok: false, changed: 0, skipped: [entry.path], error: 'not-restorable' };
    }
    const content = await this.store.readBlob(entry.restoreHash);
    if (content === null) {
      entry.lastError = 'restore-blob-missing';
      return { ok: false, changed: 0, skipped: [entry.path], error: 'restore-blob-missing' };
    }
    const exists = await this.readVaultFile(entry.path);
    const write = await this.writeVaultContent(entry.path, content, exists === null);
    if (!write.ok) {
      entry.lastError = write.error;
      return { ok: false, changed: 0, skipped: [entry.path], error: write.error };
    }
    entry.state = 'active';
    entry.lastError = undefined;
    return { ok: true, changed: 1, skipped: [] };
  }

  /** True when `consumeSelfWrite` should swallow the next vault event for `path`. */
  consumeSelfWrite(path: string, now: number): boolean {
    const guardUntil = this.selfWrites.get(path);
    if (guardUntil === undefined) {
      return false;
    }
    this.selfWrites.delete(path);
    return guardUntil >= now;
  }

  /**
   * Rename/move through `app.fileManager.renameFile` — the only rename path
   * that also updates existing links to the file. Refuses when the source is
   * missing or the target path is already occupied (never overwrite).
   */
  private async renameVaultFile(
    currentPath: string,
    newPath: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(currentPath));
      if (!(file instanceof TFile)) {
        return { ok: false, error: 'file-missing' };
      }
      if (this.app.vault.getAbstractFileByPath(normalizePath(newPath))) {
        return { ok: false, error: 'target-exists' };
      }
      await this.app.fileManager.renameFile(file, normalizePath(newPath));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async readVaultFile(path: string): Promise<string | null> {
    try {
      return await this.app.vault.adapter.read(normalizePath(path));
    } catch {
      return null;
    }
  }

  private async writeVaultContent(
    path: string,
    content: string,
    createIfMissing: boolean,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    this.selfWrites.set(path, this.now() + SELF_WRITE_GUARD_MS);
    try {
      const abstractFile = this.app.vault.getAbstractFileByPath(normalizePath(path));
      if (abstractFile instanceof TFile) {
        await this.app.vault.process(abstractFile, () => content);
        return { ok: true };
      }
      if (createIfMissing) {
        await this.app.vault.create(normalizePath(path), content);
        return { ok: true };
      }
      return { ok: false, error: 'file-missing' };
    } catch (error) {
      this.selfWrites.delete(path);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async trashVaultFile(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
    this.selfWrites.set(path, this.now() + SELF_WRITE_GUARD_MS);
    try {
      const abstractFile = this.app.vault.getAbstractFileByPath(normalizePath(path));
      if (!(abstractFile instanceof TFile)) {
        return { ok: false, error: 'file-missing' };
      }
      await this.app.vault.trash(abstractFile, false);
      return { ok: true };
    } catch (error) {
      this.selfWrites.delete(path);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
