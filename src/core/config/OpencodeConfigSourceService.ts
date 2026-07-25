/* eslint-disable max-lines -- P1-B keeps source inventory plus exact-root read/write/history/restore in one auditable scope-aware security owner. */
/**
 * Scope-aware OpenCode configuration source inventory and safe mutation owner.
 *
 * P1-B keeps target selection explicit: every raw or structured mutation names
 * one inventoried path. Managed system candidates are discoverable but never
 * enter the writable allowlist.
 */
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';

import type { JSONPath } from 'jsonc-parser';

import { ConfigurationArchiveService } from '../agents/backend/ConfigurationArchiveService';
import {
  applyJsoncPathEdits,
  type ArchiveHistoryCatalogOutcome,
  type ArchiveHistoryEntryIdentity,
  assertWithinAllowlistedRoot,
  assertWithinRoot,
  type ConfigurationArchiveHistoryResult,
  type ConfigurationEvidence,
  type ConfigurationScope,
  type FileRevision,
  type JsoncPathEdit,
  listConfigurationArchiveHistory,
  readAllowlistedFileSnapshot,
  resolveDefaultArchiveRoot,
  safeDeleteFile,
  type SafeFileMutationResult,
  safeRestoreArchivedEntry,
  safeWriteFile,
  validateConfigurationContent,
} from '../agents/backend/ProjectResourceSecureWrite';

const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';
const ARCHIVE_BACKEND = 'opencode';
const ARCHIVE_KIND = 'configuration';

export type OpencodeConfigSourceScope = 'project' | 'global' | 'managed';

export type OpencodeConfigSourceOrigin =
  | 'project-default'
  | 'project-legacy'
  | 'global-xdg-default'
  | 'global-xdg-legacy'
  | 'global-xdg-config-legacy'
  | 'global-home-default'
  | 'global-home-legacy'
  | 'global-home-config-legacy'
  | 'global-dot-opencode-jsonc-legacy'
  | 'global-dot-opencode-json-legacy'
  | 'managed-system';

export interface OpencodeConfigSourceCandidate {
  readonly scope: OpencodeConfigSourceScope;
  readonly source: OpencodeConfigSourceOrigin;
  readonly path: string;
  readonly exists: boolean;
  readonly editable: boolean;
  readonly revision: FileRevision | null;
  readonly parseError?: string;
  readonly evidence: ConfigurationEvidence;
}

export type OpencodeConfigSourceReadResult =
  | {
    readonly status: 'success';
    readonly source: OpencodeConfigSourceCandidate;
    /** Exact bytes decoded as UTF-8. Invalid JSONC remains available to repair. */
    readonly content: string;
  }
  | { readonly status: 'invalid-target'; readonly targetPath: string };

export type OpencodeConfigSourceMutationResult =
  | SafeFileMutationResult
  | { readonly status: 'read-only' }
  | { readonly status: 'invalid-target' };

export interface OpencodeConfigSourceMutationOutcome {
  readonly targetPath: string;
  readonly result: OpencodeConfigSourceMutationResult;
  readonly evidence: ConfigurationEvidence;
  /** Exact submitted/derived text so a conflict never requires discarding UI draft state. */
  readonly draft?: string;
}

export interface OpencodeConfigSourceServiceOptions {
  readonly homePath?: string;
  /** `null` explicitly models an absent XDG_CONFIG_HOME for deterministic callers/tests. */
  readonly xdgConfigHome?: string | null;
  readonly managedConfigDir?: string;
  readonly archiveRootPath?: string;
}

export interface WriteOpencodeConfigSourceOptions {
  readonly targetPath: string;
  readonly content: string;
  readonly expectedRevision: FileRevision | null;
}

export interface ApplyOpencodeConfigPathEditsOptions {
  readonly targetPath: string;
  readonly edits: readonly JsoncPathEdit[];
  readonly expectedRevision: FileRevision | null;
}

export interface DeleteOpencodeConfigSourceOptions {
  readonly targetPath: string;
  readonly expectedRevision: FileRevision | null;
}

export interface RestoreOpencodeConfigSourceOptions {
  readonly entryIdentity: ArchiveHistoryEntryIdentity;
  readonly expectedRevision: FileRevision | null;
}

