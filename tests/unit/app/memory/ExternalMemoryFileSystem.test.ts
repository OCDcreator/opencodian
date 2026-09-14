import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import { expandHomeDir, ExternalMemoryFileSystem } from '../../../../src/app/memory';

describe('expandHomeDir', () => {
  it('expands bare ~ and ~/ or ~\\ prefixes against the home dir', () => {
    expect(expandHomeDir('~')).toBe(nodeOs.homedir());
    expect(expandHomeDir('~/sub/dir')).toBe(nodePath.join(nodeOs.homedir(), 'sub/dir'));
    expect(expandHomeDir('~\\sub\\dir')).toBe(nodePath.join(nodeOs.homedir(), 'sub/dir'));
    expect(expandHomeDir('  ~/trimmed  ')).toBe(nodePath.join(nodeOs.homedir(), 'trimmed'));
  });

  it('leaves plain absolute and relative paths untouched (no ~xx user refs)', () => {
    expect(expandHomeDir('C:/data/store')).toBe('C:/data/store');
    expect(expandHomeDir('/home/u/store')).toBe('/home/u/store');
    expect(expandHomeDir('~username/store')).toBe('~username/store');
  });
});

describe('ExternalMemoryFileSystem', () => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'opencodian-extmem-'));
  });

  afterEach(() => {
    nodeFs.rmSync(root, { recursive: true, force: true });
  });

  it('round-trips files with recursive parents and reports basenames only', async () => {
    const fs = new ExternalMemoryFileSystem(root);
    const file = nodePath.join(root, 'projects', 'bucket-a', 'memory', 'MEMORY.md');
    await fs.writeFile(file, '# Memory Index');
    expect(await fs.readFile(file)).toBe('# Memory Index');
    expect(await fs.exists(file)).toBe(true);
    expect(await fs.exists(nodePath.join(root, 'projects', 'bucket-a', 'memory', 'missing.md'))).toBe(false);

    await fs.writeFile(nodePath.join(root, 'projects', 'bucket-a', 'memory', 'topic.md'), 'body');
    // listFiles must mirror the ListedFiles basename contract (files only).
    expect(await fs.listFiles(nodePath.join(root, 'projects', 'bucket-a', 'memory'))).toEqual([
      'MEMORY.md',
      'topic.md',
    ]);

    await fs.remove(nodePath.join(root, 'projects', 'bucket-a', 'memory', 'topic.md'));
    expect(await fs.readFile(nodePath.join(root, 'projects', 'bucket-a', 'memory', 'topic.md'))).toBeNull();
  });

  it('reports mtimes and native absolute paths', async () => {
    const fs = new ExternalMemoryFileSystem(root);
    const file = nodePath.join(root, 'a.md');
    await fs.writeFile(file, 'x');
    const mtime = await fs.mtimeMs(file);
    expect(typeof mtime).toBe('number');
    expect(mtime!).toBeGreaterThan(0);
    expect(await fs.mtimeMs(nodePath.join(root, 'nope.md'))).toBeNull();
    expect(fs.nativeAbsolutePath(file)).toBe(nodePath.resolve(file));
  });

  it('expands a ~ root so one settings value works on every host', async () => {
    const fs = new ExternalMemoryFileSystem('~/.opencodian-extmem-probe');
    expect(fs.resolvedRoot).toBe(nodePath.join(nodeOs.homedir(), '.opencodian-extmem-probe'));
  });
});
