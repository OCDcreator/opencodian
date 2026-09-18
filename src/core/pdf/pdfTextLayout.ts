/**
 * Pure PDF text-layer layout rules (R-C4 phase 1, flowtext-c4-design §3.1).
 *
 * These functions are engine-independent: they operate on the plain
 * `getTextContent()` item shape pdf.js returns, so the line-rebuild and
 * textless-verdict logic is unit-testable without loading the (lazy, MB
 * sized) pdf.js bundle. The engine entry (`pdfEngineEntry.ts`) calls these
 * after extracting each page's items.
 *
 * Fail-closed verdict (design §3.1 step 3): a document whose total extracted
 * character count is under `TEXT_LAYER_MIN_CHARS` AND whose share of pages
 * with any text is under `TEXT_LAYER_MIN_PAGE_RATIO` is treated as having no
 * text layer (a scan) — it never becomes a context item.
 */

/** One `getTextContent()` item, narrowed to what line rebuilding needs. */
export interface PdfTextItem {
  str: string;
  /** pdf.js transform matrix; `transform[5]` is the baseline y coordinate. */
  transform: readonly number[];
  hasEOL?: boolean;
}

/** A rebuilt line: joined text plus the y coordinate it was clustered at. */
export interface PdfTextLine {
  y: number;
  text: string;
}

/** Minimum total characters for the text layer to be considered present. */
export const TEXT_LAYER_MIN_CHARS = 32;

/** Minimum share of pages with any text for the text layer to count. */
export const TEXT_LAYER_MIN_PAGE_RATIO = 0.2;

/** One-shot attach limits (module constants per design — no new settings). */
export const PDF_ATTACH_MAX_PAGES = 150;
/** One-shot attach character budget for the whole document. */
export const PDF_ATTACH_MAX_CHARS = 120_000;

/**
 * Cluster text items into visual lines by baseline y coordinate. pdf.js
 * emits items in content-stream order, which is not reading order; grouping
 * by y (with a small tolerance for superscripts/subscripts) and sorting each
 * line's items by x gives a stable, deterministic reconstruction. Multi-column
 * pages produce a "next-best" deterministic merge (columns interleave at
 * shared baselines) — acceptable for reference context and covered by tests
 * so the behavior is pinned.
 */
export function rebuildPageLines(items: readonly PdfTextItem[]): PdfTextLine[] {
  interface Bucket {
    y: number;
    entries: Array<{ x: number; text: string }>;
  }
  const buckets: Bucket[] = [];
  for (const item of items) {
    if (!item.str) {
      continue;
    }
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    // Line pitch tolerance: items within 2 units of an existing baseline join
    // that line (pdf.js baselines are consistent within a rendered line).
    const bucket = buckets.find((candidate) => Math.abs(candidate.y - y) <= 2);
    if (bucket) {
      bucket.entries.push({ x, text: item.str });
    } else {
      buckets.push({ y, entries: [{ x, text: item.str }] });
    }
  }
  // Reading order: top of the page first (pdf.js y grows upward).
  buckets.sort((a, b) => b.y - a.y);
  return buckets.map((bucket) => ({
    y: bucket.y,
    text: bucket.entries
      .sort((a, b) => a.x - b.x)
      .map((entry) => entry.text)
      .join('')
      .replace(/\s+/gu, ' ')
      .trim(),
  })).filter((line) => line.text !== '');
}

/** Join rebuilt lines into the page's plain text (blank lines dropped). */
export function pageTextFromLines(lines: readonly PdfTextLine[]): string {
  return lines.map((line) => line.text).join('\n');
}

export interface TextLayerAssessment {
  textLayerPresent: boolean;
  totalPages: number;
  pagesWithText: number;
  extractedChars: number;
}

/**
 * Fail-closed textless verdict (design §3.1 step 3): total chars < 32 AND
 * pages-with-text ratio < 20% → no text layer. Either signal alone is not
 * enough (a one-page note-style PDF can have < 32 chars; a long document can
 * have a low ratio while still being mostly text).
 */
export function assessTextLayer(pageTexts: readonly string[]): TextLayerAssessment {
  const pagesWithText = pageTexts.filter((text) => text.trim() !== '').length;
  const extractedChars = pageTexts.reduce((sum, text) => sum + text.trim().length, 0);
  const totalPages = pageTexts.length;
  const ratio = totalPages > 0 ? pagesWithText / totalPages : 0;
  return {
    textLayerPresent: !(extractedChars < TEXT_LAYER_MIN_CHARS && ratio < TEXT_LAYER_MIN_PAGE_RATIO),
    totalPages,
    pagesWithText,
    extractedChars,
  };
}

/** Failure reasons for the one-shot attach preconditions (fail-closed). */
export type PdfAttachRejection =
  | { reason: 'too-many-pages'; pageCount: number; maxPages: number }
  | { reason: 'too-many-chars'; charCount: number; maxChars: number };

/**
 * One-shot attach limits (design §3.1 step 4): a document over the page or
 * character budget is refused with an actionable message — never silently
 * truncated; the local index (phase 2) is the intended path for it.
 */
export function checkAttachLimits(input: {
  pageCount: number;
  charCount: number;
  maxPages?: number;
  maxChars?: number;
}): PdfAttachRejection | null {
  const maxPages = input.maxPages ?? PDF_ATTACH_MAX_PAGES;
  const maxChars = input.maxChars ?? PDF_ATTACH_MAX_CHARS;
  if (input.pageCount > maxPages) {
    return { reason: 'too-many-pages', pageCount: input.pageCount, maxPages };
  }
  if (input.charCount > maxChars) {
    return { reason: 'too-many-chars', charCount: input.charCount, maxChars };
  }
  return null;
}
