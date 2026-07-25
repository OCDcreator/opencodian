/**
 * Shared secure configuration / project-resource write helpers.
 *
 * Isolates the high-risk security boundary for writing user-editable resource
 * and configuration files. Two layers live here, both guarded by the same
 * realpath + symlink-escape chokepoint:
 *
 *   Legacy project-resource CRUD (assertWithinRoot / atomicWriteFile): name
 *   safety, single-root path-traversal protection, atomic temp+rename write.
 *
 *   Shared safe configuration contract (see docs/adr/0001): explicit
 *   allowlisted roots (global/project/local), FileRevision (canonicalPath +
 *   mtime + size + sha256) conflict detection, archive-before-mutation with overwrite retention (10) and
 *   never-auto-pruned deleted retention, restore, manual clear, and strict
 *   JSON/JSONC/TOML validation plus comment-preserving JSONC path edits.
 *
 * Global configuration roots are writable ONLY when passed explicitly via an
 * allowlist entry; the realpath parent-walk remains the single escape guard.
 */
/* eslint-disable max-lines -- This is the single secure-write chokepoint for both legacy project-resource CRUD and the complete-configuration mutation contract (allowlist, FileRevision, archive/restore). Splitting would duplicate the security boundary. */

import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';

import { constants, existsSync, type Stats } from 'fs';
import { lstat, mkdir, open, readFile, realpath, rmdir, stat, unlink, writeFile } from 'fs/promises';
import {
  applyEdits as applyJsoncEdits,
  type FormattingOptions,
  type JSONPath,
  modify as modifyJsonc,
  parse as parseJsonc,
  type ParseError,
  printParseErrorCode,
} from 'jsonc-parser';
import * as path from 'path';
import { parse as parseToml } from 'smol-toml';

import {
  linkFileAtCommit,
  renameFileAtCommit,
  unlinkFileAtCommit,
} from './ConfigurationFileCommitOperations';
import { confinedComponentWalk, isENOENTError } from './PathConfinement';

// Re-export the archive owner and its public surface so callers can import the
// complete contract from the secure-write module.
export {
  type ArchiveContext,
  type ArchiveEntry,
  type ArchiveHistoryCatalogOutcome,
  type ArchiveHistoryEntryAssociation,
  type ArchiveHistoryEntryIdentity,
  type ArchiveHistoryEntryKind,
  type ArchiveHistoryEntrySummary,
  type ArchiveHistoryTarget,
  type ArchiveManifest,
  type ClearDeletedResult,
  ConfigurationArchiveService,
  OVERWRITE_RETENTION_LIMIT,
  type ReadArchiveHistoryEntryOutcome,
  type ReadDeletedOutcome,
} from './ConfigurationArchiveService';
import {
  type ArchiveContext,
  type ArchiveHistoryCatalogOutcome,
  type ArchiveHistoryEntryIdentity,
  type ClearDeletedResult,
  ConfigurationArchiveService,
} from './ConfigurationArchiveService';

export type ProjectResourceWriteError =
  | 'empty-vault'
  | 'invalid-name'
  | 'duplicate'
  | 'path-traversal'
  | 'outside-project-root'
  | 'outside-allowlist'
  | 'archive-failed'
  | 'not-found'
  | 'write-failed';

export class ProjectResourceError extends Error {
  constructor(public readonly code: ProjectResourceWriteError) {
    super(code);
    this.name = 'ProjectResourceError';
  }
}

/** A safe resource name: non-empty, no path separators, no leading dot, no control chars. */
export function isSafeResourceName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.startsWith('.')) {
    return false;
  }
  if (/[\\/:]/.test(trimmed)) {
    return false;
  }
  // eslint-disable-next-line no-control-regex -- rejecting ASCII control chars is intentional for path safety
  if (/[\x00-\x1f]/.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Secure within-root assertion via a real-path parent-walk. This is the single
 * chokepoint that prevents create/update/delete from following a symlink out of
 * the vault into ~/.claude / ~/.agents / ~/.codex.
 *
 * Unlike a purely lexical `path.resolve` check, this resolves symlinks on the
 * root and on every existing component between the real root and the target:
 *   - The root is resolved with `realpath` (so a symlinked vault root is
 *     anchored to its real target).
 *   - Each existing path component is `lstat`-ed; if it is a symlink, its real
 *     target is resolved and must stay within the real root, otherwise the
 *     operation is rejected as `path-traversal`.
 *   - For a non-existent target (create), the walk stops at the first missing
 *     component and trusts the already-verified parent (the new file/dir is
 *     created fresh under a safe ancestor).
 *
 * Must be `await`-ed at every create/update/delete site before any write or
 * delete. Callers are already async.
 */
export async function assertWithinRoot(rootPath: string, targetPath: string): Promise<void> {
  const lexicalRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);

  // Compute the relative path from the lexical root to the target. This keeps
  // both bases consistent (important on platforms where the root itself lives
  // behind a symlink, e.g. macOS /var -> /private/var); the relative
  // components are then walked from the REAL root below.
  const rel = path.relative(lexicalRoot, normalizedTarget);
  if (rel === '' ) {
    // target is the root itself.
  } else if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ProjectResourceError('path-traversal');
  }

  let realRoot: string;
  try {
    realRoot = await realpath(rootPath);
  } catch {
    throw new ProjectResourceError('outside-project-root');
  }

  // Delegate the symlink-aware parent-walk to the shared confinement owner.
  // Any escape (symlink or lexical), unresolved symlink, or non-ENOENT
  // filesystem error fails closed as path-traversal.
  const components = rel.split(path.sep).filter((component) => component.length > 0);
  try {
    await confinedComponentWalk(realRoot, components);
  } catch {
    throw new ProjectResourceError('path-traversal');
  }
}

/**
 * Atomic write: write to a temp file in the same directory, then rename. If
 * the rename fails, the temp file is removed so no half-written file remains.
 */
export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.opencodian-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(tempPath, content, 'utf-8');
    await renameFileAtCommit(tempPath, targetPath);
  } catch (err) {
    try {
      if (existsSync(tempPath)) {
        await unlink(tempPath);
      }
    } catch {
      // Ignore temp cleanup failures.
    }
    throw err;
  }
}

/**
 * Atomically publish a fully-written new file without replacing an existing
 * target. The temp file and target share a directory, so `link` is an atomic
 * create-if-absent operation; a concurrent creator receives `exists` and can
 * surface a revision conflict instead of silently overwriting the winner.
 */
async function atomicCreateFile(targetPath: string, content: string): Promise<'created' | 'exists'> {
  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.opencodian-create-${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
  try {
    await writeFile(tempPath, content, { encoding: 'utf8', flag: 'wx' });
    try {
      await linkFileAtCommit(tempPath, targetPath);
      return 'created';
    } catch (err) {
      if (err !== null && typeof err === 'object' && (err as { code?: string }).code === 'EEXIST') {
        return 'exists';
      }
      throw err;
    }
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // Best-effort cleanup; the target hard link remains valid after success.
    }
  }
}

/** Convert a thrown error (or ProjectResourceError) into a write-error code. */
export function toWriteErrorCode(err: unknown): ProjectResourceWriteError {
  if (err instanceof ProjectResourceError) {
    return err.code;
  }
  return 'write-failed';
}

// ---------------------------------------------------------------------------
// Shared safe configuration contract
// ---------------------------------------------------------------------------
//
// This section extends the secure-write chokepoint with a *complete
// configuration* mutation contract used by the configuration-completeness
// work (see docs/adr/0001). It is additive: the legacy project-resource
// CRUD callers above are untouched. The new contract adds:
//
//   - explicit allowlisted roots (global / project / local) with the same
//     realpath + symlink-escape protection as assertWithinRoot
//   - FileRevision (canonicalPath + mtime + size + sha256) optimistic-
//     concurrency conflict detection (all four fields compared)
//   - archive-before-mutation with overwrite retention (10) and
//     never-auto-pruned deleted retention, plus restore + manual clear
//   - strict JSON / JSONC / TOML content validation and JSONC path edits
//     that preserve comments, key order, unknown fields, indent and EOL
//
// Global configuration roots are NO LONGER strictly read-only when they are
// passed explicitly via an allowlist entry; the realpath parent-walk is the
// single guard that prevents a symlink/path-traversal escape out of any
// allowlisted root.

