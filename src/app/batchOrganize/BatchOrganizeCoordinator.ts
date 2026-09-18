/**
 * BatchOrganizeCoordinator — vault-facing runtime for R-B5 batch note
 * organizing. Deterministic plugin code, not a model-driven flow: it compiles
 * a task template + user parameters into a plan, previews it from live vault
 * state, and only executes after an explicit confirm handshake.
 *
 * Safety rails (mechanism-based, per requirement §11.3):
 * - preview is real: file count + concrete list computed from the actual
 *   vault state at preview time (metadata cache + content);
 * - stale-plan rule (fail closed): right before writing, the plan is
 *   recomputed from current vault state and compared by signature with the
 *   confirmed preview; any difference — files added/removed/renamed in
 *   between — aborts with ZERO writes and asks for a fresh preview;
 * - forced snapshot (fail closed): every execution opens a plugin-initiated
 *   R-B3 capture round (`beginBatchCapture`) that pre-images every affected
   * file before the first write; when the snapshot layer is unavailable or
 *   disabled the batch refuses to run at all;
 * - writes go only through `app.fileManager.renameFile` (moves/renames —
 *   references update automatically) and `app.fileManager.processFrontMatter`
 *   (property edits — YAML formatting and property types survive);
 * - target folders that do not exist are created before the first write
 *   (`vault.createFolder`, disclosed in the preview; failure is fail closed
 *   with an explicit prompt and zero writes); folders a batch created are
 *   removed again on revert when left empty, restoring the pre-batch shape;
 * - per-operation target-existence re-checks: a plan never overwrites.
 *
 * `main.ts` only constructs/disposes this coordinator and registers the
 * launch commands; all behavior lives here and in the pure planner
 * (`src/shared/batchOrganizePlan.ts`).
 */

import { type App, normalizePath, TFile } from 'obsidian';

import type { EditRevertActionResult, EditRevertServicePort } from '../../core/types';
import {
  applyBatchPropertyOperation,
  type BatchNoteSnapshot,
  type BatchOperation,
  type BatchPlanResult,
  type BatchScope,
  type BatchTemplateParams,
  buildBatchPlan,
  collectTargetFolders,
  matchesBatchScope,
  normalizeTagList,
  planSignature,
  validatePropertyName,
  validateRenameRule,
  validateTargetFolder,
} from '../../shared';
import { createLogger } from '../../shared';

const logger = createLogger('BatchOrganizeCoordinator');

/** Frontmatter key Obsidian injects for the cache block position — not a user property. */
const FRONTMATTER_POSITION_KEY = 'position';

export interface BatchPreview {
  readonly templateId: BatchTemplateParams['templateId'];
  readonly result: BatchPlanResult;
  /** Stable signature used for the stale-plan handshake. */
  readonly signature: string;
  /** Number of notes matching the scope before conflict exclusion. */
  readonly matchedCount: number;
  /** Target folders that do not exist yet and would be created by this batch. */
  readonly foldersToCreate: readonly string[];
}

export type BatchPreviewOutcome =
  | { status: 'ok'; preview: BatchPreview }
  | { status: 'invalid'; code: 'invalid-folder' | 'invalid-rename-rule' | 'invalid-property-name' };

export type BatchExecuteOutcome =
  | {
      status: 'ok';
      batchId: string;
      changed: number;
      failures: readonly string[];
      /** Folders created by this batch; revert removes the ones left empty. */
      createdFolders: readonly string[];
    }
  | { status: 'stale-plan' }
  | { status: 'empty' }
  | { status: 'snapshot-unavailable' }
  /** Fail closed: target folder could not be created — nothing was written. */
  | { status: 'folder-unavailable'; folder: string };

export class BatchOrganizeCoordinator {
  private readonly app: App;
  private readonly editRevert: EditRevertServicePort | null;
  private lastBatchId: string | null = null;
  /** Folders each executed batch created, so revert can remove the emptied ones. */
  private readonly createdFoldersByBatch = new Map<string, string[]>();
  private static batchSeq = 0;

  constructor(options: { app: App; editRevert: EditRevertServicePort | null }) {
    this.app = options.app;
    this.editRevert = options.editRevert;
  }

  /** Compute the preview from the current vault state (no writes). */
  async buildPreview(template: BatchTemplateParams): Promise<BatchPreviewOutcome> {
    const invalid = validateTemplate(template);
    if (invalid) {
      return { status: 'invalid', code: invalid };
    }
    const snapshots = await this.collectSnapshots(scopeNeedsContent(template.params.scope));
    const files = this.app.vault.getMarkdownFiles();
    const existingPaths = new Set(files.map((file) => file.path));
    const result = buildBatchPlan(template, snapshots, existingPaths);
    return {
      status: 'ok',
      preview: {
        templateId: template.templateId,
        result,
        signature: planSignature(result),
        matchedCount: snapshots.filter((note) => matchesBatchScope(note, template.params.scope)).length,
        // Folder existence is NOT part of the stale-plan signature: ensuring a
        // folder is idempotent, and a folder the user created in between is
        // simply adopted instead of recreated.
        foldersToCreate: collectTargetFolders(result.plan.operations)
          .filter((folder) => !this.folderExists(folder)),
      },
    };
  }

