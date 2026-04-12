import { TFile } from 'obsidian';

import { ContextFileCatalogIndex } from '../../../../src/features/chat/services/ContextFileCatalogIndex';

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

describe('ContextFileCatalogIndex', () => {
  it('finalizes a sorted eligible catalog after batched build appends', () => {
    const index = new ContextFileCatalogIndex();

    index.appendBuildFile(createFile('notes/B.txt'));
    index.appendBuildFile(createFile('notes/A.md'));
    index.appendBuildFile(createFile('assets/image.png'));
    index.appendBuildFile(createFile('.obsidian/config.json'));
    index.appendBuildFile(createFile('notes/no-extension'));
    index.finalizeBuild();

    const catalog = index.getCatalog();
    expect(catalog.entries.map((entry) => entry.file.path)).toEqual([
      'notes/A.md',
      'assets/image.png',
      'notes/B.txt',
    ]);
    expect(catalog.extensions).toEqual([
      { value: 'md', count: 1 },
      { value: 'png', count: 1 },
      { value: 'txt', count: 1 },
    ]);
  });

  it('keeps entries sorted while applying create, rename, and delete mutations', () => {
    const index = new ContextFileCatalogIndex();
    index.appendBuildFile(createFile('notes/A.md'));
    index.appendBuildFile(createFile('notes/B.txt'));
    index.finalizeBuild();

    index.upsertFile(createFile('notes/C.md'));
    index.renameFile(createFile('notes/Z.md'), 'notes/A.md');
    index.removePath('notes/C.md');

    const catalog = index.getCatalog();
    expect(catalog.entries.map((entry) => entry.file.path)).toEqual([
      'notes/Z.md',
      'notes/B.txt',
    ]);
    expect(catalog.extensions).toEqual([
      { value: 'md', count: 1 },
      { value: 'txt', count: 1 },
    ]);
  });

  it('drops renamed entries that no longer qualify for the context picker', () => {
    const index = new ContextFileCatalogIndex();
    index.appendBuildFile(createFile('notes/A.md'));
    index.finalizeBuild();

    index.renameFile(createFile('notes/no-extension'), 'notes/A.md');

    expect(index.getCatalog()).toEqual({
      entries: [],
      extensions: [],
    });
  });
});
