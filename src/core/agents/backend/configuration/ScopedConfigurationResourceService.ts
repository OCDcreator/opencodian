/* eslint-disable max-lines -- Secure scoped read and mutation ownership stays co-located so one narrow-root contract remains auditable. */

/**
 * Shared project/global resource mutation plumbing for P1 configuration
 * resources. Resource owners keep their own path/name/content semantics; this
 * service centralizes the explicit narrow-root allowlist, optimistic revision,
 * archive-before-mutation, history catalog, and selected-restore contract.
 */

import { lstat, mkdir } from 'fs/promises';
import * as path from 'path';

import {
  type ArchiveHistoryCatalogOutcome,
  type ArchiveHistoryEntryIdentity,
  assertWithinAllowlistedRoot,
  assertWithinRoot,
  catalogConfigurationArchiveHistory,
  computeFileRevision,
  type ConfigurationAllowlist,
  type ConfigurationArchiveHistoryResult,
  type ConfigurationArchiveOptions,
  type ConfigurationFormat,
  type FileRevision,
  listConfigurationArchiveHistory,
  readAllowlistedFileSnapshot,
  safeDeleteFile,
  type SafeFileMutationResult,
  safeRestoreArchivedEntry,
  safeWriteFile,
} from './ProjectResourceSecureWrite';

export type ScopedConfigurationResourceScope = 'project' | 'global';

export interface ScopedConfigurationResourceDefinition {
  readonly backend: string;
  readonly kind: string;
  readonly format: ConfigurationFormat;
  /** Fixed descendant root, relative to the supplied vault/home base path. */
  readonly relativeRootPath: string;
}

export interface ScopedConfigurationResourceContext {
  /** Vault root for project scope; home root for global scope. */
  readonly basePath: string;
  readonly scope: ScopedConfigurationResourceScope;
  readonly archiveRootPath?: string;
}

export interface ScopedConfigurationResourceTargetContext extends ScopedConfigurationResourceContext {
  /** Resource-owner-validated file path relative to the fixed resource root. */
  readonly targetRelativePath: string;
}

export interface CreateScopedConfigurationResourceOptions extends ScopedConfigurationResourceTargetContext {
  readonly content: string;
  readonly expectedRevision: null;
}

export interface ReadScopedConfigurationResourceOptions extends ScopedConfigurationResourceTargetContext {
  readonly expectedRevision: FileRevision;
}

export interface UpdateScopedConfigurationResourceOptions extends ScopedConfigurationResourceTargetContext {
  readonly content: string;
  readonly expectedRevision: FileRevision;
}

export interface DeleteScopedConfigurationResourceOptions extends ScopedConfigurationResourceTargetContext {
  readonly expectedRevision: FileRevision;
}

export interface RestoreScopedConfigurationResourceOptions extends ScopedConfigurationResourceTargetContext {
  readonly entryIdentity: ArchiveHistoryEntryIdentity;
  readonly expectedRevision: FileRevision | null;
}

export type ScopedConfigurationResourceMutationResult = SafeFileMutationResult & {
  readonly scope: ScopedConfigurationResourceScope;
  readonly targetPath: string;
};

export type ScopedConfigurationResourceReadOutcome =
  | { status: 'success'; content: string; revision: FileRevision }
  | { status: 'conflict'; expected: FileRevision; current: FileRevision | null }
  | { status: 'invalid-path' }
  | { status: 'read-failed'; cause: string };

export type ScopedConfigurationResourceReadResult = ScopedConfigurationResourceReadOutcome & {
  readonly scope: ScopedConfigurationResourceScope;
  readonly targetPath: string;
};

export interface NamedScopedConfigurationResourceContext extends ScopedConfigurationResourceContext {
  readonly name: string;
}

export interface CreateNamedScopedConfigurationResourceOptions extends NamedScopedConfigurationResourceContext {
  readonly content?: string;
  readonly expectedRevision: null;
}

export interface ReadNamedScopedConfigurationResourceOptions extends NamedScopedConfigurationResourceContext {
  readonly expectedRevision: FileRevision;
}

