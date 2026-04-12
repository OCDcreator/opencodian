import { TFile } from 'obsidian';

import { ContextFileCatalogBuildRunner } from '../../../../src/features/chat/services/ContextFileCatalogBuildRunner';

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

describe('ContextFileCatalogBuildRunner', () => {
  it('builds a sorted eligible catalog while yielding between scan batches', async () => {
    const yieldControl = jest.fn(async () => undefined);
    const runner = new ContextFileCatalogBuildRunner({
      batchSize: 2,
      yieldControl,
    });

    const catalogIndex = await runner.buildIndex([
      createFile('notes/B.txt'),
      createFile('notes/A.md'),
      createFile('.obsidian/config.json'),
      createFile('assets/image.png'),
      createFile('notes/no-extension'),
    ]);

    expect(yieldControl).toHaveBeenCalledTimes(2);
    expect(catalogIndex.getCatalog()).toEqual({
      entries: [
        expect.objectContaining({ file: expect.objectContaining({ path: 'notes/A.md' }) }),
        expect.objectContaining({ file: expect.objectContaining({ path: 'assets/image.png' }) }),
        expect.objectContaining({ file: expect.objectContaining({ path: 'notes/B.txt' }) }),
      ],
      extensions: [
        { value: 'md', count: 1 },
        { value: 'png', count: 1 },
        { value: 'txt', count: 1 },
      ],
    });
  });

  it('skips yielding when the scan completes in one batch', async () => {
    const yieldControl = jest.fn(async () => undefined);
    const runner = new ContextFileCatalogBuildRunner({
      batchSize: 10,
      yieldControl,
    });

    await runner.buildIndex([
      createFile('notes/A.md'),
      createFile('notes/B.txt'),
    ]);

    expect(yieldControl).not.toHaveBeenCalled();
  });
});
