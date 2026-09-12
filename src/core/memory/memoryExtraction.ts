/**
 * Per-turn memory extraction — the runtime half of the reference twin.
 *
 * Gates (D26): main session only (the caller enforces this — the send
 * pipeline is the only observer), newest user message carries ≥3 words of
 * prose (CJK characters count as words), the transcript gained a message
 * since the last extraction, and the turn did not already write into the
 * memory bucket itself. At most ONE memory per turn (D25).
 */

import { formatProjectMemoryIndexContent } from './memoryIndexFormat';
import {
  DISTILLED_MEMORY_TYPES,
  type DistilledMemory,
  type DistilledMemoryType,
  parseLooseJsonArray,
  provenanceTag,
  sanitizeMemorySlug,
} from './memoryStore';
import type { MemoryTranscriptMessage } from './memoryTypes';

export const MAX_EXTRACTED_MEMORIES = 1;
export const MAX_EXTRACTION_BODY_CHARS = 4_000;
export const MAX_EXTRACTION_DESCRIPTION_CHARS = 200;
export const MAX_EXTRACTION_TRANSCRIPT_CHARS = 24_000;

/** A real user message with at least this many Latin words. */
export const MIN_USER_PROSE_WORDS = 3;
/** …or this many CJK characters, since CJK text has no word boundaries. */
export const MIN_USER_PROSE_CJK_CHARS = 8;

/** Tool names that count as a memory write when they touch the bucket. */
export const MEMORY_WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'write',
  'edit',
  'multiedit',
  // opencode/claude/codex/pi tool spellings observed in transcripts.
  'write_file',
  'str_replace_editor',
  'apply_patch',
]);

/** Minimum characters a single write must reach to count as a saved memory. */
export const MIN_MEMORY_WRITE_CHARS = 160;

export type ExtractionMemory = DistilledMemory;

/** Structural transcript line the gates operate on. */
export type ExtractionTranscriptLine = MemoryTranscriptMessage & {
  text: string;
};

/** Normalize persisted messages into gate-ready transcript lines. */
export function toExtractionLines(
  messages: ReadonlyArray<MemoryTranscriptMessage>,
): ExtractionTranscriptLine[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => !m.summary && !m.compactionDivider)
    .map((m) => ({ ...m, text: typeof m.content === 'string' ? m.content : '' }));
}

/**
 * Tool-based file writes recovered from a persisted message. Every plausible
 * input location is probed and a miss simply means "no write detected" —
 * the guard only ever suppresses an extraction, never forces one.
 */
export function fileTouchesOfMessage(
  message: MemoryTranscriptMessage,
): Array<{ name: string; filePath: string; chars: number }> {
  const out: Array<{ name: string; filePath: string; chars: number }> = [];
  for (const call of message.toolCalls ?? []) {
    const name = typeof call.name === 'string' ? call.name.trim().toLowerCase() : '';
    const input = (call.input ?? {}) as Record<string, unknown>;
    const rawPath =
      input.filePath ?? input.file_path ?? input.path ?? input.targetFile ?? '';
    const filePath = typeof rawPath === 'string' ? rawPath : '';
    const rawContent = input.content ?? input.newString ?? input.edits ?? '';
    const chars = typeof rawContent === 'string'
      ? rawContent.length
      : Array.isArray(rawContent)
        ? JSON.stringify(rawContent).length
        : 0;
    if (!name && !filePath) continue;
    out.push({ name, filePath, chars });
  }
  return out;
}

/**
 * Message tool writes that already landed in the memory directory. The
 * model-facing bucket path and the vault-relative bucket both match (the
 * backends write with absolute native paths; comparisons are normalized).
 */
export function memoryWritePaths(
  lines: ReadonlyArray<MemoryTranscriptMessage>,
  projectDir: string,
  memoryRootNative: string,
): string[] {
  const bucket = projectDir.replace(/\\/g, '/').toLowerCase().replace(/\/+$/u, '');
  const root = memoryRootNative.replace(/\\/g, '/').toLowerCase().replace(/\/+$/u, '');
  const paths: string[] = [];
  for (const line of lines) {
    if (line.role !== 'assistant') continue;
    for (const touch of fileTouchesOfMessage(line)) {
      if (!MEMORY_WRITE_TOOL_NAMES.has(touch.name)) continue;
      if (touch.chars < MIN_MEMORY_WRITE_CHARS) continue;
      const normalized = touch.filePath.replace(/\\/g, '/').toLowerCase();
      if (!normalized.endsWith('.md')) continue;
      const inBucket = bucket && normalized.includes(bucket);
      const inRoot = root && normalized.startsWith(root);
      if (!inBucket && !inRoot) continue;
      paths.push(touch.filePath);
    }
  }
  return paths;
}

/** Last user line of a transcript ("" when there is none). */
export function lastUserTurnFromLines(
  lines: ReadonlyArray<ExtractionTranscriptLine>,
): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line && line.role === 'user') return line.text;
  }
  return '';
}

/**
 * Rough prose test: Latin word count and CJK character count both count as
 * prose, so a Chinese-speaking user is not silently exempt from extraction.
 */
export function countUserProse(text: string): number {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return 0;
  const words = trimmed
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const cjk = (trimmed.match(/[\u4e00-\u9fff]/gu) ?? []).length;
  return Math.max(words, cjk);
}

