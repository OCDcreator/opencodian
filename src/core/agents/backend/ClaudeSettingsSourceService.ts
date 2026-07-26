import { mkdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';

import { ClaudeManagedSettingsDiscovery } from './ClaudeManagedSettingsDiscovery';
import type {
  ClaudeSettingsDeleteParams,
  ClaudeSettingsDeleteResult,
  ClaudeSettingsHistoryResult,
  ClaudeSettingsPathEditsParams,
  ClaudeSettingsReadResult,
  ClaudeSettingsRestoreParams,
  ClaudeSettingsRestoreResult,
  ClaudeSettingsSourceCandidate,
  ClaudeSettingsSourceFormat,
  ClaudeSettingsSourceScope,
  ClaudeSettingsSourceServiceOptions,
  ClaudeSettingsWriteParams,
  ClaudeSettingsWriteResult,
} from './ClaudeSettingsSourceTypes';
import {
  type ArchiveHistoryCatalogOutcome,
  type ArchiveHistoryEntryAssociation,
  type ArchiveHistoryEntryIdentity,
  type ArchiveHistoryTarget,
  ConfigurationArchiveService,
} from './ConfigurationArchiveService';
import {
  applyJsoncPathEdits,
  assertWithinRoot,
  type ConfigurationAllowlist,
  type ConfigurationArchiveOptions,
  type ConfigurationEvidence,
  type ConfigurationScope,
  type FileRevision,
  listConfigurationArchiveHistory,
  readAllowlistedFileSnapshot,
  resolveDefaultArchiveRoot,
  safeDeleteFile,
  safeRestoreArchivedEntry,
  safeWriteFile,
  validateConfigurationContent,
} from './ProjectResourceSecureWrite';

export type * from './ClaudeSettingsSourceTypes';

/**
 * Documented Claude settings precedence (higher wins). Reflects the full chain
 * Managed > CLI args > Local > Project > User. `cliArgs` is documented here for
 * completeness only; CLI args is not a file candidate and is never returned by
 * inventory().
 */
export const CLAUDE_SETTINGS_PRIORITY = {
  managed: 400, cliArgs: 300, local: 200, project: 100, user: 0,
} as const;

const EVIDENCE_VERIFIED: ConfigurationEvidence = {
  persistence: 'verified', application: 'unavailable', runtime: 'unavailable',
};
const EVIDENCE_WRITTEN: ConfigurationEvidence = {
  persistence: 'verified', application: 'pending', runtime: 'unavailable',
};
const EVIDENCE_ABSENT: ConfigurationEvidence = {
  persistence: 'not-applicable', application: 'unavailable', runtime: 'unavailable',
};
const EVIDENCE_FAILED: ConfigurationEvidence = {
  persistence: 'failed', application: 'unavailable', runtime: 'unavailable',
};
const RESTORABLE_SCOPES = new Set<ConfigurationScope>(['global', 'project', 'local']);
function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object'
    ? (error as { code?: string }).code
    : undefined;
}

type SnapshotOutcome = { readonly status: 'success'; readonly content: string; readonly revision: FileRevision } | { readonly status: 'absent' } | { readonly status: 'failed' };

type InventorySlot = {
  readonly targetPath: string; readonly rootPath: string;
  readonly allowlist: ConfigurationAllowlist; readonly anchorPath?: string;
  readonly scope: ClaudeSettingsSourceScope; readonly origin: string;
  readonly priority: number; readonly editable: boolean; readonly format: ClaudeSettingsSourceFormat;
};

type AuthenticatedRestoreSlotResolution =
  | { readonly status: 'success'; readonly slot: InventorySlot }
  | { readonly status: 'invalid-target' }
  | { readonly status: 'archive-failed'; readonly cause: string };

/**
 * Read-only inventory, safe read, and safe create/update of Claude settings
 * file sources. The service returns base editable (user/project/local) and
 * managed-base candidates, plus discovered managed-settings.d drop-ins and MDM
 * plist candidates. It routes every existing root through descriptor-bound confinement, and routes every
 * mutation through the shared `safeWriteFile` chokepoint with a per-slot
 * narrow allowlist. Managed is read-only and never enters a writable allowlist.
 */