/** Configuration scope: which root layer a file belongs to. */
export type ConfigurationScope = 'global' | 'project' | 'local';

/** Configuration file format, used for validation and archive extensions. */
export type ConfigurationFormat = 'markdown' | 'json' | 'jsonc' | 'toml';

/**
 * Canonical revision of a file on disk. Conflict detection compares ALL FOUR
 * fields (canonicalPath, mtimeMs, size, sha256) via `revisionsMatch`: any
 * divergence is an external modification → conflict. sha256 is NOT the sole
 * token — an identical-content rewrite with a changed mtime, or a different
 * same-content file (different canonicalPath), also conflicts.
 */
export interface FileRevision {
  readonly canonicalPath: string;
  readonly mtimeMs: number;
  readonly size: number;
  readonly sha256: string;
}

/**
 * A single allowlisted root. The plugin resolves the real (symlink-resolved)
 * root at use time; callers only supply the lexical root path and its scope.
 */
export interface ConfigurationAllowlistEntry {
  readonly scope: ConfigurationScope;
  readonly rootPath: string;
}

export type ConfigurationAllowlist = readonly ConfigurationAllowlistEntry[];

/** Result of resolving a target against an allowlist. */
export interface AllowlistMatch {
  readonly scope: ConfigurationScope;
  readonly canonicalRoot: string;
  readonly canonicalTarget: string;
}

/**
 * Discriminated result of a safe file mutation. Every mutating operation
 * (write/delete/restore) returns one of these; the caller must branch on
 * `status`. There is intentionally no "force overwrite" status — external
 * changes always surface as `conflict`.
 */
export type SafeFileMutationResult =
  | { status: 'success'; revision: FileRevision; previousRevision?: FileRevision }
  | { status: 'conflict'; expected: FileRevision | null; current: FileRevision | null }
  | { status: 'invalid-content'; diagnostics: readonly ContentDiagnostic[] }
  | { status: 'invalid-path' }
  | { status: 'not-found' }
  | { status: 'archive-failed'; cause: string }
  | { status: 'write-failed'; cause: string };

/** A single content-validation diagnostic. */
export interface ContentDiagnostic {
  readonly message: string;
  readonly offset?: number;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; diagnostics: readonly ContentDiagnostic[] };

/**
 * Configuration evidence along the three axes that determine whether a
 * setting is *completely* configured (see CONTEXT.md / ADR 0001).
 *
 *   - persistence: the value is durably stored in a source the plugin owns
 *   - application: the value is actually wired into the backend request
 *   - runtime:     the backend confirmed the effective value in a response
 *
 * `verified` means proven; `unavailable` means the backend version does not
 * expose it; `failed` means a readback attempt failed; `pending` means the
 * proof is queued (e.g. next turn); `not-applicable` means the axis does not
 * apply to this setting.
 */
export type ConfigurationEvidenceStatus =
  | 'verified'
  | 'pending'
  | 'unavailable'
  | 'failed'
  | 'not-applicable';

export type ConfigurationEvidenceAxis = 'persistence' | 'application' | 'runtime';

export interface ConfigurationEvidence {
  readonly persistence: ConfigurationEvidenceStatus;
  readonly application: ConfigurationEvidenceStatus;
  readonly runtime: ConfigurationEvidenceStatus;
  readonly detail?: string;
}

/** A configuration is completely proven only when all three axes are verified. */
export function isConfigurationEvidenceComplete(evidence: ConfigurationEvidence): boolean {
  return (
    evidence.persistence === 'verified'
    && evidence.application === 'verified'
    && evidence.runtime === 'verified'
  );
}

/** Options describing where archives for a given target are stored. */
export interface ConfigurationArchiveOptions {
  /**
   * Archive root. Defaults to ~/.opencodian/archive. Injectable for tests.
   * Layout under the root:
   *   <backend>/<scope>/<kind>/<first-16-hex-sha256(canonicalPath)>/
   *     manifest.json
   *     versions/<utc-ms>-overwrite.<ext>
   *     deleted/<utc-ms>-delete.<ext>
   */
  readonly archiveRootPath?: string;
  readonly backend: string;
  readonly kind: string;
  readonly format: ConfigurationFormat;
}

/** Resolve the default archive root (~/.opencodian/archive). */
export function resolveDefaultArchiveRoot(): string {
  return path.join(homedir(), '.opencodian', 'archive');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Two revisions match only when ALL of canonicalPath, mtimeMs, size, and sha256
 * agree. Any divergence is an external modification → conflict. This catches a
 * same-content rewrite with a changed mtime and a different same-content file
 * (different canonicalPath), not just content changes.
 */
function revisionsMatch(a: FileRevision, b: FileRevision): boolean {
  return a.canonicalPath === b.canonicalPath
    && a.mtimeMs === b.mtimeMs
    && a.size === b.size
    && a.sha256 === b.sha256;
}

/**
 * Resolve the canonical (realpath-anchored) target if it stays within
 * `realRoot`, otherwise null. Mirrors assertWithinRoot's symlink-aware
 * parent-walk but returns the resolved target instead of asserting.
 *
 * The relative path is computed from the *lexical* root (not realRoot) so the
 * two bases stay consistent on platforms where the root lives behind a symlink
 * (e.g. macOS /var -> /private/var); the walk itself descends from realRoot.
 *
 * For a non-existent target (create), the walk stops at the first missing
 * component and anchors the lexical remainder under the last verified
 * ancestor, which is safe because everything below is freshly created.
 */
async function resolveCanonicalTargetWithinRoot(
  lexicalRoot: string,
  realRoot: string,
  targetPath: string,
): Promise<string | null> {
  const normalizedTarget = path.resolve(targetPath);
  const rel = path.relative(lexicalRoot, normalizedTarget);
  if (rel === '') {
    return realRoot;
  }
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  const components = rel.split(path.sep).filter((c) => c.length > 0);
  // Delegate to the shared confinement owner. Any escape, unresolved symlink,
  // or non-ENOENT error returns null (fail-closed) instead of silently anchoring.
  try {
    return await confinedComponentWalk(realRoot, components);
  } catch {
    return null;
  }
}

/**
 * Assert that `targetPath` resolves inside exactly one allowlisted root and
 * return the matched scope plus canonical root/target. Rejects with
 * `ProjectResourceError('outside-allowlist')` when no root contains the
 * target, and `path-traversal` if a symlink attempts to escape a matched
 * root (handled inside resolveCanonicalTargetWithinRoot by returning null).
 *
 * This is the multi-root counterpart of assertWithinRoot. The first matching
 * root wins; callers should avoid overlapping roots.
 */
export async function assertWithinAllowlistedRoot(
  allowlist: ConfigurationAllowlist,
  targetPath: string,
): Promise<AllowlistMatch> {
  if (allowlist.length === 0) {
    throw new ProjectResourceError('outside-allowlist');
  }
  for (const entry of allowlist) {
    const lexicalRoot = path.resolve(entry.rootPath);
    let realRoot: string;
    try {
      realRoot = await realpath(lexicalRoot);
    } catch {
      continue;
    }
    const canonicalTarget = await resolveCanonicalTargetWithinRoot(lexicalRoot, realRoot, path.resolve(targetPath));
    if (canonicalTarget === null) {
      continue;
    }
    if (canonicalTarget === realRoot || canonicalTarget.startsWith(realRoot + path.sep)) {
      return { scope: entry.scope, canonicalRoot: realRoot, canonicalTarget };
    }
  }
  throw new ProjectResourceError('outside-allowlist');
}

/**
 * Compute the current FileRevision of an existing file, or null if it does
 * not exist. Uses realpath for the canonical path and sha256 of the content.
 */
export async function computeFileRevision(targetPath: string): Promise<FileRevision | null> {
  let canonicalPath: string;
  try {
    canonicalPath = await realpath(targetPath);
  } catch {
    return null;
  }
  let st;
  try {
    st = await stat(canonicalPath);
  } catch {
    return null;
  }
  let content: string;
  try {
    content = await readFile(canonicalPath, 'utf8');
  } catch {
    return null;
  }
  return {
    canonicalPath,
    mtimeMs: st.mtimeMs,
    size: st.size,
    sha256: sha256Hex(content),
  };
}

/** A descriptor-bound read option for an explicitly allowlisted configuration file. */
export interface ReadAllowlistedFileSnapshotOptions {
  readonly targetPath: string;
  readonly allowlist: ConfigurationAllowlist;
  /** When supplied, any replacement or revision mismatch returns conflict. */
  readonly expectedRevision?: FileRevision;
}

/**
 * A content + revision pair captured from one stable descriptor identity.
 * `absent` is only possible when no expected revision was supplied; callers
 * that expected a file receive `conflict` instead, preserving their draft.
 */
export type AllowlistedFileSnapshotResult =
  | { readonly status: 'success'; readonly content: string; readonly revision: FileRevision }
  | { readonly status: 'absent' }
  | { readonly status: 'conflict'; readonly expected: FileRevision | null; readonly current: FileRevision | null }
  | { readonly status: 'invalid-path' }
  | { readonly status: 'read-failed'; readonly cause: string };

const READ_ONLY_NOFOLLOW_FLAGS = constants.O_RDONLY
  | (typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0);

function snapshotErrorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object'
    ? (error as { code?: string }).code
    : undefined;
}

