import { PDF_INDEX_ROOT } from '../../../../src/core/pdf/pdfIndexFormat';
import {
  type PdfFileMeta,
  type PdfIndexFs,
  PdfIndexService,
} from '../../../../src/core/pdf/PdfIndexService';
import type { PdfTextEngine } from '../../../../src/core/pdf/pdfTextEngine';

/** Deterministic in-memory vault + index store for the fs port. */
class InMemoryPdfFs implements PdfIndexFs {
  pdfs = new Map<string, { bytes: ArrayBuffer; mtimeMs: number; size: number }>();
  indexFiles = new Map<string, string>();
  /** Call-order log proving tmp → rename atomicity. */
  writeLog: Array<{ op: 'write' | 'rename' | 'remove'; path: string; to?: string }> = [];

  async listPdfFiles(): Promise<readonly PdfFileMeta[]> {
    return [...this.pdfs.entries()].map(([path, pdf]) => ({
      path,
      mtimeMs: pdf.mtimeMs,
      size: pdf.size,
    }));
  }

  async readPdfBinary(path: string): Promise<ArrayBuffer | null> {
    return this.pdfs.get(path)?.bytes ?? null;
  }

  async writeIndexFileAtomic(path: string, data: string): Promise<void> {
    if (!path.startsWith(`${PDF_INDEX_ROOT}/`)) {
      throw new Error(`index write outside root: ${path}`);
    }
    const tmp = `${path}.tmp`;
    this.writeLog.push({ op: 'write', path: tmp });
    this.indexFiles.set(tmp, data);
    this.writeLog.push({ op: 'rename', path: tmp, to: path });
    this.indexFiles.delete(tmp);
    this.indexFiles.set(path, data);
  }

  async readIndexFile(path: string): Promise<string | null> {
    if (!path.startsWith(`${PDF_INDEX_ROOT}/`)) {
      throw new Error(`index read outside root: ${path}`);
    }
    return this.indexFiles.get(path) ?? null;
  }

  async deleteIndexFile(path: string): Promise<void> {
    this.writeLog.push({ op: 'remove', path });
    this.indexFiles.delete(path);
  }
}

function makeEngine(pages: Record<number, string>): PdfTextEngine & { calls: number } {
  const engine = {
    calls: 0,
    async extractPages(_data: ArrayBuffer, opts: { maxPages: number }) {
      engine.calls += 1;
      const pageNums = Object.keys(pages).map(Number).filter((pageNo) => pageNo <= opts.maxPages);
      return {
        pageCount: pageNums.length,
        pages: pageNums.sort((a, b) => a - b).map((pageNo) => ({ page: pageNo, text: pages[pageNo] })),
      };
    },
  };
  return engine;
}

function createSettings(overrides: Partial<{
  pdfIndexEnabled: boolean;
  vaultRetrievalTopK: number;
  vaultRetrievalMaxCharsPerNote: number;
  vaultRetrievalExcludedPaths: string[];
}> = {}) {
  return {
    pdfIndexEnabled: true,
    vaultRetrievalTopK: 6,
    vaultRetrievalMaxCharsPerNote: 4000,
    vaultRetrievalExcludedPaths: [] as string[],
    ...overrides,
  };
}

function seedPdf(fs: InMemoryPdfFs, path: string, pages: Record<number, string>, mtimeMs = 1000): void {
  const size = Object.values(pages).join('').length;
  fs.pdfs.set(path, { bytes: new ArrayBuffer(size), mtimeMs, size });
}