export class ClaudeSettingsSourceService {
  private readonly vaultPath: string;
  private readonly home: string;
  private readonly platform: NodeJS.Platform;
  private readonly managedDiscovery: ClaudeManagedSettingsDiscovery;
  private readonly archiveRootPath?: string;

  constructor(vaultPath: string, options?: ClaudeSettingsSourceServiceOptions) {
    this.vaultPath = path.resolve(vaultPath);
    this.home = path.resolve(options?.home ?? homedir());
    this.platform = options?.platform ?? process.platform;
    this.managedDiscovery = new ClaudeManagedSettingsDiscovery({
      ...options,
      platform: this.platform,
      managedPriority: CLAUDE_SETTINGS_PRIORITY.managed,
    });
    this.archiveRootPath = options?.archiveRootPath;
  }

  getDefaultProjectSettingsPath(): string {
    return path.join(this.vaultPath, '.claude', 'settings.json');
  }

  getDefaultGlobalSettingsPath(): string {
    return path.join(this.home, '.claude', 'settings.json');
  }

  async inventory(): Promise<readonly ClaudeSettingsSourceCandidate[]> {
    const slots = await this.inventorySlots();
    const results = await Promise.all(slots.map((slot) => this.inspectSlot(slot)));
    return slots.map((slot, index) => {
      const r = results[index];
      return {
        ...this.toCandidate(slot, { exists: r.exists, revision: r.revision, evidence: r.evidence }),
        ...(r.parseError !== undefined ? { parseError: r.parseError } : {}),
      };
    });
  }

  async read(targetPath: string): Promise<ClaudeSettingsReadResult> {
    const slot = await this.findSlot(targetPath);
    if (slot === undefined) {
      return { status: 'invalid-target', targetPath };
    }
    const r = await this.inspectSlot(slot);
    const source: ClaudeSettingsSourceCandidate = {
      ...this.toCandidate(slot, { exists: r.exists, revision: r.revision, evidence: r.evidence }),
      ...(r.parseError !== undefined ? { parseError: r.parseError } : {}),
    };
    return { status: 'success', source, content: r.content };
  }

  async applyPathEdits(params: ClaudeSettingsPathEditsParams): Promise<ClaudeSettingsWriteResult> {
    const { targetPath, baseContent, edits, expectedRevision } = params;
    // Managed/unknown targets short-circuit BEFORE any content parsing or edit,
    // so a read-only or unknown target never materializes anything. This mirrors
    // write()'s ordering and takes precedence over strict-JSON validation.
    const slot = await this.findSlot(targetPath);
    if (slot === undefined) {
      return { targetPath, draft: baseContent, evidence: EVIDENCE_ABSENT, result: { status: 'invalid-target' } };
    }
    if (!slot.editable) {
      return { targetPath, draft: baseContent, evidence: EVIDENCE_ABSENT, result: { status: 'read-only' } };
    }
    // Strict-JSON validate the caller's base draft first; an invalid base never
    // touches the filesystem and the original draft is preserved.
    const baseValidation = validateConfigurationContent('json', baseContent);
    if (!baseValidation.ok) {
      return { targetPath, draft: baseContent, evidence: EVIDENCE_FAILED, result: { status: 'invalid-content', diagnostics: baseValidation.diagnostics } };
    }
    // Structure-aware edit over the caller's baseContent (preserves unknown
    // fields, key order, indent, EOL). The shared function is not modified.
    const edited = applyJsoncPathEdits(baseContent, edits);
    if (!edited.ok) {
      return { targetPath, draft: baseContent, evidence: EVIDENCE_FAILED, result: { status: 'invalid-content', diagnostics: edited.diagnostics } };
    }
    // Re-validate the edited result as strict JSON so JSONC comments / trailing
    // commas / non-object roots cannot smuggle through the JSONC edit layer.
    const editedValidation = validateConfigurationContent('json', edited.result);
    if (!editedValidation.ok) {
      return { targetPath, draft: edited.result, evidence: EVIDENCE_FAILED, result: { status: 'invalid-content', diagnostics: editedValidation.diagnostics } };
    }
    // Delegate to write for CAS / archive / commit. On external conflict the
    // CAS returns conflict and the draft is the derived intended text, never a
    // re-read of the external winner with edits reapplied.
    return this.write({ targetPath, content: edited.result, expectedRevision });
  }

