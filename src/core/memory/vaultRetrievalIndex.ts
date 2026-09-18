/**
 * Vault-wide lexical retrieval core (R-C1): pure chunking, scoring,
 * truncation and exclusion rules for the opt-in whole-vault retrieval index.
 *
 * D-O7 sibling: just like `memoryRecall`, this is lexical-only by decision
 * (flowtext-parity §10 Q3) — no embedding channel, no vector store, no new
 * dependencies. The tokenizer (Latin words + CJK bigrams) and the
 * count-each-query-token-once weighted-overlap scoring are reused from
 * `memoryRecall` so both recall surfaces behave the same way.
 *
 * The index stores tokens + line numbers only, never note bodies. Bodies are
 * re-read at injection time so snippets always reflect the current note.
 */

import { createHash } from 'node:crypto';

import { tokenize } from './memoryRecall';

/** Vault-relative root of the retrieval index (plugin data, hidden from Obsidian). */
export const VAULT_INDEX_ROOT = '.opencodian/vault-index';

/** Sections larger than this many chars are bisected at blank lines. */
export const SOFT_CHUNK_CHARS = 1500;

/**
 * Selection gate: a chunk whose hits come from fewer than this many distinct
 * query tokens is only kept when a title/heading token or a verbatim title
 * mention matched — this suppresses single common-bigram false recalls
 * (flowtext-c1-design §3.2).
 */
export const MIN_DISTINCT_TOKEN_HITS = 2;

/** Field weights: note title > heading lines > body (memoryRecall analog). */
export const TITLE_WEIGHT = 3;
export const HEADING_WEIGHT = 2;
export const BODY_WEIGHT = 1;

/** Safety caps for the on-disk index (flowtext-c1-design §3.3). */
export const MAX_SHARD_BYTES = 512 * 1024;
export const MAX_MANIFEST_BYTES = 100 * 1024 * 1024;

/** Excluded by default; users extend via `vaultRetrievalExcludedPaths`. */
export const DEFAULT_VAULT_EXCLUDED_PATHS: readonly string[] = [
  '.obsidian/',
  '.opencodian/',
];

/** One indexed chunk of a note: location + lexical tokens, never the text. */
export interface VaultIndexChunk {
  /** 1-based inclusive line range into the note. */
  readonly startLine: number;
  readonly endLine: number;
  /** `section` = whole heading section, `paragraph` = bisected piece. */
  readonly kind: 'section' | 'paragraph';
  /** Tokens of the heading lines inside the chunk (weight 2). */
  readonly headingTokens: readonly string[];
  /** Tokens of the chunk body (weight 1). */
  readonly bodyTokens: readonly string[];
}

/** One indexed note (a shard payload). */
export interface VaultIndexEntry {
  /** Vault-relative POSIX path. */
  readonly path: string;
  readonly mtimeMs: number;
  /** File name without extension; scores with the title weight. */
  readonly title: string;
  /** sha-1 of the full content (first 16 hex) — skip unchanged notes. */
  readonly contentHash: string;
  readonly titleTokens: readonly string[];
  readonly chunks: readonly VaultIndexChunk[];
  /** True when the note was too large to index completely. */
  readonly partial?: boolean;
}

/** Manifest row: what is on disk for one note. */
export interface VaultManifestRow {
  readonly mtimeMs: number;
  readonly contentHash: string;
  /** Shard file name under `<root>/shards/`. */
  readonly shard: string;
}

export interface VaultIndexManifest {
  readonly version: 1;
  readonly entries: Readonly<Record<string, VaultManifestRow>>;
}

/** A selected snippet: which lines of which note matched, and why. */
export interface SelectedVaultSnippet {
  readonly path: string;
  readonly title: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly score: number;
  readonly verbatim: boolean;
}

// ---------------------------------------------------------------------------
// Fence scanning (shared by chunking, entry building and truncation)
// ---------------------------------------------------------------------------

interface FenceState {
  marker: string;
  length: number;
}