function snapshotDescriptorIdentityMatches(a: Stats, b: Stats): boolean {
  const inodeIdentityAvailable = a.dev !== 0 || b.dev !== 0 || a.ino !== 0 || b.ino !== 0;
  if (inodeIdentityAvailable) return a.dev === b.dev && a.ino === b.ino;
  return a.birthtimeMs === b.birthtimeMs && a.mode === b.mode;
}

function snapshotDescriptorStateMatches(a: Stats, b: Stats): boolean {
  return snapshotDescriptorIdentityMatches(a, b)
    && a.mtimeMs === b.mtimeMs
    && a.size === b.size;
}

function snapshotConflict(
  expectedRevision: FileRevision | undefined,
  current: FileRevision | null,
): AllowlistedFileSnapshotResult {
  return { status: 'conflict', expected: expectedRevision ?? null, current };
}

function snapshotMissing(expectedRevision: FileRevision | undefined): AllowlistedFileSnapshotResult {
  return expectedRevision === undefined
    ? { status: 'absent' }
    : snapshotConflict(expectedRevision, null);
}

/**
 * Read a regular file through a descriptor-bound, no-follow snapshot. The
 * returned content and revision originate from the same file identity; an
 * allowlist/canonical-path/descriptor change never leaks content.
 */
// eslint-disable-next-line complexity -- each branch maps a distinct filesystem race to a content-free typed outcome.
export async function readAllowlistedFileSnapshot(
  options: ReadAllowlistedFileSnapshotOptions,
): Promise<AllowlistedFileSnapshotResult> {
  let initialCanonicalTarget: string;
  try {
    const match = await assertWithinAllowlistedRoot(options.allowlist, options.targetPath);
    initialCanonicalTarget = match.canonicalTarget;
  } catch {
    return { status: 'invalid-path' };
  }

  let lexicalState: Stats;
  try {
    lexicalState = await lstat(options.targetPath);
  } catch (error) {
    if (snapshotErrorCode(error) === 'ENOENT') return snapshotMissing(options.expectedRevision);
    return { status: 'read-failed', cause: error instanceof Error ? error.message : String(error) };
  }
  if (lexicalState.isSymbolicLink()) return { status: 'invalid-path' };
  if (!lexicalState.isFile()) return { status: 'read-failed', cause: 'resource target is not a regular file' };

  let handle;
  try {
    handle = await open(options.targetPath, READ_ONLY_NOFOLLOW_FLAGS);
  } catch (error) {
    const code = snapshotErrorCode(error);
    if (code === 'ELOOP') return { status: 'invalid-path' };
    if (code === 'ENOENT') return snapshotMissing(options.expectedRevision);
    return { status: 'read-failed', cause: error instanceof Error ? error.message : String(error) };
  }

  try {
    const beforeReadState = await handle.stat();
    if (!beforeReadState.isFile()) return { status: 'read-failed', cause: 'resource target is not a regular file' };
    if (!snapshotDescriptorIdentityMatches(lexicalState, beforeReadState)) {
      return snapshotConflict(options.expectedRevision, null);
    }

    let beforeReadCanonicalTarget: string;
    try {
      const match = await assertWithinAllowlistedRoot(options.allowlist, options.targetPath);
      beforeReadCanonicalTarget = match.canonicalTarget;
    } catch {
      return { status: 'invalid-path' };
    }
    if (beforeReadCanonicalTarget !== initialCanonicalTarget) return snapshotConflict(options.expectedRevision, null);
    const beforeReadLexicalState = await lstat(options.targetPath);
    if (beforeReadLexicalState.isSymbolicLink()) return { status: 'invalid-path' };
    if (!snapshotDescriptorIdentityMatches(beforeReadLexicalState, beforeReadState)) {
      return snapshotConflict(options.expectedRevision, null);
    }
    if (
      options.expectedRevision !== undefined
      && (
        options.expectedRevision.canonicalPath !== beforeReadCanonicalTarget
        || options.expectedRevision.mtimeMs !== beforeReadState.mtimeMs
        || options.expectedRevision.size !== beforeReadState.size
      )
    ) {
      return snapshotConflict(options.expectedRevision, null);
    }

    const content = await handle.readFile({ encoding: 'utf8' });
    const afterReadState = await handle.stat();
    if (!snapshotDescriptorStateMatches(beforeReadState, afterReadState)) {
      return snapshotConflict(options.expectedRevision, null);
    }
    const revision: FileRevision = {
      canonicalPath: beforeReadCanonicalTarget,
      mtimeMs: afterReadState.mtimeMs,
      size: afterReadState.size,
      sha256: sha256Hex(content),
    };
    if (options.expectedRevision !== undefined && !revisionsMatch(options.expectedRevision, revision)) {
      return snapshotConflict(options.expectedRevision, revision);
    }

    let afterReadCanonicalTarget: string;
    try {
      const match = await assertWithinAllowlistedRoot(options.allowlist, options.targetPath);
      afterReadCanonicalTarget = match.canonicalTarget;
    } catch {
      return { status: 'invalid-path' };
    }
    if (afterReadCanonicalTarget !== beforeReadCanonicalTarget) return snapshotConflict(options.expectedRevision, null);
    const afterReadLexicalState = await lstat(options.targetPath);
    if (afterReadLexicalState.isSymbolicLink()) return { status: 'invalid-path' };
    if (!snapshotDescriptorStateMatches(afterReadLexicalState, afterReadState)) {
      return snapshotConflict(options.expectedRevision, null);
    }

    let verificationHandle;
    try {
      verificationHandle = await open(options.targetPath, READ_ONLY_NOFOLLOW_FLAGS);
      const verificationState = await verificationHandle.stat();
      if (!snapshotDescriptorStateMatches(verificationState, afterReadState)) {
        return snapshotConflict(options.expectedRevision, null);
      }
    } catch (error) {
      const code = snapshotErrorCode(error);
      if (code === 'ELOOP') return { status: 'invalid-path' };
      if (code === 'ENOENT') return snapshotMissing(options.expectedRevision);
      return { status: 'read-failed', cause: error instanceof Error ? error.message : String(error) };
    } finally {
      await verificationHandle?.close().catch(() => undefined);
    }

    return { status: 'success', content, revision };
  } catch (error) {
    const code = snapshotErrorCode(error);
    if (code === 'ELOOP') return { status: 'invalid-path' };
    if (code === 'ENOENT') return snapshotMissing(options.expectedRevision);
    return { status: 'read-failed', cause: error instanceof Error ? error.message : String(error) };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Content validation + JSONC path edits
// ---------------------------------------------------------------------------

/**
 * Validate configuration content for a format.
 *
 *   - json:  strict — rejects comments, trailing commas, and non-object roots.
 *   - jsonc: parsed with jsonc-parser; parse errors fail; root must be object.
 *   - toml:  full smol-toml parse; root must be a table (object).
 *   - markdown: always valid.
 */
export function validateConfigurationContent(
  format: ConfigurationFormat,
  content: string,
): ValidationResult {
  switch (format) {
    case 'json': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return { ok: false, diagnostics: [{ message: err instanceof Error ? err.message : String(err) }] };
      }
      if (!isPlainObject(parsed)) {
        return { ok: false, diagnostics: [{ message: 'JSON root must be an object' }] };
      }
      return { ok: true };
    }
    case 'jsonc': {
      const errors: ParseError[] = [];
      const parsed = parseJsonc(content, errors, { allowTrailingComma: true });
      if (errors.length > 0) {
        return {
          ok: false,
          diagnostics: errors.map((e) => ({ message: `JSONC parse error: ${printParseErrorCode(e.error)}`, offset: e.offset })),
        };
      }
      if (!isPlainObject(parsed)) {
        return { ok: false, diagnostics: [{ message: 'JSONC root must be an object' }] };
      }
      return { ok: true };
    }
    case 'toml': {
      let parsed: unknown;
      try {
        parsed = parseToml(content);
      } catch (err) {
        return { ok: false, diagnostics: [{ message: err instanceof Error ? err.message : String(err) }] };
      }
      if (!isPlainObject(parsed)) {
        return { ok: false, diagnostics: [{ message: 'TOML root must be a table' }] };
      }
      return { ok: true };
    }
    case 'markdown':
      return { ok: true };
  }
}

