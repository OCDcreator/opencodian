/* eslint-disable max-lines -- Cohesive public-contract coverage for allowlist, revision races, archive, restore, clear and content validation. */

/**
 * Shared safe configuration contract tests (round 2).
 *
 * Covers: allowlisted roots + escape protection; mandatory FileRevision|null
 * expected-state for every non-create mutation with full canonicalPath+mtime+
 * size+sha256 conflict detection; confined archive layout + manifest validation
 * + atomic manifest I/O + overwrite retention; honest typed clearDeletedArchives
 * (partial failure + manifest-write failure); restore content validation; and
 * adversarial backend/kind traversal + tampered-manifest confinement.
 */
import { createHash } from 'node:crypto';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  applyJsoncPathEdits,
  assertWithinAllowlistedRoot,
  clearDeletedArchives,
  type ClearDeletedResult,
  type ConfigurationAllowlist,
  ConfigurationArchiveService,
  type FileRevision,
  isConfigurationEvidenceComplete,
  OVERWRITE_RETENTION_LIMIT,
  safeDeleteFile,
  safeRestoreFile,
  safeWriteFile,
  validateConfigurationContent,
} from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function write(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}
function rev(target: string): FileRevision {
  const r = computeFileRevisionSync(target);
  if (!r) throw new Error(`no revision for ${target}`);
  return r;
}
function computeFileRevisionSync(target: string): FileRevision | null {
  // synchronous mirror for test setup convenience
  const real = fs.realpathSync(target);
  const st = fs.statSync(real);
  const content = fs.readFileSync(real, 'utf8');
  return { canonicalPath: real, mtimeMs: st.mtimeMs, size: st.size, sha256: sha(content) };
}
const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const ARCHIVE = { backend: 'test', kind: 'config', format: 'json' as const };
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

