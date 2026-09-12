import {
  hashWorkspacePath,
  memoryIndexPath,
  memoryProjectDir,
  memoryProjectFile,
  modelMemoryRootDisplay,
  sanitizeProjectSlug,
  MEMORY_STORE_ROOT,
} from '../../../../src/core/memory/memoryPaths';

describe('memoryPaths', () => {
  it('sanitizes project slugs to lowercase [a-z0-9._-] with a 48-char cap', () => {
    expect(sanitizeProjectSlug('My Cool Vault')).toBe('my-cool-vault');
    expect(sanitizeProjectSlug('大写中文项目')).toBe('project');
    expect(sanitizeProjectSlug('--lead--tail--')).toBe('lead--tail');
    expect(sanitizeProjectSlug('a'.repeat(80)).length).toBe(48);
    expect(sanitizeProjectSlug('')).toBe('project');
  });

  it('hashes the resolved absolute workspace path to 16 hex chars', () => {
    const a = hashWorkspacePath('/tmp/ws-a');
    const b = hashWorkspacePath('/tmp/ws-b');
    expect(a).toMatch(/^[0-9a-f]{16}$/u);
    expect(a).not.toBe(b);
    // Same path resolved differently still hashes identically.
    expect(hashWorkspacePath('/tmp/ws-a/')).toBe(a);
  });

  it('builds the vault-relative project bucket under .opencodian/memory', () => {
    const dir = memoryProjectDir('/tmp/my-vault');
    expect(dir.startsWith(`${MEMORY_STORE_ROOT}/projects/`)).toBe(true);
    expect(dir).toContain('my-vault-');
    expect(memoryProjectFile('/tmp/my-vault', 'MEMORY.md')).toBe(`${dir}/MEMORY.md`);
    expect(memoryIndexPath('/tmp/my-vault')).toBe(`${dir}/MEMORY.md`);
  });

  it('different vaults map to different buckets', () => {
    expect(memoryProjectDir('/tmp/one')).not.toBe(memoryProjectDir('/tmp/two'));
  });

  it('renders the model-facing root with a trailing separator', () => {
    expect(modelMemoryRootDisplay('/vault/x/memory/projects/b')).toBe(
      '/vault/x/memory/projects/b/',
    );
    expect(modelMemoryRootDisplay('/vault/b/')).toBe('/vault/b/');
  });
});