/** A single JSONC path edit: set `value` at `path`. */
export interface JsoncPathEdit {
  readonly path: JSONPath;
  readonly value: unknown;
}

/** Detect EOL, indentation style and tab size from existing JSONC content. */
function detectJsoncFormatting(content: string): FormattingOptions {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const indentMatch = content.match(/\r?\n([ \t]+)\S/);
  let insertSpaces = true;
  let tabSize = 2;
  if (indentMatch) {
    const indent = indentMatch[1];
    insertSpaces = !indent.includes('\t') || indent.startsWith(' ');
    if (insertSpaces) {
      const spaces = indent.match(/ /g);
      tabSize = spaces && spaces.length > 0 ? spaces.length : 2;
    }
  }
  return { insertSpaces, tabSize, eol };
}

/**
 * Apply JSONC path edits while preserving comments, key order, unknown
 * fields, indentation and EOL (jsonc-parser's modify is structure-aware).
 * Returns diagnostics if the source is not valid JSONC.
 */
export function applyJsoncPathEdits(
  content: string,
  edits: readonly JsoncPathEdit[],
): { ok: true; result: string } | { ok: false; diagnostics: readonly ContentDiagnostic[] } {
  const errors: ParseError[] = [];
  parseJsonc(content, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    return {
      ok: false,
      diagnostics: errors.map((e) => ({ message: `JSONC parse error: ${printParseErrorCode(e.error)}`, offset: e.offset })),
    };
  }
  const formatting = detectJsoncFormatting(content);
  let result = content;
  for (const edit of edits) {
    const editResult = modifyJsonc(result, edit.path, edit.value, { formattingOptions: formatting });
    result = applyJsoncEdits(result, editResult);
  }
  return { ok: true, result };
}

// ---------------------------------------------------------------------------
// Safe mutation operations
// ---------------------------------------------------------------------------

const configurationMutationTails = new Map<string, Promise<void>>();

async function resolveMutationLockKey(targetPath: string): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch {
    try {
      return path.join(await realpath(path.dirname(targetPath)), path.basename(targetPath));
    } catch {
      return path.resolve(targetPath);
    }
  }
}

/** Serialize plugin-owned mutations per canonical target; external edits remain guarded by FileRevision. */
async function withConfigurationMutationLock<T>(targetPath: string, operation: () => Promise<T>): Promise<T> {
  const key = await resolveMutationLockKey(targetPath);
  const previous = configurationMutationTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  configurationMutationTails.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (configurationMutationTails.get(key) === tail) {
      configurationMutationTails.delete(key);
    }
  }
}

/** Private identity captured immediately before a target is atomically claimed. */
interface CommitTargetState {
  readonly revision: FileRevision;
  readonly device: number;
  readonly inode: number;
}

/** A target moved into a private same-parent staging directory during commit. */
interface CommitTargetClaim {
  readonly directoryPath: string;
  readonly claimedPath: string;
}

type ClaimExpectedTargetResult =
  | { readonly status: 'claimed'; readonly claim: CommitTargetClaim }
  | { readonly status: 'conflict'; readonly current: FileRevision | null }
  | { readonly status: 'write-failed'; readonly cause: string };

type RestoreClaimResult =
  | { readonly status: 'restored' }
  | { readonly status: 'target-exists' }
  | { readonly status: 'failed'; readonly cause: string };

type CommitExpectedTargetResult =
  | { readonly status: 'committed' }
  | { readonly status: 'conflict'; readonly current: FileRevision | null }
  | { readonly status: 'write-failed'; readonly cause: string };

