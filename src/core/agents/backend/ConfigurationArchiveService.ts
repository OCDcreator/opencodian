/**
 * ConfigurationArchiveService — confined archive storage owner.
 *
 * Owns the high-risk archive filesystem boundary for the complete-configuration
 * mutation contract (see docs/adr/0001-complete-configuration-means-closed-loop-control.md).
 *
 * Security invariants (round-2 hardening):
 *   - backend / kind validated as single safe path segments; scope is enum;
 *     every archive dir is keyed by sha256(canonicalTarget)[:16].
 *   - REALPATH/SYMLINK ANCHORING: every read/write/remove is resolved through
 *     `confinedPath`, a parent-walk anchored at the archive root's canonical
 *     realpath. Each existing component is lstat-checked; a symlink that
 *     resolves outside the anchor is rejected. A missing target is anchored
 *     under its nearest verified ancestor. This defeats pre-placed symlinks at
 *     any level (backend/scope/kind/hash/versions/deleted/manifest/entry).
 *   - manifest state is tri-state: absent (first archive ok) vs
 *     present-but-invalid (fail closed — never treated as first archive, never
 *     overwritten) vs valid. Invalid = bad JSON/schema/association/entry/fmt.
 *   - format is part of manifest association; entry file extensions must match
 *     the manifest format; cross-format reads are rejected.
 *   - manifest writes are atomic (temp + rename); retention clears old files
 *     only AFTER the new manifest commits (manifest-first), so a manifest-write
 *     failure never orphans references. On manifest-write failure the just-
 *     written new archive file is cleaned up and the old manifest/files survive.
 *
 * Mutation archive ops (archiveOverwrite/archiveDeleted) THROW on failure so the
 * orchestrator aborts the mutation. clearDeleted is the typed, never-throws
 * manual API with a manifest-first honest result.
 */
/* eslint-disable max-lines -- Cohesive high-risk archive owner (confined layout, manifest integrity, retention, atomic I/O, honest clear). Splitting would scatter the security boundary. */
import { createHash, randomBytes } from 'node:crypto';
import { constants, type Dirent, type Stats } from 'node:fs';
import { link, lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { confinedComponentWalk, isENOENTError, resolveAnchorRealpath } from './PathConfinement';
import type {
  AllowlistMatch,
  ConfigurationFormat,
  ConfigurationScope,
  FileRevision,
} from './ProjectResourceSecureWrite';

/** Maximum overwrite versions retained per target. Deleted entries are never auto-pruned. */
export const OVERWRITE_RETENTION_LIMIT = 10;

const VALID_SCOPES: readonly ConfigurationScope[] = ['global', 'project', 'local'];
const VALID_FORMATS: readonly ConfigurationFormat[] = ['markdown', 'json', 'jsonc', 'toml'];

export interface ArchiveEntry {
  readonly timestamp: number;
  readonly fileName: string;
  readonly sha256: string;
  readonly mtimeMs: number;
  readonly size: number;
}

export interface ArchiveManifest {
  readonly canonicalPath: string;
  readonly backend: string;
  readonly scope: string;
  readonly kind: string;
  readonly format: ConfigurationFormat;
  readonly versions: readonly ArchiveEntry[];
  readonly deleted: readonly ArchiveEntry[];
}

export interface ArchiveContext {
  readonly backend: string;
  readonly kind: string;
  readonly format: ConfigurationFormat;
  readonly match: AllowlistMatch;
}

declare const archiveHistoryEntryIdentityBrand: unique symbol;

/** Opaque selection token issued only by a validated history listing. */
export type ArchiveHistoryEntryIdentity = string & {
  readonly [archiveHistoryEntryIdentityBrand]: true;
};

export type ArchiveHistoryEntryKind = 'overwrite' | 'delete';

export interface ArchiveHistoryEntrySummary {
  readonly identity: ArchiveHistoryEntryIdentity;
  readonly archiveKind: ArchiveHistoryEntryKind;
  readonly timestamp: number;
  readonly size: number;
}

export interface ArchiveHistoryTarget {
  readonly canonicalTarget: string;
  readonly backend: string;
  readonly scope: ConfigurationScope;
  readonly kind: string;
  readonly format: ConfigurationFormat;
  readonly entries: readonly ArchiveHistoryEntrySummary[];
}

export type ArchiveHistoryCatalogOutcome =
  | { readonly status: 'success'; readonly targets: readonly ArchiveHistoryTarget[] }
  | { readonly status: 'archive-failed'; readonly cause: string };

export interface ArchiveHistoryEntryAssociation {
  readonly canonicalTarget: string;
  readonly backend: string;
  readonly scope: ConfigurationScope;
  readonly kind: string;
  readonly format: ConfigurationFormat;
}

export type ReadArchiveHistoryEntryOutcome =
  | { readonly status: 'not-found' }
  | { readonly status: 'found'; readonly content: string }
  | { readonly status: 'archive-failed'; readonly cause: string };

/**
 * Typed outcome of reading the latest deleted archive content. Distinguishes
 * "nothing to restore" (not-found) from "the archive system is failing"
 * (archive-failed) so restore never silently misreports a system failure as a
 * missing archive.
 */
export type ReadDeletedOutcome =
  | { status: 'not-found' }
  | { status: 'found'; content: string }
  | { status: 'archive-failed'; cause: string };

/**
 * Honest manual-clear result (manifest-first model). `cleared` counts entries
 * whose archive file was actually removed from disk AFTER the manifest commit.
 * `orphanedFiles` lists entries cleared from the manifest whose file could not
 * be physically removed (best-effort cleanup failed — harmless orphans, no
 * longer referenced). `manifestWriteFailed` means the manifest could not be
 * committed, so nothing was cleared. This API never throws.
 */
export type ClearDeletedResult =
  | { ok: true; cleared: number }
  | {
    ok: false;
    cleared: number;                          // entries actually physically removed this call
    orphanedFiles: readonly string[];         // logically cleared but file remained on disk
    manifestWriteFailed: boolean;             // manifest could not be committed (nothing changed)
    integrityFailures: readonly string[];     // present-but-invalid/association-mismatch manifests (not touched, reported)
    absentEntries: readonly string[];         // entries already absent on disk (manifest referenced missing files)
  };

/** Tri-state manifest read outcome. */
type ManifestOutcome =
  | { status: 'absent' }
  | { status: 'valid'; manifest: ArchiveManifest }
  | { status: 'invalid'; reason: string };

interface ArchiveEntryIdentity {
  readonly entry: ArchiveEntry;
  readonly lexicalPath: string;
  readonly dev: number;
  readonly ino: number;
}

interface ArchiveEntryPreflight {
  readonly failures: string[];
  readonly identities: ArchiveEntryIdentity[];
}

interface ArchiveHistoryFileState {
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly birthtimeMs: number;
}

interface ArchiveHistoryEntryFence {
  readonly entry: ArchiveEntry;
  readonly lexicalPath: string;
  readonly fileState: ArchiveHistoryFileState;
}

type ArchiveHistoryDescriptorReadOutcome =
  | { readonly status: 'valid'; readonly identity: ArchiveHistoryEntryFence; readonly content: string }
  | { readonly status: 'invalid'; readonly reason: string };

interface ArchiveHistoryIdentityPayload extends ArchiveHistoryEntryAssociation {
  readonly version: 1;
  readonly archiveKind: ArchiveHistoryEntryKind;
  readonly entry: ArchiveEntry;
  readonly fileState: ArchiveHistoryFileState;
}

class ArchiveIntegrityError extends Error {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A safe single path segment: non-empty, no separators, no '..', no leading dot, no control chars. */
function isSafeArchiveSegment(segment: string): boolean {
  if (typeof segment !== 'string') return false;
  const trimmed = segment.trim();
  if (!trimmed || trimmed.startsWith('.')) return false;
  if (/[\\/:]/.test(trimmed)) return false;
  // eslint-disable-next-line no-control-regex -- rejecting ASCII control chars is intentional for path safety
  if (/[\x00-\x1f]/.test(trimmed)) return false;
  return true;
}

function archiveFileExtension(format: ConfigurationFormat): string {
  switch (format) {
    case 'json': return 'json';
    case 'jsonc': return 'jsonc';
    case 'toml': return 'toml';
    case 'markdown': return 'md';
  }
}

function isConfigurationFormat(value: unknown): value is ConfigurationFormat {
  return typeof value === 'string' && (VALID_FORMATS as readonly string[]).includes(value);
}

/** Strict archive filename: <13-digit timestamp>-<8 hex>-<kind>.<ext>, ext must match the format. */
function buildArchiveFileName(timestamp: number, kind: 'overwrite' | 'delete', ext: string): string {
  return `${timestamp}-${randomBytes(4).toString('hex')}-${kind}.${ext}`;
}

function isSafeArchiveFileName(fileName: string, expectedKind: 'overwrite' | 'delete', expectedExt: string): boolean {
  if (typeof fileName !== 'string' || fileName.length === 0) return false;
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes(path.sep)) return false;
  if (fileName.includes('\0') || fileName === '.' || fileName === '..') return false;
  const match = fileName.match(/^(\d{13})-([0-9a-f]{8})-(overwrite|delete)\.(md|json|jsonc|toml)$/);
  if (!match) return false;
  return match[3] === expectedKind && match[4] === expectedExt;
}

function hashCanonicalPath(canonicalPath: string): string {
  return createHash('sha256').update(canonicalPath, 'utf8').digest('hex');
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const FILE_NAME_TIMESTAMP_RE = /^(\d{13})-/;

function validateEntries(
  raw: unknown,
  expectedKind: 'overwrite' | 'delete',
  expectedExt: string,
): ArchiveEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const safe: ArchiveEntry[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const fileName = item.fileName;
    if (typeof fileName !== 'string' || !isSafeArchiveFileName(fileName, expectedKind, expectedExt)) {
      return null;
    }
    const timestamp = typeof item.timestamp === 'number' ? item.timestamp : NaN;
    const sha256 = typeof item.sha256 === 'string' ? item.sha256 : '';
    const mtimeMs = typeof item.mtimeMs === 'number' ? item.mtimeMs : NaN;
    const size = typeof item.size === 'number' ? item.size : NaN;
    // Strict numeric sanity: finite, non-negative, bounded (no Infinity / NaN).
    if (!Number.isFinite(timestamp) || timestamp < 0) return null;
    if (!Number.isFinite(mtimeMs) || mtimeMs < 0) return null;
    if (!Number.isFinite(size) || size < 0) return null;
    // sha256 must be exactly 64 lowercase hex chars.
    if (!SHA256_HEX_RE.test(sha256)) return null;
    // The filename's leading 13-digit timestamp must match entry.timestamp.
    const nameMatch = fileName.match(FILE_NAME_TIMESTAMP_RE);
    if (!nameMatch || Number(nameMatch[1]) !== timestamp) return null;
    safe.push({ timestamp, fileName, sha256, mtimeMs, size });
  }
  return safe;
}

function archiveEntriesMatch(a: ArchiveEntry, b: ArchiveEntry): boolean {
  return a.timestamp === b.timestamp
    && a.fileName === b.fileName
    && a.sha256 === b.sha256
    && a.mtimeMs === b.mtimeMs
    && a.size === b.size;
}

function archiveHistoryFileState(stats: Stats): ArchiveHistoryFileState {
  return {
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
    birthtimeMs: stats.birthtimeMs,
  };
}

function archiveHistoryDescriptorIdentityMatches(
  a: ArchiveHistoryFileState,
  b: ArchiveHistoryFileState,
): boolean {
  const inodeIdentityAvailable = a.dev !== 0 || b.dev !== 0 || a.ino !== 0 || b.ino !== 0;
  if (inodeIdentityAvailable) return a.dev === b.dev && a.ino === b.ino;
  return a.birthtimeMs === b.birthtimeMs
    && a.ctimeMs === b.ctimeMs
    && a.mode === b.mode;
}

function archiveHistoryDescriptorStateMatches(
  a: ArchiveHistoryFileState,
  b: ArchiveHistoryFileState,
): boolean {
  return archiveHistoryDescriptorIdentityMatches(a, b)
    && a.mode === b.mode
    && a.size === b.size
    && a.mtimeMs === b.mtimeMs
    && a.ctimeMs === b.ctimeMs
    && a.birthtimeMs === b.birthtimeMs;
}

function decodeArchiveHistoryFileState(value: unknown): ArchiveHistoryFileState | null {
  if (!isPlainObject(value)) return null;
  const integerFields = [value.dev, value.ino, value.mode];
  if (integerFields.some((field) => !Number.isSafeInteger(field) || (field as number) < 0)) return null;
  const numericFields = [value.size, value.mtimeMs, value.ctimeMs, value.birthtimeMs];
  if (numericFields.some((field) => typeof field !== 'number' || !Number.isFinite(field) || field < 0)) return null;
  return {
    dev: value.dev as number,
    ino: value.ino as number,
    mode: value.mode as number,
    size: value.size as number,
    mtimeMs: value.mtimeMs as number,
    ctimeMs: value.ctimeMs as number,
    birthtimeMs: value.birthtimeMs as number,
  };
}

function archiveHistoryErrorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object'
    ? (error as { code?: string }).code
    : undefined;
}

