import { tokenize } from '../../../../src/core/memory/memoryRecall';
import type { PdfIndexFile } from '../../../../src/core/pdf/pdfIndexFormat';
import {
  pdfTitleOf,
  scorePdfChunk,
  selectPdfSnippets,
} from '../../../../src/core/pdf/pdfIndexScoring';

function makeFile(overrides: Partial<PdfIndexFile> = {}): PdfIndexFile {
  return {
    version: 1,
    pdfPath: 'papers/deep-retrieval.pdf',
    fingerprint: 'fp',
    ready: true,
    chunks: [
      { id: 'papers/deep-retrieval.pdf#p1-1', pageFrom: 1, pageTo: 1, text: 'retrieval scoring uses lexical token overlap' },
      { id: 'papers/deep-retrieval.pdf#p2-2', pageFrom: 2, pageTo: 2, text: 'indexing pipeline merges page text lazily' },
    ],
    ...overrides,
  };
}

describe('pdfTitleOf', () => {
  it('strips the extension and keeps the folder-free name', () => {
    expect(pdfTitleOf('a/b/My Paper.PDF')).toBe('My Paper');
  });
});

describe('scorePdfChunk (R-C1 primitive reuse)', () => {
  it('reuses the memoryRecall tokenizer: latin words and CJK bigrams', () => {
    const hit = scorePdfChunk(['检索'.slice(0, 1) + '索'], [], { text: '中文检索场景' });
    expect(hit.score).toBeGreaterThan(0);
  });

  it('gives title-token hits the top weight', () => {
    const titleTokens = tokenize(pdfTitleOf('papers/deep-retrieval.pdf'));
    const withTitle = scorePdfChunk(['deep'], titleTokens, { text: 'unrelated body' });
    const withBody = scorePdfChunk(['lexical'], titleTokens, { text: 'lexical body' });
    expect(withTitle.score).toBeGreaterThan(withBody.score);
    expect(withTitle.titleHit).toBe(true);
  });
});

describe('selectPdfSnippets', () => {
  it('returns only hit fragments, never the whole document', () => {
    const file = makeFile();
    const snippets = selectPdfSnippets({
      query: 'lexical token overlap',
      files: [file],
      topK: 5,
      maxCharsPerPdf: 4000,
    });
    expect(snippets).toHaveLength(1);
    expect(snippets[0].pageFrom).toBe(1);
    expect(snippets[0].pageTo).toBe(1);
    expect(snippets[0].text).not.toContain('indexing pipeline');
  });

  it('enforces the selection gate: one weak token does not pass', () => {
    const file = makeFile();
    const snippets = selectPdfSnippets({
      query: 'overlap',
      files: [file],
      topK: 5,
      maxCharsPerPdf: 4000,
    });
    expect(snippets).toHaveLength(0);
  });

  it('keeps a chunk with a title hit even for a single token', () => {
    const snippets = selectPdfSnippets({
      query: 'retrieval',
      files: [makeFile()],
      topK: 5,
      maxCharsPerPdf: 4000,
    });
    expect(snippets).toHaveLength(1);
  });

  it('never returns a not-ready file (design ready contract)', () => {
    const snippets = selectPdfSnippets({
      query: 'retrieval scoring lexical token overlap',
      files: [makeFile({ ready: false })],
      topK: 5,
      maxCharsPerPdf: 4000,
    });
    expect(snippets).toHaveLength(0);
  });

  it('truncates a multi-line fragment at the per-pdf cap without cutting a line', () => {
    const line = 'retrieval scoring deep lexicon entry filler';
    const longText = Array.from({ length: 20 }, () => line).join('\n');
    const snippets = selectPdfSnippets({
      query: 'retrieval scoring deep',
      files: [makeFile({ chunks: [{ id: 'c', pageFrom: 1, pageTo: 1, text: longText }] })],
      topK: 5,
      maxCharsPerPdf: 120,
    });
    expect(snippets).toHaveLength(1);
    expect(snippets[0].text.length).toBeLessThanOrEqual(120);
    expect(snippets[0].truncated).toBe(true);
    // Every kept line is complete — no mid-line cut.
    for (const kept of snippets[0].text.split('\n')) {
      expect(kept).toBe(line);
    }
  });

  it('falls back to a prefix cut for one huge paragraph over the cap', () => {
    const huge = 'x'.repeat(500);
    const snippets = selectPdfSnippets({
      query: 'retrieval scoring deep',
      files: [makeFile({ chunks: [{ id: 'c', pageFrom: 1, pageTo: 1, text: huge }] })],
      topK: 5,
      maxCharsPerPdf: 120,
    });
    expect(snippets).toHaveLength(1);
    expect(snippets[0].text).toBe('x'.repeat(120));
    expect(snippets[0].truncated).toBe(true);
  });

  it('applies topK across documents with one snippet per document', () => {
    const files = [
      makeFile(),
      makeFile({ pdfPath: 'other/scoring-notes.pdf', chunks: [{ id: 'o', pageFrom: 1, pageTo: 1, text: 'scoring deep retrieval notes' }] }),
    ];
    const snippets = selectPdfSnippets({
      query: 'deep retrieval scoring',
      files,
      topK: 1,
      maxCharsPerPdf: 4000,
    });
    expect(snippets).toHaveLength(1);
  });

  it('returns [] for an empty query', () => {
    expect(selectPdfSnippets({ query: '  ', files: [makeFile()], topK: 3, maxCharsPerPdf: 1000 })).toEqual([]);
  });
});