function errorCause(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hasErrorCode(err: unknown, code: string): boolean {
  return err !== null
    && typeof err === 'object'
    && (err as { code?: string }).code === code;
}

/** Capture both the public revision and inode identity without trusting either alone. */
async function captureCommitTargetState(targetPath: string): Promise<CommitTargetState | null> {
  const revision = await computeFileRevision(targetPath);
  if (revision === null) {
    return null;
  }
  try {
    const entry = await lstat(targetPath);
    if (!entry.isFile()) {
      return null;
    }
    return { revision, device: entry.dev, inode: entry.ino };
  } catch {
    return null;
  }
}

function commitTargetStatesMatch(a: CommitTargetState, b: CommitTargetState): boolean {
  // A successful claim intentionally moves the same inode from `targetPath`
  // to `claimedPath`, so canonicalPath must differ here. The public revision
  // keeps canonicalPath for ordinary conflict checks; the post-claim identity
  // fence compares the immutable identity plus the remaining revision fields.
  return a.revision.mtimeMs === b.revision.mtimeMs
    && a.revision.size === b.revision.size
    && a.revision.sha256 === b.revision.sha256
    && a.device === b.device
    && a.inode === b.inode;
}

/** Allocate a mode-0700 staging directory beside the target, never under an unrelated root. */
async function createCommitTargetClaim(targetPath: string): Promise<CommitTargetClaim> {
  const parentPath = path.dirname(targetPath);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const directoryPath = path.join(
      parentPath,
      `.opencodian-commit-${process.pid}-${randomBytes(12).toString('hex')}`,
    );
    try {
      await mkdir(directoryPath, { mode: 0o700 });
      return { directoryPath, claimedPath: path.join(directoryPath, 'claimed') };
    } catch (err) {
      if (hasErrorCode(err, 'EEXIST')) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('Could not allocate a private configuration commit staging directory');
}

/**
 * Remove only a file we claimed, then only an empty staging directory; never
 * recurse. A residual is surfaced to the caller so a completed mutation is
 * never reported as fully clean when its private staging bytes remain.
 */
async function discardOwnedCommitClaim(claim: CommitTargetClaim): Promise<string | null> {
  const failures: string[] = [];
  try {
    await unlink(claim.claimedPath);
  } catch (err) {
    if (!hasErrorCode(err, 'ENOENT')) {
      failures.push(`claimed file retained at ${claim.claimedPath}: ${errorCause(err)}`);
    }
  }
  try {
    await rmdir(claim.directoryPath);
  } catch (err) {
    if (!hasErrorCode(err, 'ENOENT')) {
      failures.push(`staging directory retained at ${claim.directoryPath}: ${errorCause(err)}`);
    }
  }
  return failures.length > 0 ? failures.join('; ') : null;
}

async function removePreparedCommitFile(tempPath: string): Promise<string | null> {
  try {
    await unlink(tempPath);
    return null;
  } catch (err) {
    if (hasErrorCode(err, 'ENOENT')) {
      return null;
    }
    return `prepared replacement temp retained at ${tempPath}: ${errorCause(err)}`;
  }
}

/** Restore a claimed file only if an external writer has not already recreated the target. */
async function restoreClaimedTargetIfAbsent(
  claim: CommitTargetClaim,
  targetPath: string,
): Promise<RestoreClaimResult> {
  try {
    await linkFileAtCommit(claim.claimedPath, targetPath);
    return { status: 'restored' };
  } catch (err) {
    if (hasErrorCode(err, 'EEXIST')) {
      return { status: 'target-exists' };
    }
    return { status: 'failed', cause: errorCause(err) };
  }
}

/**
 * Atomically claim the expected target, then prove the moved inode is the same
 * file we inspected. A mismatch restores the claimed external bytes with an
 * atomic create-if-absent link; a later external winner is never overwritten.
 */
async function claimExpectedTargetAtCommit(
  targetPath: string,
  expectedRevision: FileRevision,
): Promise<ClaimExpectedTargetResult> {
  const beforeClaim = await captureCommitTargetState(targetPath);
  if (beforeClaim === null || !revisionsMatch(beforeClaim.revision, expectedRevision)) {
    return { status: 'conflict', current: await computeFileRevision(targetPath) };
  }

  let claim: CommitTargetClaim;
  try {
    claim = await createCommitTargetClaim(targetPath);
  } catch (err) {
    return { status: 'write-failed', cause: errorCause(err) };
  }

  try {
    await renameFileAtCommit(targetPath, claim.claimedPath);
  } catch (err) {
    const cleanupFailure = await discardOwnedCommitClaim(claim);
    if (cleanupFailure !== null) {
      return { status: 'write-failed', cause: `${errorCause(err)}; ${cleanupFailure}` };
    }
    const current = await computeFileRevision(targetPath);
    if (current === null || !revisionsMatch(current, expectedRevision)) {
      return { status: 'conflict', current };
    }
    return { status: 'write-failed', cause: errorCause(err) };
  }

  const claimedState = await captureCommitTargetState(claim.claimedPath);
  if (claimedState !== null && commitTargetStatesMatch(beforeClaim, claimedState)) {
    return { status: 'claimed', claim };
  }

  const restored = await restoreClaimedTargetIfAbsent(claim, targetPath);
  if (restored.status === 'restored') {
    const cleanupFailure = await discardOwnedCommitClaim(claim);
    if (cleanupFailure !== null) {
      return {
        status: 'write-failed',
        cause: `External target was restored but ${cleanupFailure}`,
      };
    }
    return { status: 'conflict', current: await computeFileRevision(targetPath) };
  }

  const retainedPath = claim.claimedPath;
  if (restored.status === 'target-exists') {
    return {
      status: 'write-failed',
      cause: `External commit collision retained claimed bytes at ${retainedPath}; target already has a later external winner`,
    };
  }
  return {
    status: 'write-failed',
    cause: `Could not restore external claimed bytes; retained at ${retainedPath}: ${restored.cause}`,
  };
}

async function prepareCommitReplacementFile(targetPath: string, content: string): Promise<string> {
  const parentPath = path.dirname(targetPath);
  await mkdir(parentPath, { recursive: true });
  const tempPath = path.join(
    parentPath,
    `.opencodian-commit-temp-${process.pid}-${randomBytes(12).toString('hex')}.tmp`,
  );
  await writeFile(tempPath, content, { encoding: 'utf8', flag: 'wx' });
  return tempPath;
}

/**
 * Replace an expected target without ever overwriting a target recreated after
 * the claim. The public mutation layer supplies the archive and result shape.
 */
async function replaceExpectedTargetAtCommit(
  targetPath: string,
  expectedRevision: FileRevision,
  content: string,
): Promise<CommitExpectedTargetResult> {
  let tempPath: string;
  try {
    tempPath = await prepareCommitReplacementFile(targetPath, content);
  } catch (err) {
    return { status: 'write-failed', cause: errorCause(err) };
  }

  const claimed = await claimExpectedTargetAtCommit(targetPath, expectedRevision);
  if (claimed.status !== 'claimed') {
    const tempCleanupFailure = await removePreparedCommitFile(tempPath);
    if (tempCleanupFailure !== null) {
      const mutationCause = claimed.status === 'write-failed'
        ? claimed.cause
        : 'External target state changed before replacement commit';
      return { status: 'write-failed', cause: `${mutationCause}; ${tempCleanupFailure}` };
    }
    return claimed;
  }

  try {
    await linkFileAtCommit(tempPath, targetPath);
  } catch (err) {
    const tempCleanupFailure = await removePreparedCommitFile(tempPath);
    if (hasErrorCode(err, 'EEXIST')) {
      const claimCleanupFailure = await discardOwnedCommitClaim(claimed.claim);
      const cleanupFailure = [tempCleanupFailure, claimCleanupFailure].filter(Boolean).join('; ');
      if (cleanupFailure) {
        return {
          status: 'write-failed',
          cause: `External target won replacement commit; ${cleanupFailure}`,
        };
      }
      return { status: 'conflict', current: await computeFileRevision(targetPath) };
    }

    const restored = await restoreClaimedTargetIfAbsent(claimed.claim, targetPath);
    if (restored.status === 'restored' || restored.status === 'target-exists') {
      const claimCleanupFailure = await discardOwnedCommitClaim(claimed.claim);
      const cleanupFailure = [tempCleanupFailure, claimCleanupFailure].filter(Boolean).join('; ');
      return {
        status: 'write-failed',
        cause: cleanupFailure ? `${errorCause(err)}; ${cleanupFailure}` : errorCause(err),
      };
    }
    const tempDetail = tempCleanupFailure === null ? '' : `; ${tempCleanupFailure}`;
    return {
      status: 'write-failed',
      cause: `${errorCause(err)}; could not restore claimed bytes retained at ${claimed.claim.claimedPath}: ${restored.cause}${tempDetail}`,
    };
  }

  const tempCleanupFailure = await removePreparedCommitFile(tempPath);
  const claimCleanupFailure = await discardOwnedCommitClaim(claimed.claim);
  const cleanupFailure = [tempCleanupFailure, claimCleanupFailure].filter(Boolean).join('; ');
  if (cleanupFailure) {
    return { status: 'write-failed', cause: `Replacement committed but ${cleanupFailure}` };
  }
  return { status: 'committed' };
}

/** Delete only the identity-verified claimed file; a recreated target is preserved. */
async function deleteExpectedTargetAtCommit(
  targetPath: string,
  expectedRevision: FileRevision,
): Promise<CommitExpectedTargetResult> {
  const claimed = await claimExpectedTargetAtCommit(targetPath, expectedRevision);
  if (claimed.status !== 'claimed') {
    return claimed;
  }

  try {
    await unlinkFileAtCommit(claimed.claim.claimedPath);
  } catch (err) {
    const restored = await restoreClaimedTargetIfAbsent(claimed.claim, targetPath);
    if (restored.status === 'restored' || restored.status === 'target-exists') {
      const cleanupFailure = await discardOwnedCommitClaim(claimed.claim);
      return {
        status: 'write-failed',
        cause: cleanupFailure ? `${errorCause(err)}; ${cleanupFailure}` : errorCause(err),
      };
    }
    return {
      status: 'write-failed',
      cause: `${errorCause(err)}; could not restore claimed bytes retained at ${claimed.claim.claimedPath}: ${restored.cause}`,
    };
  }

  const cleanupFailure = await discardOwnedCommitClaim(claimed.claim);
  if (cleanupFailure !== null) {
    return { status: 'write-failed', cause: `Deletion committed but ${cleanupFailure}` };
  }
  const current = await computeFileRevision(targetPath);
  return current === null
    ? { status: 'committed' }
    : { status: 'conflict', current };
}

type CommitContentFailure = Extract<
  SafeFileMutationResult,
  { status: 'conflict' } | { status: 'write-failed' }
>;

/**
 * Select the only safe publication primitive for a target's expected state.
 * Both write and restore share this high-risk final-commit decision: absent
 * targets use link create-if-absent; present targets use the identity fence.
 */
async function commitContentAtExpectedState(
  targetPath: string,
  content: string,
  expectedRevision: FileRevision | null,
): Promise<CommitContentFailure | null> {
  if (expectedRevision === null) {
    const createResult = await atomicCreateFile(targetPath, content);
    if (createResult === 'exists') {
      return {
        status: 'conflict',
        expected: null,
        current: await computeFileRevision(targetPath),
      };
    }
    return null;
  }

  const committed = await replaceExpectedTargetAtCommit(targetPath, expectedRevision, content);
  if (committed.status === 'conflict') {
    return { status: 'conflict', expected: expectedRevision, current: committed.current };
  }
  if (committed.status === 'write-failed') {
    return { status: 'write-failed', cause: committed.cause };
  }
  return null;
}

export interface SafeWriteFileOptions {
  readonly targetPath: string;
  readonly content: string;
  /**
   * Expected state of the target. `null` means the target must be ABSENT
   * (create); a `FileRevision` means the target must be present at exactly that
   * revision (update). Any divergence — a different canonicalPath/mtime/size/
   * sha, or unexpected presence/absence — returns `conflict`. There is no
   * force-overwrite path.
   */
  readonly expectedRevision: FileRevision | null;
  readonly allowlist: ConfigurationAllowlist;
  readonly archive: ConfigurationArchiveOptions;
  /** Validate content before writing. Defaults to 'markdown' (no validation). */
  readonly format?: ConfigurationFormat;
}

/**
 * Safely create or update a configuration file.
 *
 * Order: validate content → assert allowlist → expected-state conflict check →
 * archive current (must succeed) → atomic write. Archive failure aborts the
 * mutation; the target is never left half-written.
 */
export async function safeWriteFile(options: SafeWriteFileOptions): Promise<SafeFileMutationResult> {
  return withConfigurationMutationLock(options.targetPath, () => safeWriteFileUnlocked(options));
}

async function safeWriteFileUnlocked(options: SafeWriteFileOptions): Promise<SafeFileMutationResult> {
  const format: ConfigurationFormat = options.format ?? 'markdown';
  if (format !== 'markdown') {
    const validation = validateConfigurationContent(format, options.content);
    if (!validation.ok) {
      return { status: 'invalid-content', diagnostics: validation.diagnostics };
    }
  }

  let match: AllowlistMatch;
  try {
    match = await assertWithinAllowlistedRoot(options.allowlist, options.targetPath);
  } catch {
    return { status: 'invalid-path' };
  }

  const current = await computeFileRevision(match.canonicalTarget);

  if (options.expectedRevision === null) {
    // create: target must be absent
    if (current !== null) {
      return { status: 'conflict', expected: null, current };
    }
  } else {
    // update: target must be present at exactly the expected revision
    if (current === null) {
      return { status: 'conflict', expected: options.expectedRevision, current: null };
    }
    if (!revisionsMatch(current, options.expectedRevision)) {
      return { status: 'conflict', expected: options.expectedRevision, current };
    }
    const archiveCause = await archiveCurrentOverwrite(options.archive, match, current);
    if (archiveCause !== 'ok') {
      const conflict = await detectArchiveRaceConflict(match, options.expectedRevision);
      if (conflict) return conflict;
      return { status: 'archive-failed', cause: archiveCause };
    }
  }

  // TOCTOU re-verify: if the file changed between the initial revision check and
  // now (concurrent edit during archive), return conflict — do NOT overwrite.
  if (options.expectedRevision !== null) {
    const recheck = await computeFileRevision(match.canonicalTarget);
    if (recheck === null || !revisionsMatch(recheck, options.expectedRevision)) {
      return { status: 'conflict', expected: options.expectedRevision, current: recheck };
    }
  }
  try {
    const commitFailure = await commitContentAtExpectedState(
      match.canonicalTarget,
      options.content,
      options.expectedRevision,
    );
    if (commitFailure !== null) {
      return commitFailure;
    }
  } catch (err) {
    return { status: 'write-failed', cause: err instanceof Error ? err.message : String(err) };
  }

  const revision = await computeFileRevision(match.canonicalTarget);
  if (revision === null) {
    return { status: 'write-failed', cause: 'file missing after write' };
  }
  return { status: 'success', revision, ...(current ? { previousRevision: current } : {}) };
}

export interface SafeDeleteFileOptions {
  readonly targetPath: string;
  /** `null` asserts the target is absent; a revision asserts presence at it. */
  readonly expectedRevision: FileRevision | null;
  readonly allowlist: ConfigurationAllowlist;
  readonly archive: ConfigurationArchiveOptions;
}

/** Safely delete a configuration file, archiving it first as a deleted entry. */
export async function safeDeleteFile(options: SafeDeleteFileOptions): Promise<SafeFileMutationResult> {
  return withConfigurationMutationLock(options.targetPath, () => safeDeleteFileUnlocked(options));
}

async function safeDeleteFileUnlocked(options: SafeDeleteFileOptions): Promise<SafeFileMutationResult> {
  let match: AllowlistMatch;
  try {
    match = await assertWithinAllowlistedRoot(options.allowlist, options.targetPath);
  } catch {
    return { status: 'invalid-path' };
  }

  const current = await computeFileRevision(match.canonicalTarget);

  if (options.expectedRevision === null) {
    // caller asserts the target is absent
    if (current !== null) {
      return { status: 'conflict', expected: null, current };
    }
    return { status: 'not-found' };
  }

  if (current === null) {
    return { status: 'conflict', expected: options.expectedRevision, current: null };
  }
  if (!revisionsMatch(current, options.expectedRevision)) {
    return { status: 'conflict', expected: options.expectedRevision, current };
  }

  const archiveCause = await archiveCurrentDeleted(options.archive, match, current);
  if (archiveCause !== 'ok') {
    const conflict = await detectArchiveRaceConflict(match, options.expectedRevision);
    if (conflict) return conflict;
    return { status: 'archive-failed', cause: archiveCause };
  }

  // TOCTOU re-verify before unlink.
  const deleteRecheck = await computeFileRevision(match.canonicalTarget);
  if (deleteRecheck === null || !revisionsMatch(deleteRecheck, options.expectedRevision)) {
    return { status: 'conflict', expected: options.expectedRevision, current: deleteRecheck };
  }
  const committed = await deleteExpectedTargetAtCommit(
    match.canonicalTarget,
    options.expectedRevision,
  );
  if (committed.status === 'conflict') {
    return { status: 'conflict', expected: options.expectedRevision, current: committed.current };
  }
  if (committed.status === 'write-failed') {
    return { status: 'write-failed', cause: committed.cause };
  }
  return { status: 'success', revision: current, previousRevision: current };
}

/**
 * Re-enter the canonical target stored in a manifest through its allowlist's
 * lexical root. This preserves the `/var` -> `/private/var` root mapping that
 * ordinary caller paths get from assertWithinAllowlistedRoot.
 */
async function matchArchivedCanonicalTargetWithinAllowlist(
  allowlist: ConfigurationAllowlist,
  canonicalTarget: string,
  expectedScope: ConfigurationScope,
  allowMissingRoot = false,
): Promise<AllowlistMatch | null> {
  for (const entry of allowlist) {
    if (entry.scope !== expectedScope) continue;
    const lexicalRoot = path.resolve(entry.rootPath);
    let canonicalRoot: string;
    let rootMissing = false;
    try {
      canonicalRoot = await realpath(lexicalRoot);
    } catch (error) {
      if (!allowMissingRoot || !isENOENTError(error)) continue;
      const missingCanonicalRoot = await resolveMissingLexicalRootCanonicalPath(lexicalRoot);
      if (missingCanonicalRoot === null) continue;
      canonicalRoot = missingCanonicalRoot;
      rootMissing = true;
    }
    const relativeTarget = path.relative(canonicalRoot, canonicalTarget);
    if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) continue;
    const lexicalTarget = path.join(lexicalRoot, relativeTarget);
    if (rootMissing) {
      // The root is absent, so assertWithinAllowlistedRoot cannot realpath it.
      // `canonicalRoot` was derived only by walking up to an existing real
      // ancestor, and the relative target was checked against that root above.
      return { scope: entry.scope, canonicalRoot, canonicalTarget };
    }
    try {
      const match = await assertWithinAllowlistedRoot([entry], lexicalTarget);
      if (match.canonicalTarget === canonicalTarget && match.scope === expectedScope) return match;
    } catch {
      // Try the next explicitly allowlisted root.
    }
  }
  return null;
}

/**
 * Map a missing lexical allowlist root through its nearest existing canonical
 * ancestor. This preserves `/var` -> `/private/var`-style mappings without
 * creating the missing root, and is intentionally used only by archive
 * catalog readback for already-recorded canonical targets.
 */
async function resolveMissingLexicalRootCanonicalPath(lexicalRoot: string): Promise<string | null> {
  const suffix: string[] = [];
  let candidate = lexicalRoot;
  while (path.dirname(candidate) !== candidate) {
    try {
      return path.join(await realpath(candidate), ...suffix);
    } catch (error) {
      if (!isENOENTError(error)) return null;
      const parent = path.dirname(candidate);
      suffix.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
  try {
    return path.join(await realpath(candidate), ...suffix);
  } catch {
    return null;
  }
}

export type ConfigurationArchiveHistoryResult = ArchiveHistoryCatalogOutcome | { readonly status: 'invalid-path' };

export interface ListConfigurationArchiveHistoryOptions {
  readonly targetPath: string;
  readonly allowlist: ConfigurationAllowlist;
  readonly archive: ConfigurationArchiveOptions;
}

/** List validated history for one caller-allowlisted configuration target. */
export async function listConfigurationArchiveHistory(
  options: ListConfigurationArchiveHistoryOptions,
): Promise<ConfigurationArchiveHistoryResult> {
  let match: AllowlistMatch;
  try {
    match = await assertWithinAllowlistedRoot(options.allowlist, options.targetPath);
  } catch {
    return { status: 'invalid-path' };
  }
  const service = new ConfigurationArchiveService(options.archive.archiveRootPath ?? resolveDefaultArchiveRoot());
  return service.listHistory({
    backend: options.archive.backend,
    kind: options.archive.kind,
    format: options.archive.format,
    match,
  });
}

export interface CatalogConfigurationArchiveHistoryOptions {
  readonly archiveRootPath?: string;
  readonly backend: string;
  readonly scope?: ConfigurationScope;
  readonly kind?: string;
  readonly allowlist: ConfigurationAllowlist;
}

/**
 * Catalog validated archived targets, including targets currently absent from
 * filesystem discovery. Every manifest target is revalidated against the
 * caller's allowlist; one failure suppresses the complete catalog.
 */
export async function catalogConfigurationArchiveHistory(
  options: CatalogConfigurationArchiveHistoryOptions,
): Promise<ArchiveHistoryCatalogOutcome> {
  const service = new ConfigurationArchiveService(options.archiveRootPath ?? resolveDefaultArchiveRoot());
  const catalog = await service.catalogHistory({
    backend: options.backend,
    ...(options.scope ? { scope: options.scope } : {}),
    ...(options.kind ? { kind: options.kind } : {}),
  });
  if (catalog.status === 'archive-failed') return catalog;
  for (const target of catalog.targets) {
    const match = await matchArchivedCanonicalTargetWithinAllowlist(
      options.allowlist,
      target.canonicalTarget,
      target.scope,
      true,
    );
    if (match === null) {
      return { status: 'archive-failed', cause: 'archived target is outside the configuration allowlist' };
    }
  }
  return catalog;
}

export interface SafeRestoreFileOptions {
  readonly targetPath: string;
  /** Expected state of the TARGET (not the archive). `null` = expected absent. */
  readonly expectedRevision: FileRevision | null;
  readonly allowlist: ConfigurationAllowlist;
  readonly archive: ConfigurationArchiveOptions;
}

/**
 * Restore the most recently deleted archived version of a target. The restored
 * content is validated against `archive.format` before any write. Per the
 * contract, restore archives the *current* target first (as an overwrite) when
 * it is present. Returns `not-found` when there is no deleted entry to restore.
 */
export async function safeRestoreFile(options: SafeRestoreFileOptions): Promise<SafeFileMutationResult> {
  return withConfigurationMutationLock(options.targetPath, () => safeRestoreFileUnlocked(options));
}

// eslint-disable-next-line complexity -- This single mutation chokepoint must keep validation, archive, revision, and commit-fence branches adjacent for fail-closed restore semantics.
async function safeRestoreFileUnlocked(options: SafeRestoreFileOptions): Promise<SafeFileMutationResult> {
  let match: AllowlistMatch;
  try {
    match = await assertWithinAllowlistedRoot(options.allowlist, options.targetPath);
  } catch {
    return { status: 'invalid-path' };
  }

  const service = new ConfigurationArchiveService(options.archive.archiveRootPath ?? resolveDefaultArchiveRoot());
  const ctx: ArchiveContext = { backend: options.archive.backend, kind: options.archive.kind, format: options.archive.format, match };
  const deleted = await service.readLatestDeletedContent(ctx);
  // Only a genuinely missing archive/entry is not-found; an invalid/tampered/
  // unreadable manifest or entry, or a confinement failure, is archive-failed.
  if (deleted.status === 'not-found') {
    return { status: 'not-found' };
  }
  if (deleted.status === 'archive-failed') {
    return { status: 'archive-failed', cause: deleted.cause };
  }
  const restoredContent = deleted.content;

  // Validate restored content BEFORE any mutation.
  if (options.archive.format !== 'markdown') {
    const validation = validateConfigurationContent(options.archive.format, restoredContent);
    if (!validation.ok) {
      return { status: 'invalid-content', diagnostics: validation.diagnostics };
    }
  }

  const current = await computeFileRevision(match.canonicalTarget);
  if (options.expectedRevision === null) {
    if (current !== null) {
      return { status: 'conflict', expected: null, current };
    }
  } else {
    if (current === null) {
      return { status: 'conflict', expected: options.expectedRevision, current: null };
    }
    if (!revisionsMatch(current, options.expectedRevision)) {
      return { status: 'conflict', expected: options.expectedRevision, current };
    }
    const archiveCause = await archiveCurrentOverwrite(options.archive, match, current);
    if (archiveCause !== 'ok') {
      const conflict = await detectArchiveRaceConflict(match, options.expectedRevision);
      if (conflict) return conflict;
      return { status: 'archive-failed', cause: archiveCause };
    }
  }

  // TOCTOU re-verify before final write.
  if (options.expectedRevision !== null) {
    const restoreRecheck = await computeFileRevision(match.canonicalTarget);
    if (restoreRecheck === null || !revisionsMatch(restoreRecheck, options.expectedRevision)) {
      return { status: 'conflict', expected: options.expectedRevision, current: restoreRecheck };
    }
  }
  try {
    const commitFailure = await commitContentAtExpectedState(
      match.canonicalTarget,
      restoredContent,
      options.expectedRevision,
    );
    if (commitFailure !== null) {
      return commitFailure;
    }
  } catch (err) {
    return { status: 'write-failed', cause: err instanceof Error ? err.message : String(err) };
  }

  const revision = await computeFileRevision(match.canonicalTarget);
  if (revision === null) {
    return { status: 'write-failed', cause: 'file missing after restore' };
  }
  return { status: 'success', revision, ...(current ? { previousRevision: current } : {}) };
}

export interface SafeRestoreArchivedEntryOptions {
  /** Opaque identity returned by a validated history listing. */
  readonly entryIdentity: ArchiveHistoryEntryIdentity;
  /** Expected state of the TARGET represented by the identity. */
  readonly expectedRevision: FileRevision | null;
  readonly allowlist: ConfigurationAllowlist;
  readonly archiveRootPath?: string;
}

/** Restore one caller-selected overwrite or delete archive entry. */
export async function safeRestoreArchivedEntry(
  options: SafeRestoreArchivedEntryOptions,
): Promise<SafeFileMutationResult> {
  const service = new ConfigurationArchiveService(options.archiveRootPath ?? resolveDefaultArchiveRoot());
  const association = service.getHistoryEntryAssociation(options.entryIdentity);
  if (association === null) {
    return { status: 'archive-failed', cause: 'invalid archive history identity' };
  }
  const match = await matchArchivedCanonicalTargetWithinAllowlist(
    options.allowlist,
    association.canonicalTarget,
    association.scope,
  );
  if (match === null) {
    return { status: 'invalid-path' };
  }
  const ctx: ArchiveContext = {
    backend: association.backend,
    kind: association.kind,
    format: association.format,
    match,
  };
  return withConfigurationMutationLock(match.canonicalTarget, () => (
    safeRestoreArchivedEntryUnlocked(options, service, ctx)
  ));
}

// eslint-disable-next-line complexity -- Selected restore keeps identity/content validation, optimistic conflict checks, archive-before-replace, and the shared commit fence adjacent.
async function safeRestoreArchivedEntryUnlocked(
  options: SafeRestoreArchivedEntryOptions,
  service: ConfigurationArchiveService,
  ctx: ArchiveContext,
): Promise<SafeFileMutationResult> {
  const selected = await service.readHistoryEntryContent(ctx, options.entryIdentity);
  if (selected.status === 'not-found') return { status: 'not-found' };
  if (selected.status === 'archive-failed') {
    return { status: 'archive-failed', cause: selected.cause };
  }
  if (ctx.format !== 'markdown') {
    const validation = validateConfigurationContent(ctx.format, selected.content);
    if (!validation.ok) {
      return { status: 'invalid-content', diagnostics: validation.diagnostics };
    }
  }

  const current = await computeFileRevision(ctx.match.canonicalTarget);
  if (options.expectedRevision === null) {
    if (current !== null) return { status: 'conflict', expected: null, current };
  } else {
    if (current === null) {
      return { status: 'conflict', expected: options.expectedRevision, current: null };
    }
    if (!revisionsMatch(current, options.expectedRevision)) {
      return { status: 'conflict', expected: options.expectedRevision, current };
    }
    const archiveOptions: ConfigurationArchiveOptions = {
      ...(options.archiveRootPath ? { archiveRootPath: options.archiveRootPath } : {}),
      backend: ctx.backend,
      kind: ctx.kind,
      format: ctx.format,
    };
    const archiveCause = await archiveCurrentOverwrite(archiveOptions, ctx.match, current);
    if (archiveCause !== 'ok') {
      const conflict = await detectArchiveRaceConflict(ctx.match, options.expectedRevision);
      if (conflict) return conflict;
      return { status: 'archive-failed', cause: archiveCause };
    }
  }

  if (options.expectedRevision !== null) {
    const restoreRecheck = await computeFileRevision(ctx.match.canonicalTarget);
    if (restoreRecheck === null || !revisionsMatch(restoreRecheck, options.expectedRevision)) {
      return { status: 'conflict', expected: options.expectedRevision, current: restoreRecheck };
    }
  }
  try {
    const commitFailure = await commitContentAtExpectedState(
      ctx.match.canonicalTarget,
      selected.content,
      options.expectedRevision,
    );
    if (commitFailure !== null) return commitFailure;
  } catch (err) {
    return { status: 'write-failed', cause: err instanceof Error ? err.message : String(err) };
  }

  const revision = await computeFileRevision(ctx.match.canonicalTarget);
  if (revision === null) return { status: 'write-failed', cause: 'file missing after restore' };
  return { status: 'success', revision, ...(current ? { previousRevision: current } : {}) };
}

export interface ClearDeletedArchivesOptions {
  readonly archiveRootPath?: string;
  readonly backend: string;
  readonly scope?: ConfigurationScope;
  readonly kind?: string;
}

/**
 * Manually clear deleted archive entries (optionally scoped). Deleted entries
 * are never auto-pruned, so this is the only way to remove them. Typed, honest,
 * never throws: an entry counts as cleared only when its archive file was
 * actually removed (or was already absent). Overwrite history is untouched.
 */
export async function clearDeletedArchives(options: ClearDeletedArchivesOptions): Promise<ClearDeletedResult> {
  const archiveRootPath = options.archiveRootPath ?? resolveDefaultArchiveRoot();
  const service = new ConfigurationArchiveService(archiveRootPath);
  return service.clearDeleted({
    backend: options.backend,
    ...(options.scope ? { scope: options.scope } : {}),
    ...(options.kind ? { kind: options.kind } : {}),
  });
}

// --- archive orchestration helpers ----------------------------------------

/** Convert an archive failure caused by an external edit into the required conflict outcome. */
async function detectArchiveRaceConflict(
  match: AllowlistMatch,
  expectedRevision: FileRevision,
): Promise<Extract<SafeFileMutationResult, { status: 'conflict' }> | null> {
  const current = await computeFileRevision(match.canonicalTarget);
  return current === null || !revisionsMatch(current, expectedRevision)
    ? { status: 'conflict', expected: expectedRevision, current }
    : null;
}

/** Archive the current target as an overwrite; returns 'ok' or an error cause. */
async function archiveCurrentOverwrite(
  archive: ConfigurationArchiveOptions,
  match: AllowlistMatch,
  current: FileRevision,
): Promise<'ok' | string> {
  try {
    const service = new ConfigurationArchiveService(archive.archiveRootPath ?? resolveDefaultArchiveRoot());
    await service.archiveOverwrite(
      { backend: archive.backend, kind: archive.kind, format: archive.format, match },
      current,
    );
    return 'ok';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Archive the current target as a deleted entry; returns 'ok' or an error cause. */
async function archiveCurrentDeleted(
  archive: ConfigurationArchiveOptions,
  match: AllowlistMatch,
  current: FileRevision,
): Promise<'ok' | string> {
  try {
    const service = new ConfigurationArchiveService(archive.archiveRootPath ?? resolveDefaultArchiveRoot());
    await service.archiveDeleted(
      { backend: archive.backend, kind: archive.kind, format: archive.format, match },
      current,
    );
    return 'ok';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
