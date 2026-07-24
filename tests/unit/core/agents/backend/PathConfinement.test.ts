/**
 * Direct unit tests for the shared PathConfinement owner — the single
 * symlink-aware parent-walk reused by assertWithinRoot,
 * resolveCanonicalTargetWithinRoot, and ConfigurationArchiveService.confinedPath.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  confinedComponentWalk,
  isENOENTError,
  isWithinRoot,
  PathConfinementError,
  resolveAnchorRealpath,
} from '../../../../../src/core/agents/backend/PathConfinement';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('PathConfinement — confinedComponentWalk', () => {
  let root: string;
  let outside: string;
  beforeEach(() => {
    root = tmpDir('pc-walk-');
    outside = tmpDir('pc-out-');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('resolves an existing in-root path', async () => {
    const target = path.join(root, 'a', 'b.txt');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'x');
    const resolved = await confinedComponentWalk(root, ['a', 'b.txt']);
    expect(isWithinRoot(root, resolved)).toBe(true);
  });

  it('anchors a missing (ENOENT) target under the verified ancestor', async () => {
    const resolved = await confinedComponentWalk(root, ['new', 'deep', 'file.txt']);
    expect(resolved).toBe(path.join(root, 'new', 'deep', 'file.txt'));
    expect(isWithinRoot(root, resolved)).toBe(true);
  });

  it('rejects a symlink that escapes the root', async () => {
    const sentinel = path.join(outside, 'escape.txt');
    fs.writeFileSync(sentinel, 'secret');
    const link = path.join(root, 'link.txt');
    fs.symlinkSync(sentinel, link);
    await expect(confinedComponentWalk(root, ['link.txt'])).rejects.toBeInstanceOf(PathConfinementError);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('secret');
  });

  it('rejects a final target that resolves outside root', async () => {
    // root itself is the realRoot; a path that lexically is outside can't be
    // expressed via components, so verify the isWithinRoot guard directly.
    expect(isWithinRoot(root, path.join(outside, 'x'))).toBe(false);
  });
});

describe('PathConfinement — resolveAnchorRealpath', () => {
  let root: string;
  beforeEach(() => { root = tmpDir('pc-anchor-'); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('returns the realpath for an existing root', async () => {
    const resolved = await resolveAnchorRealpath(root);
    expect(isWithinRoot(fs.realpathSync(root), resolved)).toBe(true);
  });

  it('falls back to the lexical path when the root does not exist (ENOENT)', async () => {
    const missing = path.join(root, 'does-not-exist');
    const resolved = await resolveAnchorRealpath(missing);
    expect(resolved).toBe(path.resolve(missing));
  });
});

describe('PathConfinement — helpers', () => {
  it('isENOENTError detects ENOENT only', () => {
    expect(isENOENTError({ code: 'ENOENT' })).toBe(true);
    expect(isENOENTError({ code: 'EACCES' })).toBe(false);
    expect(isENOENTError(null)).toBe(false);
  });
  it('isWithinRoot is inclusive of the root', () => {
    expect(isWithinRoot('/a', '/a')).toBe(true);
    expect(isWithinRoot('/a', '/a/b')).toBe(true);
    expect(isWithinRoot('/a', '/ab')).toBe(false);
    expect(isWithinRoot('/a', '/b')).toBe(false);
  });
});
