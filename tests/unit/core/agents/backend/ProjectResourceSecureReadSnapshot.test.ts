import type { PathLike } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  type ConfigurationAllowlist,
  readAllowlistedFileSnapshot,
} from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

jest.mock('fs/promises', () => {
  const actual = jest.requireActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, open: jest.fn(actual.open) };
});

const actualFs = jest.requireActual<typeof import('fs/promises')>('fs/promises');
const mockedOpen = fs.open as jest.MockedFunction<typeof fs.open>;

describe('readAllowlistedFileSnapshot', () => {
  let rootPath: string;
  let outsidePath: string;
  let targetPath: string;
  let allowlist: ConfigurationAllowlist;

  beforeEach(async () => {
    mockedOpen.mockImplementation(actualFs.open);
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-secure-snapshot-root-'));
    outsidePath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-secure-snapshot-outside-'));
    targetPath = path.join(rootPath, 'settings.json');
    allowlist = [{ scope: 'project', rootPath }];
  });

  afterEach(async () => {
    await fs.rm(rootPath, { recursive: true, force: true });
    await fs.rm(outsidePath, { recursive: true, force: true });
  });

  it('returns content and revision from one stable descriptor identity', async () => {
    await fs.writeFile(targetPath, '{"value":"A"}', 'utf8');

    const result = await readAllowlistedFileSnapshot({ targetPath, allowlist });

    expect(result).toEqual(expect.objectContaining({
      status: 'success',
      content: '{"value":"A"}',
      revision: expect.objectContaining({ canonicalPath: await fs.realpath(targetPath) }),
    }));
  });

  it('does not mix content A with an external replacement B at the read/revision boundary', async () => {
    await fs.writeFile(targetPath, '{"value":"A"}', 'utf8');
    const replacementPath = path.join(rootPath, 'replacement.json');
    await fs.writeFile(replacementPath, '{"value":"B"}', 'utf8');
    mockedOpen.mockImplementationOnce(async (filePath: PathLike, flags: number) => {
      await fs.rename(replacementPath, targetPath);
      return actualFs.open(filePath, flags);
    });

    const result = await readAllowlistedFileSnapshot({ targetPath, allowlist });

    expect(result.status).toBe('conflict');
    expect('content' in result).toBe(false);
    await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe('{"value":"B"}');
  });

  it('rejects same-content inode and symlink swaps without exposing outside bytes', async () => {
    await fs.writeFile(targetPath, '{"value":"same"}', 'utf8');
    const replacementPath = path.join(rootPath, 'replacement.json');
    await fs.writeFile(replacementPath, '{"value":"same"}', 'utf8');
    mockedOpen.mockImplementationOnce(async (filePath: PathLike, flags: number) => {
      await fs.rename(replacementPath, targetPath);
      return actualFs.open(filePath, flags);
    });
    const inodeSwap = await readAllowlistedFileSnapshot({ targetPath, allowlist });
    expect(inodeSwap.status).toBe('conflict');
    expect('content' in inodeSwap).toBe(false);

    const outsideTarget = path.join(outsidePath, 'external.json');
    await fs.writeFile(outsideTarget, '{"outside":true}', 'utf8');
    await fs.unlink(targetPath);
    await fs.symlink(outsideTarget, targetPath);
    const symlinkSwap = await readAllowlistedFileSnapshot({ targetPath, allowlist });
    expect(symlinkSwap.status).toBe('invalid-path');
    expect('content' in symlinkSwap).toBe(false);
    await expect(fs.readFile(outsideTarget, 'utf8')).resolves.toBe('{"outside":true}');
  });
});
