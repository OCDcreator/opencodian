/**
 * Recall assembly: Relevant-Memory Reminder framing, session budgets and
 * the lexical selector backing opt-in semantic recall.
 *
 * zmem twin: bodies capped (~4096B / 200 lines) with an age header, framed
 * as `<system-reminder>` (what the `# Memory` protocol promises), session
 * budget ~64KB, secret guard withholds whole files from injection only.
 * D-O7: the embedding channel is intentionally not ported — the semantic
 * path is lexical prefilter + optional lite-model ranking with lexical
 * fallback.
 */

import type { TopicManifestEntry } from './memoryManifest';
import { scanForSecrets } from './memorySecretScan';
import { byteLength } from './memoryTypes';

/** Session budget for recalled Topic File characters (zmem twin ~64KB). */
export const DEFAULT_RECALLED_CONTENT_BUDGET = 61_440;

/** Per-file body caps (zmem twin). */
const MAX_BODY_BYTES = 4096;
const MAX_BODY_LINES = 200;

/** Upper bound of entries handed to the lite model for ranking. */
export const LEXICAL_PREFILTER_TOP_N = 10;

/** First line of every recall; dedupe keys off this marker. */
const RELEVANT_MEMORY_MARKER =
  'Retrieved for possible relevance — use only if it actually applies to what the user asked.';

/** Retrieval-as-verification tail hint appended to every reminder. */
export const RECALL_VERIFICATION_HINT =
  'If any recalled memory above is outdated or wrong, update its file via the # Memory protocol this turn.';

/** One selected Topic File after formatting. */
export type SelectedMemory = {
  filePath: string;
  /** Already-framed or raw body text counted toward session budget. */
  content: string;
};

// ---------------------------------------------------------------------------
// Lexical selector (CJK-aware tokenizer + weighted overlap)
// ---------------------------------------------------------------------------

const NAME_WEIGHT = 3;
const STEM_WEIGHT = 2;
const DESC_WEIGHT = 1;

const LATIN_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that',
  'these', 'those', 'how', 'what', 'why', 'when', 'where', 'which', 'who',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'shall',
  'my', 'your', 'our', 'we', 'you', 'i', 'me', 'he', 'she', 'they', 'them',
  'as', 'at', 'by', 'from', 'about', 'if', 'then', 'than', 'so', 'not',
  'no', 'yes', 'please', 'help', 'need', 'want', 'get', 'use', 'using',
  'make', 'like', 'just',
]);

const CJK_STOPWORDS = new Set([
  '的', '了', '是', '在', '吗', '呢', '吧', '啊', '么', '我', '你', '他',
  '她', '它', '这', '那', '有', '就', '都', '也', '还', '把', '被', '让',
  '给', '对', '跟', '和', '与', '或', '并', '而', '请', '帮忙', '需要',
  '想要', '请问', '一下', '如何', '怎么', '什么', '为什么', '一个', '我们',
  '你们', '他们',
]);

/**
 * Tokenize for lexical matching: Latin words (lowercased) + CJK bigrams.
 * Stopwords and punctuation are dropped; CJK runs slide a 2-char window so
 * single-char query terms still overlap.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(/[a-z0-9]+/g)) {
    const t = m[0];
    if (t.length > 0 && !LATIN_STOPWORDS.has(t)) out.push(t);
  }
  for (const m of text.matchAll(/[\u4e00-\u9fff]+/g)) {
    const run = m[0];
    if (run.length === 1) {
      if (!CJK_STOPWORDS.has(run)) out.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) {
      const big = run.slice(i, i + 2);
      if (!CJK_STOPWORDS.has(big)) out.push(big);
    }
  }
  return out;
}

type EntryTokens = {
  name: string[];
  stem: string[];
  description: string[];
};

function stemOf(entry: TopicManifestEntry): string {
  return entry.filename.replace(/\.md$/i, '');
}

function entryTokens(entry: TopicManifestEntry): EntryTokens {
  return {
    name: tokenize(entry.name),
    stem: tokenize(stemOf(entry)),
    description: tokenize(entry.description),
  };
}

/** Pure lexical relevance: weighted term overlap, each query term counted once. */
export function scoreEntry(
  queryTokens: string[],
  entry: TopicManifestEntry,
  toks?: EntryTokens,
): number {
  const t = toks ?? entryTokens(entry);
  let score = 0;
  const seen = new Set<string>();
  for (const q of queryTokens) {
    if (seen.has(q)) continue;
    seen.add(q);
    if (t.name.includes(q)) score += NAME_WEIGHT;
    else if (t.stem.includes(q)) score += STEM_WEIGHT;
    else if (t.description.includes(q)) score += DESC_WEIGHT;
  }
  return score;
}

function normalizeMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

/** Direct mention of the filename or name in the query → deterministic, skip the model. */
export function isVerbatimHit(
  query: string,
  entry: TopicManifestEntry,
): boolean {
  const q = normalizeMatch(query);
  const name = normalizeMatch(entry.name);
  const stem = normalizeMatch(stemOf(entry));
  if (name.length >= 3 && q.includes(name)) return true;
  if (stem.length >= 3 && q.includes(stem)) return true;
  return false;
}

export type LexicalRank = {
  entry: TopicManifestEntry;
  score: number;
  verbatim: boolean;
};

/**
 * Rank manifest entries by pure lexical relevance. Entries with no term
 * overlap are dropped. Importance/recency only break ties.
 */
export function rankLexically(
  query: string,
  manifest: TopicManifestEntry[],
): LexicalRank[] {
  const q = tokenize(query);
  const out: LexicalRank[] = [];
  for (const entry of manifest) {
    const toks = entryTokens(entry);
    const score = scoreEntry(q, entry, toks);
    const verbatim = isVerbatimHit(query, entry);
    if (score > 0 || verbatim) out.push({ entry, score, verbatim });
  }
  out.sort(
    (a, b) =>
      b.score - a.score ||
      b.entry.importance - a.entry.importance ||
      b.entry.mtimeMs - a.entry.mtimeMs,
  );
  return out;
}

/** Deterministic candidate shortlist handed to the lite model (or returned directly). */
export function lexicalCandidates(
  query: string,
  manifest: TopicManifestEntry[],
  topN: number = LEXICAL_PREFILTER_TOP_N,
): TopicManifestEntry[] {
  return rankLexically(query, manifest)
    .slice(0, topN)
    .map((r) => r.entry);
}

// ---------------------------------------------------------------------------
// Recalled body formatting
// ---------------------------------------------------------------------------

function limitCompleteLinesByBytes(content: string): {
  content: string;
  truncated: boolean;
} {
  const lines = content === '' ? [''] : content.split('\n');
  const kept: string[] = [];
  let n = 0;
  for (const line of lines) {
    const sep = kept.length > 0 ? 1 : 0;
    const next = n + sep + byteLength(line);
    if (next > MAX_BODY_BYTES) {
      return { content: kept.join('\n'), truncated: true };
    }
    kept.push(line);
    n = next;
  }
  return { content: kept.join('\n'), truncated: false };
}

export function memoryHeader(filePath: string, mtimeMs: number, nowMs: number): string {
  const days = Math.max(0, Math.floor((nowMs - mtimeMs) / 86_400_000));
  if (days <= 1) return `Memory: ${filePath}:`;
  return [
    `This memory is ${days} days old. Memories are point-in-time observations, not live state — claims about code behavior or file:line citations may be outdated. Verify against current code before asserting as fact.`,
    '',
    `Memory: ${filePath}:`,
  ].join('\n');
}

/**
 * Format one Topic File body for the Relevant-Memory Reminder. `rawContent`
 * is always supplied by the caller (no direct fs access in the core).
 */
export function formatRecalledTopicFile(input: {
  filePath: string;
  mtimeMs: number;
  nowMs?: number;
  rawContent: string;
}): SelectedMemory {
  const nowMs = input.nowMs ?? Date.now();
  const raw = input.rawContent
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n/gu, '\n');

  const totalLines = raw.length === 0 ? 0 : raw.split('\n').length;
  const byBytes = limitCompleteLinesByBytes(raw);
  let body = byBytes.content;
  let truncated = byBytes.truncated;
  let truncReason = '4096 byte limit';

  const bodyLines = body === '' ? [] : body.split('\n');
  if (bodyLines.length > MAX_BODY_LINES) {
    body = bodyLines.slice(0, MAX_BODY_LINES).join('\n');
    truncated = true;
    truncReason = 'first 200 lines';
  } else if (!byBytes.truncated && totalLines > MAX_BODY_LINES) {
    body = raw.split('\n').slice(0, MAX_BODY_LINES).join('\n');
    truncated = true;
    truncReason = 'first 200 lines';
  }

  if (truncated) {
    body = `${body}\n\n> This memory file was truncated (${truncReason}). Use the Read tool to view the complete file at: ${input.filePath}`;
  }

  const header = memoryHeader(input.filePath, input.mtimeMs, nowMs);
  return {
    filePath: input.filePath,
    content: `${header}\n\n${body}`,
  };
}

