/* eslint-disable max-lines -- Comprehensive archive security/integrity/clear/symlink test coverage. */
/**
 * ConfigurationArchiveService direct unit tests (round 2 hardening).
 *
 * Covers: archive-root-anchored realpath/symlink confinement at every level
 * (backend/scope/kind/hash/versions/deleted/manifest/entry); manifest
 * present-but-invalid fail-closed (not treated as first archive, not
 * overwritten); retention transaction order (manifest-write failure preserves
 * old manifest + files and cleans the orphan); and cross-format rejection.
 */
import { createHash } from 'node:crypto';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  type ArchiveContext,
  ConfigurationArchiveService,
  OVERWRITE_RETENTION_LIMIT,
} from '../../../../../src/core/agents/backend/ConfigurationArchiveService';
import type { AllowlistMatch, FileRevision } from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';
import { safeRestoreFile } from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function write(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}
function revisionOf(target: string): FileRevision {
  const real = fs.realpathSync(target);
  const st = fs.statSync(real);
  const content = fs.readFileSync(real, 'utf8');
  return {
    canonicalPath: real,
    mtimeMs: st.mtimeMs,
    size: st.size,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}
function findHashDir(archiveRoot: string): string | null {
  const backend = path.join(archiveRoot, 'test');
  if (!fs.existsSync(backend)) return null;
  for (const scope of fs.readdirSync(backend)) {
    const scopeDir = path.join(backend, scope);
    if (!fs.statSync(scopeDir).isDirectory()) continue;
    for (const kind of fs.readdirSync(scopeDir)) {
      const kindDir = path.join(scopeDir, kind);
      if (!fs.statSync(kindDir).isDirectory()) continue;
      for (const hash of fs.readdirSync(kindDir)) {
        const hashDir = path.join(kindDir, hash);
        if (fs.statSync(hashDir).isDirectory()) return hashDir;
      }
    }
  }
  return null;
}

describe('ConfigurationArchiveService — archive-root-anchored symlink confinement', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let outside: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;

  beforeEach(() => {
    projectRoot = tmpDir('arc-secure-p-');
    archiveRoot = tmpDir('arc-secure-a-');
    outside = tmpDir('arc-secure-out-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => {
    // restore any chmod'd dirs before rmSync
    for (const d of [findHashDir(archiveRoot)]) {
      if (d) try { fs.chmodSync(d, 0o755); } catch { /* ignore */ }
    }
    for (const d of [projectRoot, archiveRoot, outside]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('refuses a backend-level symlink that escapes the archive root', async () => {
    const sentinel = path.join(outside, 'sentinel.json');
    write(sentinel, 'precious');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target)); // builds real structure
    // Replace backend dir with a symlink to outside.
    const backendDir = path.join(archiveRoot, 'test');
    fs.rmSync(backendDir, { recursive: true, force: true });
    fs.symlinkSync(outside, backendDir);

    await expect(service.archiveOverwrite(ctx, revisionOf(target))).rejects.toThrow();
    expect(fs.existsSync(sentinel)).toBe(true);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('precious');
  });

  it('refuses a versions-level symlink and does not write/read outside', async () => {
    const sentinel = path.join(outside, 'version-out.json');
    write(sentinel, 'keep');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const versionsDir = path.join(hashDir, 'versions');
    fs.rmSync(versionsDir, { recursive: true, force: true });
    fs.symlinkSync(outside, versionsDir);

    await expect(service.archiveOverwrite(ctx, revisionOf(target))).rejects.toThrow();
    // No new file was written into the outside sentinel directory via versions/.
    expect(fs.readdirSync(outside)).toEqual(['version-out.json']);
  });

  it('refuses a deleted-level symlink on restore (returns null, no outside read)', async () => {
    const sentinel = path.join(outside, 'deleted-out.json');
    write(sentinel, 'secret');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const deletedDir = path.join(hashDir, 'deleted');
    fs.rmSync(deletedDir, { recursive: true, force: true });
    fs.symlinkSync(outside, deletedDir);

    const res = await service.readLatestDeletedContent(ctx);
    // A deleted-level symlink escape is an archive system failure, not "nothing to restore".
    expect(res.status).toBe('archive-failed');
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('secret');
  });

  it('refuses a manifest-level symlink (archive op fails, sentinel untouched)', async () => {
    const sentinel = path.join(outside, 'manifest-out.json');
    write(sentinel, 'manifest-secret');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    fs.rmSync(manifestPath, { force: true });
    fs.symlinkSync(sentinel, manifestPath);

    await expect(service.archiveOverwrite(ctx, revisionOf(target))).rejects.toThrow();
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('manifest-secret');
  });
});

describe('ConfigurationArchiveService — manifest present-but-invalid is fail-closed', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;

  beforeEach(() => {
    projectRoot = tmpDir('arc-invalid-p-');
    archiveRoot = tmpDir('arc-invalid-a-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => {
    for (const d of [projectRoot, archiveRoot]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('a corrupt-JSON manifest is NOT treated as first archive and NOT overwritten', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target)); // real manifest now exists
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const corrupted = '{ not valid json';
    fs.writeFileSync(manifestPath, corrupted, 'utf8');

    await expect(service.archiveOverwrite(ctx, revisionOf(target))).rejects.toThrow();
    // The invalid manifest was left in place (not overwritten with a fresh one).
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(corrupted);
  });

  it('a manifest whose entry has a wrong-extension filename is invalid (fail-closed)', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Tamper an entry's extension to toml while format is json.
    if (manifest.versions[0]) manifest.versions[0].fileName = manifest.versions[0].fileName.replace(/\.json$/, '.toml');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    await expect(service.archiveOverwrite(ctx, revisionOf(target))).rejects.toThrow();
  });
});

describe('ConfigurationArchiveService — retention transaction order', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;

  beforeEach(() => {
    projectRoot = tmpDir('arc-ret-p-');
    archiveRoot = tmpDir('arc-ret-a-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => {
    for (const d of [projectRoot, archiveRoot]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('manifest-write failure preserves the old manifest + its files and cleans the new orphan', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    // Pre-fill exactly the retention limit.
    for (let i = 0; i < OVERWRITE_RETENTION_LIMIT; i++) {
      write(target, `{"v":${i}}`);
      await service.archiveOverwrite(ctx, revisionOf(target));
    }
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const manifestBefore = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const versionsDir = path.join(hashDir, 'versions');
    const filesBefore = fs.readdirSync(versionsDir).length;
    expect(manifestBefore.versions.length).toBe(OVERWRITE_RETENTION_LIMIT);

    // Inject manifest-write failure: make hashDir read-only (versions/ stays writable).
    fs.chmodSync(hashDir, 0o555);
    write(target, '{"v":99}');
    await expect(service.archiveOverwrite(ctx, revisionOf(target))).rejects.toThrow();
    fs.chmodSync(hashDir, 0o755);

    // Old manifest is unchanged and still references exactly the old files.
    const manifestAfter = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifestAfter.versions).toEqual(manifestBefore.versions);
    // The orphaned new version file was cleaned up (no extra file on disk).
    expect(fs.readdirSync(versionsDir).length).toBe(filesBefore);
  });
});

describe('ConfigurationArchiveService — revision/content snapshot integrity', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;

  beforeEach(() => {
    projectRoot = tmpDir('arc-snapshot-p-');
    archiveRoot = tmpDir('arc-snapshot-a-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"value":"original"}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });

  afterEach(() => {
    for (const dir of [projectRoot, archiveRoot]) fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each(['archiveOverwrite', 'archiveDeleted'] as const)(
    '%s rejects a stale revision instead of archiving bytes from a newer file state',
    async (method) => {
      const staleRevision = revisionOf(target);
      write(target, '{"value":"external"}');
      const service = new ConfigurationArchiveService(archiveRoot);

      await expect(service[method](ctx, staleRevision)).rejects.toThrow(/revision/i);
      expect(findHashDir(archiveRoot)).toBeNull();
    },
  );
});

describe('ConfigurationArchiveService — cross-format rejection', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let target: string;
  let match: AllowlistMatch;

  beforeEach(() => {
    projectRoot = tmpDir('arc-fmt-p-');
    archiveRoot = tmpDir('arc-fmt-a-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
  });
  afterEach(() => {
    for (const d of [projectRoot, archiveRoot]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('does not read history across formats (json archive vs toml ctx → invalid, not found)', async () => {
    const jsonCtx: ArchiveContext = { backend: 'test', kind: 'config', format: 'json', match };
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(jsonCtx, revisionOf(target));

    // A toml context on the same target must not read the json history; the
    // format-association mismatch makes the manifest invalid → archive-failed.
    const tomlCtx: ArchiveContext = { backend: 'test', kind: 'config', format: 'toml', match };
    expect((await service.readLatestDeletedContent(tomlCtx)).status).toBe('archive-failed');
    // And archiving again with the toml context fails closed (format association mismatch).
    await expect(service.archiveOverwrite(tomlCtx, revisionOf(target))).rejects.toThrow();
  });

  it('a manifest missing the format field is invalid (not silently guessed)', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite({ backend: 'test', kind: 'config', format: 'json', match }, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    delete manifest.format;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    await expect(service.archiveOverwrite({ backend: 'test', kind: 'config', format: 'json', match }, revisionOf(target))).rejects.toThrow();
  });
});

describe('ConfigurationArchiveService — restore honesty (not-found vs archive-failed)', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

  beforeEach(() => {
    projectRoot = tmpDir('arc-rh-p-');
    archiveRoot = tmpDir('arc-rh-a-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => {
    for (const d of [projectRoot, archiveRoot]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('manifest ENOENT (no archive at all) => not-found', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    expect((await service.readLatestDeletedContent(ctx)).status).toBe('not-found');
  });

  it('valid manifest with no deleted entries => not-found', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target)); // versions only, no deletes
    expect((await service.readLatestDeletedContent(ctx)).status).toBe('not-found');
  });

  it('malformed-JSON manifest => archive-failed', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const manifestPath = path.join(findHashDir(archiveRoot) as string, 'manifest.json');
    fs.writeFileSync(manifestPath, '{ not valid', 'utf8');
    expect((await service.readLatestDeletedContent(ctx)).status).toBe('archive-failed');
  });

  it('association-invalid manifest (wrong canonicalPath) => archive-failed', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const manifestPath = path.join(findHashDir(archiveRoot) as string, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.canonicalPath = '/different/path';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    expect((await service.readLatestDeletedContent(ctx)).status).toBe('archive-failed');
  });

  it('non-ENOENT manifest read error (EACCES) => archive-failed', async () => {
    if (isRoot) return; // chmod ineffective as root
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const manifestPath = path.join(findHashDir(archiveRoot) as string, 'manifest.json');
    fs.chmodSync(manifestPath, 0o000);
    try {
      expect((await service.readLatestDeletedContent(ctx)).status).toBe('archive-failed');
    } finally {
      fs.chmodSync(manifestPath, 0o644);
    }
  });

  it('referenced deleted entry file missing => archive-failed (not silent not-found)', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const deletedDir = path.join(hashDir, 'deleted');
    for (const f of fs.readdirSync(deletedDir)) fs.rmSync(path.join(deletedDir, f), { force: true });
    expect((await service.readLatestDeletedContent(ctx)).status).toBe('archive-failed');
  });

  it('safeRestoreFile leaves the target unchanged on archive-failed', async () => {
    const allowlist = [{ scope: 'project' as const, rootPath: projectRoot }];
    const archive = { backend: 'test', kind: 'config', format: 'json' as const, archiveRootPath: archiveRoot };
    // Build a real archive, then corrupt the manifest.
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const manifestPath = path.join(findHashDir(archiveRoot) as string, 'manifest.json');
    fs.writeFileSync(manifestPath, '{ broken', 'utf8');

    const before = revisionOf(target);
    const res = await safeRestoreFile({ targetPath: target, expectedRevision: null, allowlist, archive });
    expect(res.status).toBe('archive-failed');
    // Target content + revision unchanged.
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}');
    expect(revisionOf(target).sha256).toBe(before.sha256);
  });
});

describe('ConfigurationArchiveService — entry content integrity (item 3)', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;
  beforeEach(() => {
    projectRoot = tmpDir('arc-ci-p-');
    archiveRoot = tmpDir('arc-ci-a-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => { for (const d of [projectRoot, archiveRoot]) fs.rmSync(d, { recursive: true, force: true }); });

  it('a tampered deleted entry (still valid JSON) → archive-failed, target unchanged', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const deletedDir = path.join(findHashDir(archiveRoot) as string, 'deleted');
    const entryFile = fs.readdirSync(deletedDir)[0];
    // Tamper: keep valid JSON but different content (size/sha change).
    fs.writeFileSync(path.join(deletedDir, entryFile), '{"a":999}', 'utf8');
    const res = await service.readLatestDeletedContent(ctx);
    expect(res.status).toBe('archive-failed');
    // safeRestoreFile leaves the target unchanged.
    const before = revisionOf(target).sha256;
    const restoreRes = await safeRestoreFile({ targetPath: target, expectedRevision: null, allowlist: [{ scope: 'project', rootPath: projectRoot }], archive: { backend: 'test', kind: 'config', format: 'json', archiveRootPath: archiveRoot } });
    expect(restoreRes.status).toBe('archive-failed');
    expect(revisionOf(target).sha256).toBe(before);
  });
});

describe('ConfigurationArchiveService — clearDeleted honesty (item 4)', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;
  beforeEach(() => {
    projectRoot = tmpDir('arc-ch-p-');
    archiveRoot = tmpDir('arc-ch-a-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => { for (const d of [projectRoot, archiveRoot]) fs.rmSync(d, { recursive: true, force: true }); });

  it('a backend-association-tampered manifest → integrityFailure, history not cleared', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const manifestPath = path.join(findHashDir(archiveRoot) as string, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.backend = 'evil'; // tamper association
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBe(1);
    // The deleted entry file is still on disk (history not cleared).
    const deletedDir = path.join(findHashDir(archiveRoot) as string, 'deleted');
    expect(fs.readdirSync(deletedDir).length).toBe(1);
  });

  it('a malformed manifest → integrityFailure (not silent ok:true)', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const manifestPath = path.join(findHashDir(archiveRoot) as string, 'manifest.json');
    fs.writeFileSync(manifestPath, '{ broken', 'utf8');
    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBe(1);
  });

  it('an already-absent referenced entry → preflight integrity failure (manifest unchanged)', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const manifestPath = path.join(findHashDir(archiveRoot) as string, 'manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    const deletedDir = path.join(findHashDir(archiveRoot) as string, 'deleted');
    const entryFile = fs.readdirSync(deletedDir)[0];
    fs.rmSync(path.join(deletedDir, entryFile), { force: true }); // entry already gone
    const result = await service.clearDeleted({ backend: 'test' });
    // Preflight catches the absent referenced file → integrity failure, not absentEntries.
    expect(result.ok).toBe(false);
    const failed = result as { cleared: number; integrityFailures: readonly unknown[] };
    expect(failed.cleared).toBe(0);
    expect(failed.integrityFailures.length).toBeGreaterThan(0);
    // Manifest byte-for-byte unchanged (no write happened).
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });
});

describe('ConfigurationArchiveService — symlink confinement at every archive level (item 5)', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let outside: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;
  beforeEach(() => {
    projectRoot = tmpDir('arc-sym-p-');
    archiveRoot = tmpDir('arc-sym-a-');
    outside = tmpDir('arc-sym-out-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => { for (const d of [projectRoot, archiveRoot, outside]) fs.rmSync(d, { recursive: true, force: true }); });

  it('scope-level symlink escape is refused (sentinel untouched)', async () => {
    const sentinel = path.join(outside, 'scope-out.json');
    write(sentinel, 'keep');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target)); // build real tree
    const hashDir = findHashDir(archiveRoot) as string;
    const scopeDir = path.dirname(path.dirname(hashDir)); // .../test/project
    fs.rmSync(scopeDir, { recursive: true, force: true });
    fs.symlinkSync(outside, scopeDir);
    await expect(service.archiveOverwrite(ctx, revisionOf(target))).rejects.toThrow();
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('kind-level symlink escape is refused', async () => {
    const sentinel = path.join(outside, 'kind-out.json');
    write(sentinel, 'keep');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const kindDir = path.dirname(hashDir); // .../config
    fs.rmSync(kindDir, { recursive: true, force: true });
    fs.symlinkSync(outside, kindDir);
    await expect(service.archiveOverwrite(ctx, revisionOf(target))).rejects.toThrow();
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('path-hash-level symlink escape is refused', async () => {
    const sentinel = path.join(outside, 'hash-out.json');
    write(sentinel, 'keep');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    fs.rmSync(hashDir, { recursive: true, force: true });
    fs.symlinkSync(outside, hashDir);
    await expect(service.archiveOverwrite(ctx, revisionOf(target))).rejects.toThrow();
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('entry-file symlink escape on restore is refused (no outside read)', async () => {
    const sentinel = path.join(outside, 'entry-out.json');
    write(sentinel, 'entry-secret');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const deletedDir = path.join(findHashDir(archiveRoot) as string, 'deleted');
    const entryFile = fs.readdirSync(deletedDir)[0];
    fs.rmSync(path.join(deletedDir, entryFile), { force: true });
    fs.symlinkSync(sentinel, path.join(deletedDir, entryFile));
    const res = await service.readLatestDeletedContent(ctx);
    expect(res.status).toBe('archive-failed');
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('entry-secret');
  });
});

describe('ConfigurationArchiveService — clearDeleted fail-closed at scan levels (item A)', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let outside: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;
  beforeEach(() => {
    projectRoot = tmpDir('arc-A-p-');
    archiveRoot = tmpDir('arc-A-a-');
    outside = tmpDir('arc-A-out-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => { for (const d of [projectRoot, archiveRoot, outside]) fs.rmSync(d, { recursive: true, force: true }); });

  it('a scope-level symlink during clear → integrityFailure, sentinel untouched', async () => {
    const sentinel = path.join(outside, 'scope-clear.json');
    write(sentinel, 'keep');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const scopeDir = path.dirname(path.dirname(hashDir));
    fs.rmSync(scopeDir, { recursive: true, force: true });
    fs.symlinkSync(outside, scopeDir);
    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBeGreaterThan(0);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('keep');
  });

  it('a path-hash-level symlink during clear → integrityFailure', async () => {
    const sentinel = path.join(outside, 'hash-clear.json');
    write(sentinel, 'keep');
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    fs.rmSync(hashDir, { recursive: true, force: true });
    fs.symlinkSync(outside, hashDir);
    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBeGreaterThan(0);
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('unsafe backend → ok:false integrity failure (never ok:true)', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    const result = await service.clearDeleted({ backend: '..' });
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBeGreaterThan(0);
    void service;
  });
});

describe('ConfigurationArchiveService — clearDeleted preflight (item A round 6)', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;
  beforeEach(() => {
    projectRoot = tmpDir('arc-pf-p-');
    archiveRoot = tmpDir('arc-pf-a-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => { for (const d of [projectRoot, archiveRoot]) fs.rmSync(d, { recursive: true, force: true }); });

  it('a deleted-entry symlink → integrityFailure, manifest byte-for-byte unchanged', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target));
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    // Tamper: replace a deleted entry file with a symlink to outside.
    const deletedDir = path.join(hashDir, 'deleted');
    const entryFile = fs.readdirSync(deletedDir)[0];
    fs.rmSync(path.join(deletedDir, entryFile), { force: true });
    fs.symlinkSync('/etc/passwd', path.join(deletedDir, entryFile));
    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBeGreaterThan(0);
    // Manifest unchanged byte-for-byte.
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });

  it('a version-entry content tamper → integrityFailure, manifest + files unchanged', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target));
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    // Tamper a version entry's content (size/sha mismatch).
    const versionsDir = path.join(hashDir, 'versions');
    const entryFile = fs.readdirSync(versionsDir)[0];
    fs.writeFileSync(path.join(versionsDir, entryFile), '{"tampered":true}', 'utf8');
    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBeGreaterThan(0);
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });
});

describe('ConfigurationArchiveService — preflight directory symlink + EACCES (items 3+4 round 7)', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let outside: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;
  beforeEach(() => {
    projectRoot = tmpDir('arc-r7-p-');
    archiveRoot = tmpDir('arc-r7-a-');
    outside = tmpDir('arc-r7-out-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => { for (const d of [projectRoot, archiveRoot, outside]) fs.rmSync(d, { recursive: true, force: true }); });

  it('planted versions/ symlink with EMPTY versions list → preflight catches it, manifest unchanged', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    // Archive ONLY a delete (no overwrite → versions list is empty, versions/ dir may not exist).
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    // Plant a symlink at versions/ (which doesn't normally exist for delete-only).
    fs.symlinkSync(outside, path.join(hashDir, 'versions'));
    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBeGreaterThan(0);
    // Manifest byte-for-byte unchanged.
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });

  it('planted deleted/ symlink → preflight catches it, manifest unchanged', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    // Plant a symlink at deleted/ (overwrite-only → no deleted entries, deleted/ may not exist).
    fs.symlinkSync(outside, path.join(hashDir, 'deleted'));
    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBeGreaterThan(0);
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });

  it('EACCES on readdir during scan → ok:false, integrityFailures, manifest unchanged', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    // Chmod the scope dir to 000 → readdir inside fails with EACCES.
    const scopeDir = path.dirname(path.dirname(hashDir));
    let result;
    try {
      fs.chmodSync(scopeDir, 0o000);
      result = await service.clearDeleted({ backend: 'test' });
    } finally {
      fs.chmodSync(scopeDir, 0o755);
    }
    expect(result.ok).toBe(false);
    const failed = result as { integrityFailures: readonly unknown[]; manifestWriteFailed: boolean };
    expect(failed.integrityFailures.length > 0 || failed.manifestWriteFailed).toBe(true);
    // Manifest byte-for-byte unchanged (read AFTER restoring perms).
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });
});

describe('ConfigurationArchiveService — round 8: readdir seam + in-root symlink (items C+E)', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let target: string;
  let match: AllowlistMatch;
  let ctx: ArchiveContext;
  beforeEach(() => {
    projectRoot = tmpDir('arc-r8-p-');
    archiveRoot = tmpDir('arc-r8-a-');
    target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    match = { scope: 'project', canonicalRoot: projectRoot, canonicalTarget: fs.realpathSync(target) };
    ctx = { backend: 'test', kind: 'config', format: 'json', match };
  });
  afterEach(() => { for (const d of [projectRoot, archiveRoot]) fs.rmSync(d, { recursive: true, force: true }); });

  it('EACCES via readDirEntries seam → ok:false, integrityFailures with code, manifest unchanged', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const manifestPath = path.join(findHashDir(archiveRoot) as string, 'manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    // Inject EACCES via the seam (deterministic, no chmod).
    jest.spyOn(service as unknown as { readDirEntries: () => Promise<unknown[]> }, 'readDirEntries')
      .mockRejectedValue(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    const failed = result as { integrityFailures: readonly string[] };
    expect(failed.integrityFailures.some((f) => f.includes('EACCES'))).toBe(true);
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });

  it('deleted entry symlink to an in-root version → rejected, version/manifest unchanged', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target)); // creates a version
    await service.archiveDeleted(ctx, revisionOf(target));   // creates a delete
    const hashDir = findHashDir(archiveRoot) as string;
    const manifestPath = path.join(hashDir, 'manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    const versionsDir = path.join(hashDir, 'versions');
    const deletedDir = path.join(hashDir, 'deleted');
    const versionFile = fs.readdirSync(versionsDir)[0];
    const deletedFile = fs.readdirSync(deletedDir)[0];
    // Replace the deleted entry with a symlink to the version (in-root, same content).
    fs.rmSync(path.join(deletedDir, deletedFile), { force: true });
    fs.symlinkSync(path.join(versionsDir, versionFile), path.join(deletedDir, deletedFile));
    const result = await service.clearDeleted({ backend: 'test' });
    expect(result.ok).toBe(false);
    const failed = result as { integrityFailures: readonly string[] };
    expect(failed.integrityFailures.some((f) => f.includes('symlink'))).toBe(true);
    // Version file still exists (not deleted).
    expect(fs.existsSync(path.join(versionsDir, versionFile))).toBe(true);
    // Manifest byte-for-byte unchanged.
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });

  it('does not follow a deleted entry swapped to an in-root symlink after preflight', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveOverwrite(ctx, revisionOf(target));
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const versionsDir = path.join(hashDir, 'versions');
    const deletedDir = path.join(hashDir, 'deleted');
    const versionFile = fs.readdirSync(versionsDir)[0];
    const deletedFile = fs.readdirSync(deletedDir)[0];
    const versionPath = path.join(versionsDir, versionFile);
    const deletedPath = path.join(deletedDir, deletedFile);
    const internals = service as unknown as {
      writeManifestAtomic(dir: string, manifest: unknown): Promise<void>;
    };
    const writeManifestAtomic = internals.writeManifestAtomic.bind(service);
    jest.spyOn(internals, 'writeManifestAtomic').mockImplementationOnce(async (dir, manifest) => {
      await writeManifestAtomic(dir, manifest);
      fs.rmSync(deletedPath, { force: true });
      fs.symlinkSync(versionPath, deletedPath);
    });

    const result = await service.clearDeleted({ backend: 'test' });

    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly string[] }).integrityFailures.length).toBeGreaterThan(0);
    expect(fs.existsSync(versionPath)).toBe(true);
    expect(fs.readFileSync(versionPath, 'utf8')).toBe('{"a":1}');
  });

  it('preserves a same-content regular file swapped in after preflight by checking dev/ino', async () => {
    const service = new ConfigurationArchiveService(archiveRoot);
    await service.archiveDeleted(ctx, revisionOf(target));
    const hashDir = findHashDir(archiveRoot) as string;
    const deletedDir = path.join(hashDir, 'deleted');
    const deletedFile = fs.readdirSync(deletedDir)[0];
    const deletedPath = path.join(deletedDir, deletedFile);
    const internals = service as unknown as {
      writeManifestAtomic(dir: string, manifest: unknown): Promise<void>;
    };
    const writeManifestAtomic = internals.writeManifestAtomic.bind(service);
    jest.spyOn(internals, 'writeManifestAtomic').mockImplementationOnce(async (dir, manifest) => {
      await writeManifestAtomic(dir, manifest);
      fs.rmSync(deletedPath, { force: true });
      write(deletedPath, '{"a":1}');
    });

    const result = await service.clearDeleted({ backend: 'test' });

    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly string[] }).integrityFailures)
      .toEqual(expect.arrayContaining([expect.stringContaining('identity changed')]));
    expect(fs.existsSync(deletedPath)).toBe(true);
    expect(fs.readFileSync(deletedPath, 'utf8')).toBe('{"a":1}');
  });
});
