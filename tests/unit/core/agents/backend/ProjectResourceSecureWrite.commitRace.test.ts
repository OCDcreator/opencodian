/** Public-API commit-race contracts for the secure configuration mutation chokepoint. */
import { createHash } from 'node:crypto';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  type ConfigurationAllowlist,
  type FileRevision,
} from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

type SecureWriteModule = typeof import('../../../../../src/core/agents/backend/ProjectResourceSecureWrite');
type CommitOperationsModule = typeof import('../../../../../src/core/agents/backend/ConfigurationFileCommitOperations');
type CommitRenameArgs = Parameters<CommitOperationsModule['renameFileAtCommit']>;
type CommitLinkArgs = Parameters<CommitOperationsModule['linkFileAtCommit']>;
type CommitUnlinkArgs = Parameters<CommitOperationsModule['unlinkFileAtCommit']>;

const ARCHIVE = { backend: 'test', kind: 'config', format: 'json' as const };

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function revision(target: string): FileRevision {
  const canonicalPath = fs.realpathSync(target);
  const fileStat = fs.statSync(canonicalPath);
  const content = fs.readFileSync(canonicalPath, 'utf8');
  return {
    canonicalPath,
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}

function privateCommitArtifacts(rootPath: string): string[] {
  return fs.readdirSync(rootPath)
    .filter((entry) => entry.startsWith('.opencodian-commit-') || entry.startsWith('.opencodian-create-'));
}

function isTargetPath(value: string | Buffer | URL, target: string): boolean {
  return typeof value === 'string' && value === target;
}

function loadSecureWriteModule(): SecureWriteModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- load after the commit facade spy is installed.
  return require('../../../../../src/core/agents/backend/ProjectResourceSecureWrite') as SecureWriteModule;
}

function loadCommitOperationsModule(): CommitOperationsModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- share the exact facade module instance with the source loaded next.
  return require('../../../../../src/core/agents/backend/ConfigurationFileCommitOperations') as CommitOperationsModule;
}

function installExternalMutationAtCommit(target: string, content: string): {
  readonly injected: () => boolean;
  readonly restore: () => void;
} {
  const operations = loadCommitOperationsModule();
  const actual = {
    rename: operations.renameFileAtCommit,
    link: operations.linkFileAtCommit,
    unlink: operations.unlinkFileAtCommit,
  };
  let wasInjected = false;
  const inject = (): void => {
    if (!wasInjected) {
      wasInjected = true;
      write(target, content);
    }
  };
  const renameSpy = jest.spyOn(operations, 'renameFileAtCommit').mockImplementation(async (...args: CommitRenameArgs) => {
    if (isTargetPath(args[0], target) || isTargetPath(args[1], target)) inject();
    await actual.rename(...args);
  });
  const linkSpy = jest.spyOn(operations, 'linkFileAtCommit').mockImplementation(async (...args: CommitLinkArgs) => {
    if (isTargetPath(args[0], target) || isTargetPath(args[1], target)) inject();
    await actual.link(...args);
  });
  const unlinkSpy = jest.spyOn(operations, 'unlinkFileAtCommit').mockImplementation(async (...args: CommitUnlinkArgs) => {
    if (isTargetPath(args[0], target)) inject();
    await actual.unlink(...args);
  });
  return {
    injected: () => wasInjected,
    restore: () => {
      unlinkSpy.mockRestore();
      linkSpy.mockRestore();
      renameSpy.mockRestore();
    },
  };
}