/** True when the newest user turn carries enough substance to distill. */
export function transcriptHasExtractableProse(
  lines: ReadonlyArray<ExtractionTranscriptLine>,
): boolean {
  return countUserProse(lastUserTurnFromLines(lines)) >= MIN_USER_PROSE_WORDS;
}

/**
 * The full extraction gate. Every reason the turn should NOT be distilled
 * is a named skip — surfaced in metrics so the loop tests can assert zero
 * model calls on negative scenarios.
 */
export function evaluateExtractionGate(input: {
  lines: ReadonlyArray<ExtractionTranscriptLine>;
  /** Message count at the previous extraction (0 = never extracted). */
  lastExtractedMessageCount: number;
  projectDir: string;
  memoryRootNative: string;
}): { proceed: boolean; skipReason: string | null } {
  const { lines } = input;
  if (lines.length === 0) {
    return { proceed: false, skipReason: 'empty-transcript' };
  }
  if (lines.length <= input.lastExtractedMessageCount) {
    return { proceed: false, skipReason: 'transcript-not-grown' };
  }
  if (!transcriptHasExtractableProse(lines)) {
    return { proceed: false, skipReason: 'user-prose-below-threshold' };
  }
  if (memoryWritePaths(lines, input.projectDir, input.memoryRootNative).length > 0) {
    return { proceed: false, skipReason: 'turn-wrote-memory' };
  }
  return { proceed: true, skipReason: null };
}

/** Flatten transcript lines into the prompt transcript format. */
export function formatTranscriptForPrompt(
  lines: ReadonlyArray<ExtractionTranscriptLine>,
): string {
  return lines
    .map((line) => `[${line.role}] ${line.text}`)
    .join('\n');
}

export function buildExtractionSystemPrompt(): string {
  return [
    'You distill durable memories from a coding session turn.',
    'Return JSON only with key memories (array of objects with name, description, type, body).',
    'Most turns are worth nothing: return an empty array unless something will still matter in a future session.',
    'Never invent, never restate what the memory index already records, and never record what the repository or git history already says.',
  ].join(' ');
}

export function buildExtractionUserPrompt(input: {
  transcript: string;
  indexContent: string | null | undefined;
}): string {
  const index = formatProjectMemoryIndexContent(input.indexContent ?? '');
  let transcript = input.transcript.trim();
  if (transcript.length > MAX_EXTRACTION_TRANSCRIPT_CHARS) {
    transcript = `…(older transcript omitted)\n${transcript.slice(
      transcript.length - MAX_EXTRACTION_TRANSCRIPT_CHARS,
    )}`;
  }

  return [
    'Current memory index (MEMORY.md):',
    '```',
    index || '(empty)',
    '```',
    '',
    'Recent session transcript (oldest first, may be truncated):',
    '```',
    transcript || '(empty)',
    '```',
    '',
    'Distill at most 1 durable observation from the LAST user turn that is not already covered above.',
    'Respond with JSON only: {"memories":[{"name":"short-kebab-case-slug","description":"one-line summary","type":"user|feedback|project|reference","body":"markdown body"}]}',
    'Rules:',
    '- Return {"memories":[]} when nothing is durable — that is the common case and a valid answer.',
    "- Save user corrections and confirmed preferences as `feedback`; save who the user is (role, expertise, preferences) as `user`; ongoing project facts, decisions and constraints as `project`; external pointers as `reference`.",
    '- The last user turn must contain the evidence; do not mine older turns, and do not promote a throwaway remark into a memory.',
    '- Skip anything derivable from the repo, git history, or AGENTS.md/CLAUDE.md, and anything that only matters inside this conversation.',
    '- Do not restate or rephrase an entry already in the index above.',
    '- Each body must cite the transcript snippet it is based on (quote it as a `>` block).',
    '- For feedback bodies start with a `Trigger:` line (when this should come to mind), then **Why:** and **How to apply:**; project bodies need **Why:** and **How to apply:** too.',
  ].join('\n');
}

/**
 * Defensive parse of model extraction output; fail soft → [].
 * Accepts {"memories":[…]} / {"observations":[…]} / bare […], tolerates
 * markdown fences, drops invalid entries, caps at MAX_EXTRACTED_MEMORIES.
 */
export function parseExtractionResponse(text: string): ExtractionMemory[] {
  const list = parseLooseJsonArray(text);
  if (!list) return [];

  const out: ExtractionMemory[] = [];
  const seen = new Set<string>();
  for (const e of list) {
    if (out.length >= MAX_EXTRACTED_MEMORIES) break;
    const name = sanitizeMemorySlug(typeof e.name === 'string' ? e.name : '');
    const description =
      typeof e.description === 'string' ? e.description.replace(/\s+/g, ' ').trim() : '';
    const type = typeof e.type === 'string' ? e.type.trim().toLowerCase() : '';
    const body = typeof e.body === 'string' ? e.body.trim() : '';
    if (!name || name === 'memory') continue;
    if (seen.has(name)) continue;
    if (!description || !body) continue;
    if (!DISTILLED_MEMORY_TYPES.has(type)) continue;
    seen.add(name);
    out.push({
      name,
      description: description.slice(0, MAX_EXTRACTION_DESCRIPTION_CHARS),
      type: type as DistilledMemoryType,
      body: body.slice(0, MAX_EXTRACTION_BODY_CHARS),
    });
  }
  return out;
}

/** `extracted <sessionID first 12 chars>` provenance tag for frontmatter. */
export function extractionSourceTag(sourceSessionID: string): string {
  return provenanceTag('extracted', sourceSessionID);
}
