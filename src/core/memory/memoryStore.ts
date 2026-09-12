/**
 * Shared write path for plugin-authored Topic Files (per-turn extraction,
 * compaction reflection). Model-authored writes go through the backend's
 * file-writing tool per the `# Memory` protocol instead — this module only
 * covers memories the plugin distills itself, which is why it owns the
 * provenance stamping.
 *
 * zmem twin: `metadata.node_type: memory` + `metadata.source:
 * extracted|compacted <session>` on every plugin-authored file, mirroring
 * the upstream stamping so a store written by either agent stays parseable
 * by both.
 */

import type { TopicManifestEntry } from './memoryManifest';
import type { MemoryFileSystem } from './memoryTypes';

/** Kebab-case slug for a distilled memory name ("" when unusable). */
export function sanitizeMemorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Provenance tag recorded in `metadata.source`. */
export function provenanceTag(kind: 'compacted' | 'extracted', sessionID: string): string {
  return `${kind} ${sessionID.slice(0, 12)}`;
}

/** YAML-safe scalar: double-quote when the value could break a bare scalar. */
export function yamlScalar(value: string): string {
  if (/[:#"'{}[\],&*?|>%@`]/u.test(value) || /^\s|\s$/u.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function memoryTitle(name: string): string {
  const words = name.replace(/-/g, ' ').trim();
  const first = words[0];
  return first ? first.toUpperCase() + words.slice(1) : name;
}

export function toSingleLine(text: string, maxChars: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line;
}

export type ProvenanceWrite = {
  filename: string;
  /** Vault-relative path (`.opencodian/memory/projects/<bucket>/<file>.md`). */
  filePath: string;
  /** Full Topic File content incl. frontmatter. */
  content: string;
  /** One-line MEMORY.md pointer (index-format convention). */
  indexLine: string;
};

export type DistilledMemoryType = 'user' | 'feedback' | 'project' | 'reference';

export type DistilledMemory = {
  name: string;
  description: string;
  type: DistilledMemoryType;
  body: string;
};

/** Types the model may propose; anything else is dropped by the parsers. */
export const DISTILLED_MEMORY_TYPES: ReadonlySet<string> = new Set([
  'user',
  'feedback',
  'project',
  'reference',
]);

/** Importance used when frontmatter omits `metadata.importance`. */
export const DEFAULT_IMPORTANCE = 3;

/** Clamp to the 1-5 band; anything unusable falls back to the default. */
export function parseImportanceValue(raw: string | undefined): number {
  if (!raw) return DEFAULT_IMPORTANCE;
  const n = Number.parseInt(raw.replace(/^["']|["']$/g, ''), 10);
  if (!Number.isFinite(n)) return DEFAULT_IMPORTANCE;
  return Math.min(5, Math.max(1, n));
}

/**
 * Index hook text: one line, no leading/trailing quotes. Descriptions are
 * model-authored and sometimes arrive wrapped in `"…"`.
 */
export function indexHookText(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim().replace(/^["'`]+|["'`]+$/g, '');
  return toSingleLine(cleaned, maxChars);
}

/**
 * Topic File content with the plugin's provenance frontmatter.
 */
export function buildProvenanceMemoryFile(input: {
  memory: DistilledMemory;
  source: string;
  /** Mark the file as a post-compaction reflection product. */
  reflection?: boolean;
}): string {
  const { memory } = input;
  return [
    '---',
    `name: ${yamlScalar(memory.name)}`,
    `description: ${yamlScalar(memory.description)}`,
    'metadata:',
    '  node_type: memory',
    `  type: ${memory.type}`,
    ...(input.reflection ? ['  reflection: true'] : []),
    `  source: ${yamlScalar(input.source)}`,
    '---',
    '',
    memory.body,
    '',
  ].join('\n');
}

export type ProvenanceWritePlan = {
  writes: ProvenanceWrite[];
  /** Memories that could not be written, with the reason. */
  skipped: Array<{ name: string; reason: string }>;
};

/**
 * Turn distilled memories into a write plan against the project bucket.
 * Filename conflicts (existing file, MEMORY.md, or duplicate within the
 * batch) skip that memory instead of overwriting anything — a distillation
 * never clobbers a model-authored file it happens to name alike.
 */
export function planProvenanceWrites(input: {
  memories: DistilledMemory[];
  /** Vault-relative project bucket dir. */
  projectDir: string;
  /** Existing filenames under the bucket (e.g. from buildTopicManifest). */
  existingFilenames?: Iterable<string>;
  /** Provenance tag written into `metadata.source`. */
  source: string;
  /** Description length for the index hook (default 160). */
  hookChars?: number;
  /** Mark written files as reflection products. */
  reflection?: boolean;
}): ProvenanceWritePlan {
  const taken = new Set(
    Array.from(input.existingFilenames ?? [], (f) => f.toLowerCase()),
  );
  taken.add('memory.md');
  const hookChars = input.hookChars ?? 160;

  const writes: ProvenanceWrite[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  for (const memory of input.memories) {
    const slug = sanitizeMemorySlug(memory.name);
    if (!slug || slug === 'memory') {
      skipped.push({ name: memory.name, reason: 'filename conflict' });
      continue;
    }
    const filename = `${slug}.md`;
    if (taken.has(filename.toLowerCase())) {
      skipped.push({ name: memory.name, reason: 'filename conflict' });
      continue;
    }
    taken.add(filename.toLowerCase());
    writes.push({
      filename,
      filePath: `${input.projectDir}/${filename}`,
      content: buildProvenanceMemoryFile({
        memory: { ...memory, name: slug },
        source: input.source,
        ...(input.reflection ? { reflection: true } : {}),
      }),
      indexLine: `- [${memoryTitle(slug)}](${filename}) — ${indexHookText(
        memory.description,
        hookChars,
      )}`,
    });
  }
  return { writes, skipped };
}

/**
 * Append index lines to MEMORY.md content. Missing/empty index gets the
 * standard header; lines already present verbatim are not duplicated.
 */
export function appendIndexLines(
  current: string | null | undefined,
  lines: string[],
): string {
  const existing = (current ?? '').replace(/\r\n/g, '\n');
  const fresh = lines.filter((l) => {
    const line = l.trim();
    return line.length > 0 && !existing.includes(line);
  });
  if (fresh.length === 0) {
    return existing.length > 0 ? ensureTrailingNewline(existing) : existing ?? '';
  }

  if (existing.trim().length === 0) {
    return ['# Memory Index', '', ...fresh, ''].join('\n');
  }
  return `${ensureTrailingNewline(existing)}${fresh.join('\n')}\n`;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

/**
 * Rewrite an index without the lines pointing at the given filenames
 * (forget flow). Lines whose link target basename matches are dropped;
 * everything else is preserved verbatim.
 */
export function removeIndexLines(
  current: string | null | undefined,
  filenames: ReadonlySet<string>,
): string {
  if (!current) return '';
  const lowered = new Set([...filenames].map((f) => f.toLowerCase()));
  const kept = current
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => {
      const m = line.match(/^-\s+\[[^\]]*\]\(([^)\s]+)\)/u);
      if (!m?.[1]) return true;
      const target = m[1].split('#')[0] ?? m[1];
      const base = target.slice(Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\')) + 1);
      return !lowered.has(base.toLowerCase());
    });
  return kept.join('\n');
}

/**
 * Persist a write plan through the filesystem port: Topic Files first, then
 * the MEMORY.md index. The index read-modify-write runs without awaits
 * between read and write of the index to keep the update atomic against the
 * caller's own concurrent writes.
 */
export async function writeMemoryWrites(input: {
  fs: MemoryFileSystem;
  writes: ProvenanceWrite[];
  /** Vault-relative MEMORY.md path. */
  indexPath: string;
}): Promise<number> {
  const { fs, writes } = input;
  if (writes.length === 0) return 0;

  for (const write of writes) {
    await fs.writeFile(write.filePath, write.content);
  }
  const current = await fs.readFile(input.indexPath);
  await fs.writeFile(
    input.indexPath,
    appendIndexLines(current, writes.map((w) => w.indexLine)),
  );
  return writes.length;
}


/**
 * Loose JSON array extraction from a model reply: accepts a bare array,
 * {"memories":[...]} or {"observations":[...]}, tolerates surrounding prose
 * and markdown fences by slicing between the first opening delimiter and
 * the last matching closing delimiter. Returns null when nothing parses —
 * callers fail soft to [].
 */
export function parseLooseJsonArray(text: string): ReadonlyArray<Record<string, unknown>> | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    const objStart = raw.indexOf('{');
    const arrStart = raw.indexOf('[');
    if (arrStart >= 0 && (objStart < 0 || arrStart < objStart)) {
      const arrEnd = raw.lastIndexOf(']');
      if (arrEnd <= arrStart) return null;
      parsed = JSON.parse(raw.slice(arrStart, arrEnd + 1));
    } else if (objStart >= 0) {
      const objEnd = raw.lastIndexOf('}');
      if (objEnd <= objStart) return null;
      parsed = JSON.parse(raw.slice(objStart, objEnd + 1));
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const container = parsed as { memories?: unknown; observations?: unknown };
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(container?.memories)
      ? container.memories
      : Array.isArray(container?.observations)
        ? container.observations
        : null;
  if (!list) return null;
  return (list as unknown[]).filter(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object',
  );
}

/** Re-exported so callers can build a manifest for conflict checking. */
export type { TopicManifestEntry };
