/**
 * Maintenance-needed signals (hygiene nudges). When the store drifts into a
 * state that only a user-approved flow should fix, the injection carries a
 * marked notice. The plugin itself NEVER modifies memories — the notice
 * asks the model to surface it and the user to run the plugin's memory
 * commands (D-O8).
 */

import type { TopicManifestEntry } from './memoryManifest';
import { byteLength } from './memoryTypes';

/** Unreviewed reflection files at/above this count → suggest review. */
export const REFLECTION_REVIEW_THRESHOLD = 3;
/** Index size early-warning band below the hard 200-line / 25KB cap. */
export const INDEX_LINE_WARN = 150;
export const INDEX_BYTES_WARN = 20_000;
/** importance ≤ 2 and age > 90 days → archive candidate (protocol rule). */
export const ARCHIVE_CANDIDATE_THRESHOLD = 3;
const ARCHIVE_AGE_MS = 90 * 86_400_000;

/** Greppable marker — also how the model recognizes the notice in context. */
export const HYGIENE_NOTICE_MARKER = '[MEMORY-ACTION]';

export type HygieneAssessment = {
  reflectionPending: number;
  indexLineCount: number;
  indexBytes: number;
  archiveCandidates: number;
  needsReview: boolean;
  needsAudit: boolean;
};

/** Pure assessment from the already-loaded index text + topic manifest. */
export function assessHygiene(input: {
  memoryIndexContent?: string | null;
  manifest?: TopicManifestEntry[];
  nowMs?: number;
}): HygieneAssessment {
  const nowMs = input.nowMs ?? Date.now();
  const index = (input.memoryIndexContent ?? '').trim();
  const indexLineCount = index ? index.split('\n').length : 0;
  const indexBytes = index ? byteLength(index) : 0;

  let reflectionPending = 0;
  let archiveCandidates = 0;
  for (const e of input.manifest ?? []) {
    if (e.reflection) reflectionPending++;
    if (e.importance <= 2 && nowMs - e.mtimeMs > ARCHIVE_AGE_MS) {
      archiveCandidates++;
    }
  }

  const needsReview = reflectionPending >= REFLECTION_REVIEW_THRESHOLD;
  const needsAudit =
    indexLineCount >= INDEX_LINE_WARN ||
    indexBytes >= INDEX_BYTES_WARN ||
    archiveCandidates >= ARCHIVE_CANDIDATE_THRESHOLD;

  return {
    reflectionPending,
    indexLineCount,
    indexBytes,
    archiveCandidates,
    needsReview,
    needsAudit,
  };
}

/**
 * Render the marked, user-facing notice. Returns null when nothing pending.
 * One block covers BOTH flows when review and audit are due together.
 */
export function buildHygieneNotice(a: HygieneAssessment): string | null {
  if (!a.needsReview && !a.needsAudit) return null;

  const items: string[] = [];
  if (a.needsReview) {
    items.push(
      `- REVIEW: ${a.reflectionPending} unreviewed auto-written memories (distilled after compaction or per-turn) — ask the user to run the plugin's memory review (memory list / memory forget commands).`,
    );
  }
  if (a.needsAudit) {
    const reasons: string[] = [];
    if (a.indexLineCount >= INDEX_LINE_WARN || a.indexBytes >= INDEX_BYTES_WARN) {
      reasons.push(
        `MEMORY.md is ${a.indexLineCount} lines / ${Math.round(a.indexBytes / 1024)}KB (hard cap 200 lines / 25KB)`,
      );
    }
    if (a.archiveCandidates >= ARCHIVE_CANDIDATE_THRESHOLD) {
      reasons.push(
        `${a.archiveCandidates} archive candidates (importance ≤ 2, idle 90+ days)`,
      );
    }
    items.push(`- AUDIT: ${reasons.join('; ')} — suggest the plugin's memory status command.`);
  }

  return [
    `⚠️ ${HYGIENE_NOTICE_MARKER} memory maintenance pending:`,
    ...items,
    'Handling rules for the assistant:',
    `1. SURFACE: at the end of your reply, repeat this ⚠️ ${HYGIENE_NOTICE_MARKER} block to the user verbatim — it is for the user's eyes. Keep showing it every turn until the backlog is resolved.`,
    "2. CONSENT GATE: run maintenance ONLY when the user's latest message clearly agrees to it (any wording counts — \"OK\", \"好\", \"do it\", …). Without clear agreement, perform NO maintenance actions — just keep surfacing this notice unchanged.",
  ].join('\n');
}