export interface UpdateNamedScopedConfigurationResourceOptions extends NamedScopedConfigurationResourceContext {
  readonly content: string;
  readonly expectedRevision: FileRevision;
}

export interface DeleteNamedScopedConfigurationResourceOptions extends NamedScopedConfigurationResourceContext {
  readonly expectedRevision: FileRevision;
}

export interface RestoreNamedScopedConfigurationResourceOptions extends NamedScopedConfigurationResourceContext {
  readonly entryIdentity: ArchiveHistoryEntryIdentity;
  readonly expectedRevision: FileRevision | null;
}

export interface NamedScopedConfigurationResourceDefinition extends ScopedConfigurationResourceDefinition {
  readonly targetRelativePath: (name: string) => string;
  readonly isSafeName: (name: string) => boolean;
  readonly defaultContent: (name: string) => string;
  readonly validateContent: (content: string) => string | null;
}

export interface NamedScopedConfigurationResourceFacade {
  readonly readRevision: (
    context: ScopedConfigurationResourceContext,
    name: string,
  ) => Promise<FileRevision | null>;
  readonly read: (
    options: ReadNamedScopedConfigurationResourceOptions,
  ) => Promise<ScopedConfigurationResourceReadResult>;
  readonly create: (
    options: CreateNamedScopedConfigurationResourceOptions,
  ) => Promise<ScopedConfigurationResourceMutationResult>;
  readonly update: (
    options: UpdateNamedScopedConfigurationResourceOptions,
  ) => Promise<ScopedConfigurationResourceMutationResult>;
  readonly delete: (
    options: DeleteNamedScopedConfigurationResourceOptions,
  ) => Promise<ScopedConfigurationResourceMutationResult>;
  readonly listHistory: (
    options: NamedScopedConfigurationResourceContext,
  ) => Promise<ConfigurationArchiveHistoryResult>;
  readonly catalogHistory: (
    context: ScopedConfigurationResourceContext,
  ) => Promise<ArchiveHistoryCatalogOutcome>;
  readonly restore: (
    options: RestoreNamedScopedConfigurationResourceOptions,
  ) => Promise<ScopedConfigurationResourceMutationResult>;
}

interface ResolvedResourcePaths {
  readonly rootPath: string;
  readonly targetPath: string;
}

type RootMaterializationResult =
  | { readonly status: 'success' }
  | { readonly status: 'invalid-path' }
  | { readonly status: 'write-failed'; readonly cause: string };

/** Shared secure mutation/history owner reused by every P1-A resource kind. */
export class ScopedConfigurationResourceService {
  constructor(private readonly definition: ScopedConfigurationResourceDefinition) {}