function fenceOpening(line: string): FenceState | null {
  const match = line.match(/^\s*(`{3,}|~{3,})/u);
  return match ? { marker: match[1][0], length: match[1].length } : null;
}

function fenceCloses(state: FenceState, line: string): boolean {
  const match = line.match(/^\s*(`{3,}|~{3,})/u);
  return match !== null && match[1][0] === state.marker && match[1].length >= state.length;
}

function isAtxHeading(line: string): boolean {
  return /^#{1,6}\s/u.test(line);
}

function isSetextUnderline(line: string): boolean {
  return /^={2,}\s*$/u.test(line) || /^-{2,}\s*$/u.test(line);
}

function frontmatterEndLine(lines: readonly string[]): number {
  if (lines[0]?.trimEnd() !== '---') {
    return -1;
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') {
      return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Exclusion rules
// ---------------------------------------------------------------------------

function toPosixLower(path: string): string {
  return path.replace(/\\/gu, '/').toLowerCase();
}

function hasDotSegment(path: string): boolean {
  return toPosixLower(path).split('/').some((segment) => segment.startsWith('.'));
}

function wildcardRuleToRegExp(rule: string): RegExp {
  const pattern = rule
    .split('*')
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/gu, (ch) => `\\${ch}`))
    .join('[^/]*');
  return new RegExp(`^${pattern}$`, 'u');
}

/**
 * Case-insensitive path match against user rules. A rule naming a directory
 * (optionally with a trailing slash) matches everything under it; `*`
 * matches within one path segment (`templates/*`, `notes/temp*`). Paths with
 * dot-prefixed segments are always excluded regardless of the rules — the
 * index must never observe `.obsidian/` or `.opencodian/` content even when a
 * user rule says otherwise.
 */
export function isExcludedPath(path: string, rules: readonly string[]): boolean {
  const normalized = toPosixLower(path).replace(/^\/+/u, '');
  if (hasDotSegment(normalized)) {
    return true;
  }
  for (const rawRule of rules) {
    const rule = toPosixLower(rawRule).trim().replace(/^\/+/u, '').replace(/\/+$/u, '');
    if (rule === '') {
      continue;
    }
    if (!rule.includes('*')) {
      // Plain directory prefix: the rule itself or anything under it.
      if (normalized === rule || normalized.startsWith(`${rule}/`)) {
        return true;
      }
      continue;
    }
    // Wildcard rule: segment-wise match against a complete path only, so
    // `notes/*` covers one extra segment and never crosses deeper.
    const segments = normalized.split('/');
    const ruleSegments = rule.split('/');
    if (segments.length !== ruleSegments.length) {
      continue;
    }
    if (ruleSegments.every((part, i) => wildcardRuleToRegExp(part).test(segments[i]))) {
      return true;
    }
  }
  return false;
}