describe('assertWithinAllowlistedRoot — multi-root + escape protection', () => {
  let globalRoot: string;
  let projectRoot: string;
  let external: string;
  let allowlist: ConfigurationAllowlist;

  beforeEach(() => {
    globalRoot = tmpDir('cfg-global-');
    projectRoot = tmpDir('cfg-project-');
    external = tmpDir('cfg-external-');
    allowlist = [
      { scope: 'global', rootPath: globalRoot },
      { scope: 'project', rootPath: projectRoot },
    ];
  });
  afterEach(() => {
    for (const d of [globalRoot, projectRoot, external]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('matches a target inside the project root', async () => {
    const match = await assertWithinAllowlistedRoot(allowlist, path.join(projectRoot, 'config.json'));
    expect(match.scope).toBe('project');
    expect(match.canonicalTarget).toBe(path.join(fs.realpathSync(projectRoot), 'config.json'));
  });
  it('matches a target inside the global root', async () => {
    const match = await assertWithinAllowlistedRoot(allowlist, path.join(globalRoot, 'settings.json'));
    expect(match.scope).toBe('global');
  });
  it('rejects a target outside every allowlisted root', async () => {
    await expect(assertWithinAllowlistedRoot(allowlist, path.join(external, 'evil.json'))).rejects.toThrow();
  });
  it('rejects path-traversal that escapes the root lexically', async () => {
    await expect(assertWithinAllowlistedRoot(allowlist, path.join(projectRoot, '..', 'escape.json'))).rejects.toThrow();
  });
  it('refuses to follow a symlink that escapes the project root', async () => {
    fs.symlinkSync(path.join(external, 'sentinel.json'), path.join(projectRoot, 'link.json'));
    await expect(assertWithinAllowlistedRoot(allowlist, path.join(projectRoot, 'link.json'))).rejects.toThrow();
  });
  it('resolves a create target whose parent does not yet exist', async () => {
    const match = await assertWithinAllowlistedRoot(allowlist, path.join(projectRoot, 'deep', 'nested', 'new.json'));
    expect(match.scope).toBe('project');
  });
});

describe('safeWriteFile — mandatory expectedRevision + full FileRevision conflict detection', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let allowlist: ConfigurationAllowlist;
  beforeEach(() => {
    projectRoot = tmpDir('cfg-w-');
    archiveRoot = tmpDir('cfg-w-archive-');
    allowlist = [{ scope: 'project', rootPath: projectRoot }];
  });
  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  });

  it('creates a new file when expectedRevision=null and target is absent', async () => {
    const target = path.join(projectRoot, 'a.json');
    const res = await safeWriteFile({ targetPath: target, content: '{"a":1}', expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res).toEqual(expect.objectContaining({ status: 'success' }));
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}');
  });

  it('create (expected null) conflicts when the target already exists (no duplicate overwrite)', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    const res = await safeWriteFile({ targetPath: target, content: '{"a":2}', expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('conflict');
    expect((res as { expected: FileRevision | null }).expected).toBeNull();
    expect((res as { current: FileRevision | null }).current).not.toBeNull();
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}');
  });

  it('concurrent creates are atomic: exactly one succeeds and the winner is never overwritten', async () => {
    const target = path.join(projectRoot, 'create-race.json');
    const contents = Array.from({ length: 8 }, (_, index) => JSON.stringify({ index }));

    const results = await Promise.all(contents.map((content) => safeWriteFile({
      targetPath: target,
      content,
      expectedRevision: null,
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    })));

    const successfulIndexes = results.flatMap((result, index) => result.status === 'success' ? [index] : []);
    expect(successfulIndexes).toHaveLength(1);
    expect(results.filter((result) => result.status === 'conflict')).toHaveLength(contents.length - 1);
    expect(fs.readFileSync(target, 'utf8')).toBe(contents[successfulIndexes[0]]);
  });

  it('updates when expectedRevision matches exactly', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    const res = await safeWriteFile({ targetPath: target, content: '{"a":2}', expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('success');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":2}');
  });

  it('conflicts on a sha256 change (external content edit)', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    const expected = rev(target);
    write(target, '{"a":999}');
    const res = await safeWriteFile({ targetPath: target, content: '{"a":2}', expectedRevision: expected, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('conflict');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":999}');
  });

  it('conflicts on an identical-content rewrite with a changed mtime', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    const expected = rev(target);
    // Same content, but rewrite so the mtime changes (and re-stat picks a new mtime).
    await new Promise((r) => setTimeout(r, 20));
    write(target, '{"a":1}');
    const res = await safeWriteFile({ targetPath: target, content: '{"a":2}', expectedRevision: expected, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('conflict');
  });

  it('conflicts when expectedRevision is for a different same-content file (different canonicalPath)', async () => {
    const a = path.join(projectRoot, 'a.json');
    const b = path.join(projectRoot, 'b.json');
    write(a, '{"a":1}');
    write(b, '{"a":1}'); // identical content → same sha, but different canonicalPath
    const expectedB = rev(b);
    const res = await safeWriteFile({ targetPath: a, content: '{"a":2}', expectedRevision: expectedB, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('conflict');
  });

  it('conflicts when an update expects a revision but the target is absent', async () => {
    const target = path.join(projectRoot, 'missing.json');
    const res = await safeWriteFile({ targetPath: target, content: '{}', expectedRevision: { canonicalPath: target, mtimeMs: 0, size: 0, sha256: 'deadbeef' }, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('conflict');
    expect((res as { current: FileRevision | null }).current).toBeNull();
  });

  it('returns invalid-path for a target outside the allowlist', async () => {
    const res = await safeWriteFile({ targetPath: path.join(os.tmpdir(), 'outside.json'), content: '{}', expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('invalid-path');
  });

  it('returns invalid-content for malformed JSON', async () => {
    const target = path.join(projectRoot, 'bad.json');
    const res = await safeWriteFile({ targetPath: target, content: '{ not json', expectedRevision: null, format: 'json', allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('invalid-content');
    expect(fs.existsSync(target)).toBe(false);
  });

  it('aborts the mutation (target unchanged) when archiving fails', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, 'orig');
    const blocker = path.join(projectRoot, 'blocker');
    fs.writeFileSync(blocker, 'x', 'utf8');
    const badArchiveRoot = path.join(blocker, 'archive'); // parent is a file → mkdir fails
    const res = await safeWriteFile({ targetPath: target, content: 'new', expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: badArchiveRoot } });
    expect(res.status).toBe('archive-failed');
    expect(fs.readFileSync(target, 'utf8')).toBe('orig');
  });

  it('preserves an external update that lands after archiving and before commit', async () => {
    const target = path.join(projectRoot, 'update-race.json');
    write(target, '{"value":"original"}');
    const expected = rev(target);
    const originalArchive = ConfigurationArchiveService.prototype.archiveOverwrite;
    const archiveSpy = jest.spyOn(ConfigurationArchiveService.prototype, 'archiveOverwrite')
      .mockImplementationOnce(async function (ctx, revision) {
        await originalArchive.call(this, ctx, revision);
        write(target, '{"value":"external"}');
      });

    try {
      const result = await safeWriteFile({
        targetPath: target,
        content: '{"value":"plugin"}',
        expectedRevision: expected,
        allowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(result.status).toBe('conflict');
      expect(fs.readFileSync(target, 'utf8')).toBe('{"value":"external"}');

      const hashDir = findHashDir(archiveRoot) as string;
      const manifest = JSON.parse(fs.readFileSync(path.join(hashDir, 'manifest.json'), 'utf8'));
      const entry = manifest.versions[0];
      const archived = fs.readFileSync(path.join(hashDir, 'versions', entry.fileName), 'utf8');
      expect(archived).toBe('{"value":"original"}');
      expect(entry.size).toBe(Buffer.byteLength(archived, 'utf8'));
      expect(entry.sha256).toBe(sha(archived));
    } finally {
      archiveSpy.mockRestore();
    }
  });

  it('reports conflict when the target changes while the archive snapshot is being captured', async () => {
    const target = path.join(projectRoot, 'archive-race.json');
    write(target, '{"value":"original"}');
    const expected = rev(target);
    const originalArchive = ConfigurationArchiveService.prototype.archiveOverwrite;
    const archiveSpy = jest.spyOn(ConfigurationArchiveService.prototype, 'archiveOverwrite')
      .mockImplementationOnce(async function (ctx, revision) {
        write(target, '{"value":"external"}');
        await originalArchive.call(this, ctx, revision);
      });

    try {
      const result = await safeWriteFile({
        targetPath: target,
        content: '{"value":"plugin"}',
        expectedRevision: expected,
        allowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(result.status).toBe('conflict');
      expect(fs.readFileSync(target, 'utf8')).toBe('{"value":"external"}');
      expect(findHashDir(archiveRoot)).toBeNull();
    } finally {
      archiveSpy.mockRestore();
    }
  });

  it('serializes concurrent updates so a shared expected revision has only one winner', async () => {
    const target = path.join(projectRoot, 'update-cas.json');
    write(target, '{"value":"original"}');
    const expected = rev(target);
    const contents = ['{"value":"first"}', '{"value":"second"}'];

    const results = await Promise.all(contents.map((content, index) => safeWriteFile({
      targetPath: target,
      content,
      expectedRevision: expected,
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: `${archiveRoot}-${index}` },
    })));

    const winner = results.findIndex((result) => result.status === 'success');
    expect(winner).toBeGreaterThanOrEqual(0);
    expect(results.filter((result) => result.status === 'success')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'conflict')).toHaveLength(1);
    expect(fs.readFileSync(target, 'utf8')).toBe(contents[winner]);
    for (const index of [0, 1]) fs.rmSync(`${archiveRoot}-${index}`, { recursive: true, force: true });
  });
});

describe('safeDeleteFile — mandatory expectedRevision', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let allowlist: ConfigurationAllowlist;
  beforeEach(() => {
    projectRoot = tmpDir('cfg-d-');
    archiveRoot = tmpDir('cfg-d-archive-');
    allowlist = [{ scope: 'project', rootPath: projectRoot }];
  });
  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  });

  it('deletes when expectedRevision matches', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, 'x');
    const res = await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('success');
    expect(fs.existsSync(target)).toBe(false);
  });

  it('expected null + present → conflict', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, 'x');
    const res = await safeDeleteFile({ targetPath: target, expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('conflict');
    expect(fs.existsSync(target)).toBe(true);
  });

  it('expected null + absent → not-found', async () => {
    const target = path.join(projectRoot, 'a.json');
    const res = await safeDeleteFile({ targetPath: target, expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('not-found');
  });

  it('expected revision + absent → conflict', async () => {
    const target = path.join(projectRoot, 'a.json');
    const res = await safeDeleteFile({ targetPath: target, expectedRevision: { canonicalPath: target, mtimeMs: 0, size: 0, sha256: 'deadbeef' }, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('conflict');
  });

  it('revision mismatch → conflict', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, 'x');
    const expected = rev(target);
    write(target, 'y');
    const res = await safeDeleteFile({ targetPath: target, expectedRevision: expected, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('conflict');
    expect(fs.existsSync(target)).toBe(true);
  });

  it('preserves an external edit that lands after delete archiving and before unlink', async () => {
    const target = path.join(projectRoot, 'delete-race.json');
    write(target, 'original');
    const expected = rev(target);
    const originalArchive = ConfigurationArchiveService.prototype.archiveDeleted;
    const archiveSpy = jest.spyOn(ConfigurationArchiveService.prototype, 'archiveDeleted')
      .mockImplementationOnce(async function (ctx, revision) {
        await originalArchive.call(this, ctx, revision);
        write(target, 'external');
      });

    try {
      const result = await safeDeleteFile({
        targetPath: target,
        expectedRevision: expected,
        allowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(result.status).toBe('conflict');
      expect(fs.readFileSync(target, 'utf8')).toBe('external');

      const hashDir = findHashDir(archiveRoot) as string;
      const manifest = JSON.parse(fs.readFileSync(path.join(hashDir, 'manifest.json'), 'utf8'));
      const entry = manifest.deleted[0];
      const archived = fs.readFileSync(path.join(hashDir, 'deleted', entry.fileName), 'utf8');
      expect(archived).toBe('original');
      expect(entry.size).toBe(Buffer.byteLength(archived, 'utf8'));
      expect(entry.sha256).toBe(sha(archived));
    } finally {
      archiveSpy.mockRestore();
    }
  });
});

describe('archive retention + restore', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let allowlist: ConfigurationAllowlist;
  beforeEach(() => {
    projectRoot = tmpDir('cfg-r-');
    archiveRoot = tmpDir('cfg-r-archive-');
    allowlist = [{ scope: 'project', rootPath: projectRoot }];
  });
  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  });

  it('keeps only the latest OVERWRITE_RETENTION_LIMIT overwrite versions', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, 'v0');
    for (let i = 1; i <= OVERWRITE_RETENTION_LIMIT + 2; i++) {
      const res = await safeWriteFile({ targetPath: target, content: `v${i}`, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
      expect(res.status).toBe('success');
    }
    const versionsDir = findDir(archiveRoot, 'versions');
    expect(versionsDir).not.toBeNull();
    const files = fs.readdirSync(versionsDir as string).filter((f) => f.endsWith('-overwrite.json'));
    expect(files.length).toBe(OVERWRITE_RETENTION_LIMIT);
  });

  it('never auto-prunes deleted entries across multiple deletes', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, 'd0');
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    write(target, 'd1');
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    const deletedDir = findDir(archiveRoot, 'deleted');
    expect(deletedDir).not.toBeNull();
    expect(fs.readdirSync(deletedDir as string).filter((f) => f.endsWith('-delete.json')).length).toBe(2);
  });

  it('restore writes the latest deleted content back after validating it', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(fs.existsSync(target)).toBe(false);
    const res = await safeRestoreFile({ targetPath: target, expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('success');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}');
  });

  it('restore refuses invalid restored content (invalid-content, no write)', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, '{ broken'); // archived as-is despite being invalid JSON
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(fs.existsSync(target)).toBe(false);
    const res = await safeRestoreFile({ targetPath: target, expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('invalid-content');
    expect(fs.existsSync(target)).toBe(false);
  });

  it('restore conflicts when a target appears before restore (expected null + present)', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    write(target, '{"a":999}'); // reappeared
    const res = await safeRestoreFile({ targetPath: target, expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('conflict');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":999}');
  });

  it('restore archives the current target before overwriting it', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, '{"v":1}');
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    write(target, '{"v":2}');
    const res = await safeRestoreFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('success');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"v":1}');
    const versionsDir = findDir(archiveRoot, 'versions');
    expect(versionsDir).not.toBeNull();
    const overwrites = fs.readdirSync(versionsDir as string).filter((f) => f.endsWith('-overwrite.json'));
    expect(overwrites.length).toBe(1);
    expect(fs.readFileSync(path.join(versionsDir as string, overwrites[0]), 'utf8')).toBe('{"v":2}');
  });

  it('preserves an external edit that lands after restore archiving and before commit', async () => {
    const target = path.join(projectRoot, 'restore-race.json');
    write(target, '{"v":1}');
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    write(target, '{"v":2}');
    const expected = rev(target);
    const originalArchive = ConfigurationArchiveService.prototype.archiveOverwrite;
    const archiveSpy = jest.spyOn(ConfigurationArchiveService.prototype, 'archiveOverwrite')
      .mockImplementationOnce(async function (ctx, revision) {
        await originalArchive.call(this, ctx, revision);
        write(target, '{"v":3}');
      });

    try {
      const result = await safeRestoreFile({
        targetPath: target,
        expectedRevision: expected,
        allowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(result.status).toBe('conflict');
      expect(fs.readFileSync(target, 'utf8')).toBe('{"v":3}');
    } finally {
      archiveSpy.mockRestore();
    }
  });

  it('restore returns not-found when there is no deleted entry', async () => {
    const target = path.join(projectRoot, 'a.json');
    const res = await safeRestoreFile({ targetPath: target, expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(res.status).toBe('not-found');
  });
});

describe('clearDeletedArchives — honest typed contract', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let allowlist: ConfigurationAllowlist;
  beforeEach(() => {
    projectRoot = tmpDir('cfg-c-');
    archiveRoot = tmpDir('cfg-c-archive-');
    allowlist = [{ scope: 'project', rootPath: projectRoot }];
  });
  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  });

  it('clears deleted entries and leaves overwrite history intact', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, 'v1');
    await safeWriteFile({ targetPath: target, content: 'v2', expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    const result: ClearDeletedResult = await clearDeletedArchives({ archiveRootPath: archiveRoot, backend: 'test' });
    expect(result.ok).toBe(true);
    expect((result as { cleared: number }).cleared).toBe(1);
    const versionsDir = findDir(archiveRoot, 'versions');
    expect(versionsDir).not.toBeNull();
    expect(fs.readdirSync(versionsDir as string).filter((f) => f.endsWith('-overwrite.json')).length).toBe(1);
  });

  it('reports orphaned files when physical removal fails after manifest commit (cleared reflects disk)', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, 'v1');
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    const deletedDir = findDir(archiveRoot, 'deleted');
    expect(deletedDir).not.toBeNull();
    try {
      fs.chmodSync(deletedDir as string, 0o555); // physical removal fails; manifest commit (in hashDir) still works
      if (isRoot) return; // chmod ineffective as root
      const result = await clearDeletedArchives({ archiveRootPath: archiveRoot, backend: 'test' });
      expect(result.ok).toBe(false);
      const failed = result as { cleared: number; orphanedFiles: readonly unknown[]; manifestWriteFailed: boolean };
      // Manifest-first: committed deleted:[] but file could not be removed → orphan, not cleared.
      expect(failed.cleared).toBe(0);
      expect(failed.orphanedFiles.length).toBe(1);
      expect(failed.manifestWriteFailed).toBe(false);
    } finally {
      fs.chmodSync(deletedDir as string, 0o755);
    }
  });

  it('reports manifest-write failure without throwing (nothing cleared, old state intact)', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, 'v1');
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    const hashDir = findHashDir(archiveRoot);
    expect(hashDir).not.toBeNull();
    try {
      fs.chmodSync(hashDir as string, 0o555); // manifest temp+rename fails
      if (isRoot) return;
      const result = await clearDeletedArchives({ archiveRootPath: archiveRoot, backend: 'test' });
      expect(result.ok).toBe(false);
      const failed = result as { cleared: number; manifestWriteFailed: boolean };
      expect(failed.cleared).toBe(0);
      expect(failed.manifestWriteFailed).toBe(true);
    } finally {
      fs.chmodSync(hashDir as string, 0o755);
    }
  });
});

describe('archive confinement — adversarial (item 3)', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let allowlist: ConfigurationAllowlist;
  beforeEach(() => {
    projectRoot = tmpDir('cfg-adv-');
    archiveRoot = tmpDir('cfg-adv-archive-');
    allowlist = [{ scope: 'project', rootPath: projectRoot }];
  });
  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
  });

  it('rejects a traversal backend segment and touches nothing outside', async () => {
    const sentinel = path.join(archiveRoot, '..', 'adv-sentinel.json');
    write(sentinel, 'keep');
    const result = await clearDeletedArchives({ archiveRootPath: archiveRoot, backend: '..', scope: 'project' });
    // An unsafe backend segment is an integrity failure (never ok:true).
    expect(result.ok).toBe(false);
    expect((result as { integrityFailures: readonly unknown[] }).integrityFailures.length).toBeGreaterThan(0);
    expect(fs.existsSync(sentinel)).toBe(true);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('keep');
  });

  it('a tampered manifest filename never reads/deletes a file outside the archive', async () => {
    const target = path.join(projectRoot, 'a.json');
    write(target, '{"a":1}');
    await safeDeleteFile({ targetPath: target, expectedRevision: rev(target), allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    // Plant an outside sentinel the tampered name would target.
    const outside = path.join(archiveRoot, '..', 'outside.json');
    write(outside, 'precious');
    // Tamper the manifest: rewrite the deleted entry fileName to escape.
    const hashDir = findHashDir(archiveRoot);
    expect(hashDir).not.toBeNull();
    const manifestPath = path.join(hashDir as string, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.deleted[0].fileName = '../../../outside.json';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    // A tampered manifest entry makes the manifest invalid → archive-failed
    // (NOT a silent not-found), and the outside sentinel is never touched.
    const restoreRes = await safeRestoreFile({ targetPath: target, expectedRevision: null, allowlist, archive: { ...ARCHIVE, archiveRootPath: archiveRoot } });
    expect(restoreRes.status).toBe('archive-failed');
    // clearDeleted must not remove the outside file.
    const result = await clearDeletedArchives({ archiveRootPath: archiveRoot, backend: 'test' });
    expect(fs.existsSync(outside)).toBe(true);
    expect(fs.readFileSync(outside, 'utf8')).toBe('precious');
    void result;
  });
});

describe('content validation + JSONC preservation + evidence', () => {
  it('strict JSON rejects comments, trailing commas and non-object roots', () => {
    expect(validateConfigurationContent('json', '{ "a": 1 }').ok).toBe(true);
    expect(validateConfigurationContent('json', '{ "a": 1 /* c */ }').ok).toBe(false);
    expect(validateConfigurationContent('json', '{ "a": 1, }').ok).toBe(false);
    expect(validateConfigurationContent('json', '[1, 2, 3]').ok).toBe(false);
  });
  it('JSONC allows comments/trailing commas; rejects invalid tokens', () => {
    expect(validateConfigurationContent('jsonc', '{ "a": 1 /* c */, }').ok).toBe(true);
    expect(validateConfigurationContent('jsonc', '{ "a": }').ok).toBe(false);
  });
  it('TOML parses valid tables and rejects invalid input', () => {
    expect(validateConfigurationContent('toml', 'a = 1\n').ok).toBe(true);
    expect(validateConfigurationContent('toml', 'a = "x').ok).toBe(false);
  });
  it('applyJsoncPathEdits preserves comments, key order, unknown fields, indent, EOL', () => {
    const content = '{\r\n  // keep me\r\n  "a": 1,\r\n  "unknown": true,\r\n  "b": {\r\n    "c": 2\r\n  }\r\n}\r\n';
    const res = applyJsoncPathEdits(content, [
      { path: ['b', 'c'], value: 99 },
      { path: ['a'], value: 7 },
    ]);
    expect(res.ok).toBe(true);
    const ok = res as { result: string };
    expect(ok.result).toContain('\r\n');
    expect(ok.result).toContain('// keep me');
    expect(ok.result.indexOf('"a": 7')).toBeLessThan(ok.result.indexOf('"unknown"'));
    expect(ok.result).toContain('"unknown": true');
    expect(ok.result).toContain('    "c": 99');
  });
  it('ConfigurationEvidence is complete only when all three axes are verified', () => {
    expect(isConfigurationEvidenceComplete({ persistence: 'verified', application: 'verified', runtime: 'verified' })).toBe(true);
    expect(isConfigurationEvidenceComplete({ persistence: 'verified', application: 'verified', runtime: 'unavailable' })).toBe(false);
  });
});

function findDir(root: string, leaf: string): string | null {
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        if (e.name === leaf) return full;
        stack.push(full);
      }
    }
  }
  return null;
}
function findHashDir(archiveRoot: string): string | null {
  // <archiveRoot>/<backend>/<scope>/<kind>/<hash>
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