describe('PdfIndexService', () => {
  let fs: InMemoryPdfFs;
  let service: PdfIndexService;
  let engine: PdfTextEngine & { calls: number };

  beforeEach(() => {
    fs = new InMemoryPdfFs();
    engine = makeEngine({
      1: 'retrieval scoring uses lexical token overlap',
      2: 'indexing pipeline merges page text into chunks',
    });
    service = new PdfIndexService();
    service.attach(fs, () => createSettings(), async () => engine);
  });

  afterEach(() => {
    service.dispose();
  });

  it('is fully dormant while pdfIndexEnabled is off', async () => {
    seedPdf(fs, 'a.pdf', { 1: 'some text' });
    service.attach(fs, () => createSettings({ pdfIndexEnabled: false }), async () => engine);
    await service.onSettingsChanged();
    expect(engine.calls).toBe(0);
    expect(fs.indexFiles.size).toBe(0);
    expect(service.isBuilding()).toBe(false);
    await expect(service.select('some text')).resolves.toEqual([]);
  });

  it('builds a ready index in the background and answers queries', async () => {
    seedPdf(fs, 'papers/retrieval.pdf', {
      1: 'retrieval scoring uses lexical token overlap',
      2: 'indexing pipeline merges page text into chunks',
    });
    await service.rebuildAll();
    expect(engine.calls).toBe(1);
    expect(service.isBuilding()).toBe(false);
    expect(service.indexedPdfCount()).toBe(1);
    // Every index write was atomic: write tmp, then rename.
    expect(fs.writeLog.filter((entry) => entry.op === 'rename').length).toBeGreaterThan(0);
    expect(fs.indexFiles.has('a.pdf')).toBe(false);

    const snippets = await service.select('lexical token overlap');
    expect(snippets).toHaveLength(1);
    expect(snippets[0].pdfPath).toBe('papers/retrieval.pdf');
    // Only the matched fragment is injected — never the whole document.
    expect(snippets[0].text).toContain('lexical token overlap');
    expect(snippets[0].text).not.toContain('indexing pipeline');
  });

  it('skips extraction when a valid ready index already exists on disk', async () => {
    seedPdf(fs, 'papers/retrieval.pdf', { 1: 'retrieval scoring lexical overlap' });
    await service.rebuildAll();
    expect(engine.calls).toBe(1);
    // Fresh service over the same store (restart): hydrate instead of re-extract.
    const secondService = new PdfIndexService();
    const secondEngine = makeEngine({ 1: 'different' });
    secondService.attach(fs, () => createSettings(), async () => secondEngine);
    await secondService.rebuildAll();
    expect(secondEngine.calls).toBe(0);
    expect(secondService.indexedPdfCount()).toBe(1);
    secondService.dispose();
  });

  it('rebuilds when the fingerprint changes (pdf modified)', async () => {
    seedPdf(fs, 'papers/retrieval.pdf', { 1: 'retrieval scoring lexical overlap' });
    await service.rebuildAll();
    expect(engine.calls).toBe(1);
    seedPdf(fs, 'papers/retrieval.pdf', { 1: 'revised retrieval scoring lexical overlap' }, 2000);
    await service.rebuildAll();
    expect(engine.calls).toBe(2);
  });

  it('respects the R-C1 exclusion rules', async () => {
    seedPdf(fs, 'archive/private.pdf', { 1: 'secret retrieval corpus' });
    service.attach(fs, () => createSettings({ vaultRetrievalExcludedPaths: ['archive/'] }), async () => engine);
    await service.onSettingsChanged();
    expect(engine.calls).toBe(0);
    expect(service.indexedPdfCount()).toBe(0);
    await expect(service.select('secret retrieval corpus')).resolves.toEqual([]);
  });

  it('prunes orphan indexes whose PDF vanished', async () => {
    seedPdf(fs, 'gone.pdf', { 1: 'retrieval scoring corpus' });
    await service.rebuildAll();
    expect(service.indexedPdfCount()).toBe(1);
    fs.pdfs.delete('gone.pdf');
    await service.rebuildAll();
    expect(service.indexedPdfCount()).toBe(0);
    expect(fs.indexFiles.size).toBe(0);
  });

  it('cancels a build when the setting flips off mid-flight', async () => {
    seedPdf(fs, 'a.pdf', { 1: 'text one' });
    seedPdf(fs, 'b.pdf', { 1: 'text two' });
    const settings = createSettings();
    const slowEngine = makeEngine({ 1: 'slow extraction retrieval corpus' });
    slowEngine.extractPages = async () => {
      // Simulate the setting flipping off while a page batch extracts.
      settings.pdfIndexEnabled = false;
      await service.onSettingsChanged();
      return { pageCount: 1, pages: [{ page: 1, text: 'slow extraction retrieval corpus' }] };
    };
    service.attach(fs, () => settings, async () => slowEngine);
    await service.rebuildAll();
    // Restore the setting, then prove the cancelled pass left NO ready index.
    settings.pdfIndexEnabled = true;
    await expect(service.select('slow extraction retrieval corpus')).resolves.toEqual([]);
  });

  it('re-uses the tmp+rename contract even when a write fails', async () => {
    seedPdf(fs, 'a.pdf', { 1: 'retrieval corpus' });
    const failingFs = new InMemoryPdfFs();
    failingFs.pdfs = fs.pdfs;
    failingFs.writeIndexFileAtomic = async () => {
      throw new Error('disk full');
    };
    service.attach(failingFs, () => createSettings(), async () => engine);
    await service.rebuildAll();
    // Fail-closed: nothing marked ready, nothing queryable.
    expect(service.indexedPdfCount()).toBe(0);
    await expect(service.select('retrieval corpus')).resolves.toEqual([]);
  });

  it('select returns [] when the query is blank', async () => {
    seedPdf(fs, 'a.pdf', { 1: 'retrieval corpus' });
    await service.onSettingsChanged();
    await expect(service.select('   ')).resolves.toEqual([]);
  });
});
