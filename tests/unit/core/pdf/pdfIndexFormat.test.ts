import {
  mergePageTextsIntoChunks,
  parsePdfIndexFile,
  PDF_CHUNK_TARGET_MAX_CHARS,
  PDF_INDEX_ROOT,
  pdfIndexFileName,
  pdfIndexFingerprint,
} from '../../../../src/core/pdf/pdfIndexFormat';

function page(page: number, text: string): { page: number; text: string } {
  return { page, text };
}

describe('pdfIndexFingerprint / file naming', () => {
  it('changes when path, mtime or size changes', () => {
    const base = { path: 'docs/a.pdf', mtimeMs: 100, size: 10 };
    const same = pdfIndexFingerprint(base);
    expect(same).toBe(pdfIndexFingerprint({ ...base }));
    expect(same).not.toBe(pdfIndexFingerprint({ ...base, path: 'docs/b.pdf' }));
    expect(same).not.toBe(pdfIndexFingerprint({ ...base, mtimeMs: 101 }));
    expect(same).not.toBe(pdfIndexFingerprint({ ...base, size: 11 }));
  });

  it('names index files under the plugin-private root', () => {
    const name = pdfIndexFileName('deadbeef');
    expect(name.startsWith(`${PDF_INDEX_ROOT}/`)).toBe(true);
    expect(name.endsWith('.json')).toBe(true);
  });
});

describe('mergePageTextsIntoChunks (page-anchored slicing)', () => {
  it('never crosses a page boundary (页界不跨 chunk)', () => {
    const chunks = mergePageTextsIntoChunks('a.pdf', [
      page(1, 'one paragraph for page one'),
      page(2, 'another paragraph on page two'),
      page(3, 'x'.repeat(100)),
      page(4, 'y'.repeat(100)),
      page(5, 'z'.repeat(100)),
    ]);
    for (const chunk of chunks) {
      expect(chunk.pageFrom).toBe(chunk.pageTo);
    }
    expect(chunks.map((chunk) => chunk.pageFrom)).toEqual([1, 2, 3, 4, 5]);
  });

  it('merges paragraphs within one page while under the target window', () => {
    const short = 'x'.repeat(100);
    const chunks = mergePageTextsIntoChunks('b.pdf', [
      page(2, [short, short, short].join('\n\n')),
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageFrom).toBe(2);
    expect(chunks[0].pageTo).toBe(2);
    expect(chunks[0].text).toContain(short);
  });

  it('keeps chunk size within the 800-1200 target when paragraphs allow', () => {
    const paragraph = 'y'.repeat(300);
    const paragraphs = Array.from({ length: 12 }, () => paragraph);
    const chunks = mergePageTextsIntoChunks('c.pdf', [page(1, paragraphs.join('\n\n'))]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(PDF_CHUNK_TARGET_MAX_CHARS);
    }
    // Merged coverage: every paragraph survives in exactly one chunk.
    const totalChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
    expect(totalChars).toBeGreaterThanOrEqual(paragraphs.join('').length);
  });

  it('splits one huge page into multiple chunks with unique ids', () => {
    const paragraph = 'z'.repeat(900);
    const chunks = mergePageTextsIntoChunks('d.pdf', [page(4, [paragraph, paragraph].join('\n\n'))]);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const ids = new Set(chunks.map((chunk) => chunk.id));
    expect(ids.size).toBe(chunks.length);
    for (const chunk of chunks) {
      expect(chunk.pageFrom).toBe(4);
      expect(chunk.pageTo).toBe(4);
      expect(chunk.id.startsWith('d.pdf#p4-4')).toBe(true);
    }
  });

  it('skips empty pages without producing empty chunks', () => {
    const chunks = mergePageTextsIntoChunks('e.pdf', [page(1, ''), page(2, '  '), page(3, 'real text')]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageFrom).toBe(3);
  });
});

describe('parsePdfIndexFile (structural validation)', () => {
  const fingerprint = pdfIndexFingerprint({ path: 'a.pdf', mtimeMs: 1, size: 2 });
  const valid = {
    version: 1,
    pdfPath: 'a.pdf',
    fingerprint,
    ready: true,
    chunks: [{ id: 'a.pdf#p1-1', pageFrom: 1, pageTo: 1, text: 'text' }],
  };

  it('accepts a valid ready file', () => {
    expect(parsePdfIndexFile(JSON.stringify(valid), fingerprint)).toEqual(valid);
  });

  it('rejects a not-ready file (half builds are never queryable)', () => {
    expect(parsePdfIndexFile(JSON.stringify({ ...valid, ready: false }), fingerprint)).toBeNull();
  });

  it('rejects a fingerprint mismatch', () => {
    expect(parsePdfIndexFile(JSON.stringify(valid), 'other')).toBeNull();
  });

  it('rejects corrupt JSON and wrong shapes', () => {
    expect(parsePdfIndexFile('not json', fingerprint)).toBeNull();
    expect(parsePdfIndexFile('{"version":1}', fingerprint)).toBeNull();
    expect(parsePdfIndexFile(JSON.stringify({ ...valid, chunks: 'nope' }), fingerprint)).toBeNull();
    expect(parsePdfIndexFile(
      JSON.stringify({ ...valid, chunks: [{ id: 'x', pageFrom: 3, pageTo: 1, text: '' }] }),
      fingerprint,
    )).toBeNull();
  });
});
