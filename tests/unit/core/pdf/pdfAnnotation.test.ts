import {
  annotationsSidecarPathFor,
  buildAnnotationEntry,
  pdfSelectionLink,
} from '../../../../src/core/pdf/pdfAnnotation';
import { PDF_SELECTION_EXCERPT_MAX_CHARS } from '../../../../src/shared';

const NOON = new Date(2026, 8, 18, 12, 0); // 2026-09-18 12:00 local

function payload(overrides: Partial<Parameters<typeof buildAnnotationEntry>[0]> = {}) {
  return {
    timestamp: NOON,
    pdfPath: 'docs/file.pdf',
    selection: {
      page: 3,
      text: 'selected original text',
      rangeStr: '0,12,45,88',
    },
    question: 'What does this say?',
    answer: 'It says hello.',
    ...overrides,
  };
}

describe('annotationsSidecarPathFor (design D2)', () => {
  it('sits next to the PDF with the fixed template', () => {
    expect(annotationsSidecarPathFor('docs/file.pdf')).toBe('docs/file.annotations.md');
    expect(annotationsSidecarPathFor('report.pdf')).toBe('report.annotations.md');
  });

  it('only replaces the extension, never a dot inside a folder name', () => {
    expect(annotationsSidecarPathFor('my.dir/book.pdf')).toBe('my.dir/book.annotations.md');
    expect(annotationsSidecarPathFor('noext')).toBe('noext.annotations.md');
  });

  it('normalizes windows separators', () => {
    expect(annotationsSidecarPathFor('docs\\file.pdf')).toBe('docs/file.annotations.md');
  });
});

describe('pdfSelectionLink', () => {
  it('carries the page and the native selection sub-path', () => {
    expect(pdfSelectionLink(payload())).toBe('[[docs/file.pdf#page=3&selection=0,12,45,88]]');
  });

  it('degrades to a page-only link without rangeStr', () => {
    const link = pdfSelectionLink(payload({ selection: { page: 7, text: 'x' } }));
    expect(link).toBe('[[docs/file.pdf#page=7]]');
  });
});

describe('buildAnnotationEntry', () => {
  it('renders timestamp, link, excerpt and Q/A in the documented shape', () => {
    const entry = buildAnnotationEntry(payload());
    expect(entry).toBe(
      '- 2026-09-18 12:00 · [[docs/file.pdf#page=3&selection=0,12,45,88]]\n'
      + '  > selected original text\n'
      + '  - **问**：What does this say?\n'
      + '  - **答**：It says hello.\n',
    );
  });

  it('truncates the excerpt at the shared 200-char cap on a word boundary', () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const entry = buildAnnotationEntry(payload({ selection: { page: 1, text: words } }));
    const excerptLine = entry.split('\n')[1];
    const excerpt = excerptLine.replace('  > ', '');
    expect(excerpt.length).toBeLessThanOrEqual(PDF_SELECTION_EXCERPT_MAX_CHARS + 1);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toMatch(/word\d?$/);
  });

  it('collapses multi-line Q/A onto indented continuation lines', () => {
    const entry = buildAnnotationEntry(payload({
      question: 'Line one\nLine two',
      answer: 'Answer one\n\nAnswer two',
    }));
    expect(entry).toContain('  - **问**：Line one\n  Line two');
    expect(entry).toContain('  - **答**：Answer one\n  Answer two');
  });

  it('keeps a placeholder for empty answers so the entry stays parseable', () => {
    const entry = buildAnnotationEntry(payload({ answer: '  ' }));
    expect(entry).toContain('- **答**：（无）');
  });
});
