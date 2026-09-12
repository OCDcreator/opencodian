/**
 * In-memory `MemoryFileSystem` for deterministic tests and the loop-test
 * harness. Tracks mtimes on write so partition ordering and hygiene aging
 * behave like the vault-backed adapter.
 */

import type { MemoryFileSystem } from './memoryTypes';

export class InMemoryMemoryFileSystem implements MemoryFileSystem {
  private readonly files = new Map<string, { content: string; mtimeMs: number }>();
  private readonly dirs = new Set<string>();

  constructor(private readonly nativeBasePath = '/vault') {}

  async readFile(relativePath: string): Promise<string | null> {
    return this.files.get(this.normalizeKey(relativePath))?.content ?? null;
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const key = this.normalizeKey(relativePath);
    await this.ensureParents(key);
    this.files.set(key, { content, mtimeMs: Date.now() });
    this.dirs.add(this.dirname(key));
  }

  async exists(relativePath: string): Promise<boolean> {
    const key = this.normalizeKey(relativePath);
    return this.files.has(key) || this.dirs.has(key);
  }

  async listFiles(relativePath: string): Promise<string[]> {
    const dir = this.normalizeKey(relativePath);
    const names = new Set<string>();
    for (const key of this.files.keys()) {
      if (this.dirname(key) === dir) names.add(key.slice(dir.length + 1));
    }
    return [...names].sort();
  }

  async mkdir(relativePath: string): Promise<void> {
    const key = this.normalizeKey(relativePath);
    this.dirs.add(key);
    await this.ensureParents(key);
  }

  async remove(relativePath: string): Promise<void> {
    const key = this.normalizeKey(relativePath);
    this.files.delete(key);
  }

  async mtimeMs(relativePath: string): Promise<number | null> {
    return this.files.get(this.normalizeKey(relativePath))?.mtimeMs ?? null;
  }

  nativeAbsolutePath(relativePath: string): string {
    const key = this.normalizeKey(relativePath);
    return `${this.nativeBasePath}/${key}`;
  }

  /** Test hook: seed a file with an explicit mtime. */
  seedFile(relativePath: string, content: string, mtimeMs: number): void {
    const key = this.normalizeKey(relativePath);
    this.files.set(key, { content, mtimeMs });
  }

  private normalizeKey(relativePath: string): string {
    return relativePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');
  }

  private dirname(key: string): string {
    const idx = key.lastIndexOf('/');
    return idx === -1 ? '' : key.slice(0, idx);
  }

  private async ensureParents(key: string): Promise<void> {
    const parts = key.split('/');
    for (let i = 1; i < parts.length; i++) {
      this.dirs.add(parts.slice(0, i).join('/'));
    }
  }
}