  async write(params: ClaudeSettingsWriteParams): Promise<ClaudeSettingsWriteResult> {
    const { targetPath, content, expectedRevision } = params;
    const draft = content;
    const slot = await this.findSlot(targetPath);
    if (slot === undefined) {
      return { targetPath, draft, evidence: EVIDENCE_ABSENT, result: { status: 'invalid-target' } };
    }
    if (!slot.editable) {
      return { targetPath, draft, evidence: EVIDENCE_ABSENT, result: { status: 'read-only' } };
    }
    // Strict-JSON validation before any filesystem effect (no dir created for
    // invalid content). safeWriteFile re-validates as its own chokepoint.
    const validation = validateConfigurationContent('json', content);
    if (!validation.ok) {
      return {
        targetPath,
        draft,
        evidence: EVIDENCE_FAILED,
        result: { status: 'invalid-content', diagnostics: validation.diagnostics },
      };
    }
    // Anchor-confined narrow-root creation: confine, mkdir, re-confine (TOCTOU).
    if (slot.anchorPath !== undefined) {
      try {
        await assertWithinRoot(slot.anchorPath, slot.rootPath);
        await mkdir(slot.rootPath, { recursive: true });
        await assertWithinRoot(slot.anchorPath, slot.rootPath);
      } catch {
        return { targetPath, draft, evidence: EVIDENCE_FAILED, result: { status: 'write-failed', cause: 'path-confinement' } };
      }
    }
    const mutation = await safeWriteFile({
      targetPath: slot.targetPath,
      content,
      expectedRevision,
      allowlist: slot.allowlist,
      archive: this.archiveOptions(),
      format: 'json',
    });
    const evidence = mutation.status === 'success' ? EVIDENCE_WRITTEN : EVIDENCE_FAILED;
    return { targetPath, draft, evidence, result: mutation };
  }

  async delete(params: ClaudeSettingsDeleteParams): Promise<ClaudeSettingsDeleteResult> {
    const { targetPath, expectedRevision } = params;
    const slot = await this.findSlot(targetPath);
    if (slot === undefined) {
      return { targetPath, evidence: EVIDENCE_ABSENT, result: { status: 'invalid-target' } };
    }
    if (!slot.editable) {
      return { targetPath, evidence: EVIDENCE_ABSENT, result: { status: 'read-only' } };
    }
    // Anchor-confine the narrow root before deleting; never mkdir/materialize.
    if (slot.anchorPath !== undefined) {
      try {
        await assertWithinRoot(slot.anchorPath, slot.rootPath);
      } catch {
        return { targetPath, evidence: EVIDENCE_FAILED, result: { status: 'write-failed', cause: 'path-confinement' } };
      }
    }
    const mutation = await safeDeleteFile({
      targetPath: slot.targetPath,
      expectedRevision,
      allowlist: slot.allowlist,
      archive: this.archiveOptions(),
    });
    const deleteEvidence = mutation.status === 'success' ? EVIDENCE_WRITTEN : EVIDENCE_FAILED;
    return { targetPath, evidence: deleteEvidence, result: mutation };
  }

