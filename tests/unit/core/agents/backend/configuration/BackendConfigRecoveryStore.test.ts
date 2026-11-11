import crypto from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { backendRecoveryIdentity, createBackendConfigRecoveryStore, recoveryRevision } from '../../../../../../src/core/agents/backend/configuration/BackendConfigRecoveryStore';

const POSIX = process.platform !== 'win32';
const fixtureCache = resolve(__dirname, '../../../../../../node_modules/.cache/backend-config-recovery-tests');

function fixture() {
  mkdirSync(fixtureCache, { recursive: true });
  const root = mkdtempSync(join(realpathSync(fixtureCache), 'case-'));
  const base = join(root, 'history');
  const identity = backendRecoveryIdentity(join(root, 'vault-a'), 'fixture:config')!;
  const store = createBackendConfigRecoveryStore({ baseDir: base });
  return { root, base, identity, store };
}

// Fixtures remain in this worktree for inspection. No teardown deletes paths.
afterEach(() => { jest.restoreAllMocks(); });

describe('Backend configuration history content', () => {
  it('roundtrips exact bytes, metadata and a bounded five-slot history', () => {
    const { base, identity, store } = fixture();
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']) store.archive(identity, 'fixture-key', JSON.stringify({ version }));
    const entries = store.list(identity, 'fixture-key');
    expect(entries).toHaveLength(5);
    expect(JSON.parse(store.read(identity, 'fixture-key', 1)!.raw).version).toBe('v7');
    expect(JSON.parse(store.read(identity, 'fixture-key', 5)!.raw).version).toBe('v3');
    expect(store.read(identity, 'fixture-key', 6)).toBeNull();
    const raw = readFileSync(join(base, identity, 'fixture-key-1.json'), 'utf8');
    expect(entries[0]).toEqual(expect.objectContaining({ index: 1, revision: recoveryRevision(raw), bytes: Buffer.byteLength(raw), savedAt: expect.any(Number) }));
    expect(readdirSync(join(base, identity)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('survives reopening the store without exposing secret bytes in listings', () => {
    const { base, identity, store } = fixture();
    const raw = '{"apiKey":"fixture-private-value","comment":"精确保留"}\n';
    store.archive(identity, 'fixture-key', raw);
    const reopened = createBackendConfigRecoveryStore({ baseDir: base });
    expect(reopened.read(identity, 'fixture-key', 1)?.raw).toBe(raw);
    expect(JSON.stringify(reopened.list(identity, 'fixture-key'))).not.toContain('fixture-private-value');
    expect(reopened.list(identity, 'fixture-key')[0]).not.toHaveProperty('raw');
  });

  it('can restore the initial empty overlay after its first edit', () => {
    const { identity, store } = fixture();
    store.archive(identity, 'fixture-key', '');
    expect(store.list(identity, 'fixture-key')).toHaveLength(1);
    expect(store.read(identity, 'fixture-key', 1)).toEqual(expect.objectContaining({ raw: '', revision: recoveryRevision('') }));
  });

  it('isolates vaults and targets without creating a missing history on read', () => {
    const { root, base, identity, store } = fixture();
    expect(store.list(identity, 'fixture-key')).toEqual([]);
    expect(existsSync(base)).toBe(false);
    const otherVault = backendRecoveryIdentity(join(root, 'vault-b'), 'fixture:config')!;
    const otherTarget = backendRecoveryIdentity(join(root, 'vault-a'), 'fixture:other')!;
    store.archive(identity, 'fixture-key', 'private');
    for (const other of [otherVault, otherTarget]) {
      expect(store.list(other, 'fixture-key')).toEqual([]);
      expect(store.read(other, 'fixture-key', 1)).toBeNull();
    }
  });

  it('does not reuse a rotated slot identity for a stale selection', () => {
    const { identity, store } = fixture();
    store.archive(identity, 'fixture-key', 'first');
    const listed = store.list(identity, 'fixture-key')[0];
    store.archive(identity, 'fixture-key', 'second');
    expect(store.read(identity, 'fixture-key', listed.index)?.revision).not.toBe(listed.revision);
    expect(store.read(identity, 'fixture-key', 2)?.raw).toBe('first');
  });
});

describe('Backend configuration history confinement', () => {
  it('creates private files and hardens pre-existing dedicated directories', () => {
    if (!POSIX) return;
    const { base, identity, store } = fixture();
    mkdirSync(join(base, identity), { recursive: true, mode: 0o755 });
    chmodSync(base, 0o755);
    chmodSync(join(base, identity), 0o755);
    expect(() => store.list(identity, 'fixture-key')).toThrow('not private');
    store.archive(identity, 'fixture-key', 'private');
    expect(lstatSync(base).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(base, identity)).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(base, identity, 'fixture-key-1.json')).mode & 0o777).toBe(0o600);
  });

  it.each(['base', 'parent', 'namespace'])('rejects a symlink at the %s boundary', (boundary) => {
    if (!POSIX) return;
    const { root, base, identity } = fixture();
    const vault = join(root, 'vault-with-private-config');
    mkdirSync(vault, { mode: 0o700 });
    let historyBase = base;
    if (boundary === 'base') symlinkSync(vault, base);
    else if (boundary === 'parent') {
      const parent = join(root, 'linked-parent');
      symlinkSync(vault, parent);
      historyBase = join(parent, 'history');
    } else {
      mkdirSync(base, { mode: 0o700 });
      symlinkSync(vault, join(base, identity));
    }
    const store = createBackendConfigRecoveryStore({ baseDir: historyBase });
    expect(() => store.archive(identity, 'fixture-key', 'must not enter vault')).toThrow('Unsafe');
    expect(() => store.list(identity, 'fixture-key')).toThrow('Unsafe');
    expect(() => store.read(identity, 'fixture-key', 1)).toThrow('Unsafe');
    expect(readdirSync(vault)).toEqual([]);
  });

  it('ignores symlinked or publicly readable slots and never follows their targets on archive', () => {
    if (!POSIX) return;
    const { root, base, identity, store } = fixture();
    store.archive(identity, 'fixture-key', 'working');
    const slot = join(base, identity, 'fixture-key-1.json');
    renameSync(slot, join(base, identity, 'retained-original.json'));
    const outside = join(root, 'untouched.json');
    writeFileSync(outside, 'untouched');
    symlinkSync(outside, slot);
    expect(store.list(identity, 'fixture-key')).toEqual([]);
    expect(store.read(identity, 'fixture-key', 1)).toBeNull();
    store.archive(identity, 'fixture-key', 'new snapshot');
    expect(readFileSync(outside, 'utf8')).toBe('untouched');
    expect(store.read(identity, 'fixture-key', 1)?.raw).toBe('new snapshot');
    chmodSync(slot, 0o644);
    expect(store.read(identity, 'fixture-key', 1)).toBeNull();
  });

  it.each(['regular file', 'symlink'])('does not overwrite a pre-existing temporary %s or rotate history', (kind) => {
    if (!POSIX && kind === 'symlink') return;
    const { root, base, identity, store } = fixture();
    store.archive(identity, 'fixture-key', 'working');
    const token = '00000000-0000-4000-8000-000000000000';
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(token);
    const temporary = join(base, identity, `fixture-key-${token}.tmp`);
    const outside = join(root, 'untouched.json');
    writeFileSync(outside, 'untouched');
    if (kind === 'symlink') symlinkSync(outside, temporary);
    else writeFileSync(temporary, 'pre-existing');
    expect(() => store.archive(identity, 'fixture-key', 'new secret')).toThrow();
    expect(readFileSync(outside, 'utf8')).toBe('untouched');
    expect(readFileSync(temporary, 'utf8')).toBe(kind === 'symlink' ? 'untouched' : 'pre-existing');
    expect(store.list(identity, 'fixture-key')).toHaveLength(1);
    expect(store.read(identity, 'fixture-key', 1)?.raw).toBe('working');
  });
});

describe('Backend configuration history namespace validation', () => {
  it.each(['', 'relative-root', '../outside'])('rejects relative history root %s', (baseDir) => {
    expect(() => createBackendConfigRecoveryStore({ baseDir })).toThrow('must be absolute');
  });

  it.each(['../outside', 'a/b', 'x', 'A'.repeat(64)])('rejects unsafe identity %s before filesystem changes', (identity) => {
    const { base, store } = fixture();
    expect(() => store.archive(identity, 'fixture-key', 'private')).toThrow('namespace');
    expect(() => store.list(identity, 'fixture-key')).toThrow('namespace');
    expect(() => store.read(identity, 'fixture-key', 1)).toThrow('namespace');
    expect(existsSync(base)).toBe(false);
  });

  it.each(['../outside', 'a/b', 'a\\b', '', 'UPPER'])('rejects unsafe key %s before filesystem changes', (key) => {
    const { base, identity, store } = fixture();
    expect(() => store.archive(identity, key, 'private')).toThrow('namespace');
    expect(() => store.list(identity, key)).toThrow('namespace');
    expect(() => store.read(identity, key, 1)).toThrow('namespace');
    expect(existsSync(base)).toBe(false);
  });

  it.each([undefined, '', '   ', 'relative-vault', '../outside'])('has no recovery identity for path %s', (path) => {
    expect(backendRecoveryIdentity(path, 'dsh:mcpServers')).toBeNull();
  });
});
