import type { PathLike } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  computeFileRevision,
  type FileRevision,
} from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';
import {
  type ScopedConfigurationResourceReadResult,
  ScopedConfigurationResourceService,
} from '../../../../../src/core/agents/backend/ScopedConfigurationResourceService';

jest.mock('fs/promises', () => {
  const actual = jest.requireActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, open: jest.fn(actual.open) };
});

const actualFs = jest.requireActual<typeof import('fs/promises')>('fs/promises');
const mockedOpen = fs.open as jest.MockedFunction<typeof fs.open>;

describe('ScopedConfigurationResourceService secure content read', () => {
  let sandboxPath: string;
  let outsidePath: string;
  let service: ScopedConfigurationResourceService;

  beforeEach(async () => {
    mockedOpen.mockImplementation(actualFs.open);
    sandboxPath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-scoped-read-'));
    outsidePath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-scoped-read-outside-'));
    service = new ScopedConfigurationResourceService({
      backend: 'test-backend',
      kind: 'command',
      format: 'markdown',
      relativeRootPath: path.join('.tool', 'commands'),
    });
  });

  afterEach(async () => {
    await fs.rm(sandboxPath, { recursive: true, force: true });
    await fs.rm(outsidePath, { recursive: true, force: true });
  });

  async function writeExpectedTarget(content = '# expected\n'): Promise<{
    targetPath: string;
    revision: FileRevision;
  }> {
    const targetPath = path.join(sandboxPath, '.tool', 'commands', 'review.md');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf8');
    const revision = await computeFileRevision(targetPath);
    if (revision === null) throw new Error('expected target revision missing');
    return { targetPath, revision };
  }

  function read(expectedRevision: FileRevision): Promise<ScopedConfigurationResourceReadResult> {
    return service.read({
      scope: 'project',
      basePath: sandboxPath,
      targetRelativePath: 'review.md',
      expectedRevision,
    });
  }

  it('returns content only when the complete expected revision still matches', async () => {
    const expected = await writeExpectedTarget();

    const result = await read(expected.revision);

    expect(result).toEqual(expect.objectContaining({
      status: 'success',
      content: '# expected\n',
      revision: expected.revision,
      scope: 'project',
      targetPath: expected.targetPath,
    }));
  });

  it('returns a content-free conflict for a stale expected revision', async () => {
    const expected = await writeExpectedTarget();
    await fs.writeFile(expected.targetPath, '# externally changed\n', 'utf8');

    const result = await read(expected.revision);

    expect(result.status).toBe('conflict');
    expect('content' in result).toBe(false);
    if (result.status !== 'conflict') throw new Error('expected conflict');
    expect(result.expected).toEqual(expected.revision);
    expect(result.current?.sha256).not.toBe(expected.revision.sha256);
  });

  it('rejects an escaping fixed resource root without returning outside content', async () => {
    const outsideTarget = path.join(outsidePath, 'commands', 'review.md');
    const outsideContent = '# fixed-root outside\n';
    await fs.mkdir(path.dirname(outsideTarget), { recursive: true });
    await fs.writeFile(outsideTarget, outsideContent, 'utf8');
    const outsideRevision = await computeFileRevision(outsideTarget);
    if (outsideRevision === null) throw new Error('outside revision missing');
    await fs.symlink(outsidePath, path.join(sandboxPath, '.tool'));

    const result = await read(outsideRevision);

    expect(result.status).toBe('invalid-path');
    expect('content' in result).toBe(false);
    await expect(fs.readFile(outsideTarget, 'utf8')).resolves.toBe(outsideContent);
  });

  it('rejects a discovery-to-read leaf symlink swap without returning outside content', async () => {
    const expected = await writeExpectedTarget();
    const outsideTarget = path.join(outsidePath, 'outside.md');
    const outsideContent = '# leaf outside\n';
    await fs.writeFile(outsideTarget, outsideContent, 'utf8');
    await fs.unlink(expected.targetPath);
    await fs.symlink(outsideTarget, expected.targetPath);

    const result = await read(expected.revision);

    expect(result.status).toBe('invalid-path');
    expect('content' in result).toBe(false);
    await expect(fs.readFile(outsideTarget, 'utf8')).resolves.toBe(outsideContent);
  });

  it('rejects an equal-revision inode swap between lexical lstat and descriptor open', async () => {
    const expected = await writeExpectedTarget('# same bytes\n');
    const controlledTime = new Date(Math.floor(Date.now() / 1000) * 1000 - 10_000);
    await fs.utimes(expected.targetPath, controlledTime, controlledTime);
    const expectedRevision = await computeFileRevision(expected.targetPath);
    if (expectedRevision === null) throw new Error('controlled expected revision missing');
    const originalStat = await fs.stat(expected.targetPath);
    const replacementPath = `${expected.targetPath}.replacement`;
    await fs.writeFile(replacementPath, '# same bytes\n', 'utf8');
    await fs.utimes(replacementPath, controlledTime, controlledTime);
    mockedOpen.mockImplementationOnce(async (filePath: PathLike, flags: number) => {
      await fs.rename(replacementPath, expected.targetPath);
      return actualFs.open(filePath, flags);
    });

    const result = await read(expectedRevision);

    expect(result.status).toBe('conflict');
    expect('content' in result).toBe(false);
    const replacementStat = await fs.stat(expected.targetPath);
    expect(replacementStat.ino).not.toBe(originalStat.ino);
    await expect(computeFileRevision(expected.targetPath)).resolves.toEqual(expectedRevision);
  });
});
