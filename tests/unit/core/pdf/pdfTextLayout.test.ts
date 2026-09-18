import {
  assessTextLayer,
  checkAttachLimits,
  pageTextFromLines,
  rebuildPageLines,
  TEXT_LAYER_MIN_CHARS,
  TEXT_LAYER_MIN_PAGE_RATIO,
} from '../../../../src/core/pdf/pdfTextLayout';

function item(str: string, x: number, y: number) {
  return { str, transform: [1, 0, 0, 1, x, y], hasEOL: false };
}

describe('rebuildPageLines (R-C4 line reconstruction)', () => {
  it('joins items on the same baseline in x order', () => {
    const lines = rebuildPageLines([item('World', 200, 100), item('Hello', 72, 100)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('HelloWorld');
    expect(lines[0].y).toBe(100);
  });

  it('orders lines top-down even when content-stream order is reversed', () => {
    const lines = rebuildPageLines([item('bottom', 72, 50), item('top', 72, 300)]);
    expect(lines.map((line) => line.text)).toEqual(['top', 'bottom']);
  });

  it('tolerates small baseline jitter (superscripts) within a line', () => {
    const lines = rebuildPageLines([item('H', 72, 100), item('2', 79, 101.5), item('O', 84, 100)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('H2O');
  });

  it('produces a deterministic (next-best) merge for multi-column pages', () => {
    const left = [item('alpha one', 72, 700), item('alpha two', 72, 680)];
    const right = [item('beta one', 320, 700), item('beta two', 320, 680)];
    const first = rebuildPageLines([...right, ...left]);
    const second = rebuildPageLines([...left, ...right]);
    expect(first).toEqual(second);
    expect(first[0].text).toBe('alpha onebeta one');
  });

  it('drops empty items and empty lines', () => {
    const lines = rebuildPageLines([item('', 72, 100), item('   ', 80, 100), item('kept', 72, 90)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('kept');
  });

  it('pageTextFromLines joins with newlines', () => {
    expect(pageTextFromLines([{ y: 2, text: 'a' }, { y: 1, text: 'b' }])).toBe('a\nb');
  });
});

describe('assessTextLayer (fail-closed textless verdict)', () => {
  it('rejects a scan with almost no text on almost every page', () => {
    const pages = Array.from({ length: 10 }, (_, i) => (i === 0 ? ' a ' : ''));
    const verdict = assessTextLayer(pages);
    expect(verdict.extractedChars).toBeLessThan(TEXT_LAYER_MIN_CHARS);
    expect(verdict.pagesWithText / verdict.totalPages).toBeLessThan(TEXT_LAYER_MIN_PAGE_RATIO);
    expect(verdict.textLayerPresent).toBe(false);
  });

  it('rejects the empty document', () => {
    const verdict = assessTextLayer(['', '']);
    expect(verdict.textLayerPresent).toBe(false);
    expect(verdict.extractedChars).toBe(0);
  });

  it('keeps a document with plenty of text on few pages', () => {
    const page = 'x'.repeat(TEXT_LAYER_MIN_CHARS + 5);
    const verdict = assessTextLayer([page, '', '', '', '', '', '', '', '', '']);
    expect(verdict.pagesWithText / verdict.totalPages).toBeLessThan(TEXT_LAYER_MIN_PAGE_RATIO);
    expect(verdict.textLayerPresent).toBe(true);
  });

  it('keeps a short but wide document (ratio high, chars low)', () => {
    const verdict = assessTextLayer(['ab', 'cd', 'ef']);
    expect(verdict.extractedChars).toBeLessThan(TEXT_LAYER_MIN_CHARS);
    expect(verdict.textLayerPresent).toBe(true);
  });

  it('rejects a long scanned document with stray artifacts', () => {
    const pages = Array.from({ length: 100 }, (_, i) => (i === 3 ? 'x'.repeat(10) : ''));
    const verdict = assessTextLayer(pages);
    expect(verdict.extractedChars).toBeLessThan(TEXT_LAYER_MIN_CHARS);
    expect(verdict.pagesWithText / verdict.totalPages).toBeLessThan(TEXT_LAYER_MIN_PAGE_RATIO);
    expect(verdict.textLayerPresent).toBe(false);
  });
});

describe('checkAttachLimits (one-shot attach caps)', () => {
  it('passes a document within both budgets', () => {
    expect(checkAttachLimits({ pageCount: 10, charCount: 5000 })).toBeNull();
  });

  it('refuses over the page budget', () => {
    const rejection = checkAttachLimits({ pageCount: 151, charCount: 10 });
    expect(rejection).toEqual({ reason: 'too-many-pages', pageCount: 151, maxPages: 150 });
  });

  it('refuses over the character budget', () => {
    const rejection = checkAttachLimits({ pageCount: 3, charCount: 120_001 });
    expect(rejection).toEqual({ reason: 'too-many-chars', charCount: 120_001, maxChars: 120_000 });
  });

  it('honours injected budgets (test seam mirrors module constants)', () => {
    expect(checkAttachLimits({ pageCount: 2, charCount: 0, maxPages: 1 })).not.toBeNull();
    expect(checkAttachLimits({ pageCount: 1, charCount: 5, maxChars: 4 })).toEqual({
      reason: 'too-many-chars',
      charCount: 5,
      maxChars: 4,
    });
  });
});