  /**
   * Execute a confirmed preview. `confirmedSignature` must equal a signature
   * the user saw and confirmed; the plan is recomputed first and any drift
   * aborts with zero writes.
   */
  async execute(template: BatchTemplateParams, confirmedSignature: string): Promise<BatchExecuteOutcome> {
    const outcome = await this.buildPreview(template);
    if (outcome.status !== 'ok' || outcome.preview.signature !== confirmedSignature) {
      return { status: 'stale-plan' };
    }
    const operations = outcome.preview.result.plan.operations;
    if (operations.length === 0) {
      return { status: 'empty' };
    }

    const beginBatchCapture = this.editRevert?.beginBatchCapture?.bind(this.editRevert);
    if (!beginBatchCapture) {
      logger.warn('batch organize refused to run: snapshot layer unavailable');
      return { status: 'snapshot-unavailable' };
    }
    const batchId = `batch-organize-${Date.now()}-${++BatchOrganizeCoordinator.batchSeq}`;
    // Forced R-B3 snapshot of every affected file BEFORE the first write
    // (folder creation included — it is a vault mutation even though notes
    // are not touched by it).
    const captured = await beginBatchCapture(
      batchId,
      operations.map((operation) => sourcePathOf(operation)),
    );
    if (!captured) {
      logger.warn('batch organize refused to run: edit revert disabled');
      return { status: 'snapshot-unavailable' };
    }

    // `FileManager.renameFile` does NOT create missing parent folders —
    // without this step every move into a fresh folder fails silently.
    // Fail closed: if a folder cannot be created, roll back the ones just
    // created and report; nothing has been written yet.
    const ensured = await this.ensureTargetFolders(operations);
    if (!ensured.ok) {
      await this.removeEmptyFolders(ensured.created);
      await this.editRevert?.endBatchCapture?.(batchId);
      logger.warn('batch organize refused to run: target folder could not be created', { folder: ensured.folder });
      return { status: 'folder-unavailable', folder: ensured.folder };
    }    this.createdFoldersByBatch.set(batchId, ensured.created);

    const failures: string[] = [];
    let changed = 0;
    try {
      for (const operation of operations) {
        const failure = await this.applyOperation(batchId, operation, template);
        if (failure) {
          failures.push(failure);
        } else {
          changed += 1;
        }
      }
    } finally {
      await this.editRevert?.endBatchCapture?.(batchId);
    }
    let createdFolders = ensured.created;
    if (changed === 0 && createdFolders.length > 0) {
      // Nothing changed: drop the folders created for this batch right away
      // so the vault is left exactly as before (there is nothing to revert).
      await this.removeEmptyFolders(createdFolders);
      createdFolders = [];
    }
    if (createdFolders.length > 0) {
      this.createdFoldersByBatch.set(batchId, [...createdFolders]);
    }
    this.lastBatchId = batchId;
    if (failures.length > 0) {
      logger.warn('batch organize finished with skipped files', { batchId, failures });
    }
    return { status: 'ok', batchId, changed, failures, createdFolders };
  }

  /**
   * One-click revert of the most recent batch (null when none recorded).
   * After the R-B3 revert of the file entries, folders this batch created
   * are removed when they are now empty, so the vault returns to its
   * pre-batch shape; a folder that received other content in the meantime is
   * kept (never delete user content).
   */
  async revertLastBatch(): Promise<EditRevertActionResult | null> {
    if (!this.lastBatchId || !this.editRevert) {
      return null;
    }
    const result = await this.editRevert.revertAll(this.lastBatchId);
    const created = this.createdFoldersByBatch.get(this.lastBatchId);
    if (created && created.length > 0) {
      await this.removeEmptyFolders(created);
    }
    return result;
  }

  /** True when a completed batch of this session can still be reverted. */
  hasLastBatch(): boolean {
    return this.lastBatchId !== null;
  }

  getLastBatchId(): string | null {
    return this.lastBatchId;
  }

  // --- execution ---------------------------------------------------------------

  /** Returns the failed source path, or null on success. */
  private async applyOperation(
    batchId: string,
    operation: BatchOperation,
    template: BatchTemplateParams,
  ): Promise<string | null> {
    try {
      if (operation.kind === 'edit-properties') {
        return await this.applyPropertyEdit(batchId, operation.path, template);
      }
      return await this.applyRename(batchId, operation.from, operation.to);
    } catch (error) {
      logger.warn('batch operation failed', { error, operation });
      return sourcePathOf(operation);
    }
  }