function isUnsupportedNoFollowError(error: unknown): boolean {
  const code = archiveHistoryErrorCode(error);
  return code === 'EINVAL' || code === 'ENOSYS' || code === 'ENOTSUP' || code === 'EOPNOTSUPP';
}

function encodeArchiveHistoryEntryIdentity(
  manifest: ArchiveManifest,
  archiveKind: ArchiveHistoryEntryKind,
  identity: ArchiveHistoryEntryFence,
): ArchiveHistoryEntryIdentity {
  const payload: ArchiveHistoryIdentityPayload = {
    version: 1,
    canonicalTarget: manifest.canonicalPath,
    backend: manifest.backend,
    scope: manifest.scope as ConfigurationScope,
    kind: manifest.kind,
    format: manifest.format,
    archiveKind,
    entry: identity.entry,
    fileState: identity.fileState,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') as ArchiveHistoryEntryIdentity;
}

// eslint-disable-next-line complexity -- Opaque identity parsing rejects every malformed association, entry metadata, filename, and listing-time file-identity branch at one fail-closed boundary.
function decodeArchiveHistoryEntryIdentity(identity: ArchiveHistoryEntryIdentity): ArchiveHistoryIdentityPayload | null {
  if (typeof identity !== 'string' || identity.length === 0 || identity.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(identity)) {
    return null;
  }
  let parsed: unknown;
  try {
    const decoded = Buffer.from(identity, 'base64url');
    if (decoded.toString('base64url') !== identity) return null;
    parsed = JSON.parse(decoded.toString('utf8'));
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) || parsed.version !== 1) return null;
  if (typeof parsed.backend !== 'string' || !isSafeArchiveSegment(parsed.backend)) return null;
  if (typeof parsed.kind !== 'string' || !isSafeArchiveSegment(parsed.kind)) return null;
  if (typeof parsed.scope !== 'string' || !(VALID_SCOPES as readonly string[]).includes(parsed.scope)) return null;
  if (!isConfigurationFormat(parsed.format)) return null;
  if (typeof parsed.canonicalTarget !== 'string' || !path.isAbsolute(parsed.canonicalTarget) || parsed.canonicalTarget.includes('\0')) return null;
  if (parsed.archiveKind !== 'overwrite' && parsed.archiveKind !== 'delete') return null;
  const fileState = decodeArchiveHistoryFileState(parsed.fileState);
  if (fileState === null) return null;
  const ext = archiveFileExtension(parsed.format);
  const entries = validateEntries(
    [parsed.entry],
    parsed.archiveKind,
    ext,
  );
  if (entries === null || entries.length !== 1) return null;
  return {
    version: 1,
    canonicalTarget: parsed.canonicalTarget,
    backend: parsed.backend,
    scope: parsed.scope as ConfigurationScope,
    kind: parsed.kind,
    format: parsed.format,
    archiveKind: parsed.archiveKind,
    entry: entries[0],
    fileState,
  };
}

