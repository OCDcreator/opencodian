/* eslint-disable max-lines, max-lines-per-function -- Cohesive public-contract matrix shares one isolated archive/allowlist fixture across listing, selection, conflict, and adversarial identity cases. */
import { createHash } from 'node:crypto';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  type ArchiveContext,
  type ArchiveHistoryEntryIdentity,
  assertWithinAllowlistedRoot,
  catalogConfigurationArchiveHistory,
  clearDeletedArchives,
  type ConfigurationAllowlist,
  ConfigurationArchiveService,
  type FileRevision,
  listConfigurationArchiveHistory,
  safeDeleteFile,
  safeRestoreArchivedEntry,
  safeWriteFile,
} from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

interface ArchiveReadSwapState {
  readonly entryPath: string;
  readonly outsidePath: string;
  readonly outsideContent: string;
  swapped: boolean;
  outsideReadObserved: boolean;
}

let mockArchiveReadSwap: ArchiveReadSwapState | null = null;

jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  const actualFs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const actualPath = jest.requireActual<typeof import('node:path')>('node:path');
  const canonicalizeExisting = (candidate: string): string => {
    try {
      return actualFs.realpathSync(candidate);
    } catch {
      return actualPath.resolve(candidate);
    }
  };
  const isEntryPath = (candidate: unknown, state: ArchiveReadSwapState): boolean => (
    typeof candidate === 'string'
    && canonicalizeExisting(candidate) === canonicalizeExisting(state.entryPath)
  );
  const swapLeaf = (state: ArchiveReadSwapState): void => {
    if (state.swapped) return;
    actualFs.rmSync(state.entryPath);
    actualFs.symlinkSync(state.outsidePath, state.entryPath);
    state.swapped = true;
  };
  return {
    ...actual,
    readFile: async (...args: unknown[]): Promise<unknown> => {
      const state = mockArchiveReadSwap;
      const entryRead = state !== null && isEntryPath(args[0], state);
      if (entryRead) swapLeaf(state);
      const content = await Reflect.apply(actual.readFile, actual, args);
      if (entryRead && content === state.outsideContent) state.outsideReadObserved = true;
      return content;
    },
    open: async (...args: unknown[]): Promise<unknown> => {
      const state = mockArchiveReadSwap;
      if (state === null || !isEntryPath(args[0], state)) {
        return Reflect.apply(actual.open, actual, args);
      }
      swapLeaf(state);
      const handle = await Reflect.apply(actual.open, actual, args);
      return new Proxy(handle, {
        get(target, property): unknown {
          if (property === 'readFile') {
            return async (...readArgs: unknown[]): Promise<unknown> => {
              const content = await Reflect.apply(target.readFile, target, readArgs);
              const observed = typeof content === 'string'
                ? content
                : Buffer.isBuffer(content) ? content.toString('utf8') : null;
              if (observed === state.outsideContent) state.outsideReadObserved = true;
              return content;
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function revisionOf(target: string): FileRevision {
  const canonicalPath = fs.realpathSync(target);
  const stat = fs.statSync(canonicalPath);
  const content = fs.readFileSync(canonicalPath, 'utf8');
  return {
    canonicalPath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}

const ARCHIVE = { backend: 'test', kind: 'config', format: 'json' as const };

function findHashDir(archiveRoot: string, backend = 'test'): string {
  const backendDir = path.join(archiveRoot, backend);
  for (const scope of fs.readdirSync(backendDir)) {
    const scopeDir = path.join(backendDir, scope);
    for (const kind of fs.readdirSync(scopeDir)) {
      const kindDir = path.join(scopeDir, kind);
      for (const hash of fs.readdirSync(kindDir)) {
        const hashDir = path.join(kindDir, hash);
        if (fs.statSync(hashDir).isDirectory()) return hashDir;
      }
    }
  }
  throw new Error('archive hash directory not found');
}

function findHashDirForTarget(archiveRoot: string, canonicalTarget: string): string {
  const kindDir = path.join(archiveRoot, 'test', 'project', 'config');
  for (const hash of fs.readdirSync(kindDir)) {
    const hashDir = path.join(kindDir, hash);
    const manifestPath = path.join(hashDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { canonicalPath?: string };
    if (manifest.canonicalPath === canonicalTarget) return hashDir;
  }
  throw new Error(`archive hash directory not found for ${canonicalTarget}`);
}

function archiveEntryPath(archiveRoot: string, archiveKind: 'overwrite' | 'delete'): string {
  const hashDir = findHashDir(archiveRoot);
  const manifest = JSON.parse(fs.readFileSync(path.join(hashDir, 'manifest.json'), 'utf8')) as {
    versions: Array<{ fileName: string }>;
    deleted: Array<{ fileName: string }>;
  };
  const entries = archiveKind === 'overwrite' ? manifest.versions : manifest.deleted;
  const entry = entries[entries.length - 1];
  return path.join(hashDir, archiveKind === 'overwrite' ? 'versions' : 'deleted', entry.fileName);
}

function tamperIdentity(
  identity: ArchiveHistoryEntryIdentity,
  mutate: (payload: Record<string, unknown>) => void,
): ArchiveHistoryEntryIdentity {
  const payload = JSON.parse(Buffer.from(identity, 'base64url').toString('utf8')) as Record<string, unknown>;
  mutate(payload);
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') as ArchiveHistoryEntryIdentity;
}

describe('configuration archive history public contract', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let allowlist: ConfigurationAllowlist;

  beforeEach(() => {
    projectRoot = tmpDir('cfg-history-project-');
    archiveRoot = tmpDir('cfg-history-archive-');
    allowlist = [{ scope: 'project', rootPath: projectRoot }];
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  });

  async function createDeletedHistory(content = '{"version":1}'): Promise<{
    targetPath: string;
    canonicalTarget: string;
    identity: ArchiveHistoryEntryIdentity;
  }> {
    const targetPath = path.join(projectRoot, 'settings.json');
    write(targetPath, content);
    const canonicalTarget = fs.realpathSync(targetPath);
    const deleted = await safeDeleteFile({
      targetPath,
      expectedRevision: revisionOf(targetPath),
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    if (deleted.status !== 'success') throw new Error(`delete failed: ${deleted.status}`);
    const history = await catalogConfigurationArchiveHistory({
      archiveRootPath: archiveRoot,
      backend: 'test',
      scope: 'project',
      kind: 'config',
      allowlist,
    });
    if (history.status !== 'success') throw new Error(history.cause);
    const selected = history.targets[0]?.entries.find((entry) => entry.archiveKind === 'delete');
    if (!selected) throw new Error('deleted history identity missing');
    return { targetPath, canonicalTarget, identity: selected.identity };
  }

  it('catalogs a deleted target after reload and restores its selected deleted entry', async () => {
    const targetPath = path.join(projectRoot, 'settings.json');
    write(targetPath, '{"version":1}');
    const canonicalTarget = fs.realpathSync(targetPath);
    const deleted = await safeDeleteFile({
      targetPath,
      expectedRevision: revisionOf(targetPath),
      allowlist,
      archive: { archiveRootPath: archiveRoot, backend: 'test', kind: 'config', format: 'json' },
    });
    expect(deleted.status).toBe('success');
    expect(fs.existsSync(targetPath)).toBe(false);

    const history = await catalogConfigurationArchiveHistory({
      archiveRootPath: archiveRoot,
      backend: 'test',
      scope: 'project',
      kind: 'config',
      allowlist,
    });
    if (history.status !== 'success') throw new Error(history.cause);
    expect(history.status).toBe('success');
    expect(history.targets).toHaveLength(1);
    expect(history.targets[0]).toEqual(expect.objectContaining({
      canonicalTarget,
      backend: 'test',
      scope: 'project',
      kind: 'config',
      format: 'json',
    }));
    expect(history.targets[0].entries).toHaveLength(1);
    expect(history.targets[0].entries[0]).toEqual(expect.objectContaining({ archiveKind: 'delete' }));

    const restored = await safeRestoreArchivedEntry({
      entryIdentity: history.targets[0].entries[0].identity,
      expectedRevision: null,
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(restored.status).toBe('success');
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('{"version":1}');
  });

  it('catalogs a deleted target after its narrow allowlist root is removed without recreating that root', async () => {
    const narrowRoot = path.join(projectRoot, 'narrow');
    const targetPath = path.join(narrowRoot, 'settings.json');
    const narrowAllowlist: ConfigurationAllowlist = [{ scope: 'project', rootPath: narrowRoot }];
    write(targetPath, '{"version":1}');
    const canonicalTarget = fs.realpathSync(targetPath);
    const deleted = await safeDeleteFile({
      targetPath,
      expectedRevision: revisionOf(targetPath),
      allowlist: narrowAllowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    expect(deleted.status).toBe('success');
    fs.rmSync(narrowRoot, { recursive: true, force: true });

    const catalog = await catalogConfigurationArchiveHistory({
      archiveRootPath: archiveRoot,
      backend: 'test',
      scope: 'project',
      kind: 'config',
      allowlist: narrowAllowlist,
    });

    expect(catalog).toEqual(expect.objectContaining({
      status: 'success',
      targets: [expect.objectContaining({ canonicalTarget })],
    }));
    expect(fs.existsSync(narrowRoot)).toBe(false);
  });

  it('preserves lexical-to-canonical order for a two-level missing root beneath a symlinked ancestor', async () => {
    const lexicalParent = tmpDir('cfg-history-lexical-');
    const canonicalBase = tmpDir('cfg-history-canonical-');
    try {
      const lexicalBase = path.join(lexicalParent, 'vault-link');
      await fs.promises.symlink(canonicalBase, lexicalBase);
      const lexicalRoot = path.join(lexicalBase, '.tool', 'commands');
      const targetPath = path.join(lexicalRoot, 'settings.json');
      const narrowAllowlist: ConfigurationAllowlist = [{ scope: 'project', rootPath: lexicalRoot }];
      write(targetPath, '{"version":1}');
      const canonicalTarget = fs.realpathSync(targetPath);
      const deleted = await safeDeleteFile({
        targetPath,
        expectedRevision: revisionOf(targetPath),
        allowlist: narrowAllowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(deleted.status).toBe('success');
      fs.rmSync(path.join(canonicalBase, '.tool'), { recursive: true, force: true });

      const catalog = await catalogConfigurationArchiveHistory({
        archiveRootPath: archiveRoot,
        backend: 'test',
        scope: 'project',
        kind: 'config',
        allowlist: narrowAllowlist,
      });

      expect(catalog).toEqual(expect.objectContaining({
        status: 'success',
        targets: [expect.objectContaining({ canonicalTarget })],
      }));
      expect(fs.existsSync(path.join(canonicalBase, '.tool'))).toBe(false);
      expect(fs.existsSync(lexicalRoot)).toBe(false);
    } finally {
      fs.rmSync(lexicalParent, { recursive: true, force: true });
      fs.rmSync(canonicalBase, { recursive: true, force: true });
    }
  });

  it('lists overwrite and delete history and restores either selected entry', async () => {
    const targetPath = path.join(projectRoot, 'settings.json');
    write(targetPath, '{"version":1}');
    const updated = await safeWriteFile({
      targetPath,
      content: '{"version":2}',
      expectedRevision: revisionOf(targetPath),
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      format: 'json',
    });
    expect(updated.status).toBe('success');
    const deleted = await safeDeleteFile({
      targetPath,
      expectedRevision: revisionOf(targetPath),
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    expect(deleted.status).toBe('success');

    const catalog = await catalogConfigurationArchiveHistory({
      archiveRootPath: archiveRoot,
      backend: 'test',
      scope: 'project',
      kind: 'config',
      allowlist,
    });
    if (catalog.status !== 'success') throw new Error(catalog.cause);
    const overwrite = catalog.targets[0].entries.find((entry) => entry.archiveKind === 'overwrite');
    const deletedEntry = catalog.targets[0].entries.find((entry) => entry.archiveKind === 'delete');
    if (!overwrite || !deletedEntry) throw new Error('expected overwrite and delete entries');

    const restoredOverwrite = await safeRestoreArchivedEntry({
      entryIdentity: overwrite.identity,
      expectedRevision: null,
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(restoredOverwrite.status).toBe('success');
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('{"version":1}');

    const restoredDeleted = await safeRestoreArchivedEntry({
      entryIdentity: deletedEntry.identity,
      expectedRevision: revisionOf(targetPath),
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(restoredDeleted.status).toBe('success');
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('{"version":2}');

    const targetHistory = await listConfigurationArchiveHistory({
      targetPath,
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    if (targetHistory.status !== 'success') throw new Error(targetHistory.status);
    expect(targetHistory.targets).toHaveLength(1);
    expect(targetHistory.targets[0].entries.filter((entry) => entry.archiveKind === 'overwrite')).toHaveLength(2);
  });

  it('returns conflict without changing target bytes when expectedRevision no longer matches', async () => {
    const { targetPath, identity } = await createDeletedHistory();
    write(targetPath, '{"external":true}');
    const result = await safeRestoreArchivedEntry({
      entryIdentity: identity,
      expectedRevision: null,
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(result.status).toBe('conflict');
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('{"external":true}');
  });

  it('validates selected source content before restoring', async () => {
    const { targetPath, identity } = await createDeletedHistory('{ broken');
    const result = await safeRestoreArchivedEntry({
      entryIdentity: identity,
      expectedRevision: null,
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(result.status).toBe('invalid-content');
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it('rejects tampered and cross-target/backend/scope/kind/format identities', async () => {
    const { targetPath, identity } = await createDeletedHistory();
    const match = await assertWithinAllowlistedRoot(allowlist, targetPath);
    const service = new ConfigurationArchiveService(archiveRoot);
    const validContext: ArchiveContext = { backend: 'test', kind: 'config', format: 'json', match };
    const otherPath = path.join(projectRoot, 'other.json');
    write(otherPath, '{}');
    const otherMatch = await assertWithinAllowlistedRoot(allowlist, otherPath);
    const contexts: ArchiveContext[] = [
      { ...validContext, match: otherMatch },
      { ...validContext, backend: 'other' },
      { ...validContext, match: { ...match, scope: 'global' } },
      { ...validContext, kind: 'other' },
      { ...validContext, format: 'jsonc' },
    ];
    for (const context of contexts) {
      const result = await service.readHistoryEntryContent(context, identity);
      expect(result.status).toBe('archive-failed');
    }

    const malformed = await service.readHistoryEntryContent(
      validContext,
      'not-an-issued-token' as ArchiveHistoryEntryIdentity,
    );
    expect(malformed.status).toBe('archive-failed');
    const unsafeFileName = tamperIdentity(identity, (payload) => {
      (payload.entry as Record<string, unknown>).fileName = '../../../outside.json';
    });
    const unsafe = await service.readHistoryEntryContent(validContext, unsafeFileName);
    expect(unsafe.status).toBe('archive-failed');
  });

  it('rejects a selected entry replaced by an escaping symlink', async () => {
    const { identity } = await createDeletedHistory();
    const sentinel = path.join(projectRoot, 'sentinel.json');
    write(sentinel, '{"sentinel":true}');
    const entryPath = archiveEntryPath(archiveRoot, 'delete');
    fs.rmSync(entryPath);
    fs.symlinkSync(sentinel, entryPath);

    const result = await safeRestoreArchivedEntry({
      entryIdentity: identity,
      expectedRevision: null,
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(result.status).toBe('archive-failed');
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('{"sentinel":true}');
  });

  it('never reads outside bytes when a selected archive leaf swaps to a symlink at open', async () => {
    const { targetPath, identity } = await createDeletedHistory();
    const entryPath = archiveEntryPath(archiveRoot, 'delete');
    const canonicalEntryPath = fs.realpathSync(entryPath);
    const outsidePath = path.join(projectRoot, 'outside-secret.json');
    const outsideContent = '{"outside":"must-not-be-read"}';
    write(outsidePath, outsideContent);
    mockArchiveReadSwap = {
      entryPath: canonicalEntryPath,
      outsidePath,
      outsideContent,
      swapped: false,
      outsideReadObserved: false,
    };

    try {
      const result = await safeRestoreArchivedEntry({
        entryIdentity: identity,
        expectedRevision: null,
        allowlist,
        archiveRootPath: archiveRoot,
      });
      expect(mockArchiveReadSwap.swapped).toBe(true);
      expect(result.status).toBe('archive-failed');
      expect(mockArchiveReadSwap.outsideReadObserved).toBe(false);
      expect(fs.existsSync(targetPath)).toBe(false);
    } finally {
      mockArchiveReadSwap = null;
    }
  });

  it('never reads outside bytes when cataloging an archive leaf that swaps to a symlink at open', async () => {
    await createDeletedHistory();
    const entryPath = archiveEntryPath(archiveRoot, 'delete');
    const canonicalEntryPath = fs.realpathSync(entryPath);
    const outsidePath = path.join(projectRoot, 'outside-catalog-secret.json');
    const outsideContent = '{"outside":"catalog-must-not-read"}';
    write(outsidePath, outsideContent);
    mockArchiveReadSwap = {
      entryPath: canonicalEntryPath,
      outsidePath,
      outsideContent,
      swapped: false,
      outsideReadObserved: false,
    };

    try {
      const result = await catalogConfigurationArchiveHistory({
        archiveRootPath: archiveRoot,
        backend: 'test',
        scope: 'project',
        kind: 'config',
        allowlist,
      });
      expect(mockArchiveReadSwap.swapped).toBe(true);
      expect(result.status).toBe('archive-failed');
      expect(mockArchiveReadSwap.outsideReadObserved).toBe(false);
    } finally {
      mockArchiveReadSwap = null;
    }
  });

  it('rejects a same-content archive inode swap after listing', async () => {
    const { identity } = await createDeletedHistory();
    const entryPath = archiveEntryPath(archiveRoot, 'delete');
    const content = fs.readFileSync(entryPath, 'utf8');
    fs.renameSync(entryPath, `${entryPath}.retained`);
    write(entryPath, content);

    const result = await safeRestoreArchivedEntry({
      entryIdentity: identity,
      expectedRevision: null,
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(result.status).toBe('archive-failed');
  });

  it('rejects hash-mismatched and missing selected archive files', async () => {
    const { identity } = await createDeletedHistory();
    const entryPath = archiveEntryPath(archiveRoot, 'delete');
    fs.writeFileSync(entryPath, '{"tampered":true}', 'utf8');
    const hashMismatch = await safeRestoreArchivedEntry({
      entryIdentity: identity,
      expectedRevision: null,
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(hashMismatch.status).toBe('archive-failed');

    fs.rmSync(entryPath);
    const missing = await safeRestoreArchivedEntry({
      entryIdentity: identity,
      expectedRevision: null,
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(missing.status).toBe('archive-failed');
  });

  it('returns not-found when a previously listed entry was removed from the manifest', async () => {
    const { identity } = await createDeletedHistory();
    const cleared = await clearDeletedArchives({ archiveRootPath: archiveRoot, backend: 'test' });
    expect(cleared.ok).toBe(true);
    const result = await safeRestoreArchivedEntry({
      entryIdentity: identity,
      expectedRevision: null,
      allowlist,
      archiveRootPath: archiveRoot,
    });
    expect(result.status).toBe('not-found');
  });

  it('fails the whole catalog when one manifest claims another target identity', async () => {
    const firstPath = path.join(projectRoot, 'first.json');
    const secondPath = path.join(projectRoot, 'second.json');
    write(firstPath, '{"first":true}');
    write(secondPath, '{"second":true}');
    const firstCanonical = fs.realpathSync(firstPath);
    const secondCanonical = fs.realpathSync(secondPath);
    await safeDeleteFile({
      targetPath: firstPath,
      expectedRevision: revisionOf(firstPath),
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    await safeDeleteFile({
      targetPath: secondPath,
      expectedRevision: revisionOf(secondPath),
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    const firstHashDir = findHashDirForTarget(archiveRoot, firstCanonical);
    const manifestPath = path.join(firstHashDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.canonicalPath = secondCanonical;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    const catalog = await catalogConfigurationArchiveHistory({
      archiveRootPath: archiveRoot,
      backend: 'test',
      allowlist,
    });
    expect(catalog.status).toBe('archive-failed');
    expect('targets' in catalog).toBe(false);
  });

  it('fails closed when the backend tree contains an unknown scope directory', async () => {
    fs.mkdirSync(path.join(archiveRoot, 'test', 'unexpected-scope'), { recursive: true });
    const catalog = await catalogConfigurationArchiveHistory({
      archiveRootPath: archiveRoot,
      backend: 'test',
      allowlist,
    });
    expect(catalog.status).toBe('archive-failed');
  });
});