  private async applyRename(batchId: string, from: string, to: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(from);
    if (!(file instanceof TFile)) {
      return from;
    }
    // Never overwrite: the plan excluded occupied targets, but the vault may
    // have changed since (in which case the stale-plan check already fired —
    // this is a final defensive gate).
    if (to !== from && this.app.vault.getAbstractFileByPath(to)) {
      return from;
    }
    await this.app.fileManager.renameFile(file, to);
    await this.editRevert?.notePluginMove?.(batchId, from, to);
    return null;
  }

  private async applyPropertyEdit(
    batchId: string,
    path: string,
    template: BatchTemplateParams,
  ): Promise<string | null> {
    if (template.templateId !== 'edit-properties') {
      return path;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return path;
    }
    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      applyBatchPropertyOperation(frontmatter, template.params.operation);
    });
    await this.editRevert?.notePluginWrite?.(batchId, path);
    return null;
  }

  // --- target folder handling -----------------------------------------------------

  private folderExists(folder: string): boolean {
    if (!folder) {
      return true; // vault root always exists
    }
    return this.app.vault.getAbstractFileByPath(folder) !== null;
  }

  /**
   * Create every missing target folder (`vault.createFolder` creates missing
   * ancestors; the list is parent-before-child sorted, so this is also
   * idempotent across the operations of one batch). Resolves the folders this
   * call created, or the folder it failed on.
   */
  private async ensureTargetFolders(
    operations: readonly BatchOperation[],
  ): Promise<{ ok: true; created: string[] } | { ok: false; folder: string; created: string[] }> {
    const created: string[] = [];
    for (const folder of collectTargetFolders(operations)) {
      if (this.folderExists(folder)) {
        continue;
      }
      try {
        await this.app.vault.createFolder(normalizePath(folder));
        created.push(folder);
      } catch (error) {
        logger.warn('failed to create batch target folder', { error, folder });
        return { ok: false, folder, created };
      }
    }
    return { ok: true, created };
  }

  /**
   * Remove the given folders deepest-first, but ONLY when they are empty —
   * this is what makes a reverted batch leave the vault exactly as it was,
   * while a folder that gained user content in the meantime is kept.
   */
  private async removeEmptyFolders(folders: readonly string[]): Promise<string[]> {
    const removed: string[] = [];
    for (const folder of [...folders].sort().reverse()) {
      try {
        const normalized = normalizePath(folder);
        const listing = await this.app.vault.adapter.list(normalized);
        if (listing.files.length > 0 || listing.folders.length > 0) {
          continue;
        }
        await this.app.vault.adapter.remove(normalized);
        removed.push(folder);
      } catch (error) {
        logger.warn('batch organize folder cleanup skipped', { error, folder });
      }
    }
    return removed;
  }

  // --- snapshot collection -------------------------------------------------------

  /**
   * Build plain note snapshots from the metadata cache (tags + frontmatter)
   * and — only for keyword scopes — note content. No writes; reads use the
   * Obsidian cache/read APIs.
   */
  private async collectSnapshots(withContent: boolean): Promise<BatchNoteSnapshot[]> {
    const files = this.app.vault.getMarkdownFiles();
    const snapshots: BatchNoteSnapshot[] = [];
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const properties = sanitizeFrontmatter(cache?.frontmatter);
      const inlineTags = (cache?.tags ?? []).map((tag) => tag.tag);
      let contentText: string | undefined;
      if (withContent) {
        try {
          contentText = (await this.app.vault.cachedRead(file)).toLowerCase();
        } catch (error) {
          logger.warn('failed to read note content for keyword match', { error, path: file.path });
        }
      }
      snapshots.push({
        path: file.path,
        name: file.basename,
        tags: normalizeTagList(properties.tags, inlineTags),
        properties,
        ...(contentText !== undefined ? { contentText } : {}),
      });
    }
    return snapshots;
  }
}

function scopeNeedsContent(scope: BatchScope): boolean {
  return scope.kind === 'keyword';
}

/** Copy frontmatter without Obsidian's internal `position` key. */
function sanitizeFrontmatter(frontmatter: Record<string, unknown> | undefined | null): Record<string, unknown> {
  if (!frontmatter) {
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key !== FRONTMATTER_POSITION_KEY) {
      result[key] = value;
    }
  }
  return result;
}

function sourcePathOf(operation: BatchOperation): string {
  return operation.kind === 'edit-properties' ? operation.path : operation.from;
}

function validateTemplate(template: BatchTemplateParams): 'invalid-folder' | 'invalid-rename-rule' | 'invalid-property-name' | null {
  if (template.templateId === 'move-notes') {
    return validateTargetFolder(template.params.targetFolder) === null ? 'invalid-folder' : null;
  }
  if (template.templateId === 'rename-by-rule') {
    return validateRenameRule(template.params);
  }
  return validatePropertyName(template.params.operation.name);
}
