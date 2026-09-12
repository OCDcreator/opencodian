/**
 * Compaction reflection: distills durable observations right after a
 * session compact (zmem twin). Reflection distills session findings only —
 * profile facts (`user`) stay a model-authored/protocol concern, so the
 * accepted type set here is narrower than extraction's.
 */

import { formatProjectMemoryIndexContent } from './memoryIndexFormat';
import {
  type DistilledMemory,
  parseLooseJsonArray,
  planProvenanceWrites,
  provenanceTag,
  type ProvenanceWritePlan,
  sanitizeMemorySlug,
} from './memoryStore';

/** Hard cap on distilled memories per compaction (anti over-generalization). */
export const MAX_REFLECTED_MEMORIES = 3;
/** Defensive caps for untrusted model output / prompt size. */
export const MAX_REFLECTION_BODY_CHARS = 4_000;
export const MAX_REFLECTION_DESCRIPTION_CHARS = 200;
export const MAX_REFLECTION_TRANSCRIPT_CHARS = 24_000;

export type ReflectedMemoryType = 'project' | 'reference' | 'feedback';

const REFLECTED_MEMORY_TYPES: ReadonlySet<string> = new Set([
  'project',
  'reference',
  'feedback',
]);

export type ReflectedMemory = DistilledMemory & { type: ReflectedMemoryType };

export function buildReflectionSystemPrompt(): string {
  return [
    'You reflect on a compacted coding session and distill durable memories.',
    'Return JSON only with key memories (array of objects with name, description, type, body).',
    'Prefer an empty array over speculation: only observations that stay true beyond this conversation.',
    'Distill repeated user corrections into one feedback memory rather than separate facts.',
  ].join(' ');
}

export function buildReflectionUserPrompt(input: {
  transcript: string;
  indexContent: string | null | undefined;
}): string {
  const index = formatProjectMemoryIndexContent(input.indexContent ?? '');
  let transcript = input.transcript.trim();
  if (transcript.length > MAX_REFLECTION_TRANSCRIPT_CHARS) {
    transcript = `…(older transcript omitted)\n${transcript.slice(
      transcript.length - MAX_REFLECTION_TRANSCRIPT_CHARS,
    )}`;
  }

  return [
    'Current memory index (MEMORY.md):',
    '```',
    index || '(empty)',
    '```',
    '',
    'Session transcript (just compacted; oldest first, may be truncated):',
    '```',
    transcript || '(empty)',
    '```',
    '',
    'Distill at most 3 durable observations from this session into new memories.',
    'Respond with JSON only: {"memories":[{"name":"short-kebab-case-slug","description":"one-line summary","type":"project|reference|feedback","body":"markdown body"}]}',
    'Rules:',
    '- Return {"memories":[]} when nothing is durable — that is a valid answer.',
    '- Only what stays true beyond this conversation: user corrections and confirmed working preferences (feedback), ongoing project facts/decisions (project), external pointers (reference).',
    '- Do not restate an entry already in the index above; propose only genuinely new observations.',
    '- Each body must cite the transcript snippet it is based on (quote it as a `>` block).',
    '- For feedback bodies, start with a `Trigger:` line (when this feedback should come to mind), then **Why:** and **How to apply:**; for project bodies include **Why:** and **How to apply:** lines.',
    '- If the transcript shows the user repeatedly correcting the same kind of agent behavior, propose one feedback memory (with its `Trigger:` line) instead of separate facts.',
    '- Skip anything derivable from the repo, git history, or AGENTS.md/CLAUDE.md, and anything conversation-only.',
  ].join('\n');
}

/**
 * Defensive parse of the model reflection output; fail soft → [].
 * Accepts {"memories":[...]} / {"observations":[...]} / bare [...],
 * tolerates markdown fences around the JSON, drops invalid entries,
 * caps at MAX_REFLECTED_MEMORIES.
 */
export function parseReflectionResponse(text: string): ReflectedMemory[] {
  const list = parseLooseJsonArray(text);
  if (!list) return [];

  const out: ReflectedMemory[] = [];
  const seenNames = new Set<string>();
  for (const e of list) {
    if (out.length >= MAX_REFLECTED_MEMORIES) break;
    const name = sanitizeMemorySlug(typeof e.name === 'string' ? e.name : '');
    const description =
      typeof e.description === 'string' ? e.description.replace(/\s+/g, ' ').trim() : '';
    const type = typeof e.type === 'string' ? e.type.trim().toLowerCase() : '';
    const body = typeof e.body === 'string' ? e.body.trim() : '';
    if (!name || name === 'memory') continue;
    if (seenNames.has(name)) continue;
    if (!description || !body) continue;
    if (!REFLECTED_MEMORY_TYPES.has(type)) continue;
    seenNames.add(name);
    out.push({
      name,
      description: description.slice(0, MAX_REFLECTION_DESCRIPTION_CHARS),
      type: type as ReflectedMemoryType,
      body: body.slice(0, MAX_REFLECTION_BODY_CHARS),
    });
  }
  return out;
}

/** `compacted <sessionID first 12 chars>` provenance tag for frontmatter. */
export function reflectionSourceTag(sourceSessionID: string): string {
  return provenanceTag('compacted', sourceSessionID);
}

/**
 * Turn parsed memories into a write plan against the project bucket.
 * Filename conflicts skip that memory instead of overwriting anything.
 */
export function planReflectionWrites(input: {
  memories: ReflectedMemory[];
  projectDir: string;
  existingFilenames?: Iterable<string>;
  sourceSessionID: string;
}): ProvenanceWritePlan {
  return planProvenanceWrites({
    memories: input.memories.map((m) => ({
      ...m,
      name: sanitizeMemorySlug(m.name),
    })),
    projectDir: input.projectDir,
    existingFilenames: input.existingFilenames,
    source: reflectionSourceTag(input.sourceSessionID),
    hookChars: 160,
    reflection: true,
  });
}