  private async resolveRootPath(context: ScopedConfigurationResourceContext): Promise<string | null> {
    if (!context.basePath?.trim()) return null;
    const basePath = path.resolve(context.basePath);
    const rootPath = path.resolve(basePath, this.definition.relativeRootPath);
    const relative = path.relative(basePath, rootPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    try {
      // Validate the fixed narrow root against the caller's vault/home base
      // before treating that root as an allowlist anchor. Otherwise an
      // escaping `.claude` / `.agents` / `.codex` parent symlink would make
      // the external directory look valid once the narrow root itself was
      // realpathed. For create, this must also precede mkdir so validation has
      // no out-of-root side effect.
      await assertWithinRoot(basePath, rootPath);
      return rootPath;
    } catch {
      return null;
    }
  }

  private async resolvePaths(
    context: ScopedConfigurationResourceTargetContext,
  ): Promise<ResolvedResourcePaths | null> {
    const rootPath = await this.resolveRootPath(context);
    if (rootPath === null || !context.targetRelativePath) return null;
    const targetPath = path.resolve(rootPath, context.targetRelativePath);
    const relative = path.relative(rootPath, targetPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return { rootPath, targetPath };
  }

  private allowlist(scope: ScopedConfigurationResourceScope, rootPath: string): ConfigurationAllowlist {
    return [{ scope, rootPath }];
  }

  private archive(archiveRootPath?: string): ConfigurationArchiveOptions {
    return {
      ...(archiveRootPath ? { archiveRootPath } : {}),
      backend: this.definition.backend,
      kind: this.definition.kind,
      format: this.definition.format,
    };
  }

  /** Materialize only a root that remains confined to the caller's base. */
  private async materializeRoot(
    context: ScopedConfigurationResourceContext,
    rootPath: string,
  ): Promise<RootMaterializationResult> {
    try {
      await assertWithinRoot(path.resolve(context.basePath), rootPath);
    } catch {
      return { status: 'invalid-path' };
    }
    try {
      await mkdir(rootPath, { recursive: true });
    } catch (error) {
      return { status: 'write-failed', cause: error instanceof Error ? error.message : String(error) };
    }
    try {
      await assertWithinRoot(path.resolve(context.basePath), rootPath);
    } catch {
      return { status: 'invalid-path' };
    }
    return { status: 'success' };
  }

  private async rootIsMissing(rootPath: string): Promise<boolean> {
    try {
      await lstat(rootPath);
      return false;
    } catch (error) {
      return error !== null && typeof error === 'object' && (error as { code?: string }).code === 'ENOENT';
    }
  }

  private withLocation(
    result: SafeFileMutationResult,
    context: ScopedConfigurationResourceTargetContext,
    targetPath: string,
  ): ScopedConfigurationResourceMutationResult {
    return { ...result, scope: context.scope, targetPath };
  }

  /** Resolve a revision only when the target remains inside the exact narrow root. */
  async readRevision(context: ScopedConfigurationResourceTargetContext): Promise<FileRevision | null> {
    const paths = await this.resolvePaths(context);
    if (paths === null) return null;
    try {
      const match = await assertWithinAllowlistedRoot(
        this.allowlist(context.scope, paths.rootPath),
        paths.targetPath,
      );
      return computeFileRevision(match.canonicalTarget);
    } catch {
      return null;
    }
  }

  /**
   * Read an expected resource through a descriptor-bound identity fence.
   * Content is returned only after the lexical target, opened descriptor, full
   * four-field revision, and a post-read target revalidation all agree.
   */
  // eslint-disable-next-line complexity -- Each branch is a distinct fail-closed filesystem race outcome.
  async read(
    options: ReadScopedConfigurationResourceOptions,
  ): Promise<ScopedConfigurationResourceReadResult> {
    const paths = await this.resolvePaths(options);
    const targetPath = paths?.targetPath ?? path.join(options.basePath || '.', options.targetRelativePath);
    const withLocation = (
      result: ScopedConfigurationResourceReadOutcome,
    ): ScopedConfigurationResourceReadResult => ({ ...result, scope: options.scope, targetPath });
    if (paths === null) return withLocation({ status: 'invalid-path' });
    const snapshot = await readAllowlistedFileSnapshot({
      targetPath,
      allowlist: this.allowlist(options.scope, paths.rootPath),
      expectedRevision: options.expectedRevision,
    });
    switch (snapshot.status) {
      case 'success': return withLocation(snapshot);
      case 'conflict': return withLocation({
        status: 'conflict',
        expected: options.expectedRevision,
        current: snapshot.current,
      });
      case 'invalid-path': return withLocation(snapshot);
      case 'read-failed': return withLocation(snapshot);
      case 'absent':
        // The scoped read contract always supplies an expected revision, so
        // absence is normalized to its existing conflict outcome defensively.
        return withLocation({ status: 'conflict', expected: options.expectedRevision, current: null });
    }
  }

  /** Create expected-absent after materializing only the fixed narrow root. */
  async create(
    options: CreateScopedConfigurationResourceOptions,
  ): Promise<ScopedConfigurationResourceMutationResult> {
    const paths = await this.resolvePaths(options);
    const targetPath = paths?.targetPath ?? path.join(options.basePath || '.', options.targetRelativePath);
    if (paths === null) return this.withLocation({ status: 'invalid-path' }, options, targetPath);
    const materialized = await this.materializeRoot(options, paths.rootPath);
    if (materialized.status !== 'success') return this.withLocation(materialized, options, targetPath);
    const result = await safeWriteFile({
      targetPath,
      content: options.content,
      expectedRevision: options.expectedRevision,
      allowlist: this.allowlist(options.scope, paths.rootPath),
      archive: this.archive(options.archiveRootPath),
      format: this.definition.format,
    });
    return this.withLocation(result, options, targetPath);
  }

  async update(
    options: UpdateScopedConfigurationResourceOptions,
  ): Promise<ScopedConfigurationResourceMutationResult> {
    const paths = await this.resolvePaths(options);
    const targetPath = paths?.targetPath ?? path.join(options.basePath || '.', options.targetRelativePath);
    if (paths === null) return this.withLocation({ status: 'invalid-path' }, options, targetPath);
    const result = await safeWriteFile({
      targetPath,
      content: options.content,
      expectedRevision: options.expectedRevision,
      allowlist: this.allowlist(options.scope, paths.rootPath),
      archive: this.archive(options.archiveRootPath),
      format: this.definition.format,
    });
    return this.withLocation(result, options, targetPath);
  }

  async delete(
    options: DeleteScopedConfigurationResourceOptions,
  ): Promise<ScopedConfigurationResourceMutationResult> {
    const paths = await this.resolvePaths(options);
    const targetPath = paths?.targetPath ?? path.join(options.basePath || '.', options.targetRelativePath);
    if (paths === null) return this.withLocation({ status: 'invalid-path' }, options, targetPath);
    const result = await safeDeleteFile({
      targetPath,
      expectedRevision: options.expectedRevision,
      allowlist: this.allowlist(options.scope, paths.rootPath),
      archive: this.archive(options.archiveRootPath),
    });
    return this.withLocation(result, options, targetPath);
  }

  async listHistory(
    context: ScopedConfigurationResourceTargetContext,
  ): Promise<ConfigurationArchiveHistoryResult> {
    const paths = await this.resolvePaths(context);
    if (paths === null) return { status: 'invalid-path' };
    return listConfigurationArchiveHistory({
      targetPath: paths.targetPath,
      allowlist: this.allowlist(context.scope, paths.rootPath),
      archive: this.archive(context.archiveRootPath),
    });
  }

  async catalogHistory(
    context: ScopedConfigurationResourceContext,
  ): Promise<ArchiveHistoryCatalogOutcome> {
    const rootPath = await this.resolveRootPath(context);
    if (rootPath === null) return { status: 'archive-failed', cause: 'invalid resource base/root path' };
    return catalogConfigurationArchiveHistory({
      ...(context.archiveRootPath ? { archiveRootPath: context.archiveRootPath } : {}),
      backend: this.definition.backend,
      scope: context.scope,
      kind: this.definition.kind,
      allowlist: this.allowlist(context.scope, rootPath),
    });
  }

  /** Restore only an identity proven to belong to the caller's selected target. */
  async restore(
    options: RestoreScopedConfigurationResourceOptions,
  ): Promise<ScopedConfigurationResourceMutationResult> {
    const paths = await this.resolvePaths(options);
    const targetPath = paths?.targetPath ?? path.join(options.basePath || '.', options.targetRelativePath);
    if (paths === null) return this.withLocation({ status: 'invalid-path' }, options, targetPath);
    if (await this.rootIsMissing(paths.rootPath)) {
      if (options.expectedRevision !== null) {
        return this.withLocation({ status: 'conflict', expected: options.expectedRevision, current: null }, options, targetPath);
      }
      // Validate the opaque selection via catalog while the root is absent.
      // This remains read-only and does not turn an arbitrary identity into a
      // directory-creation capability.
      const catalog = await this.catalogHistory(options);
      if (catalog.status !== 'success') {
        return this.withLocation({ status: 'archive-failed', cause: catalog.cause }, options, targetPath);
      }
      if (!catalog.targets.some((target) => target.entries.some((entry) => entry.identity === options.entryIdentity))) {
        return this.withLocation({ status: 'not-found' }, options, targetPath);
      }
      const materialized = await this.materializeRoot(options, paths.rootPath);
      if (materialized.status !== 'success') return this.withLocation(materialized, options, targetPath);
    }
    const history = await this.listHistory(options);
    if (history.status !== 'success') {
      const result: SafeFileMutationResult = history.status === 'invalid-path'
        ? { status: 'invalid-path' }
        : { status: 'archive-failed', cause: history.cause };
      return this.withLocation(result, options, targetPath);
    }
    if (!history.targets.some((target) => target.entries.some((entry) => entry.identity === options.entryIdentity))) {
      return this.withLocation({ status: 'not-found' }, options, targetPath);
    }
    const result = await safeRestoreArchivedEntry({
      entryIdentity: options.entryIdentity,
      expectedRevision: options.expectedRevision,
      allowlist: this.allowlist(options.scope, paths.rootPath),
      ...(options.archiveRootPath ? { archiveRootPath: options.archiveRootPath } : {}),
    });
    return this.withLocation(result, options, targetPath);
  }
}

/**
 * Bind resource-owner path/name/template/validation semantics to the shared
 * secure service. Callbacks remain declared by each Command/Skill/Agent owner;
 * only repeated scope/revision/history plumbing is centralized here.
 */
export function createNamedScopedConfigurationResourceFacade(
  definition: NamedScopedConfigurationResourceDefinition,
): NamedScopedConfigurationResourceFacade {
  const service = new ScopedConfigurationResourceService(definition);
  const targetContext = (context: ScopedConfigurationResourceContext, name: string) => ({
    ...context,
    targetRelativePath: definition.targetRelativePath(name),
  });
  const location = (context: ScopedConfigurationResourceContext, name: string) => ({
    scope: context.scope,
    targetPath: path.join(context.basePath, definition.relativeRootPath, definition.targetRelativePath(name)),
  });
  const validName = (context: ScopedConfigurationResourceContext, name: string) => (
    Boolean(context.basePath?.trim()) && definition.isSafeName(name)
  );
  const invalidPath = (
    context: ScopedConfigurationResourceContext,
    name: string,
  ): ScopedConfigurationResourceMutationResult => ({
    status: 'invalid-path',
    ...location(context, name),
  });
  const invalidContent = (
    context: ScopedConfigurationResourceContext,
    name: string,
    message: string,
  ): ScopedConfigurationResourceMutationResult => ({
    status: 'invalid-content',
    diagnostics: [{ message }],
    ...location(context, name),
  });

  return {
    readRevision: async (context, rawName) => {
      const name = rawName.trim();
      if (!validName(context, name)) return null;
      return service.readRevision(targetContext(context, name));
    },
    read: async (options) => {
      const name = options.name.trim();
      if (!validName(options, name)) {
        return {
          status: 'invalid-path',
          ...location(options, name),
        };
      }
      return service.read({
        ...targetContext(options, name),
        expectedRevision: options.expectedRevision,
      });
    },
    create: async (options) => {
      const name = options.name.trim();
      if (!validName(options, name)) return invalidPath(options, name);
      const content = options.content ?? definition.defaultContent(name);
      const validationError = definition.validateContent(content);
      if (validationError) return invalidContent(options, name, validationError);
      return service.create({ ...targetContext(options, name), content, expectedRevision: null });
    },
    update: async (options) => {
      const name = options.name.trim();
      if (!validName(options, name)) return invalidPath(options, name);
      const validationError = definition.validateContent(options.content);
      if (validationError) return invalidContent(options, name, validationError);
      return service.update({
        ...targetContext(options, name),
        content: options.content,
        expectedRevision: options.expectedRevision,
      });
    },
    delete: async (options) => {
      const name = options.name.trim();
      if (!validName(options, name)) return invalidPath(options, name);
      return service.delete({ ...targetContext(options, name), expectedRevision: options.expectedRevision });
    },
    listHistory: async (options) => {
      const name = options.name.trim();
      if (!validName(options, name)) return { status: 'invalid-path' };
      return service.listHistory(targetContext(options, name));
    },
    catalogHistory: (context) => service.catalogHistory(context),
    restore: async (options) => {
      const name = options.name.trim();
      if (!validName(options, name)) return invalidPath(options, name);
      return service.restore({
        ...targetContext(options, name),
        entryIdentity: options.entryIdentity,
        expectedRevision: options.expectedRevision,
      });
    },
  };
}