export class ConfigurationArchiveService {
  constructor(private readonly archiveRootPath: string) {}

  /** Canonical realpath of the archive root (lexical fallback if it does not exist yet). */
  private async anchorRealPath(): Promise<string> {
    return resolveAnchorRealpath(this.archiveRootPath);
  }

  /**
   * Resolve `targetLexical` to a confined path via the shared symlink-aware
   * parent-walk (PathConfinement), anchored at the archive root's canonical
   * realpath. Every read/write/remove MUST go through the returned path.
   * Throws ArchiveIntegrityError on any escape, unresolved symlink, or
   * non-ENOENT filesystem error (→ caller maps to archive failure / skip).
   */
  private async confinedPath(targetLexical: string): Promise<string> {
    const lexicalRoot = path.resolve(this.archiveRootPath);
    const realRoot = await this.anchorRealPath();
    const resolvedTarget = path.resolve(targetLexical);
    const rel = path.relative(lexicalRoot, resolvedTarget);
    if (rel === '') return realRoot;
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ArchiveIntegrityError('archive path escapes root (lexical)');
    }
    const components = rel.split(path.sep).filter((c) => c.length > 0);
    try {
      return await confinedComponentWalk(realRoot, components);
    } catch (err) {
      throw new ArchiveIntegrityError(err instanceof Error ? err.message : 'archive path confinement failed');
    }
  }

  /** Resolve and validate the confined archive directory for a context (lexical). */
  private resolveArchiveDir(ctx: ArchiveContext): string {
    if (!isSafeArchiveSegment(ctx.backend)) {
      throw new ArchiveIntegrityError(`unsafe archive backend segment: ${ctx.backend}`);
    }
    if (!isSafeArchiveSegment(ctx.kind)) {
      throw new ArchiveIntegrityError(`unsafe archive kind segment: ${ctx.kind}`);
    }
    if (!VALID_SCOPES.includes(ctx.match.scope)) {
      throw new ArchiveIntegrityError(`unsafe archive scope: ${ctx.match.scope}`);
    }
    const hash = hashCanonicalPath(ctx.match.canonicalTarget).slice(0, 16);
    return path.join(this.archiveRootPath, ctx.backend, ctx.match.scope, ctx.kind, hash);
  }

  /**
   * Read the manifest for a context. Tri-state: absent (ENOENT) vs
   * present-but-invalid (fail closed) vs valid. A present-but-invalid manifest
   * is NEVER treated as absent/first-archive.
   */
  private async readManifestOutcome(dir: string, ctx: ArchiveContext): Promise<ManifestOutcome> {
    const manifestPath = await this.confinedPath(path.join(dir, 'manifest.json'));
    let raw: string;
    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch (err) {
      // Only a truly missing manifest is "absent" (first archive ok). Any other
      // read error (EACCES/EIO/...) is a present-but-unreadable manifest → the
      // archive system is failing, NOT a fresh-archive situation.
      if (err !== null && typeof err === 'object' && (err as { code?: string }).code === 'ENOENT') {
        return { status: 'absent' };
      }
      return { status: 'invalid', reason: `manifest read error: ${(err as { code?: string }).code ?? 'unknown'}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'invalid', reason: 'manifest is not valid JSON' };
    }
    if (!isPlainObject(parsed)) return { status: 'invalid', reason: 'manifest root is not an object' };
    if (parsed.canonicalPath !== ctx.match.canonicalTarget) return { status: 'invalid', reason: 'canonicalPath association mismatch' };
    if (parsed.backend !== ctx.backend) return { status: 'invalid', reason: 'backend association mismatch' };
    if (parsed.scope !== ctx.match.scope) return { status: 'invalid', reason: 'scope association mismatch' };
    if (parsed.kind !== ctx.kind) return { status: 'invalid', reason: 'kind association mismatch' };
    if (!isConfigurationFormat(parsed.format)) return { status: 'invalid', reason: 'manifest format missing or unknown' };
    if (parsed.format !== ctx.format) return { status: 'invalid', reason: 'format association mismatch' };
    const ext = archiveFileExtension(ctx.format);
    const versions = validateEntries(parsed.versions, 'overwrite', ext);
    const deleted = validateEntries(parsed.deleted, 'delete', ext);
    if (versions === null || deleted === null) return { status: 'invalid', reason: 'invalid archive entry' };
    return {
      status: 'valid',
      manifest: {
        canonicalPath: ctx.match.canonicalTarget,
        backend: ctx.backend,
        scope: ctx.match.scope,
        kind: ctx.kind,
        format: ctx.format,
        versions,
        deleted,
      },
    };
  }

  private async writeManifestAtomic(dir: string, manifest: ArchiveManifest): Promise<void> {
    const manifestPath = await this.confinedPath(path.join(dir, 'manifest.json'));
    const dirSafe = await this.confinedPath(dir);
    await mkdir(dirSafe, { recursive: true });
    const tempName = `.manifest-${randomBytes(4).toString('hex')}.tmp`;
    const tempPath = await this.confinedPath(path.join(dir, tempName));
    try {
      await writeFile(tempPath, JSON.stringify(manifest, null, 2), 'utf8');
      await rename(tempPath, manifestPath);
    } catch (err) {
      try {
        await rm(tempPath, { force: true });
      } catch {
        // best-effort temp cleanup
      }
      throw err;
    }
  }

  private freshManifest(ctx: ArchiveContext): ArchiveManifest {
    return {
      canonicalPath: ctx.match.canonicalTarget,
      backend: ctx.backend,
      scope: ctx.match.scope,
      kind: ctx.kind,
      format: ctx.format,
      versions: [],
      deleted: [],
    };
  }

  /**
   * Read exactly the file state represented by `currentRevision`. The two
   * stats fence the read against an in-place edit, while dev/ino fence a path
   * replacement. Archive bytes are accepted only when their size/hash and all
   * public FileRevision fields still match the caller's optimistic token.
   */
  private async readRevisionContent(ctx: ArchiveContext, currentRevision: FileRevision): Promise<string> {
    const canonicalPath = await realpath(ctx.match.canonicalTarget);
    const before = await stat(canonicalPath);
    const content = await readFile(canonicalPath, 'utf8');
    const after = await stat(canonicalPath);
    const contentBuffer = Buffer.from(content, 'utf8');
    const contentSha = createHash('sha256').update(contentBuffer).digest('hex');
    const stableIdentity = before.dev === after.dev && before.ino === after.ino;
    const stableMetadata = before.mtimeMs === after.mtimeMs && before.size === after.size;
    const matchesRevision = canonicalPath === currentRevision.canonicalPath
      && after.mtimeMs === currentRevision.mtimeMs
      && after.size === currentRevision.size
      && contentBuffer.byteLength === currentRevision.size
      && contentSha === currentRevision.sha256;
    if (!stableIdentity || !stableMetadata || !matchesRevision) {
      throw new ArchiveIntegrityError('target revision changed before archive snapshot');
    }
    return content;
  }

  /**
   * Archive the current target content as an overwrite version. Transaction
   * order: write the new archive file → atomically commit the new manifest →
   * only on manifest success, best-effort prune files dropped by retention. On
   * manifest-write failure the just-written new file is cleaned up and the old
   * manifest + its referenced files survive. Throws on any failure.
   */
  async archiveOverwrite(ctx: ArchiveContext, currentRevision: FileRevision): Promise<void> {
    const content = await this.readRevisionContent(ctx, currentRevision);
    const dir = this.resolveArchiveDir(ctx);
    const ext = archiveFileExtension(ctx.format);
    const outcome = await this.readManifestOutcome(dir, ctx);
    if (outcome.status === 'invalid') {
      throw new ArchiveIntegrityError(`archive manifest invalid: ${outcome.reason}`);
    }
    const manifest = outcome.status === 'valid' ? outcome.manifest : this.freshManifest(ctx);

    const versionsDir = path.join(dir, 'versions');
    const versionsDirSafe = await this.confinedPath(versionsDir);
    await mkdir(versionsDirSafe, { recursive: true });
    const timestamp = Date.now();
    const fileName = buildArchiveFileName(timestamp, 'overwrite', ext);
    if (!isSafeArchiveFileName(fileName, 'overwrite', ext)) {
      throw new ArchiveIntegrityError('generated overwrite name failed validation');
    }
    const versionPathSafe = await this.confinedPath(path.join(versionsDir, fileName));
    await writeFile(versionPathSafe, content, 'utf8');

    const contentBuf = Buffer.from(content, 'utf8');
    const entry: ArchiveEntry = {
      timestamp,
      fileName,
      sha256: createHash('sha256').update(contentBuf).digest('hex'),
      mtimeMs: currentRevision.mtimeMs,
      size: contentBuf.byteLength,
    };
    const combined = [...manifest.versions, entry];
    const overflow = combined.length - OVERWRITE_RETENTION_LIMIT;
    const pruned = overflow > 0 ? combined.slice(0, overflow) : [];
    const kept = overflow > 0 ? combined.slice(overflow) : combined;

    try {
      await this.writeManifestAtomic(dir, { ...manifest, versions: kept });
    } catch (err) {
      // Manifest commit failed: clean up the orphaned new file, preserve old state.
      try {
        await rm(versionPathSafe, { force: true });
      } catch {
        // best-effort
      }
      throw err;
    }

    // Manifest committed: best-effort physical prune of dropped files. A prune
    // failure leaves a harmless orphan (no longer referenced by the manifest).
    for (const removed of pruned) {
      if (!isSafeArchiveFileName(removed.fileName, 'overwrite', ext)) continue;
      try {
        const removedPathSafe = await this.confinedPath(path.join(versionsDir, removed.fileName));
        await rm(removedPathSafe, { force: true });
      } catch {
        // best-effort orphan cleanup
      }
    }
  }

  /**
   * Archive the current target content as a deleted entry. Deleted entries are
   * never auto-pruned. Writes the new file then atomically commits the manifest;
   * on manifest failure the new file is cleaned up. Throws on any failure.
   */
  async archiveDeleted(ctx: ArchiveContext, currentRevision: FileRevision): Promise<void> {
    const content = await this.readRevisionContent(ctx, currentRevision);
    const dir = this.resolveArchiveDir(ctx);
    const ext = archiveFileExtension(ctx.format);
    const outcome = await this.readManifestOutcome(dir, ctx);
    if (outcome.status === 'invalid') {
      throw new ArchiveIntegrityError(`archive manifest invalid: ${outcome.reason}`);
    }
    const manifest = outcome.status === 'valid' ? outcome.manifest : this.freshManifest(ctx);

    const deletedDir = path.join(dir, 'deleted');
    const deletedDirSafe = await this.confinedPath(deletedDir);
    await mkdir(deletedDirSafe, { recursive: true });
    const timestamp = Date.now();
    const fileName = buildArchiveFileName(timestamp, 'delete', ext);
    if (!isSafeArchiveFileName(fileName, 'delete', ext)) {
      throw new ArchiveIntegrityError('generated delete name failed validation');
    }
    const deletedPathSafe = await this.confinedPath(path.join(deletedDir, fileName));
    await writeFile(deletedPathSafe, content, 'utf8');

    const contentBuf = Buffer.from(content, 'utf8');
    const entry: ArchiveEntry = {
      timestamp,
      fileName,
      sha256: createHash('sha256').update(contentBuf).digest('hex'),
      mtimeMs: currentRevision.mtimeMs,
      size: contentBuf.byteLength,
    };
    try {
      await this.writeManifestAtomic(dir, { ...manifest, deleted: [...manifest.deleted, entry] });
    } catch (err) {
      try {
        await rm(deletedPathSafe, { force: true });
      } catch {
        // best-effort
      }
      throw err;
    }
  }

  /** List validated history for one already-allowlisted configuration target. */
  async listHistory(ctx: ArchiveContext): Promise<ArchiveHistoryCatalogOutcome> {
    let dir: string;
    try {
      dir = this.resolveArchiveDir(ctx);
    } catch (err) {
      return { status: 'archive-failed', cause: err instanceof Error ? err.message : 'invalid archive context' };
    }
    let outcome: ManifestOutcome;
    try {
      outcome = await this.readManifestOutcome(dir, ctx);
    } catch (err) {
      return { status: 'archive-failed', cause: err instanceof Error ? err.message : 'manifest path escaped confinement' };
    }
    if (outcome.status === 'absent') return { status: 'success', targets: [] };
    if (outcome.status === 'invalid') {
      return { status: 'archive-failed', cause: `manifest invalid: ${outcome.reason}` };
    }
    const target = await this.buildHistoryTarget(dir, outcome.manifest);
    return target.status === 'success'
      ? { status: 'success', targets: [target.target] }
      : target;
  }

  /**
   * Catalog every validated archived target under a backend and optional
   * scope/kind. The caller must still apply its configuration allowlist before
   * exposing the result. Any discovered integrity failure suppresses all
   * partial results.
   */
  async catalogHistory(options: {
    readonly backend: string;
    readonly scope?: ConfigurationScope;
    readonly kind?: string;
  }): Promise<ArchiveHistoryCatalogOutcome> {
    if (!isSafeArchiveSegment(options.backend)) {
      return { status: 'archive-failed', cause: `unsafe backend segment: ${options.backend}` };
    }
    if (options.scope !== undefined && !VALID_SCOPES.includes(options.scope)) {
      return { status: 'archive-failed', cause: `unsafe archive scope: ${options.scope}` };
    }
    if (options.kind !== undefined && !isSafeArchiveSegment(options.kind)) {
      return { status: 'archive-failed', cause: `unsafe archive kind segment: ${options.kind}` };
    }

    const backendRoot = path.join(this.archiveRootPath, options.backend);
    const failures: string[] = [];
    const targets: ArchiveHistoryTarget[] = [];
    const scopeScan = await this.confinedScanDir(backendRoot);
    failures.push(...scopeScan.failures);
    for (const scopeDir of scopeScan.dirs) {
      const scope = path.basename(scopeDir);
      if (!(VALID_SCOPES as readonly string[]).includes(scope)) {
        failures.push(`${scope}: unknown archive scope`);
        continue;
      }
      if (options.scope && options.scope !== scope) continue;
      const kindScan = await this.confinedScanDir(scopeDir);
      failures.push(...kindScan.failures);
      for (const kindDir of kindScan.dirs) {
        const kind = path.basename(kindDir);
        if (options.kind && options.kind !== kind) continue;
        const hashScan = await this.confinedScanDir(kindDir);
        failures.push(...hashScan.failures);
        for (const hashDir of hashScan.dirs) {
          const validated = await this.readManifestForClear(hashDir, options.backend, scope, kind);
          if (validated.kind === 'absent') {
            failures.push(`${path.basename(hashDir)}: manifest absent`);
            continue;
          }
          if (validated.kind === 'integrity') {
            failures.push(validated.reason);
            continue;
          }
          const manifest: ArchiveManifest = {
            canonicalPath: validated.canonicalPath,
            backend: options.backend,
            scope,
            kind,
            format: validated.format,
            versions: validated.versions,
            deleted: validated.deleted,
          };
          const target = await this.buildHistoryTarget(hashDir, manifest);
          if (target.status === 'archive-failed') failures.push(target.cause);
          else targets.push(target.target);
        }
      }
    }
    if (failures.length > 0) {
      return { status: 'archive-failed', cause: failures.join('; ') };
    }
    targets.sort((a, b) => a.canonicalTarget.localeCompare(b.canonicalTarget));
    return { status: 'success', targets };
  }

  /** Decode only the target association carried by an opaque history token. */
  getHistoryEntryAssociation(identity: ArchiveHistoryEntryIdentity): ArchiveHistoryEntryAssociation | null {
    const payload = decodeArchiveHistoryEntryIdentity(identity);
    if (payload === null) return null;
    return {
      canonicalTarget: payload.canonicalTarget,
      backend: payload.backend,
      scope: payload.scope,
      kind: payload.kind,
      format: payload.format,
    };
  }

  /** Revalidate and read one caller-selected history entry without accepting an archive path. */
  // eslint-disable-next-line complexity -- Selected archive reads keep token/context/manifest/entry/confinement/identity/content checks adjacent so no invalid branch can fall through to bytes.
  async readHistoryEntryContent(
    ctx: ArchiveContext,
    identity: ArchiveHistoryEntryIdentity,
  ): Promise<ReadArchiveHistoryEntryOutcome> {
    const payload = decodeArchiveHistoryEntryIdentity(identity);
    if (payload === null) return { status: 'archive-failed', cause: 'invalid archive history identity' };
    if (
      payload.backend !== ctx.backend
      || payload.scope !== ctx.match.scope
      || payload.kind !== ctx.kind
      || payload.format !== ctx.format
      || payload.canonicalTarget !== ctx.match.canonicalTarget
    ) {
      return { status: 'archive-failed', cause: 'archive history identity association mismatch' };
    }

    let dir: string;
    try {
      dir = this.resolveArchiveDir(ctx);
    } catch (err) {
      return { status: 'archive-failed', cause: err instanceof Error ? err.message : 'invalid archive context' };
    }
    let outcome: ManifestOutcome;
    try {
      outcome = await this.readManifestOutcome(dir, ctx);
    } catch (err) {
      return { status: 'archive-failed', cause: err instanceof Error ? err.message : 'manifest path escaped confinement' };
    }
    if (outcome.status === 'absent') return { status: 'not-found' };
    if (outcome.status === 'invalid') {
      return { status: 'archive-failed', cause: `manifest invalid: ${outcome.reason}` };
    }
    const candidates = payload.archiveKind === 'overwrite'
      ? outcome.manifest.versions
      : outcome.manifest.deleted;
    const selected = candidates.find((entry) => archiveEntriesMatch(entry, payload.entry));
    if (selected === undefined) return { status: 'not-found' };

    const subdir = payload.archiveKind === 'overwrite' ? 'versions' : 'deleted';
    const ext = archiveFileExtension(ctx.format);
    const directoryFailures = await this.preflightDirectory(dir, subdir);
    if (directoryFailures.length > 0) {
      return { status: 'archive-failed', cause: directoryFailures.join('; ') };
    }
    const read = await this.readHistoryEntryDescriptorBound(
      dir,
      subdir,
      selected,
      ext,
      payload.fileState,
    );
    if (read.status === 'invalid') {
      return { status: 'archive-failed', cause: read.reason };
    }
    return { status: 'found', content: read.content };
  }

  private async buildHistoryTarget(
    dir: string,
    manifest: ArchiveManifest,
  ): Promise<
    | { readonly status: 'success'; readonly target: ArchiveHistoryTarget }
    | { readonly status: 'archive-failed'; readonly cause: string }
  > {
    const ext = archiveFileExtension(manifest.format);
    const versionDirectoryFailures = await this.preflightDirectory(dir, 'versions');
    const deletedDirectoryFailures = await this.preflightDirectory(dir, 'deleted');
    const failures = [
      ...versionDirectoryFailures,
      ...deletedDirectoryFailures,
    ];
    const versions: ArchiveHistoryEntryFence[] = [];
    for (const entry of manifest.versions) {
      const read = await this.readHistoryEntryDescriptorBound(dir, 'versions', entry, ext);
      if (read.status === 'invalid') failures.push(read.reason);
      else versions.push(read.identity);
    }
    const deleted: ArchiveHistoryEntryFence[] = [];
    for (const entry of manifest.deleted) {
      const read = await this.readHistoryEntryDescriptorBound(dir, 'deleted', entry, ext);
      if (read.status === 'invalid') failures.push(read.reason);
      else deleted.push(read.identity);
    }
    if (failures.length > 0) return { status: 'archive-failed', cause: failures.join('; ') };

    const entries: ArchiveHistoryEntrySummary[] = [
      ...versions.map((identity) => ({
        identity: encodeArchiveHistoryEntryIdentity(manifest, 'overwrite', identity),
        archiveKind: 'overwrite' as const,
        timestamp: identity.entry.timestamp,
        size: identity.entry.size,
      })),
      ...deleted.map((identity) => ({
        identity: encodeArchiveHistoryEntryIdentity(manifest, 'delete', identity),
        archiveKind: 'delete' as const,
        timestamp: identity.entry.timestamp,
        size: identity.entry.size,
      })),
    ].sort((a, b) => b.timestamp - a.timestamp);
    return {
      status: 'success',
      target: {
        canonicalTarget: manifest.canonicalPath,
        backend: manifest.backend,
        scope: manifest.scope as ConfigurationScope,
        kind: manifest.kind,
        format: manifest.format,
        entries,
      },
    };
  }

  /** Descriptor-bound history read shared by listing and selected restore. */
  // eslint-disable-next-line complexity, max-params -- One fail-closed boundary owns filename/confinement, nofollow open, lexical-vs-handle identity, stable descriptor state, and content integrity.
  private async readHistoryEntryDescriptorBound(
    dir: string,
    subdir: 'versions' | 'deleted',
    entry: ArchiveEntry,
    ext: string,
    expectedFileState?: ArchiveHistoryFileState,
  ): Promise<ArchiveHistoryDescriptorReadOutcome> {
    const expectedKind = subdir === 'versions' ? 'overwrite' : 'delete';
    if (!isSafeArchiveFileName(entry.fileName, expectedKind, ext)) {
      return { status: 'invalid', reason: `${entry.fileName}: unsafe archive filename` };
    }
    const lexicalDirectory = path.join(dir, subdir);
    const lexicalEntryPath = path.join(lexicalDirectory, entry.fileName);
    if (path.dirname(lexicalEntryPath) !== lexicalDirectory) {
      return { status: 'invalid', reason: `${entry.fileName}: archive entry path escaped its directory` };
    }

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await this.confinedPath(lexicalEntryPath);
      const initialLexicalStats = await lstat(lexicalEntryPath);
      if (initialLexicalStats.isSymbolicLink() || !initialLexicalStats.isFile()) {
        return { status: 'invalid', reason: `${entry.fileName}: archive entry is not a regular lexical file` };
      }

      const noFollowFlag = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
      try {
        handle = await open(lexicalEntryPath, constants.O_RDONLY | noFollowFlag);
      } catch (error) {
        if (noFollowFlag === 0 || !isUnsupportedNoFollowError(error)) throw error;
        handle = await open(lexicalEntryPath, constants.O_RDONLY);
      }

      const beforeReadStats = await handle.stat();
      if (!beforeReadStats.isFile()) {
        return { status: 'invalid', reason: `${entry.fileName}: opened archive entry is not a regular file` };
      }
      await this.confinedPath(lexicalEntryPath);
      const beforeReadLexicalStats = await lstat(lexicalEntryPath);
      if (beforeReadLexicalStats.isSymbolicLink() || !beforeReadLexicalStats.isFile()) {
        return { status: 'invalid', reason: `${entry.fileName}: archive entry changed type before descriptor read` };
      }
      const initialState = archiveHistoryFileState(initialLexicalStats);
      const beforeReadState = archiveHistoryFileState(beforeReadStats);
      const beforeReadLexicalState = archiveHistoryFileState(beforeReadLexicalStats);
      if (
        !archiveHistoryDescriptorStateMatches(initialState, beforeReadState)
        || !archiveHistoryDescriptorStateMatches(beforeReadLexicalState, beforeReadState)
      ) {
        return { status: 'invalid', reason: `${entry.fileName}: archive entry identity changed before descriptor read` };
      }
      if (
        expectedFileState !== undefined
        && !archiveHistoryDescriptorStateMatches(expectedFileState, beforeReadState)
      ) {
        return { status: 'invalid', reason: `${entry.fileName}: archive entry identity changed since listing` };
      }

      const contentBuffer = await handle.readFile();
      const afterReadStats = await handle.stat();
      const afterReadState = archiveHistoryFileState(afterReadStats);
      if (!afterReadStats.isFile() || !archiveHistoryDescriptorStateMatches(beforeReadState, afterReadState)) {
        return { status: 'invalid', reason: `${entry.fileName}: archive entry descriptor changed during read` };
      }
      const contentSha = createHash('sha256').update(contentBuffer).digest('hex');
      if (contentBuffer.byteLength !== entry.size || contentSha !== entry.sha256) {
        return { status: 'invalid', reason: `${entry.fileName}: content integrity mismatch (size/sha256)` };
      }

      await this.confinedPath(lexicalEntryPath);
      const afterReadLexicalStats = await lstat(lexicalEntryPath);
      if (afterReadLexicalStats.isSymbolicLink() || !afterReadLexicalStats.isFile()) {
        return { status: 'invalid', reason: `${entry.fileName}: archive entry changed type during descriptor read` };
      }
      if (!archiveHistoryDescriptorStateMatches(archiveHistoryFileState(afterReadLexicalStats), afterReadState)) {
        return { status: 'invalid', reason: `${entry.fileName}: archive entry identity changed during descriptor read` };
      }
      return {
        status: 'valid',
        identity: { entry, lexicalPath: lexicalEntryPath, fileState: afterReadState },
        content: contentBuffer.toString('utf8'),
      };
    } catch (error) {
      return {
        status: 'invalid',
        reason: `${entry.fileName}: descriptor read error ${archiveHistoryErrorCode(error) ?? 'unknown'}`,
      };
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  /**
   * Read the most recently deleted archived content for a target. Typed outcome:
   *   - not-found: no manifest, or a valid manifest with no deleted entries
   *     (there is genuinely nothing to restore)
   *   - archive-failed: the manifest is present-but-invalid/associated-mismatch,
   *     a path escaped confinement (symlink), or the manifest/entry could not be
   *     read — the archive system is failing, NOT a "nothing to restore" case
   *   - found: the raw deleted content (caller validates against the format)
   *
   * Never crosses formats (manifest format association is enforced).
   */
  async readLatestDeletedContent(ctx: ArchiveContext): Promise<ReadDeletedOutcome> {
    let dir: string;
    try {
      dir = this.resolveArchiveDir(ctx);
    } catch (err) {
      return { status: 'archive-failed', cause: err instanceof Error ? err.message : 'invalid archive context' };
    }
    let outcome: ManifestOutcome;
    try {
      outcome = await this.readManifestOutcome(dir, ctx);
    } catch (err) {
      return { status: 'archive-failed', cause: err instanceof Error ? err.message : 'manifest path escaped confinement' };
    }
    if (outcome.status === 'absent') return { status: 'not-found' };
    if (outcome.status === 'invalid') return { status: 'archive-failed', cause: `manifest invalid: ${outcome.reason}` };
    if (outcome.manifest.deleted.length === 0) return { status: 'not-found' };
    const latest = outcome.manifest.deleted[outcome.manifest.deleted.length - 1];
    const deletedDir = path.join(dir, 'deleted');
    let deletedPathSafe: string;
    try {
      deletedPathSafe = await this.confinedPath(path.join(deletedDir, latest.fileName));
    } catch {
      return { status: 'archive-failed', cause: 'deleted entry path escaped confinement' };
    }
    let content: string;
    try {
      content = await readFile(deletedPathSafe, 'utf8');
    } catch (err) {
      // A referenced entry that cannot be read (incl. ENOENT) is an
      // inconsistent archive → archive-failed, not a silent not-found.
      return { status: 'archive-failed', cause: `deleted entry read error: ${(err as { code?: string }).code ?? 'unknown'}` };
    }
    // Integrity check: the entry's UTF-8 byte size and sha256 must match the
    // manifest entry. A tampered archive (even still-valid JSON/TOML) fails.
    const contentBuffer = Buffer.from(content, 'utf8');
    const contentSha = createHash('sha256').update(contentBuffer).digest('hex');
    if (contentBuffer.byteLength !== latest.size || contentSha !== latest.sha256) {
      return { status: 'archive-failed', cause: 'deleted entry content integrity mismatch (size/sha256)' };
    }
    return { status: 'found', content };
  }

  /**
   * Manually clear deleted archive entries (optionally scoped). Manifest-first:
   * atomically commit a manifest with an empty deleted list, THEN best-effort
   * physically remove the files. `cleared` reflects actual physical removal;
   * `orphanedFiles` are logically cleared but still on disk; manifestWriteFailed
   * means nothing changed. Never throws. Overwrite history is never touched.
   */
  async clearDeleted(options: {
    readonly backend: string;
    readonly scope?: ConfigurationScope;
    readonly kind?: string;
  }): Promise<ClearDeletedResult> {
    // An unsafe backend segment is an integrity failure (never ok:true).
    if (!isSafeArchiveSegment(options.backend)) {
      return { ok: false, cleared: 0, orphanedFiles: [], manifestWriteFailed: false, integrityFailures: [`unsafe backend segment: ${options.backend}`], absentEntries: [] };
    }
    const backendRoot = path.join(this.archiveRootPath, options.backend);
    let totalCleared = 0;
    const totalOrphaned: string[] = [];
    const totalIntegrityFailures: string[] = [];
    const totalAbsent: string[] = [];
    let anyManifestWriteFailed = false;

    const scopeScan = await this.confinedScanDir(backendRoot);
    totalIntegrityFailures.push(...scopeScan.failures);
    for (const scopeDir of scopeScan.dirs) {
      const scope = path.basename(scopeDir);
      if (!(VALID_SCOPES as readonly string[]).includes(scope) || (options.scope && options.scope !== scope)) continue;
      const kindScan = await this.confinedScanDir(scopeDir);
      totalIntegrityFailures.push(...kindScan.failures);
      for (const kindDir of kindScan.dirs) {
        const kind = path.basename(kindDir);
        if (options.kind && options.kind !== kind) continue;
        const hashScan = await this.confinedScanDir(kindDir);
        totalIntegrityFailures.push(...hashScan.failures);
        for (const hashDir of hashScan.dirs) {
          const result = await this.clearDeletedInDir(hashDir, options.backend, scope, kind);
          totalCleared += result.cleared;
          totalOrphaned.push(...result.orphanedFiles);
          totalIntegrityFailures.push(...result.integrityFailures);
          totalAbsent.push(...result.absentEntries);
          if (result.manifestWriteFailed) anyManifestWriteFailed = true;
        }
      }
    }

    if (anyManifestWriteFailed || totalOrphaned.length > 0 || totalIntegrityFailures.length > 0 || totalAbsent.length > 0) {
      return {
        ok: false,
        cleared: totalCleared,
        orphanedFiles: totalOrphaned,
        manifestWriteFailed: anyManifestWriteFailed,
        integrityFailures: totalIntegrityFailures,
        absentEntries: totalAbsent,
      };
    }
    return { ok: true, cleared: totalCleared };
  }

  private async clearDeletedInDir(
    dir: string,
    expectedBackend: string,
    expectedScope: string,
    expectedKind: string,
  ): Promise<{ cleared: number; orphanedFiles: string[]; manifestWriteFailed: boolean; integrityFailures: string[]; absentEntries: string[] }> {
    const empty = { cleared: 0, orphanedFiles: [], manifestWriteFailed: false, integrityFailures: [], absentEntries: [] };
    const validated = await this.readManifestForClear(dir, expectedBackend, expectedScope, expectedKind);
    if (validated.kind === 'absent') return empty;
    if (validated.kind === 'integrity') {
      return { ...empty, integrityFailures: [validated.reason] };
    }

    // PREFLIGHT (items A + 3): ALWAYS run before any manifest write, even when
    // the deleted entries list is empty. Catches planted directory symlinks
    // that would be invisible with an empty entry list.
    const ext = archiveFileExtension(validated.format);
    const dirPreflight = await this.preflightDirectory(dir, 'versions');
    const deletedDirPreflight = await this.preflightDirectory(dir, 'deleted');
    const versionPreflight = await this.preflightEntries(dir, 'versions', validated.versions, ext);
    const deletedPreflight = await this.preflightEntries(dir, 'deleted', validated.deleted, ext);
    const preflightFailures = [
      ...dirPreflight,
      ...deletedDirPreflight,
      ...versionPreflight.failures,
      ...deletedPreflight.failures,
    ];
    if (preflightFailures.length > 0) {
      return { ...empty, integrityFailures: preflightFailures };
    }

    // Nothing to clear if preflight passed but there are no deleted entries.
    if (validated.deleted.length === 0) return empty;

    // Preflight passed: manifest-first commit, then physical removal.
    const committedManifest: ArchiveManifest = {
      canonicalPath: validated.canonicalPath,
      backend: expectedBackend,
      scope: expectedScope,
      kind: expectedKind,
      format: validated.format,
      versions: validated.versions,
      deleted: [],
    };
    try {
      await this.writeManifestAtomic(dir, committedManifest);
    } catch {
      return { ...empty, manifestWriteFailed: true };
    }

    // Manifest committed: physically remove only files that actually exist.
    const removed = await this.physicallyRemoveDeleted(dir, deletedPreflight.identities, ext);
    return { ...removed, manifestWriteFailed: false };
  }

  /**
   * Preflight the confinement of a subdirectory (versions/ or deleted/) itself,
   * even when the manifest has zero entries. A planted directory symlink is
   * caught here. Side-effect-free.
   */
  private async preflightDirectory(dir: string, subdir: 'versions' | 'deleted'): Promise<string[]> {
    const subPath = path.join(dir, subdir);
    let safePath: string;
    try {
      safePath = await this.confinedPath(subPath);
    } catch (err) {
      // If the dir doesn't exist (ENOENT via confinedPath missing-anchor), that's OK.
      // Any other confinement failure is an integrity issue.
      const msg = err instanceof Error ? err.message : 'unknown';
      if (msg.includes('missing-anchor') || msg.includes('ENOENT')) return [];
      return [`${subdir}/: directory confinement failed (${msg})`];
    }
    try {
      const lst = await lstat(safePath);
      if (lst.isSymbolicLink()) {
        return [`${subdir}/: directory is a symlink (rejected)`];
      }
      if (!lst.isDirectory()) {
        return [`${subdir}/: expected a directory but found a file`];
      }
    } catch (err) {
      if (isENOENTError(err)) return []; // Directory doesn't exist yet — fine.
      return [`${subdir}/: stat error ${(err as { code?: string }).code ?? 'unknown'}`];
    }
    return [];
  }

  /**
   * Preflight confinement + existence + content integrity for a set of archive
   * entries. Returns a list of integrity-failure reasons (empty = all pass).
   * This is side-effect-free — it never writes, deletes, or mutates state.
   */
  // eslint-disable-next-line complexity -- fail-closed entry validation keeps every filesystem error/type/identity/content branch explicit at the security boundary.
  private async preflightEntries(
    dir: string,
    subdir: 'versions' | 'deleted',
    entries: readonly ArchiveEntry[],
    ext: string,
  ): Promise<ArchiveEntryPreflight> {
    const failures: string[] = [];
    const identities: ArchiveEntryIdentity[] = [];
    for (const entry of entries) {
      if (!isSafeArchiveFileName(entry.fileName, subdir === 'versions' ? 'overwrite' : 'delete', ext)) {
        failures.push(`${entry.fileName}: unsafe archive filename`);
        continue;
      }
      const lexicalEntryPath = path.join(dir, subdir, entry.fileName);
      // Reject ANY symlink on the LEXICAL path (before confinedPath resolves
      // it). This catches in-root symlinks (e.g., a deleted entry pointing to
      // a version file) that confinedPath would silently follow.
      let initialIdentity: { dev: number; ino: number } | null = null;
      try {
        const lst = await lstat(lexicalEntryPath);
        if (lst.isSymbolicLink()) {
          failures.push(`${entry.fileName}: archive entry is a symlink (rejected)`);
          continue;
        }
        if (!lst.isFile()) {
          failures.push(`${entry.fileName}: archive entry is not a regular file`);
          continue;
        }
        initialIdentity = { dev: lst.dev, ino: lst.ino };
      } catch (err) {
        if (isENOENTError(err)) {
          failures.push(`${entry.fileName}: referenced entry absent`);
        } else {
          failures.push(`${entry.fileName}: lstat error ${(err as { code?: string }).code ?? 'unknown'}`);
        }
        continue;
      }
      let pathSafe: string;
      try {
        pathSafe = await this.confinedPath(lexicalEntryPath);
      } catch (err) {
        failures.push(`${entry.fileName}: confinement failed (${err instanceof Error ? err.message : 'unknown'})`);
        continue;
      }
      let content: string;
      try {
        content = await readFile(pathSafe, 'utf8');
      } catch (err) {
        if (isENOENTError(err)) {
          failures.push(`${entry.fileName}: referenced entry absent`);
        } else {
          failures.push(`${entry.fileName}: read error ${(err as { code?: string }).code ?? 'unknown'}`);
        }
        continue;
      }
      const buf = Buffer.from(content, 'utf8');
      const sha = createHash('sha256').update(buf).digest('hex');
      if (buf.byteLength !== entry.size || sha !== entry.sha256) {
        failures.push(`${entry.fileName}: content integrity mismatch (size/sha256)`);
        continue;
      }
      try {
        const finalStat = await lstat(lexicalEntryPath);
        if (
          finalStat.isSymbolicLink()
          || !finalStat.isFile()
          || initialIdentity === null
          || finalStat.dev !== initialIdentity.dev
          || finalStat.ino !== initialIdentity.ino
        ) {
          failures.push(`${entry.fileName}: archive entry identity changed during preflight`);
          continue;
        }
        identities.push({ entry, lexicalPath: lexicalEntryPath, dev: finalStat.dev, ino: finalStat.ino });
      } catch (err) {
        failures.push(`${entry.fileName}: identity recheck error ${(err as { code?: string }).code ?? 'unknown'}`);
      }
    }
    return { failures, identities };
  }

  /**
   * Read + parse + validate a manifest for clearDeleted. Returns:
   *   - absent: no manifest (ENOENT)
   *   - integrity: present-but-invalid / association mismatch (reason given)
   *   - valid: the validated manifest fields
   */
  private async readManifestForClear(
    dir: string,
    expectedBackend: string,
    expectedScope: string,
    expectedKind: string,
  ): Promise<
    | { kind: 'absent' }
    | { kind: 'integrity'; reason: string }
    | { kind: 'valid'; canonicalPath: string; format: ConfigurationFormat; versions: ArchiveEntry[]; deleted: ArchiveEntry[] }
  > {
    const label = path.basename(dir);
    let manifestPathSafe: string;
    try {
      manifestPathSafe = await this.confinedPath(path.join(dir, 'manifest.json'));
    } catch (err) {
      // Confinement failure (symlink escape / non-ENOENT) is an integrity
      // failure, NOT absent. Only a truly missing manifest is absent.
      return { kind: 'integrity', reason: `${label}: manifest path confinement failed (${err instanceof Error ? err.message : 'unknown'})` };
    }
    let raw: string;
    try {
      raw = await readFile(manifestPathSafe, 'utf8');
    } catch (err) {
      if (isENOENTError(err)) return { kind: 'absent' };
      return { kind: 'integrity', reason: `${label}: manifest read error ${(err as { code?: string }).code ?? 'unknown'}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { kind: 'integrity', reason: `${label}: manifest is not valid JSON` };
    }
    if (!isPlainObject(parsed)) return { kind: 'integrity', reason: `${label}: manifest root is not an object` };
    const result = this.validateManifestAssociation(parsed, dir, { backend: expectedBackend, scope: expectedScope, kind: expectedKind });
    if (result !== null) return { kind: 'integrity', reason: result };
    const format = (parsed as { format: ConfigurationFormat }).format;
    const ext = archiveFileExtension(format);
    const deleted = validateEntries((parsed as { deleted: unknown }).deleted, 'delete', ext);
    const versions = validateEntries((parsed as { versions: unknown }).versions, 'overwrite', ext);
    if (deleted === null || versions === null) {
      return { kind: 'integrity', reason: `${label}: invalid archive entry` };
    }
    return { kind: 'valid', canonicalPath: (parsed as { canonicalPath: string }).canonicalPath, format, versions, deleted };
  }

  /** Validate manifest association against actual dir segments + path hash. Returns a reason string or null. */
  private validateManifestAssociation(
    parsed: Record<string, unknown>,
    dir: string,
    expected: { backend: string; scope: string; kind: string },
  ): string | null {
    const label = path.basename(dir);
    const canonicalPath = typeof parsed.canonicalPath === 'string' ? parsed.canonicalPath : '';
    const problems: string[] = [];
    if (!canonicalPath || hashCanonicalPath(canonicalPath).slice(0, 16) !== label) {
      problems.push('canonicalPath/hash mismatch');
    }
    if (parsed.backend !== expected.backend) problems.push('backend mismatch');
    if (parsed.scope !== expected.scope) problems.push('scope mismatch');
    if (parsed.kind !== expected.kind) problems.push('kind mismatch');
    if (!isConfigurationFormat(parsed.format)) problems.push('format missing/unknown');
    return problems.length > 0 ? `${label}: ${problems.join('; ')}` : null;
  }

  /** Physically remove already-validated deleted entries; absent ≠ cleared. */
  // eslint-disable-next-line complexity -- manifest-first removal reports absent/orphan/integrity outcomes separately while fencing type, identity, content, quarantine and rollback.
  private async physicallyRemoveDeleted(
    dir: string,
    deleted: readonly ArchiveEntryIdentity[],
    ext: string,
  ): Promise<{ cleared: number; orphanedFiles: string[]; integrityFailures: string[]; absentEntries: string[] }> {
    const deletedDir = path.join(dir, 'deleted');
    let cleared = 0;
    const orphanedFiles: string[] = [];
    const integrityFailures: string[] = [];
    const absentEntries: string[] = [];
    for (const identity of deleted) {
      const { entry } = identity;
      if (!isSafeArchiveFileName(entry.fileName, 'delete', ext)) {
        orphanedFiles.push(entry.fileName);
        continue;
      }
      const lexicalEntryPath = identity.lexicalPath;
      if (path.dirname(lexicalEntryPath) !== deletedDir) {
        integrityFailures.push(`${entry.fileName}: archive entry path changed after preflight`);
        orphanedFiles.push(entry.fileName);
        continue;
      }
      let finalStat;
      try {
        finalStat = await lstat(lexicalEntryPath);
      } catch (err) {
        if (isENOENTError(err)) {
          absentEntries.push(entry.fileName);
        } else {
          orphanedFiles.push(entry.fileName);
        }
        continue;
      }
      if (finalStat.isSymbolicLink() || !finalStat.isFile()) {
        integrityFailures.push(`${entry.fileName}: archive entry type changed after preflight`);
        orphanedFiles.push(entry.fileName);
        continue;
      }
      if (finalStat.dev !== identity.dev || finalStat.ino !== identity.ino) {
        integrityFailures.push(`${entry.fileName}: archive entry identity changed after preflight`);
        orphanedFiles.push(entry.fileName);
        continue;
      }
      try {
        const content = await readFile(lexicalEntryPath, 'utf8');
        const contentBuffer = Buffer.from(content, 'utf8');
        const contentSha = createHash('sha256').update(contentBuffer).digest('hex');
        if (contentBuffer.byteLength !== entry.size || contentSha !== entry.sha256) {
          integrityFailures.push(`${entry.fileName}: archive entry content changed after preflight`);
          orphanedFiles.push(entry.fileName);
          continue;
        }
      } catch (err) {
        if (isENOENTError(err)) absentEntries.push(entry.fileName);
        else orphanedFiles.push(entry.fileName);
        continue;
      }

      // Rename the lexical leaf itself into an unpredictable quarantine name.
      // A last-moment symlink swap moves only the symlink; rm never follows it.
      const quarantinePath = path.join(deletedDir, `.clear-${randomBytes(8).toString('hex')}.tmp`);
      try {
        await rename(lexicalEntryPath, quarantinePath);
        const quarantinedStat = await lstat(quarantinePath);
        if (
          quarantinedStat.isSymbolicLink()
          || !quarantinedStat.isFile()
          || quarantinedStat.dev !== identity.dev
          || quarantinedStat.ino !== identity.ino
        ) {
          integrityFailures.push(`${entry.fileName}: archive entry identity changed during removal`);
          try {
            await link(quarantinePath, lexicalEntryPath);
            await rm(quarantinePath);
          } catch {
            orphanedFiles.push(entry.fileName);
          }
          continue;
        }
        await rm(quarantinePath);
        cleared += 1;
      } catch (err) {
        if (isENOENTError(err)) absentEntries.push(entry.fileName);
        else orphanedFiles.push(entry.fileName);
      }
    }
    return { cleared, orphanedFiles, integrityFailures, absentEntries };
  }

  /**
   * Confined recursive directory scan for clearDeleted. At every level the
   * parent is confinement-checked; a symlink/illegal segment or a non-ENOENT
   * readdir/confinement error is REPORTED as an integrity failure (never
   * silently ignored or followed). Only ENOENT (genuinely nothing there) yields
   * no failures. Returns lexical child dir paths (descended only after a
   * successful confinement check).
   */
  /** readdir seam for deterministic fault injection in tests. */
  protected async readDirEntries(dir: string): Promise<Dirent[]> {
    return readdir(dir, { withFileTypes: true });
  }

  private async confinedScanDir(parentLexical: string): Promise<{ dirs: string[]; failures: string[] }> {
    let parentSafe: string;
    try {
      parentSafe = await this.confinedPath(parentLexical);
    } catch (err) {
      return { dirs: [], failures: [`${path.basename(parentLexical)}: scan confinement failed (${err instanceof Error ? err.message : 'unknown'})`] };
    }
    let entries: Dirent[];
    try {
      entries = await this.readDirEntries(parentSafe);
    } catch (err) {
      if (isENOENTError(err)) return { dirs: [], failures: [] };
      return { dirs: [], failures: [`${path.basename(parentLexical)}: scan readdir error ${(err as { code?: string }).code ?? 'unknown'}`] };
    }
    const dirs: string[] = [];
    const failures: string[] = [];
    for (const entry of entries) {
      const childLexical = path.join(parentLexical, entry.name);
      // A symlink or illegal segment at any level is reported FIRST, never
      // followed or silently skipped (must not be hidden by a !isDirectory filter).
      if (entry.isSymbolicLink() || !isSafeArchiveSegment(entry.name)) {
        failures.push(`${entry.name}: illegal/symlink archive segment`);
        continue;
      }
      if (!entry.isDirectory()) continue;
      try {
        await this.confinedPath(childLexical);
        dirs.push(childLexical);
      } catch (err) {
        failures.push(`${entry.name}: child confinement failed (${err instanceof Error ? err.message : 'unknown'})`);
      }
    }
    return { dirs, failures };
  }
}