  async restore(params: ClaudeSettingsRestoreParams): Promise<ClaudeSettingsRestoreResult> {
    const { entryIdentity, expectedRevision } = params;
    // Validate the opaque identity first: backend/kind/format/scope must match
    // this service's archive contract.
    const archiveService = new ConfigurationArchiveService(
      this.archiveRootPath ?? resolveDefaultArchiveRoot(),
    );
    const association = archiveService.getHistoryEntryAssociation(entryIdentity);
    if (
      association === null
      || association.backend !== 'claude'
      || association.kind !== 'settings'
      || association.format !== 'json'
      || !RESTORABLE_SCOPES.has(association.scope)
    ) {
      return { evidence: EVIDENCE_ABSENT, result: { status: 'invalid-target' } };
    }
    const resolution = await this.resolveAuthenticatedRestoreSlot(
      archiveService,
      entryIdentity,
      association,
    );
    if (resolution.status === 'archive-failed') {
      return {
        evidence: EVIDENCE_FAILED,
        result: { status: 'archive-failed', cause: resolution.cause },
      };
    }
    if (resolution.status !== 'success') {
      return { evidence: EVIDENCE_ABSENT, result: { status: 'invalid-target' } };
    }
    // Identity + canonical candidate fully validated: now allowed to materialize
    // the editable narrow root (anchor-confined) before delegating the restore.
    const matchSlot = resolution.slot;
    if (matchSlot.anchorPath !== undefined) {
      try {
        await assertWithinRoot(matchSlot.anchorPath, matchSlot.rootPath);
        await mkdir(matchSlot.rootPath, { recursive: true });
        await assertWithinRoot(matchSlot.anchorPath, matchSlot.rootPath);
      } catch {
        return { evidence: EVIDENCE_FAILED, result: { status: 'write-failed', cause: 'path-confinement' } };
      }
    }
    const mutation = await safeRestoreArchivedEntry({
      entryIdentity,
      expectedRevision,
      allowlist: matchSlot.allowlist,
      ...(this.archiveRootPath !== undefined ? { archiveRootPath: this.archiveRootPath } : {}),
    });
    const evidence = mutation.status === 'success' ? EVIDENCE_WRITTEN : EVIDENCE_FAILED;
    return { evidence, result: mutation };
  }

  private async resolveAuthenticatedRestoreSlot(
    archiveService: ConfigurationArchiveService,
    entryIdentity: ArchiveHistoryEntryIdentity,
    association: ArchiveHistoryEntryAssociation,
  ): Promise<AuthenticatedRestoreSlotResolution> {
    // Association decoding is intentionally only syntactic. First authenticate
    // the selected token against the manifest and descriptor-bound entry bytes.
    const authenticatedHistory = await archiveService.catalogHistory({
      backend: 'claude',
      scope: association.scope,
      kind: 'settings',
    });
    if (authenticatedHistory.status === 'archive-failed') {
      return authenticatedHistory;
    }
    const identityIsAuthenticated = authenticatedHistory.targets.some((target) => (
      target.canonicalTarget === association.canonicalTarget
      && target.backend === association.backend
      && target.scope === association.scope
      && target.kind === association.kind
      && target.format === association.format
      && target.entries.some((entry) => entry.identity === entryIdentity)
    ));
    if (!identityIsAuthenticated) return { status: 'invalid-target' };

    // Only after authentication, bind the canonical target to one exact editable
    // inventory slot. Nothing is materialized during either validation phase.
    for (const slot of await this.inventorySlots()) {
      if (!slot.editable || slot.scope !== association.scope) continue;
      const expected = await this.expectedCanonicalTarget(slot);
      if (
        expected !== undefined
        && this.comparablePath(expected) === this.comparablePath(association.canonicalTarget)
      ) {
        return { status: 'success', slot };
      }
    }
    return { status: 'invalid-target' };
  }

  async catalogHistory(scope?: ConfigurationScope): Promise<ArchiveHistoryCatalogOutcome> {
    const archiveService = new ConfigurationArchiveService(
      this.archiveRootPath ?? resolveDefaultArchiveRoot(),
    );
    const catalog = await archiveService.catalogHistory({
      backend: 'claude',
      kind: 'settings',
      ...(scope !== undefined ? { scope } : {}),
    });
    if (catalog.status !== 'success') {
      return catalog;
    }
    // Rebind only archived targets owned by this service's exact editable
    // inventory. Other valid vaults sharing the archive root are not failures
    // and are never exposed. Archive integrity failures already failed above.
    const rebound: ArchiveHistoryTarget[] = [];
    const slots = await this.inventorySlots();
    for (const target of catalog.targets) {
      const slot = slots.find((candidate) => candidate.editable && candidate.scope === target.scope);
      if (slot === undefined) {
        return { status: 'archive-failed', cause: 'unbound-target-scope' };
      }
      const expected = await this.expectedCanonicalTarget(slot);
      if (expected === undefined) {
        return { status: 'archive-failed', cause: 'unbound-target' };
      }
      if (this.comparablePath(expected) !== this.comparablePath(target.canonicalTarget)) {
        continue;
      }
      rebound.push(target);
    }
    return { status: 'success', targets: rebound };
  }