// ---------------------------------------------------------------------------
// Reminder assembly
// ---------------------------------------------------------------------------

/**
 * Secret guard note appended to the reminder tail when Topic File bodies
 * were withheld from injection. The files themselves are never touched.
 */
export function secretGuardNote(skipped: number): string {
  return `Note: ${skipped} recalled topic file(s) skipped by the secret guard (possible credentials) — review them with the plugin's memory lint command.`;
}

/**
 * Recalls are framed as a `<system-reminder>` block because that is what
 * the `# Memory` protocol tells the model to expect, and because it is the
 * framing that keeps a recalled fact from reading as a fresh user
 * instruction. The marker line stays verbatim inside the wrapper.
 */
function frameRecall(body: string[]): string {
  return ['<system-reminder>', ...body, '</system-reminder>'].join('\n');
}

/**
 * Assemble the Relevant-Memory Reminder from selected (already formatted)
 * bodies. Skips paths already recalled; stops at budget. Bodies whose
 * content trips the credential heuristic are withheld entirely and
 * reported via skippedSecretGuard (+ a tail note in the reminder).
 */
export function assembleRelevantMemory(input: {
  selected: SelectedMemory[] | null | undefined;
  alreadyRecalledPaths?: Iterable<string>;
  alreadyRecalledContentCharacters?: number;
  budget?: number;
}): {
  relevantMemory: string | null;
  recalledPaths: string[];
  recalledContentCharacters: number;
  skippedSecretGuard: string[];
} {
  const budget = input.budget ?? DEFAULT_RECALLED_CONTENT_BUDGET;
  const alreadyPaths = new Set(input.alreadyRecalledPaths ?? []);
  const priorUsed = input.alreadyRecalledContentCharacters ?? 0;
  let used = priorUsed;
  const newlyRecalled: string[] = [];
  const bodies: string[] = [];
  const skippedSecretGuard: string[] = [];

  for (const item of input.selected ?? []) {
    if (!item?.filePath || typeof item.content !== 'string') continue;
    if (item.content.length === 0) continue;
    if (alreadyPaths.has(item.filePath)) continue;
    if (newlyRecalled.includes(item.filePath)) continue;
    if (scanForSecrets(item.content).hit) {
      // Hard block on injection only; the file on disk stays untouched.
      skippedSecretGuard.push(item.filePath);
      continue;
    }
    if (used + item.content.length > budget) continue;

    bodies.push(item.content);
    newlyRecalled.push(item.filePath);
    alreadyPaths.add(item.filePath);
    used += item.content.length;
  }

  if (bodies.length === 0) {
    if (skippedSecretGuard.length === 0) {
      return {
        relevantMemory: null,
        recalledPaths: newlyRecalled,
        recalledContentCharacters: used,
        skippedSecretGuard,
      };
    }
    // Everything selected tripped the guard: still emit the note-only
    // reminder so recall being withheld is visible, not silently blank.
    return {
      relevantMemory: frameRecall([
        RELEVANT_MEMORY_MARKER,
        '',
        secretGuardNote(skippedSecretGuard.length),
      ]),
      recalledPaths: newlyRecalled,
      recalledContentCharacters: used,
      skippedSecretGuard,
    };
  }

  const relevantMemory = frameRecall([
    RELEVANT_MEMORY_MARKER,
    '',
    bodies.join('\n\n'),
    '',
    RECALL_VERIFICATION_HINT,
    ...(skippedSecretGuard.length > 0
      ? ['', secretGuardNote(skippedSecretGuard.length)]
      : []),
  ]);

  return {
    relevantMemory,
    recalledPaths: newlyRecalled,
    recalledContentCharacters: used,
    skippedSecretGuard,
  };
}