describe('ProjectResourceSecureWrite commit identity fence', () => {
  let projectRoot: string;
  let archiveRoot: string;
  let allowlist: ConfigurationAllowlist;

  beforeEach(() => {
    jest.resetModules();
    // The secure-write contract commits against canonical real paths. Normalise
    // test roots too, because macOS `/var` otherwise differs from `/private/var`.
    projectRoot = fs.realpathSync(tmpDir('cfg-commit-race-'));
    archiveRoot = fs.realpathSync(tmpDir('cfg-commit-race-archive-'));
    allowlist = [{ scope: 'project', rootPath: projectRoot }];
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(archiveRoot, { recursive: true, force: true });
    jest.resetModules();
  });

  it('safeWriteFile preserves an external update that lands at its commit boundary', async () => {
    const target = path.join(projectRoot, 'update.json');
    write(target, '{"value":"original"}');
    const race = installExternalMutationAtCommit(target, '{"value":"external"}');
    const { safeWriteFile } = loadSecureWriteModule();

    try {
      const result = await safeWriteFile({
        targetPath: target,
        content: '{"value":"plugin"}',
        expectedRevision: revision(target),
        allowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(race.injected()).toBe(true);
      expect(result.status).toBe('conflict');
      expect(fs.readFileSync(target, 'utf8')).toBe('{"value":"external"}');
      expect(privateCommitArtifacts(projectRoot)).toEqual([]);
    } finally {
      race.restore();
    }
  });

  it('safeDeleteFile preserves an external replacement that lands at its commit boundary', async () => {
    const target = path.join(projectRoot, 'delete.json');
    write(target, '{"value":"original"}');
    const race = installExternalMutationAtCommit(target, '{"value":"external"}');
    const { safeDeleteFile } = loadSecureWriteModule();

    try {
      const result = await safeDeleteFile({
        targetPath: target,
        expectedRevision: revision(target),
        allowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(race.injected()).toBe(true);
      expect(result.status).toBe('conflict');
      expect(fs.readFileSync(target, 'utf8')).toBe('{"value":"external"}');
      expect(privateCommitArtifacts(projectRoot)).toEqual([]);
    } finally {
      race.restore();
    }
  });

  it('safeRestoreFile preserves an external replacement at its present-target commit boundary', async () => {
    const target = path.join(projectRoot, 'restore-present.json');
    write(target, '{"value":"deleted"}');
    const { safeDeleteFile: setupDelete } = loadSecureWriteModule();
    await setupDelete({
      targetPath: target,
      expectedRevision: revision(target),
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    write(target, '{"value":"current"}');
    jest.resetModules();
    const race = installExternalMutationAtCommit(target, '{"value":"external"}');
    const { safeRestoreFile } = loadSecureWriteModule();

    try {
      const result = await safeRestoreFile({
        targetPath: target,
        expectedRevision: revision(target),
        allowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(race.injected()).toBe(true);
      expect(result.status).toBe('conflict');
      expect(fs.readFileSync(target, 'utf8')).toBe('{"value":"external"}');
      expect(privateCommitArtifacts(projectRoot)).toEqual([]);
    } finally {
      race.restore();
    }
  });

  it('safeRestoreFile creates absent targets only when the link-time target remains absent', async () => {
    const target = path.join(projectRoot, 'restore-absent.json');
    write(target, '{"value":"deleted"}');
    const { safeDeleteFile: setupDelete } = loadSecureWriteModule();
    await setupDelete({
      targetPath: target,
      expectedRevision: revision(target),
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    jest.resetModules();
    const race = installExternalMutationAtCommit(target, '{"value":"external"}');
    const { safeRestoreFile } = loadSecureWriteModule();

    try {
      const result = await safeRestoreFile({
        targetPath: target,
        expectedRevision: null,
        allowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(race.injected()).toBe(true);
      expect(result.status).toBe('conflict');
      expect(fs.readFileSync(target, 'utf8')).toBe('{"value":"external"}');
      expect(privateCommitArtifacts(projectRoot)).toEqual([]);
    } finally {
      race.restore();
    }
  });

  it('cleans private commit artifacts after ordinary expected-present update and delete success', async () => {
    const target = path.join(projectRoot, 'ordinary-success.json');
    write(target, '{"value":"original"}');
    const { safeDeleteFile, safeWriteFile } = loadSecureWriteModule();

    const updated = await safeWriteFile({
      targetPath: target,
      content: '{"value":"plugin"}',
      expectedRevision: revision(target),
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    if (updated.status !== 'success') {
      throw new Error(`Expected update success, received ${updated.status}`);
    }
    expect(fs.readFileSync(target, 'utf8')).toBe('{"value":"plugin"}');
    expect(privateCommitArtifacts(projectRoot)).toEqual([]);

    const deleted = await safeDeleteFile({
      targetPath: target,
      expectedRevision: updated.revision,
      allowlist,
      archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
    });
    expect(deleted.status).toBe('success');
    expect(fs.existsSync(target)).toBe(false);
    expect(privateCommitArtifacts(projectRoot)).toEqual([]);
  });

  it('reports the retained claim path when a second external winner blocks restoration', async () => {
    const target = path.join(projectRoot, 'two-external-winners.json');
    write(target, '{"value":"original"}');
    const expected = revision(target);
    const operations = loadCommitOperationsModule();
    const actualRename = operations.renameFileAtCommit;
    const actualLink = operations.linkFileAtCommit;
    let firstWinnerInjected = false;
    let secondWinnerInjected = false;
    const renameSpy = jest.spyOn(operations, 'renameFileAtCommit').mockImplementation(async (...args: CommitRenameArgs) => {
      if (!firstWinnerInjected && isTargetPath(args[0], target)) {
        firstWinnerInjected = true;
        write(target, '{"value":"external-claimed"}');
      }
      await actualRename(...args);
    });
    const linkSpy = jest.spyOn(operations, 'linkFileAtCommit').mockImplementation(async (...args: CommitLinkArgs) => {
      if (!secondWinnerInjected && isTargetPath(args[1], target)) {
        secondWinnerInjected = true;
        write(target, '{"value":"external-later"}');
      }
      await actualLink(...args);
    });
    const { safeWriteFile } = loadSecureWriteModule();

    try {
      const result = await safeWriteFile({
        targetPath: target,
        content: '{"value":"plugin"}',
        expectedRevision: expected,
        allowlist,
        archive: { ...ARCHIVE, archiveRootPath: archiveRoot },
      });
      expect(firstWinnerInjected).toBe(true);
      expect(secondWinnerInjected).toBe(true);
      if (result.status !== 'write-failed') {
        throw new Error(`Expected retained-claim write failure, received ${result.status}`);
      }
      const retainedMatch = result.cause.match(/retained claimed bytes at (.+); target already has a later external winner/);
      expect(retainedMatch).not.toBeNull();
      const retainedPath = retainedMatch?.[1] ?? '';
      expect(fs.readFileSync(target, 'utf8')).toBe('{"value":"external-later"}');
      expect(fs.readFileSync(retainedPath, 'utf8')).toBe('{"value":"external-claimed"}');
      expect(privateCommitArtifacts(projectRoot)).toContain(path.basename(path.dirname(retainedPath)));
    } finally {
      linkSpy.mockRestore();
      renameSpy.mockRestore();
    }
  });
});