export type OpencodeConfigSourceHistoryResult =
  | ConfigurationArchiveHistoryResult
  | { readonly status: 'invalid-target' }
  | { readonly status: 'read-only' };

interface CandidateDefinition {
  readonly scope: OpencodeConfigSourceScope;
  readonly source: OpencodeConfigSourceOrigin;
  readonly path: string;
  readonly editable: boolean;
  readonly allowlistRoot?: string;
}

function isENOENT(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && (error as { code?: string }).code === 'ENOENT';
}

async function pathExistsWithoutFollowing(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (isENOENT(error)) return false;
    throw error;
  }
}

function pathsEqual(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function revisionsMatch(left: FileRevision | null, right: FileRevision | null): boolean {
  if (left === null || right === null) return left === right;
  return left.canonicalPath === right.canonicalPath
    && left.mtimeMs === right.mtimeMs
    && left.size === right.size
    && left.sha256 === right.sha256;
}

function sourceEvidence(exists: boolean, parseError?: string): ConfigurationEvidence {
  return {
    persistence: parseError ? 'failed' : exists ? 'verified' : 'not-applicable',
    application: 'unavailable',
    runtime: 'unavailable',
    detail: parseError
      ? `Source could not be safely read or parsed: ${parseError}`
      : exists
        ? 'Source bytes and revision were read from disk; backend application/runtime were not probed.'
        : 'Candidate does not exist; backend application/runtime were not probed.',
  };
}

function mutationEvidence(result: OpencodeConfigSourceMutationResult): ConfigurationEvidence {
  if (result.status === 'success') {
    return {
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
      detail: 'Filesystem mutation and revision were verified. OpenCode must reload the source; no runtime readback was captured.',
    };
  }
  return {
    persistence: 'failed',
    application: 'not-applicable',
    runtime: 'not-applicable',
    detail: `Persistence did not complete (${result.status}); no application/runtime claim was made.`,
  };
}

function defaultManagedConfigDir(): string {
  switch (process.platform) {
    case 'darwin':
      return '/Library/Application Support/opencode';
    case 'win32':
      return path.join(process.env.ProgramData || 'C:\\ProgramData', 'opencode');
    default:
      return '/etc/opencode';
  }
}

/** Public P1-B source seam used by Settings without broadening legacy manager targets. */
export class OpencodeConfigSourceService {
  private readonly vaultPath: string;
  private readonly homePath: string;
  private readonly xdgConfigHome: string | null;
  private readonly globalConfigBase: string;
  private readonly globalConfigDir: string;
  private readonly dotOpencodeConfigDir: string;
  private readonly managedConfigDir: string;
  private readonly archiveRootPath?: string;

  constructor(vaultPath: string, options: OpencodeConfigSourceServiceOptions = {}) {
    this.vaultPath = path.resolve(vaultPath);
    this.homePath = path.resolve(options.homePath ?? homedir());
    const configuredXdg = options.xdgConfigHome === undefined
      ? process.env.XDG_CONFIG_HOME?.trim() || null
      : options.xdgConfigHome?.trim() || null;
    this.xdgConfigHome = configuredXdg ? path.resolve(configuredXdg) : null;
    this.globalConfigBase = this.xdgConfigHome ?? path.join(this.homePath, '.config');
    this.globalConfigDir = path.join(this.globalConfigBase, 'opencode');
    this.dotOpencodeConfigDir = path.join(this.homePath, '.opencode');
    this.managedConfigDir = path.resolve(options.managedConfigDir ?? defaultManagedConfigDir());
    this.archiveRootPath = options.archiveRootPath;
  }

  getDefaultProjectConfigPath(): string {
    return path.join(this.vaultPath, '.opencode', 'opencode.jsonc');
  }

  getDefaultGlobalConfigPath(): string {
    return path.join(this.globalConfigDir, 'opencode.jsonc');
  }

  async inventory(): Promise<OpencodeConfigSourceCandidate[]> {
    return Promise.all(this.candidateDefinitions().map((candidate) => this.inspectCandidate(candidate)));
  }

  async read(targetPath: string): Promise<OpencodeConfigSourceReadResult> {
    const definition = this.findCandidate(targetPath);
    if (!definition) return { status: 'invalid-target', targetPath };
    const inspected = await this.inspectCandidate(definition, true);
    return {
      status: 'success',
      source: inspected.candidate,
      content: inspected.content,
    };
  }

  async write(options: WriteOpencodeConfigSourceOptions): Promise<OpencodeConfigSourceMutationOutcome> {
    const definition = this.findCandidate(options.targetPath);
    if (!definition) {
      return this.outcome(options.targetPath, { status: 'invalid-target' }, options.content);
    }
    if (!definition.editable) {
      return this.outcome(definition.path, { status: 'read-only' }, options.content);
    }
    try {
      await this.ensureWritableRoot(definition);
    } catch {
      return this.outcome(definition.path, { status: 'invalid-path' }, options.content);
    }
    const result = await safeWriteFile({
      targetPath: definition.path,
      content: options.content,
      expectedRevision: options.expectedRevision,
      allowlist: [this.allowlistEntry(definition)],
      archive: this.archiveOptions(),
      format: 'jsonc',
    });
    return this.outcome(definition.path, result, options.content);
  }

  async applyPathEdits(options: ApplyOpencodeConfigPathEditsOptions): Promise<OpencodeConfigSourceMutationOutcome> {
    const definition = this.findCandidate(options.targetPath);
    if (!definition) return this.outcome(options.targetPath, { status: 'invalid-target' });
    if (!definition.editable) return this.outcome(definition.path, { status: 'read-only' });

    const snapshot = await this.read(definition.path);
    if (snapshot.status !== 'success') return this.outcome(definition.path, { status: 'invalid-target' });
    if (!revisionsMatch(snapshot.source.revision, options.expectedRevision)) {
      const result: SafeFileMutationResult = {
        status: 'conflict',
        expected: options.expectedRevision,
        current: snapshot.source.revision,
      };
      return this.outcome(definition.path, result, snapshot.content);
    }

    const base = snapshot.source.exists
      ? snapshot.content
      : `{\n  "$schema": "${OPENCODE_SCHEMA_URL}"\n}\n`;
    const edited = applyJsoncPathEdits(base, options.edits);
    if (!edited.ok) {
      const result: SafeFileMutationResult = { status: 'invalid-content', diagnostics: edited.diagnostics };
      return this.outcome(definition.path, result, base);
    }
    return this.write({
      targetPath: definition.path,
      content: edited.result,
      expectedRevision: options.expectedRevision,
    });
  }

  async delete(options: DeleteOpencodeConfigSourceOptions): Promise<OpencodeConfigSourceMutationOutcome> {
    const definition = this.findCandidate(options.targetPath);
    if (!definition) return this.outcome(options.targetPath, { status: 'invalid-target' });
    if (!definition.editable) return this.outcome(definition.path, { status: 'read-only' });
    try {
      await this.ensureWritableRoot(definition);
    } catch {
      return this.outcome(definition.path, { status: 'invalid-path' });
    }
    const result = await safeDeleteFile({
      targetPath: definition.path,
      expectedRevision: options.expectedRevision,
      allowlist: [this.allowlistEntry(definition)],
      archive: this.archiveOptions(),
    });
    return this.outcome(definition.path, result);
  }

  async listHistory(targetPath: string): Promise<OpencodeConfigSourceHistoryResult> {
    const definition = this.findCandidate(targetPath);
    if (!definition) return { status: 'invalid-target' };
    if (!definition.editable) return { status: 'read-only' };
    // History discovery must remain read-only. An absent candidate root has no
    // current target to authorize, and is indistinguishable from no history.
    if (!await pathExistsWithoutFollowing(definition.allowlistRoot!)) {
      return { status: 'success', targets: [] };
    }
    return listConfigurationArchiveHistory({
      targetPath: definition.path,
      allowlist: [this.allowlistEntry(definition)],
      archive: this.archiveOptions(),
    });
  }

  async catalogHistory(scope?: ConfigurationScope): Promise<ArchiveHistoryCatalogOutcome> {
    const editable = this.candidateDefinitions().filter((candidate) => (
      candidate.editable && (!scope || candidate.scope === scope)
    ));
    const archiveService = new ConfigurationArchiveService(
      this.archiveRootPath ?? resolveDefaultArchiveRoot(),
    );
    const catalog = await archiveService.catalogHistory({
      backend: ARCHIVE_BACKEND,
      ...(scope ? { scope } : {}),
      kind: ARCHIVE_KIND,
    });
    if (catalog.status !== 'success') return catalog;
    for (const target of catalog.targets) {
      const definition = await this.findEditableArchiveTarget(target.canonicalTarget, target.scope, editable);
      if (!definition) {
        return {
          status: 'archive-failed',
          cause: 'archived target is not an inventoried OpenCode configuration candidate',
        };
      }
    }
    return catalog;
  }

  async restore(options: RestoreOpencodeConfigSourceOptions): Promise<OpencodeConfigSourceMutationOutcome> {
    const archiveService = new ConfigurationArchiveService(
      this.archiveRootPath ?? resolveDefaultArchiveRoot(),
    );
    const association = archiveService.getHistoryEntryAssociation(options.entryIdentity);
    if (
      !association
      || association.backend !== ARCHIVE_BACKEND
      || association.kind !== ARCHIVE_KIND
      || association.format !== 'jsonc'
    ) {
      return this.outcome('', { status: 'invalid-target' });
    }
    const editable = this.candidateDefinitions().filter((candidate) => (
      candidate.editable && candidate.scope === association.scope
    ));
    const definition = await this.findEditableArchiveTarget(
      association.canonicalTarget,
      association.scope,
      editable,
    );
    if (!definition) {
      return this.outcome(association.canonicalTarget, { status: 'invalid-target' });
    }
    try {
      await this.ensureWritableRoot(definition);
    } catch {
      return this.outcome(definition.path, { status: 'invalid-path' });
    }
    const result = await safeRestoreArchivedEntry({
      entryIdentity: options.entryIdentity,
      expectedRevision: options.expectedRevision,
      allowlist: [this.allowlistEntry(definition)],
      ...(this.archiveRootPath ? { archiveRootPath: this.archiveRootPath } : {}),
    });
    const targetPath = result.status === 'success'
      ? result.revision.canonicalPath
      : result.status === 'conflict'
        ? result.current?.canonicalPath ?? result.expected?.canonicalPath ?? ''
        : '';
    return this.outcome(targetPath, result);
  }

  private candidateDefinitions(): CandidateDefinition[] {
    const projectDir = path.join(this.vaultPath, '.opencode');
    const globalPrefix = this.xdgConfigHome ? 'global-xdg' : 'global-home';
    return [
      {
        scope: 'project',
        source: 'project-default',
        path: this.getDefaultProjectConfigPath(),
        editable: true,
        allowlistRoot: projectDir,
      },
      {
        scope: 'project',
        source: 'project-legacy',
        path: path.join(projectDir, 'opencode.json'),
        editable: true,
        allowlistRoot: projectDir,
      },
      {
        scope: 'global',
        source: `${globalPrefix}-default` as OpencodeConfigSourceOrigin,
        path: this.getDefaultGlobalConfigPath(),
        editable: true,
        allowlistRoot: this.globalConfigDir,
      },
      {
        scope: 'global',
        source: `${globalPrefix}-legacy` as OpencodeConfigSourceOrigin,
        path: path.join(this.globalConfigDir, 'opencode.json'),
        editable: true,
        allowlistRoot: this.globalConfigDir,
      },
      {
        scope: 'global',
        source: `${globalPrefix}-config-legacy` as OpencodeConfigSourceOrigin,
        path: path.join(this.globalConfigDir, 'config.json'),
        editable: true,
        allowlistRoot: this.globalConfigDir,
      },
      {
        scope: 'global',
        source: 'global-dot-opencode-jsonc-legacy',
        path: path.join(this.dotOpencodeConfigDir, 'opencode.jsonc'),
        editable: true,
        allowlistRoot: this.dotOpencodeConfigDir,
      },
      {
        scope: 'global',
        source: 'global-dot-opencode-json-legacy',
        path: path.join(this.dotOpencodeConfigDir, 'opencode.json'),
        editable: true,
        allowlistRoot: this.dotOpencodeConfigDir,
      },
      {
        scope: 'managed',
        source: 'managed-system',
        path: path.join(this.managedConfigDir, 'opencode.jsonc'),
        editable: false,
      },
      {
        scope: 'managed',
        source: 'managed-system',
        path: path.join(this.managedConfigDir, 'opencode.json'),
        editable: false,
      },
    ];
  }

  private findCandidate(targetPath: string): CandidateDefinition | undefined {
    return this.candidateDefinitions().find((candidate) => pathsEqual(candidate.path, targetPath));
  }

  private async resolveEditableReadPath(definition: CandidateDefinition): Promise<string | null> {
    const rootPath = definition.allowlistRoot;
    if (!rootPath) throw new Error('Editable OpenCode source is missing its allowlist root');
    if (definition.scope === 'project') {
      await assertWithinRoot(this.vaultPath, rootPath);
    } else {
      if (pathsEqual(rootPath, this.dotOpencodeConfigDir)) {
        await assertWithinRoot(this.homePath, rootPath);
      } else {
        if (!this.xdgConfigHome) await assertWithinRoot(this.homePath, this.globalConfigBase);
        if (!await pathExistsWithoutFollowing(this.globalConfigBase)) return null;
        await assertWithinRoot(this.globalConfigBase, rootPath);
      }
    }
    if (!await pathExistsWithoutFollowing(rootPath)) return null;
    const match = await assertWithinAllowlistedRoot([this.allowlistEntry(definition)], definition.path);
    return match.canonicalTarget;
  }

  private async resolveManagedReadPath(definition: CandidateDefinition): Promise<string | null> {
    if (definition.scope !== 'managed') throw new Error('Expected a managed OpenCode source');
    if (!await pathExistsWithoutFollowing(this.managedConfigDir)) return null;
    await assertWithinRoot(this.managedConfigDir, definition.path);
    try {
      return await realpath(definition.path);
    } catch (error) {
      if (isENOENT(error)) return null;
      throw error;
    }
  }

  private async inspectCandidate(
    definition: CandidateDefinition,
    includeContent: true,
  ): Promise<{ candidate: OpencodeConfigSourceCandidate; content: string }>;
  private async inspectCandidate(definition: CandidateDefinition): Promise<OpencodeConfigSourceCandidate>;
  private async inspectCandidate(
    definition: CandidateDefinition,
    includeContent = false,
  ): Promise<OpencodeConfigSourceCandidate | { candidate: OpencodeConfigSourceCandidate; content: string }> {
    let content = '';
    let exists = false;
    let revision: FileRevision | null = null;
    let parseError: string | undefined;
    try {
      if (definition.editable) {
        const resolved = await this.resolveEditableReadPath(definition);
        if (resolved !== null) {
          const snapshot = await readAllowlistedFileSnapshot({
            targetPath: definition.path,
            allowlist: [this.allowlistEntry(definition)],
          });
          if (snapshot.status === 'success') {
            content = snapshot.content;
            exists = true;
            revision = snapshot.revision;
          } else if (snapshot.status !== 'absent') {
            parseError = `Source snapshot failed: ${snapshot.status}${snapshot.status === 'read-failed' ? `: ${snapshot.cause}` : ''}`;
          }
        }
      } else {
        const resolved = await this.resolveManagedReadPath(definition);
        if (resolved !== null) {
          const snapshot = await readAllowlistedFileSnapshot({
            targetPath: definition.path,
            allowlist: [{ scope: 'global', rootPath: this.managedConfigDir }],
          });
          if (snapshot.status === 'success') {
            content = snapshot.content;
            exists = true;
            revision = snapshot.revision;
          } else if (snapshot.status !== 'absent') {
            parseError = `Source snapshot failed: ${snapshot.status}${snapshot.status === 'read-failed' ? `: ${snapshot.cause}` : ''}`;
          }
        }
      }
      if (exists) {
        const validation = validateConfigurationContent('jsonc', content);
        if (!validation.ok) parseError = validation.diagnostics.map((diagnostic) => diagnostic.message).join('; ');
      }
    } catch (error) {
      if (!isENOENT(error)) {
        const detail = error instanceof Error ? error.message : String(error);
        parseError = `Source path failed confinement/read: ${detail}`;
      }
    }
    const candidate: OpencodeConfigSourceCandidate = {
      scope: definition.scope,
      source: definition.source,
      path: definition.path,
      exists,
      editable: definition.editable,
      revision,
      ...(parseError ? { parseError } : {}),
      evidence: sourceEvidence(exists, parseError),
    };
    return includeContent ? { candidate, content } : candidate;
  }

  private async ensureWritableRoot(definition: CandidateDefinition): Promise<void> {
    if (!definition.editable || !definition.allowlistRoot) return;
    if (definition.scope === 'project') {
      // Re-check on both sides of materialization. A missing `.opencode`
      // directory can otherwise be swapped for an escaping parent symlink
      // between the initial vault proof and the narrow allowlist mutation.
      await assertWithinRoot(this.vaultPath, definition.allowlistRoot);
      await mkdir(definition.allowlistRoot, { recursive: true });
      await assertWithinRoot(this.vaultPath, definition.allowlistRoot);
      return;
    }
    if (definition.scope === 'global') {
      if (pathsEqual(definition.allowlistRoot, this.dotOpencodeConfigDir)) {
        await assertWithinRoot(this.homePath, definition.allowlistRoot);
        await mkdir(definition.allowlistRoot, { recursive: true });
        await assertWithinRoot(this.homePath, definition.allowlistRoot);
        return;
      }
      if (this.xdgConfigHome) {
        await mkdir(this.globalConfigBase, { recursive: true });
      } else {
        await assertWithinRoot(this.homePath, this.globalConfigBase);
        await mkdir(this.globalConfigBase, { recursive: true });
        await assertWithinRoot(this.homePath, this.globalConfigBase);
      }
      await assertWithinRoot(this.globalConfigBase, definition.allowlistRoot);
      await mkdir(definition.allowlistRoot, { recursive: true });
      await assertWithinRoot(this.globalConfigBase, definition.allowlistRoot);
    }
  }

  private async findEditableArchiveTarget(
    canonicalTarget: string,
    scope: ConfigurationScope,
    definitions: readonly CandidateDefinition[],
  ): Promise<CandidateDefinition | undefined> {
    for (const definition of definitions) {
      if (!definition.editable || definition.scope !== scope) continue;
      if (!await pathExistsWithoutFollowing(definition.allowlistRoot!)) {
        // A deleted target may be the only item in an absent root. Exact lexical
        // equality against an existing parent anchor is the sole safe historical
        // association without recreating the root.
        const expectedCanonical = await this.canonicalPathForAbsentRoot(definition);
        if (expectedCanonical !== null && pathsEqual(expectedCanonical, canonicalTarget)) return definition;
        continue;
      }
      try {
        const match = await assertWithinAllowlistedRoot(
          [this.allowlistEntry(definition)],
          definition.path,
        );
        if (pathsEqual(match.canonicalTarget, canonicalTarget)) return definition;
      } catch {
        // A candidate that no longer resolves inside its exact root cannot authorize an archive target.
      }
    }
    return undefined;
  }

  private async canonicalPathForAbsentRoot(definition: CandidateDefinition): Promise<string | null> {
    const anchor = definition.scope === 'project'
      ? this.vaultPath
      : pathsEqual(definition.allowlistRoot!, this.dotOpencodeConfigDir)
        ? this.homePath
        : this.globalConfigBase;
    try {
      const canonicalAnchor = await realpath(anchor);
      const relativeTarget = path.relative(anchor, definition.path);
      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) return null;
      return path.join(canonicalAnchor, relativeTarget);
    } catch {
      return null;
    }
  }

  private allowlistEntry(definition: CandidateDefinition): { scope: ConfigurationScope; rootPath: string } {
    if (!definition.allowlistRoot || definition.scope === 'managed') {
      throw new Error('Managed OpenCode configuration is read-only');
    }
    return { scope: definition.scope, rootPath: definition.allowlistRoot };
  }

  private archiveOptions(): {
    archiveRootPath?: string;
    backend: string;
    kind: string;
    format: 'jsonc';
  } {
    return {
      ...(this.archiveRootPath ? { archiveRootPath: this.archiveRootPath } : {}),
      backend: ARCHIVE_BACKEND,
      kind: ARCHIVE_KIND,
      format: 'jsonc',
    };
  }

  private outcome(
    targetPath: string,
    result: OpencodeConfigSourceMutationResult,
    draft?: string,
  ): OpencodeConfigSourceMutationOutcome {
    return {
      targetPath,
      result,
      evidence: mutationEvidence(result),
      ...(draft === undefined ? {} : { draft }),
    };
  }
}

/** Public edit type convenience for consumers that do not import jsonc-parser. */
export interface OpencodeConfigPathEdit {
  readonly path: JSONPath;
  readonly value: unknown;
}
