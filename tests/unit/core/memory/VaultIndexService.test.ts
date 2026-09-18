import { createHash } from 'node:crypto';

import {
  VAULT_MANIFEST_PATH,
  type VaultChangeKind,
  type VaultFileMeta,
  type VaultIndexFs,
  VaultIndexService,
} from '../../../../src/core/memory/VaultIndexService';
import { shardNameFor,VAULT_INDEX_ROOT } from '../../../../src/core/memory/vaultRetrievalIndex';

/** Deterministic in-memory vault + index store for the fs port. */
class InMemoryVaultFs implements VaultIndexFs {
  files = new Map<string, { content: string; mtimeMs: number }>();
  indexFiles = new Map<string, string>();
  writesByPath = new Map<string, number>();
  changeHandlers: Array<(path: string, kind: VaultChangeKind) => void> = [];

  async listMarkdownFiles(): Promise<readonly VaultFileMeta[]> {
    return [...this.files.entries()]
      .filter(([path]) => path.toLowerCase().endsWith('.md'))
      .map(([path, file]) => ({ path, mtimeMs: file.mtimeMs }));
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path)?.content ?? null;
  }

  async writeIndexFile(path: string, data: string): Promise<void> {
    this.assertIndex(path);
    this.indexFiles.set(path, data);
    this.writesByPath.set(path, (this.writesByPath.get(path) ?? 0) + 1);
  }

  async readIndexFile(path: string): Promise<string | null> {
    this.assertIndex(path);
    return this.indexFiles.get(path) ?? null;
  }

  async deleteIndexFile(path: string): Promise<void> {
    this.assertIndex(path);
    this.indexFiles.delete(path);
  }

  onVaultChanged(handler: (path: string, kind: VaultChangeKind) => void): () => void {
    this.changeHandlers.push(handler);
    return () => {
      this.changeHandlers = this.changeHandlers.filter((entry) => entry !== handler);
    };
  }

  emit(path: string, kind: VaultChangeKind): void {
    for (const handler of [...this.changeHandlers]) {
      handler(path, kind);
    }
  }

  private assertIndex(path: string): void {
    if (!path.startsWith(`${VAULT_INDEX_ROOT}/`)) {
      throw new Error(`index write outside root: ${path}`);
    }
  }
}

function createSettings(overrides: Partial<{
  vaultRetrievalEnabled: boolean;
  vaultRetrievalTopK: number;
  vaultRetrievalMaxCharsPerNote: number;
  vaultRetrievalExcludedPaths: string[];
}> = {}) {
  return {
    vaultRetrievalEnabled: true,
    vaultRetrievalTopK: 6,
    vaultRetrievalMaxCharsPerNote: 4000,
    vaultRetrievalExcludedPaths: [] as string[],
    ...overrides,
  };
}

function seedNote(fs: InMemoryVaultFs, path: string, content: string, mtimeMs = 1000): void {
  fs.files.set(path, { content, mtimeMs });
}

function noteHash(content: string): string {
  return createHash('sha1').update(content, 'utf8').digest('hex').slice(0, 16);
}

async function flushDebounce(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 2100));
}

