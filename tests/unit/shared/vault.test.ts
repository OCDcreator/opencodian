import type { App } from 'obsidian';

import { getFilePathBasename, getVaultBasePath, toVaultRelativePath } from '../../../src/shared';

describe('toVaultRelativePath', () => {
  const macBase = '/Volumes/SDD2T/obsidian-vault-write/testvault';
  const winBase = 'C:\\Users\\lt\\Desktop\\Write\\testvault';

  it('strips a macOS vault root from an absolute vault-internal path', () => {
    expect(toVaultRelativePath(`${macBase}/notes/today.md`, macBase)).toBe('notes/today.md');
    expect(toVaultRelativePath(`${macBase}/custom/deep/nested/导数模型.md`, macBase))
      .toBe('custom/deep/nested/导数模型.md');
  });

  it('normalizes Windows drive paths with backslashes into slash-separated relative paths', () => {
    expect(toVaultRelativePath(`${winBase}\\docs\\导数模型.md`, winBase)).toBe('docs/导数模型.md');
    expect(toVaultRelativePath('C:/Users/lt/Desktop/Write/testvault/docs/a.md', winBase)).toBe('docs/a.md');
    expect(toVaultRelativePath('c:/users/LT/Desktop/Write/testvault/docs/case.md', winBase))
      .toBe('docs/case.md');
  });

  it('keeps already-relative paths semantically unchanged while unifying separators', () => {
    expect(toVaultRelativePath('notes/today.md', macBase)).toBe('notes/today.md');
    expect(toVaultRelativePath('notes\\sub\\today.md', macBase)).toBe('notes/sub/today.md');
    expect(toVaultRelativePath('notes/today.md', null)).toBe('notes/today.md');
  });

  it('does not strip lookalike vault prefixes that miss a directory boundary', () => {
    expect(toVaultRelativePath('/vault-two/notes/today.md', '/vault')).toBeNull();
    expect(toVaultRelativePath('/vault/notes/today.md', '/vault')).toBe('notes/today.md');
  });

  it('fails closed for absolute paths outside the vault or without a usable base path', () => {
    expect(toVaultRelativePath('/etc/passwd', macBase)).toBeNull();
    expect(toVaultRelativePath(`${macBase}/notes/today.md`, null)).toBeNull();
    expect(toVaultRelativePath(`${macBase}/notes/today.md`, undefined)).toBeNull();
  });

  it('fails closed for parent-directory traversal in absolute or relative inputs', () => {
    expect(toVaultRelativePath(`${macBase}/../outside.md`, macBase)).toBeNull();
    expect(toVaultRelativePath(`${macBase}/notes/../../outside.md`, macBase)).toBeNull();
    expect(toVaultRelativePath('../outside.md', macBase)).toBeNull();
    expect(toVaultRelativePath('notes/../../outside.md', macBase)).toBeNull();
  });

  it('tolerates a trailing slash on the vault base and rejects the vault root itself', () => {
    expect(toVaultRelativePath(`${macBase}/notes/today.md`, `${macBase}/`)).toBe('notes/today.md');
    expect(toVaultRelativePath(macBase, macBase)).toBeNull();
  });
});

describe('getFilePathBasename', () => {
  it('returns only the final segment across slash styles', () => {
    expect(getFilePathBasename('/etc/outside.md')).toBe('outside.md');
    expect(getFilePathBasename('C:\\outside\\windows.md')).toBe('windows.md');
    expect(getFilePathBasename('../outside/relative.md')).toBe('relative.md');
  });
});

describe('getVaultBasePath', () => {
  it('keeps reading the adapter basePath and tolerates a missing adapter', () => {
    const app = { vault: { adapter: { basePath: '/vault' } } } as unknown as App;
    expect(getVaultBasePath(app)).toBe('/vault');
    expect(getVaultBasePath({ vault: {} } as unknown as App)).toBeNull();
  });
});