/** True when a path may be indexed (built-in defaults + user rules apply). */
export function isIndexablePath(path: string, rules: readonly string[]): boolean {
  return !isExcludedPath(path, [...DEFAULT_VAULT_EXCLUDED_PATHS, ...rules]);
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split a note into index-chunk line bounds. Primary split: Markdown headings
 * (`#`..`######`, plus Setext underlines) — one chunk per section. A section
 * larger than `softChunkChars` is bisected at the blank line closest to its
 * midpoint (recursively) into `paragraph`-kind pieces. Code fences (```)
 * / ~~~) are never crossed by a split. YAML frontmatter is skipped.
 * Line numbers in the result are 1-based and inclusive.
 */
export function chunkNote(
  text: string,
  softChunkChars: number = SOFT_CHUNK_CHARS,
): Array<{ startLine: number; endLine: number; kind: 'section' | 'paragraph' }> {
  const lines = text.replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n').split('\n');
  const bounds: Array<{ startLine: number; endLine: number; kind: 'section' | 'paragraph' }> = [];

  const frontmatterEnd = frontmatterEndLine(lines);
  let sectionStart = frontmatterEnd + 1;

  const pushSection = (endExclusive: number) => {
    if (endExclusive > sectionStart) {
      bounds.push({ startLine: sectionStart + 1, endLine: endExclusive, kind: 'section' });
    }
  };

  let fence: FenceState | null = null;
  let previousNonBlank = -1;
  for (let i = sectionStart; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (fenceCloses(fence, line)) fence = null;
      continue;
    }
    const opening = fenceOpening(line);
    if (opening) {
      fence = opening;
      continue;
    }
    if (isSetextUnderline(line) && previousNonBlank >= sectionStart) {
      // Setext: the underlined line was the heading — close the section
      // before it and restart the new section at the heading line.
      pushSection(previousNonBlank);
      sectionStart = previousNonBlank;
    } else if (isAtxHeading(line) && i > sectionStart) {
      pushSection(i);
      sectionStart = i;
    }
    if (line.trim() !== '') {
      previousNonBlank = i;
    }
  }
  pushSection(lines.length);

  const result: Array<{ startLine: number; endLine: number; kind: 'section' | 'paragraph' }> = [];
  const bisect = (start: number, end: number) => {
    if (end <= start) {
      return;
    }
    const size = lines.slice(start, end).join('\n').length;
    if (size <= softChunkChars) {
      result.push({ startLine: start + 1, endLine: end, kind: 'section' });
      return;
    }
    // Fence state per line so the split point never lands inside a fence.
    const fences: Array<FenceState | null> = new Array(end - start).fill(null);
    let walk: FenceState | null = null;
    for (let i = start; i < end; i++) {
      if (walk) {
        fences[i - start] = walk;
        if (fenceCloses(walk, lines[i])) walk = null;
        continue;
      }
      const opening = fenceOpening(lines[i]);
      if (opening) {
        walk = opening;
        fences[i - start] = opening;
      }
    }
    const mid = Math.floor((start + end) / 2);
    let bestBlank = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = start + 1; i < end; i++) {
      // A split line must be blank and outside any fence.
      if (fences[i - start] !== null) continue;
      if (lines[i].trim() !== '') continue;
      const distance = Math.abs(i - mid);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestBlank = i;
      }
    }
    if (bestBlank < 0) {
      // No clean blank-line split (e.g. one huge fenced block): keep as-is.
      result.push({ startLine: start + 1, endLine: end, kind: 'section' });
      return;
    }
    bisect(start, bestBlank);
    bisect(bestBlank, end);
  };

  for (const bound of bounds) {
    bisect(bound.startLine - 1, bound.endLine);
  }
  return result.filter((chunk) =>
    lines.slice(chunk.startLine - 1, chunk.endLine).some((line) => line.trim() !== ''),
  );
}

// ---------------------------------------------------------------------------
// Entry building / hashing
// ---------------------------------------------------------------------------

/** sha-1 of the content, first 16 hex chars (memoryPaths hash convention). */
export function hashNoteContent(content: string): string {
  return createHash('sha1').update(content, 'utf8').digest('hex').slice(0, 16);
}

export function noteTitleOf(path: string): string {
  const base = path.replace(/\\/gu, '/').split('/').pop() ?? path;
  return base.replace(/\.md$/iu, '');
}

/** Shard file name for a note path (hash of the path, not the content). */
export function shardNameFor(path: string): string {
  return `${createHash('sha1').update(toPosixLower(path), 'utf8').digest('hex')}.json`;
}

function collectHeadingLineNumbers(lines: readonly string[]): Set<number> {
  const headingLines = new Set<number>();
  const frontmatterEnd = frontmatterEndLine(lines);
  let fence: FenceState | null = null;
  let previousNonBlank = -1;
  for (let i = frontmatterEnd + 1; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (fenceCloses(fence, line)) fence = null;
      continue;
    }
    const opening = fenceOpening(line);
    if (opening) {
      fence = opening;
      continue;
    }
    if (isAtxHeading(line)) {
      headingLines.add(i + 1);
    } else if (isSetextUnderline(line) && previousNonBlank >= frontmatterEnd + 1) {
      headingLines.add(previousNonBlank + 1);
    }
    if (line.trim() !== '') {
      previousNonBlank = i;
    }
  }
  return headingLines;
}

/**
 * Build the index entry for one note. `content` is the raw note text; only
 * tokens and line numbers are retained — bodies never enter the index.
 */
export function buildVaultIndexEntry(input: {
  path: string;
  mtimeMs: number;
  content: string;
  softChunkChars?: number;
}): VaultIndexEntry {
  const content = input.content.replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n');
  const lines = content.split('\n');
  const headingLineNumbers = collectHeadingLineNumbers(lines);
  const title = noteTitleOf(input.path);

  const chunks = chunkNote(content, input.softChunkChars).map((chunk) => {
    const headingTokens: string[] = [];
    const bodyTokens: string[] = [];
    for (let line = chunk.startLine; line <= chunk.endLine; line++) {
      const target = headingLineNumbers.has(line) ? headingTokens : bodyTokens;
      target.push(...tokenize(lines[line - 1]));
    }
    return {
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      kind: chunk.kind,
      headingTokens,
      bodyTokens,
    } satisfies VaultIndexChunk;
  });

  return {
    path: input.path,
    mtimeMs: input.mtimeMs,
    title,
    contentHash: hashNoteContent(content),
    titleTokens: tokenize(title),
    chunks,
  };
}

/** Serialized shard size guard: halve the chunk list until the shard fits. */
export function fitShardToBudget(entry: VaultIndexEntry): {
  entry: VaultIndexEntry;
  truncated: boolean;
} {
  const fits = (candidate: VaultIndexEntry): boolean =>
    JSON.stringify(candidate).length <= MAX_SHARD_BYTES;
  if (fits(entry)) {
    return { entry, truncated: false };
  }
  let kept = entry.chunks.length;
  while (kept > 1) {
    kept = Math.floor(kept / 2);
    const fitted: VaultIndexEntry = {
      ...entry,
      chunks: entry.chunks.slice(0, kept),
      partial: true,
    };
    if (fits(fitted)) {
      return { entry: fitted, truncated: true };
    }
  }
  // Even one chunk overflows: keep a chunk-less stub so the note stays listed.
  return { entry: { ...entry, chunks: [], partial: true }, truncated: true };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function normalizeMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/gu, '');
}

/** The query verbatim mentions the note title → deterministic top hit. */
export function isVaultVerbatimHit(query: string, title: string): boolean {
  const q = normalizeMatch(query);
  const t = normalizeMatch(title);
  return t.length >= 3 && q.includes(t);
}

/**
 * Weighted term overlap for one chunk: title token hits count 3, heading
 * token hits 2, body hits 1. Each distinct query token counts once, and the
 * strongest field wins per token (memoryRecall.scoreEntry convention).
 */
export function scoreChunk(
  queryTokens: readonly string[],
  entry: Pick<VaultIndexEntry, 'titleTokens'>,
  chunk: Pick<VaultIndexChunk, 'headingTokens' | 'bodyTokens'>,
): { score: number; distinctHits: number; titleHit: boolean } {
  let score = 0;
  let distinctHits = 0;
  let titleHit = false;
  const seen = new Set<string>();
  for (const q of queryTokens) {
    if (seen.has(q)) continue;
    seen.add(q);
    if (entry.titleTokens.includes(q)) {
      score += TITLE_WEIGHT;
      distinctHits += 1;
      titleHit = true;
    } else if (chunk.headingTokens.includes(q)) {
      score += HEADING_WEIGHT;
      distinctHits += 1;
      titleHit = true;
    } else if (chunk.bodyTokens.includes(q)) {
      score += BODY_WEIGHT;
      distinctHits += 1;
    }
  }
  return { score, distinctHits, titleHit };
}

/**
 * Select the most relevant note snippets for a query. Rules
 * (flowtext-c1-design §3.2/§3.4):
 *  - a chunk passes the gate only when it hits ≥ 2 distinct query tokens, or
 *    hits a title/heading token, or the query verbatim mentions the title;
 *  - the best chunk per note wins (one snippet per note — a single note can
 *    never crowd out the whole top-K);
 *  - ordering: score → verbatim → mtime (newest first);
 *  - the returned line range expands one chunk in each direction for context.
 */
export function selectVaultSnippets(input: {
  query: string;
  entries: readonly VaultIndexEntry[];
  topK: number;
}): SelectedVaultSnippet[] {
  const queryTokens = tokenize(input.query);
  if (queryTokens.length === 0 || input.topK <= 0) {
    return [];
  }
  const candidates: Array<{
    entry: VaultIndexEntry;
    chunkIndex: number;
    score: number;
    verbatim: boolean;
  }> = [];
  for (const entry of input.entries) {
    const verbatim = isVaultVerbatimHit(input.query, entry.title);
    let best: (typeof candidates)[number] | null = null;
    for (let i = 0; i < entry.chunks.length; i++) {
      const hit = scoreChunk(queryTokens, entry, entry.chunks[i]);
      const gatePassed = hit.distinctHits >= MIN_DISTINCT_TOKEN_HITS
        || hit.titleHit
        || verbatim;
      if (!gatePassed || hit.score <= 0) {
        continue;
      }
      if (!best || hit.score > best.score) {
        best = { entry, chunkIndex: i, score: hit.score, verbatim };
      }
    }
    if (best) {
      candidates.push(best);
    }
  }
  candidates.sort((a, b) =>
    b.score - a.score
    || Number(b.verbatim) - Number(a.verbatim)
    || b.entry.mtimeMs - a.entry.mtimeMs,
  );
  return candidates.slice(0, Math.max(0, input.topK)).map((candidate) => {
    const chunks = candidate.entry.chunks;
    const from = Math.max(0, candidate.chunkIndex - 1);
    const to = Math.min(chunks.length - 1, candidate.chunkIndex + 1);
    return {
      path: candidate.entry.path,
      title: candidate.entry.title,
      startLine: chunks[from].startLine,
      endLine: chunks[to].endLine,
      score: candidate.score,
      verbatim: candidate.verbatim,
    };
  });
}

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

/**
 * Truncate a snippet to `maxChars` without ever cutting inside a code fence.
 * The cut point falls back to the most recent complete boundary — a blank
 * line outside fences or a fence-closing line. When no such boundary exists
 * within the budget (a single huge paragraph) the last complete line wins.
 * If the budget ends inside an unclosed fence, everything from the fence
 * opening on is dropped rather than split. Untouched input returns
 * `truncated: false`.
 */
export function truncateNoteSnippet(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (maxChars <= 0) {
    return { text: '', truncated: text.length > 0 };
  }
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  const lines = text.split('\n');
  const kept: string[] = [];
  let used = 0;
  let fence: FenceState | null = null;
  let lastParagraphBoundary = -1;
  let lastFenceClose = -1;
  for (const line of lines) {
    const cost = (kept.length > 0 ? 1 : 0) + line.length;
    if (used + cost > maxChars) {
      break;
    }
    if (fence) {
      kept.push(line);
      used += cost;
      if (fenceCloses(fence, line)) {
        fence = null;
        lastFenceClose = kept.length - 1;
      }
      continue;
    }
    const opening = fenceOpening(line);
    kept.push(line);
    used += cost;
    if (opening) {
      fence = opening;
      continue;
    }
    if (line.trim() === '') {
      lastParagraphBoundary = kept.length - 1;
    }
  }

  let cut = kept.length;
  if (fence) {
    // Budget ended inside an unclosed fence: drop from its opening line on.
    for (let i = cut - 1; i >= 0; i--) {
      if (fenceOpening(kept[i])) {
        cut = i;
        break;
      }
    }
  } else {
    const boundary = Math.max(lastParagraphBoundary, lastFenceClose);
    if (boundary >= 0 && boundary + 1 < cut) {
      cut = boundary + 1;
    }
  }
  const result = kept.slice(0, cut).join('\n').replace(/\n+$/u, '');
  return { text: result, truncated: true };
}
