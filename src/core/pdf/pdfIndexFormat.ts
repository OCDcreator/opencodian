/**
 * PDF local index format (R-C4 phase 2, flowtext-c4-design §3.2).
 *
 * Per-page-anchored chunk table stored under the plugin-private
 * `.opencodian/pdf-index/` directory — a dot-prefixed path Obsidian never
 * lists or searches. Scoring/injection reuse the R-C1 retrieval core
 * (`core.memory`); this module only defines the PDF-side storage shape:
 * slices of the extracted text layer, page-anchored, page boundaries never
 * crossed, written atomically (tmp → rename) with a `ready` flag so a half
 * built index is never queryable.
 */

import { createHash } from 'node:crypto';

/** Vault-relative root of the PDF index (plugin data, hidden from Obsidian). */
export const PDF_INDEX_ROOT = '.opencodian/pdf-index';

/** Target chunk size window in characters (design §3.2). */
export const PDF_CHUNK_TARGET_MIN_CHARS = 800;
export const PDF_CHUNK_TARGET_MAX_CHARS = 1200;
/** One page-anchored slice of a PDF's text layer. */
export interface PdfIndexChunk {
  /** `"<pdfPath>#<pageFrom>-<pageTo>"` — stable within one fingerprint. */
  id: string;
  pageFrom: number;
  pageTo: number;
  text: string;
}

/** On-disk index file for one PDF. */
export interface PdfIndexFile {
  version: 1;
  pdfPath: string;
  /** sha-1(path + mtime + size); mismatch ⇒ full rebuild. */
  fingerprint: string;
  /** Set true only after the complete chunk table is durable. */
  ready: boolean;
  chunks: PdfIndexChunk[];
}

/**
 * Fingerprint of a PDF's vault state: path + mtime + size. Any change
 * invalidates the index and triggers a rebuild.
 */
export function pdfIndexFingerprint(input: {
  path: string;
  mtimeMs: number;
  size: number;
}): string {
  return createHash('sha1')
    .update(`${input.path}\u0000${input.mtimeMs}\u0000${input.size}`, 'utf8')
    .digest('hex');
}

/** Index file name for a fingerprint (flat directory). */
export function pdfIndexFileName(fingerprint: string): string {
  return `${PDF_INDEX_ROOT}/${fingerprint}.json`;
}

/**
 * Merge per-page text into index chunks of `PDF_CHUNK_TARGET_MIN..MAX`
 * characters. A chunk never crosses a page boundary (design test plan:
 * "页界不跨 chunk") — accumulation restarts at every page, and inside a page
 * the split points are paragraph boundaries. A single paragraph larger than
 * `maxChars` becomes one oversized chunk rather than being cut mid-block.
 * Chunk ids follow the design's `"<pdfPath>#<page anchor>"` shape; repeated
 * anchors (one huge page split into several chunks) get a sequence suffix.
 */
export function mergePageTextsIntoChunks(
  pdfPath: string,
  pages: readonly { page: number; text: string }[],
  minChars: number = PDF_CHUNK_TARGET_MIN_CHARS,
  maxChars: number = PDF_CHUNK_TARGET_MAX_CHARS,
): PdfIndexChunk[] {
  const chunks: PdfIndexChunk[] = [];

  const flushPageGroup = (pageNo: number, parts: string[], chars: number) => {
    if (parts.length === 0 || chars === 0) {
      return;
    }
    chunks.push({
      id: '',
      pageFrom: pageNo,
      pageTo: pageNo,
      text: parts.join('\n\n').trim(),
    });
  };

  for (const page of pages) {
    const paragraphs = page.text
      .split(/\n{2,}/u)
      .map((part) => part.trim())
      .filter((part) => part !== '');
    let parts: string[] = [];
    let chars = 0;
    for (const paragraph of paragraphs) {
      const separatorCost = parts.length > 0 ? 2 : 0;
      if (parts.length > 0 && chars + separatorCost + paragraph.length > maxChars
        && chars >= minChars) {
        flushPageGroup(page.page, parts, chars);
        parts = [];
        chars = 0;
      }
      parts.push(paragraph);
      chars += (parts.length > 1 ? 2 : 0) + paragraph.length;
    }
    flushPageGroup(page.page, parts, chars);
  }

  const anchorCounts = new Map<string, number>();
  return chunks.map((chunk) => {
    const anchor = `p${chunk.pageFrom}-${chunk.pageTo}`;
    const occurrence = anchorCounts.get(anchor) ?? 0;
    anchorCounts.set(anchor, occurrence + 1);
    return {
      ...chunk,
      id: occurrence === 0 ? `${pdfPath}#${anchor}` : `${pdfPath}#${anchor}#${occurrence}`,
    };
  });
}

/** Structural validation for a parsed index file (corrupt ⇒ rebuild). */
export function parsePdfIndexFile(raw: string, expectedFingerprint: string): PdfIndexFile | null {
  try {
    const parsed = JSON.parse(raw) as PdfIndexFile;
    if (
      parsed
      && parsed.version === 1
      && typeof parsed.pdfPath === 'string'
      && parsed.pdfPath !== ''
      && parsed.fingerprint === expectedFingerprint
      && parsed.ready === true
      && Array.isArray(parsed.chunks)
      && parsed.chunks.every((chunk) =>
        typeof chunk?.id === 'string'
        && typeof chunk?.text === 'string'
        && typeof chunk?.pageFrom === 'number'
        && typeof chunk?.pageTo === 'number'
        && chunk.pageFrom >= 1
        && chunk.pageTo >= chunk.pageFrom)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