  /**
   * Expected canonical target for a slot. When the narrow root exists it is
   * canonicalized via realpath(root); when the narrow root is gone (e.g. .claude
   * removed) it is derived from an existing parent anchor via a safe relative
   * mapping that rejects traversal/absolute. Never mkdir/materialize.
   */
  private async expectedCanonicalTarget(slot: InventorySlot): Promise<string | undefined> {
    const fileName = path.basename(slot.targetPath);
    if (slot.anchorPath !== undefined) {
      try {
        await assertWithinRoot(slot.anchorPath, slot.rootPath);
      } catch {
        return undefined;
      }
    }
    try {
      const realRoot = await realpath(slot.rootPath);
      return path.join(realRoot, fileName);
    } catch (error) {
      // Only ENOENT (narrow root absent) may fall through to the parent-anchor
      // mapping. EACCES/EIO/ENAMETOOLONG/ELOOP/... fail closed.
      if (errorCode(error) !== 'ENOENT') return undefined;
      if (slot.anchorPath === undefined) return undefined;
      let realAnchor: string;
      try {
        realAnchor = await realpath(slot.anchorPath);
      } catch {
        return undefined;
      }
      const relative = path.relative(slot.anchorPath, slot.targetPath);
      if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        return undefined;
      }
      return path.join(realAnchor, relative);
    }
  }

  async listHistory(targetPath: string): Promise<ClaudeSettingsHistoryResult> {
    const slot = await this.findSlot(targetPath);
    if (slot === undefined) {
      return { status: 'invalid-target' };
    }
    if (!slot.editable || slot.scope === 'managed') {
      return { status: 'read-only' };
    }
    // A missing narrow root is benign (no writes ever happened -> no archive)
    // and must not masquerade as a confinement failure. History reads never
    // mkdir/write/materialize.
    try {
      await stat(slot.rootPath);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        const expected = await this.expectedCanonicalTarget(slot);
        if (expected === undefined) return { status: 'archive-failed', cause: 'unbound-target' };
        const catalog = await this.catalogHistory(slot.scope);
        if (catalog.status !== 'success') return catalog;
        return {
          status: 'success',
          targets: catalog.targets.filter((target) => (
            this.comparablePath(target.canonicalTarget) === this.comparablePath(expected)
          )),
        };
      }
      return { status: 'archive-failed', cause: 'root-stat-error' };
    }
    if (slot.anchorPath !== undefined) {
      try {
        await assertWithinRoot(slot.anchorPath, slot.rootPath);
      } catch {
        return { status: 'archive-failed', cause: 'path-confinement' };
      }
    }
    return listConfigurationArchiveHistory({
      targetPath: slot.targetPath,
      allowlist: slot.allowlist,
      archive: this.archiveOptions(),
    });
  }

  private archiveOptions(): ConfigurationArchiveOptions {
    return {
      backend: 'claude',
      kind: 'settings',
      format: 'json',
      ...(this.archiveRootPath !== undefined ? { archiveRootPath: this.archiveRootPath } : {}),
    };
  }

  private async inventorySlots(): Promise<readonly InventorySlot[]> {
    const globalRoot = path.join(this.home, '.claude');
    const vaultClaudeRoot = path.join(this.vaultPath, '.claude');
    // Per-slot narrow allowlists: each editable source is confined to its own
    // .claude directory; managed is read-only and never appears as writable.
    const base: InventorySlot[] = [
      { targetPath: path.join(globalRoot, 'settings.json'), rootPath: globalRoot, allowlist: [{ scope: 'global', rootPath: globalRoot }], anchorPath: this.home, scope: 'global', origin: 'user-settings', priority: CLAUDE_SETTINGS_PRIORITY.user, editable: true, format: 'json' },
      { targetPath: path.join(vaultClaudeRoot, 'settings.json'), rootPath: vaultClaudeRoot, allowlist: [{ scope: 'project', rootPath: vaultClaudeRoot }], anchorPath: this.vaultPath, scope: 'project', origin: 'project-settings', priority: CLAUDE_SETTINGS_PRIORITY.project, editable: true, format: 'json' },
      { targetPath: path.join(vaultClaudeRoot, 'settings.local.json'), rootPath: vaultClaudeRoot, allowlist: [{ scope: 'local', rootPath: vaultClaudeRoot }], anchorPath: this.vaultPath, scope: 'local', origin: 'local-settings', priority: CLAUDE_SETTINGS_PRIORITY.local, editable: true, format: 'json' },
    ];
    return [...base, ...await this.managedDiscovery.discover()];
  }

  private async findSlot(targetPath: string): Promise<InventorySlot | undefined> {
    const slots = await this.inventorySlots();
    const resolved = this.comparablePath(targetPath);
    return slots.find((slot) => this.comparablePath(slot.targetPath) === resolved);
  }

  private comparablePath(value: string): string {
    const resolved = path.resolve(value);
    // Windows drive/path comparison is case-insensitive; POSIX is case-sensitive.
    return this.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  private toCandidate(
    slot: InventorySlot,
    outcome: { readonly exists: boolean; readonly revision: FileRevision | null; readonly evidence: ConfigurationEvidence },
  ): ClaudeSettingsSourceCandidate {
    return {
      scope: slot.scope,
      origin: slot.origin,
      path: slot.targetPath,
      exists: outcome.exists,
      editable: slot.editable,
      priority: slot.priority,
      revision: outcome.revision,
      evidence: outcome.evidence,
      format: slot.format,
    };
  }

  private async snapshot(slot: InventorySlot): Promise<SnapshotOutcome> {
    // Constrain the narrow root within its parent anchor first: a symlinked
    // .claude that escapes home/vault fails closed here. An absent narrow root
    // anchors the remainder (benign for discovery).
    if (slot.anchorPath !== undefined) {
      try {
        await assertWithinRoot(slot.anchorPath, slot.rootPath);
      } catch {
        return { status: 'failed' };
      }
    }
    try {
      await stat(slot.rootPath);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { status: 'absent' };
      return { status: 'failed' };
    }
    try {
      await assertWithinRoot(slot.rootPath, slot.targetPath);
    } catch {
      return { status: 'failed' };
    }
    const snap = await readAllowlistedFileSnapshot({ targetPath: slot.targetPath, allowlist: slot.allowlist });
    if (snap.status === 'success') {
      return { status: 'success', content: snap.content, revision: snap.revision };
    }
    if (snap.status === 'absent') return { status: 'absent' };
    return { status: 'failed' };
  }

  private async inspectSlot(slot: InventorySlot): Promise<{
    readonly exists: boolean;
    readonly revision: FileRevision | null;
    readonly evidence: ConfigurationEvidence;
    readonly content: string | null;
    readonly parseError?: string;
  }> {
    if (slot.format === 'plist') {
      const pathOnly = await this.managedDiscovery.inspectPlistPath(slot);
      return { exists: pathOnly.exists, revision: null, evidence: pathOnly.evidence, content: null };
    }
    const detail = await this.readDetail(slot);
    return {
      exists: detail.exists,
      revision: detail.revision,
      evidence: detail.evidence,
      content: detail.content,
      ...(detail.parseError !== undefined ? { parseError: detail.parseError } : {}),
    };
  }

  private async readDetail(slot: InventorySlot): Promise<{
    readonly content: string;
    readonly exists: boolean;
    readonly revision: FileRevision | null;
    readonly evidence: ConfigurationEvidence;
    readonly parseError?: string;
  }> {
    const snap = await this.snapshot(slot);
    if (snap.status !== 'success') {
      const evidence = snap.status === 'absent' ? EVIDENCE_ABSENT : EVIDENCE_FAILED;
      return { content: '', exists: false, revision: null, evidence };
    }
    // Strict JSON validation only; never lenient JSONC. Content + revision come
    // from the same descriptor-bound snapshot (no second weak read). Invalid
    // strict JSON still returns the exact raw content for advanced repair.
    const validation = validateConfigurationContent('json', snap.content);
    if (validation.ok) {
      return { content: snap.content, exists: true, revision: snap.revision, evidence: EVIDENCE_VERIFIED };
    }
    return {
      content: snap.content,
      exists: true,
      revision: snap.revision,
      evidence: EVIDENCE_FAILED,
      parseError: validation.diagnostics.map((d) => d.message).join('; '),
    };
  }
}