describe('VaultIndexService', () => {
  let fs: InMemoryVaultFs;
  let service: VaultIndexService;

  beforeEach(() => {
    jest.restoreAllMocks();
    fs = new InMemoryVaultFs();
    service = new VaultIndexService();
  });

  afterEach(() => {
    service.dispose();
  });

  it('stays fully dormant while the setting is off', async () => {
    seedNote(fs, 'a.md', 'alpha body');
    service.attach(fs, () => createSettings({ vaultRetrievalEnabled: false }));
    await service.onSettingsChanged();
    expect(fs.changeHandlers.length).toBe(0);
    expect(fs.indexFiles.size).toBe(0);
    await expect(service.select('alpha')).resolves.toEqual([]);
    expect(service.isStarted()).toBe(false);
  });

  it('builds the index in the background and answers queries', async () => {
    seedNote(fs, 'deploy.md', '# Deploy guide\n\ndeploy the model on friday');
    seedNote(fs, 'garden.md', '# Garden\n\nwater the tomatoes');
    service.attach(fs, () => createSettings());
    await service.onSettingsChanged();
    await service.rebuildMissing(1000);
    const snippets = await service.select('deploy guide');
    expect(snippets.length).toBe(1);
    expect(snippets[0].path).toBe('deploy.md');
    expect(snippets[0].text).toContain('deploy the model');
    expect(fs.indexFiles.has(VAULT_MANIFEST_PATH)).toBe(true);
  });

  it('select reflects fresh note content read at query time', async () => {
    seedNote(fs, 'note.md', '# Note\n\noriginal content here');
    service.attach(fs, () => createSettings());
    await service.onSettingsChanged();
    await service.rebuildMissing(1000);
    // The note changes after indexing (index only holds tokens/lines).
    seedNote(fs, 'note.md', '# Note\n\nupdated content here', 2000);
    fs.emit('note.md', 'modify');
    await flushDebounce();
    const snippets = await service.select('original content');
    // Old text is gone from the file; the incremental update re-indexed.
    const updated = await service.select('updated content');
    expect(snippets.length).toBe(0);
    expect(updated.length).toBe(1);
    expect(updated[0].text).toContain('updated content here');
  });

  it('skips re-indexing when content hash is unchanged', async () => {
    seedNote(fs, 'note.md', '# Note\n\nstable body');
    service.attach(fs, () => createSettings());
    await service.onSettingsChanged();
    await service.rebuildMissing(1000);
    const manifestBefore = JSON.parse(fs.indexFiles.get(VAULT_MANIFEST_PATH) ?? '{}');
    const shardPath = `${VAULT_INDEX_ROOT}/shards/${shardNameFor('note.md')}`;
    const writesBefore = fs.writesByPath.get(shardPath) ?? 0;
    // mtime bump with identical content must not rewrite the shard.
    seedNote(fs, 'note.md', '# Note\n\nstable body', 9999);
    await service.rebuildMissing(1000);
    const manifestAfter = JSON.parse(fs.indexFiles.get(VAULT_MANIFEST_PATH) ?? '{}');
    expect(manifestAfter.entries['note.md'].mtimeMs).toBe(9999);
    expect(manifestAfter.entries['note.md'].contentHash).toBe(manifestBefore.entries['note.md'].contentHash);
    expect(noteHash('# Note\n\nstable body')).toBe(manifestBefore.entries['note.md'].contentHash);
    expect(fs.writesByPath.get(shardPath) ?? 0).toBe(writesBefore);
  });

  it('removes the shard when a note is deleted and re-indexes on rename', async () => {
    seedNote(fs, 'old.md', '# Old\n\ndelete the stale row now');
    service.attach(fs, () => createSettings());
    await service.onSettingsChanged();
    await service.rebuildMissing(1000);
    const shardPath = `${VAULT_INDEX_ROOT}/shards/${shardNameFor('old.md')}`;
    expect(fs.indexFiles.has(shardPath)).toBe(true);

    // Rename = delete(old) + create(new).
    fs.files.delete('old.md');
    fs.emit('old.md', 'delete');
    seedNote(fs, 'new.md', '# Old\n\ndelete the stale row now', 3000);
    fs.emit('new.md', 'create');
    await flushDebounce();

    expect(fs.indexFiles.has(shardPath)).toBe(false);
    expect(await service.select('stale row').then((s) => s.map((x) => x.path))).toEqual(['new.md']);
    expect(fs.indexFiles.has(`${VAULT_INDEX_ROOT}/shards/${shardNameFor('new.md')}`)).toBe(true);
  });

  it('respects exclusion rules and never lists excluded notes in the manifest', async () => {
    seedNote(fs, 'templates/weekly.md', '# Weekly\n\nmeeting notes template');
    seedNote(fs, 'notes/real.md', '# Real\n\nreal meeting notes');
    service.attach(fs, () => createSettings({ vaultRetrievalExcludedPaths: ['templates/'] }));
    await service.onSettingsChanged();
    await service.rebuildMissing(1000);
    const snippets = await service.select('meeting notes');
    expect(snippets.map((s) => s.path)).toEqual(['notes/real.md']);
    const manifest = JSON.parse(fs.indexFiles.get(VAULT_MANIFEST_PATH) ?? '{}');
    expect(manifest.entries['templates/weekly.md']).toBeUndefined();
  });

  it('ignores changes to excluded paths', async () => {
    service.attach(fs, () => createSettings({ vaultRetrievalExcludedPaths: ['archive/'] }));
    await service.onSettingsChanged();
    await service.rebuildMissing(1000);
    seedNote(fs, 'archive/junk.md', 'junk data junk');
    fs.emit('archive/junk.md', 'create');
    await flushDebounce();
    const manifest = JSON.parse(fs.indexFiles.get(VAULT_MANIFEST_PATH) ?? '{}');
    expect(manifest.entries['archive/junk.md']).toBeUndefined();
  });

  it('withholds snippets that trip the secret guard', async () => {
    seedNote(fs, 'creds.md', '# Creds\n\napi_key = sk-live-abcdef0123456789 password hunter2');
    service.attach(fs, () => createSettings());
    await service.onSettingsChanged();
    await service.rebuildMissing(1000);
    const logger = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const snippets = await service.select('api key');
    expect(snippets).toEqual([]);
    logger.mockRestore();
  });

  it('hydrates unchanged notes from shards on a fresh instance (restart resume)', async () => {
    seedNote(fs, 'keep.md', '# Keep\n\nhydrated body here');
    const first = new VaultIndexService();
    first.attach(fs, () => createSettings());
    await first.onSettingsChanged();
    await first.rebuildMissing(1000);
    const manifestWithEntries = JSON.parse(fs.indexFiles.get(VAULT_MANIFEST_PATH) ?? '{}');
    expect(Object.keys(manifestWithEntries.entries)).toEqual(['keep.md']);
    first.dispose();

    // Second service instance: same store, empty memory cache.
    const second = new VaultIndexService();
    second.attach(fs, () => createSettings());
    await second.onSettingsChanged();
    await second.rebuildMissing(1000);
    const snippets = await second.select('hydrated body');
    expect(snippets.length).toBe(1);
    expect(snippets[0].path).toBe('keep.md');
    second.dispose();
  });

  it('invalidateAll clears memory and disk shards', async () => {
    seedNote(fs, 'a.md', '# A\n\nfind me anywhere');
    service.attach(fs, () => createSettings());
    await service.onSettingsChanged();
    await service.rebuildMissing(1000);
    expect((await service.select('find me anywhere')).length).toBe(1);
    await service.invalidateAll();
    expect(fs.indexFiles.size).toBe(0);
    expect(await service.select('find me anywhere')).toEqual([]);
  });

  it('stop on disable drops the change subscription and cache', async () => {
    seedNote(fs, 'a.md', '# A\n\nsome content');
    let enabled = true;
    service.attach(fs, () => createSettings({ vaultRetrievalEnabled: enabled }));
    await service.onSettingsChanged();
    expect(service.isStarted()).toBe(true);
    enabled = false;
    await service.onSettingsChanged();
    expect(service.isStarted()).toBe(false);
    expect(fs.changeHandlers.length).toBe(0);
    await expect(service.select('some content')).resolves.toEqual([]);
  });
});
