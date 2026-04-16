import type { App } from 'obsidian';
import { TFile, TFolder } from 'obsidian';

import { ContextFileCatalogService } from '../../../../src/features/chat/services/ContextFileCatalogService';

function createFile(path: string): TFile {
  const file = new TFile();
  const name = path.split('/').pop() ?? path;
  const dotIndex = name.lastIndexOf('.');
  file.path = path;
  file.name = name;
  file.basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  file.extension = dotIndex > 0 ? name.slice(dotIndex + 1) : '';
  return file;
}

function createService(files: TFile[]): {
  service: ContextFileCatalogService;
  getFiles: jest.Mock<TFile[], []>;
} {
  const getFiles = jest.fn(() => files);
  const app = {
    vault: {
      getFiles,
    },
  } as unknown as App;

  return {
    service: new ContextFileCatalogService(app),
    getFiles,
  };
}

describe('ContextFileCatalogService', () => {
  it('builds a sorted eligible file catalog with extension buckets', async () => {
    const { service } = createService([
      createFile('notes/B.txt'),
      createFile('notes/A.md'),
      createFile('assets/image.png'),
      createFile('notes/.hidden.md'),
      createFile('.obsidian/config.json'),
      createFile('notes/no-extension'),
    ]);

    const catalog = await service.getCatalog();

    expect(catalog.entries.map((entry) => entry.file.path)).toEqual([
      'notes/A.md',
      'assets/image.png',
      'notes/B.txt',
    ]);
    expect(catalog.entries[0]).toEqual(expect.objectContaining({
      lowerPath: 'notes/a.md',
      lowerBasename: 'a',
      lowerExtension: 'md',
      extension: 'md',
    }));
    expect(catalog.extensions).toEqual([
      { value: 'md', count: 1 },
      { value: 'png', count: 1 },
      { value: 'txt', count: 1 },
    ]);
  });

  it('updates the cached catalog incrementally for vault file events', async () => {
    const files = [
      createFile('notes/A.md'),
      createFile('notes/B.txt'),
    ];
    const { service, getFiles } = createService(files);

    await service.getCatalog();
    const createdFile = createFile('notes/C.md');
    service.handleCreate(createdFile);

    let catalog = await service.getCatalog();
    expect(getFiles).toHaveBeenCalledTimes(1);
    expect(catalog.entries.map((entry) => entry.file.path)).toEqual([
      'notes/A.md',
      'notes/C.md',
      'notes/B.txt',
    ]);
    expect(catalog.extensions).toEqual([
      { value: 'md', count: 2 },
      { value: 'txt', count: 1 },
    ]);

    const renamedFile = createFile('notes/Z.md');
    service.handleRename(renamedFile, 'notes/A.md');
    catalog = await service.getCatalog();
    expect(catalog.entries.map((entry) => entry.file.path)).toEqual([
      'notes/C.md',
      'notes/Z.md',
      'notes/B.txt',
    ]);

    service.handleDelete(createdFile);
    catalog = await service.getCatalog();
    expect(catalog.entries.map((entry) => entry.file.path)).toEqual([
      'notes/Z.md',
      'notes/B.txt',
    ]);
    expect(catalog.extensions).toEqual([
      { value: 'md', count: 1 },
      { value: 'txt', count: 1 },
    ]);
  });

  it('invalidates the cache when a non-file vault event arrives', async () => {
    const files = [createFile('notes/A.md')];
    const { service, getFiles } = createService(files);

    await service.getCatalog();
    files.push(createFile('notes/B.md'));

    service.handleCreate(new TFolder());
    const catalog = await service.getCatalog();

    expect(getFiles).toHaveBeenCalledTimes(2);
    expect(catalog.entries.map((entry) => entry.file.path)).toEqual([
      'notes/A.md',
      'notes/B.md',
    ]);
  });
});
