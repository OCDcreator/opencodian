/**
 * PDF index selection — a thin adapter over the R-C1 retrieval core
 * (flowtext-c4-design §3.2 / §11.4: no second retrieval stack).
 *
 * Reused primitives from `core.memory`:
 *  - `tokenize` (memoryRecall): Latin words + CJK bigrams, identical query
 *    semantics with note recall and vault retrieval;
 *  - `scoreChunk` (vaultRetrievalIndex): weighted term overlap with the
 *    count-each-query-token-once rule. The signature is field-based
 *    (title/heading/body token arrays), not line-based, so PDF chunks map
 *    directly: the PDF file name provides the title field, PDF chunks have
 *    no heading field, and the chunk text is the body — no `scoreTokens`
 *    refactor of `core.memory` was needed;
 *  - the selection gate (`MIN_DISTINCT_TOKEN_HITS` / verbatim title hit) and
 *    `isVaultVerbatimHit`;
 *  - `truncateNoteSnippet` for the per-fragment character cap (never cuts
 *    mid-block; PDF text has no fences, and the fence guard is harmless).
 *
 * Top-K semantics mirror `selectVaultSnippets`: one best chunk per document,
 * ordered by score → verbatim → mtime, at most `topK` fragments.
 */

import { tokenize } from '../memory/memoryRecall';
import {
  isVaultVerbatimHit,
  MIN_DISTINCT_TOKEN_HITS,
  scoreChunk,
  truncateNoteSnippet,
} from '../memory/vaultRetrievalIndex';
import type { PdfIndexChunk, PdfIndexFile } from './pdfIndexFormat';

/** One retrieval hit: the matched fragment only, never the whole document. */
export interface SelectedPdfSnippet {
  pdfPath: string;
  chunkId: string;
  pageFrom: number;
  pageTo: number;
  score: number;
  verbatim: boolean;
  /** Fragment text after the per-document character cap (never cut mid-block). */
  text: string;
  truncated: boolean;
}

export interface SelectPdfSnippetsInput {
  query: string;
  /** Ready index files only — `ready: false` files are rejected up front. */
  files: readonly PdfIndexFile[];
  topK: number;
  maxCharsPerPdf: number;
}

/** Score one PDF chunk with the R-C1 primitives (title = file name tokens). */
export function scorePdfChunk(
  queryTokens: readonly string[],
  pdfTitleTokens: readonly string[],
  chunk: Pick<PdfIndexChunk, 'text'>,
): { score: number; distinctHits: number; titleHit: boolean } {
  return scoreChunk(queryTokens, { titleTokens: pdfTitleTokens }, {
    headingTokens: [],
    bodyTokens: tokenize(chunk.text),
  });
}

export function selectPdfSnippets(input: SelectPdfSnippetsInput): SelectedPdfSnippet[] {
  const queryTokens = tokenize(input.query);
  if (queryTokens.length === 0 || input.topK <= 0) {
    return [];
  }
  const candidates: Array<{
    file: PdfIndexFile;
    chunk: PdfIndexChunk;
    score: number;
    verbatim: boolean;
  }> = [];
  for (const file of input.files) {
    // A half built index is never queryable (design §3.2 `ready` contract).
    if (!file.ready) {
      continue;
    }
    const title = pdfTitleOf(file.pdfPath);
    const titleTokens = tokenize(title);
    const verbatim = isVaultVerbatimHit(input.query, title);
    let best: (typeof candidates)[number] | null = null;
    for (const chunk of file.chunks) {
      const hit = scorePdfChunk(queryTokens, titleTokens, chunk);
      const gatePassed = hit.distinctHits >= MIN_DISTINCT_TOKEN_HITS || hit.titleHit || verbatim;
      if (!gatePassed || hit.score <= 0) {
        continue;
      }
      if (!best || hit.score > best.score) {
        best = { file, chunk, score: hit.score, verbatim };
      }
    }
    if (best) {
      candidates.push(best);
    }
  }
  candidates.sort((a, b) =>
    b.score - a.score
    || Number(b.verbatim) - Number(a.verbatim)
    || b.file.pdfPath.localeCompare(a.file.pdfPath),
  );
  return candidates.slice(0, Math.max(0, input.topK)).map((candidate) => {
    let { text, truncated } = truncateNoteSnippet(
      candidate.chunk.text,
      input.maxCharsPerPdf,
    );
    if (text === '' && candidate.chunk.text.trim() !== '') {
      // PDF chunks are single paragraphs more often than notes are; when the
      // shared boundary truncation has no line to keep (one huge paragraph
      // over the budget), degrade to a hard prefix cut instead of injecting
      // nothing — the fragment stays honest about being truncated.
      text = candidate.chunk.text.slice(0, Math.max(0, input.maxCharsPerPdf));
      truncated = true;
    }
    return {
      pdfPath: candidate.file.pdfPath,
      chunkId: candidate.chunk.id,
      pageFrom: candidate.chunk.pageFrom,
      pageTo: candidate.chunk.pageTo,
      score: candidate.score,
      verbatim: candidate.verbatim,
      text,
      truncated,
    };
  });
}

/** File name without the `.pdf` extension (title field for scoring). */
export function pdfTitleOf(pdfPath: string): string {
  const base = pdfPath.replace(/\\/gu, '/').split('/').pop() ?? pdfPath;
  return base.replace(/\.pdf$/iu, '');
}
