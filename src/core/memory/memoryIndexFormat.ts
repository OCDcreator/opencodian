import { basename } from "node:path";

import type { TopicManifestEntry } from './memoryManifest';

const MAX_LINES = 200;
/**
 * ZCode's index cap is a CHARACTER budget, not a byte budget
 * (`MEMORY_INDEX_CHARACTER_LIMIT` in ZCode's `memory/index-content.ts`):
 * the unit is JS string length, so 25,000 CJK characters fit exactly like
 * 25,000 ASCII characters. `Buffer.byteLength(..., "utf8")` would give CJK
 * content a three-times tighter budget than ZCode.
 */
const MAX_CHARS = 25_000;
const FRONTMATTER_RE = /^---\s*\n[\s\S]*?---\s*\n?/u;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/gu;

/**
 * Tail marker separating archived index lines (roadmap 1.3). Everything from
 * this marker on stays on disk but is never injected.
 */
export const ARCHIVED_SECTION_MARKER =
  "<!-- archived: still on disk, not injected by default -->";

/** Fixed type partition order (roadmap 1.3): feedback first, procedural value highest. */
export const INDEX_SECTION_ORDER = ["feedback", "user", "project", "reference"] as const;

/**
 * ZCode's size display helper, kept verbatim: it divides the CHARACTER count
 * by 1024 and prints "KB". A 25,000-character (or 25,001-character) index
 * therefore still reads "24.4KB" — that is upstream behavior, not a byte
 * measurement. Do not "fix" it by switching to `Buffer.byteLength`.
 */
function formatBytes(n: number): string {
  const kb = n / 1024;
  if (kb < 1) return `${n} bytes`;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\.0$/u, "")}KB`;
  const mb = kb / 1024;
  return mb < 1024
    ? `${mb.toFixed(1).replace(/\.0$/u, "")}MB`
    : `${(mb / 1024).toFixed(1).replace(/\.0$/u, "")}GB`;
}

/** Strip leading YAML frontmatter if present. */
export function stripLeadingFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, "");
}

/**
 * Strip top-level HTML comments (ZCode twin). Simple regex approach —
 * good enough for MEMORY.md indexes that shouldn't embed HTML blocks.
 */
export function stripTopLevelMarkdownHtmlComments(content: string): string {
  if (!content.includes("<!--")) return content;
  return content.replace(HTML_COMMENT_RE, "");
}

/**
 * Drop the archived tail (roadmap 1.3): everything from the
 * `<!-- archived: ... -->` marker is not injected. Cuts at the marker
 * position (line-start or inline) so the marker itself never leaks through.
 */
export function cutAtArchivedSection(content: string): string {
  const idx = content.search(/<!--[ \t]*archived:/iu);
  return idx === -1 ? content : content.slice(0, idx);
}

const INDEX_LINE_RE = /^-\s+\[[^\]]*\]\(([^)\s]+)\)/u;
const SECTION_HEADER_RE = /^#{1,6}\s+\S/u;

/**
 * Re-render a pure bullet index grouped by type partition
 * (feedback → user → project → reference), each section sorted by
 * importance desc × recency (roadmap 1.2 + 1.3). Entries with a missing or
 * unknown type fall into the project partition (importance-default twin);
 * bullets not backed by a manifest entry keep their original order at the
 * tail. Content that is not a pure bullet index (free text, existing
 * `##` sections are tolerated and rebuilt) passes through unchanged, so
 * old-format indexes keep injecting as before.
 */
export function renderPartitionedIndex(
  content: string,
  manifest: TopicManifestEntry[],
): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  const bullets: Array<{ line: string; target: string; order: number }> = [];
  const tail: string[] = [];
  let header: string | null = null;
  let sawOther = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!header && /^#\s+\S/u.test(line)) {
      header = line;
      continue;
    }
    if (SECTION_HEADER_RE.test(line)) continue; // old section headers get rebuilt
    const m = line.match(INDEX_LINE_RE);
    if (m?.[1]) {
      bullets.push({ line, target: m[1], order: bullets.length });
      continue;
    }
    sawOther = true;
  }
  if (bullets.length === 0 || sawOther) return content.replace(/\r\n/g, "\n");

  const byFilename = new Map(
    manifest.map((e) => [e.filename.toLowerCase(), e]),
  );
  const sections = new Map<string, Array<TopicManifestEntry & { line: string; order: number }>>();
  for (const b of bullets) {
    const target = basename(b.target.split("#")[0] ?? b.target);
    const entry = byFilename.get(target.toLowerCase());
    if (!entry) {
      tail.push(b.line);
      continue;
    }
    const known = (INDEX_SECTION_ORDER as readonly string[]).includes(
      entry.type ?? "",
    );
    const section = known ? (entry.type as string) : "project";
    const bucket = sections.get(section) ?? [];
    bucket.push({ ...entry, line: b.line, order: b.order });
    sections.set(section, bucket);
  }

  const out: string[] = [header ?? "# Memory Index"];
  for (const section of INDEX_SECTION_ORDER) {
    const bucket = sections.get(section);
    if (!bucket?.length) continue;
    bucket.sort(
      (a, b) =>
        b.importance - a.importance ||
        b.mtimeMs - a.mtimeMs ||
        a.order - b.order,
    );
    out.push("", `## ${section.charAt(0).toUpperCase()}${section.slice(1)}`);
    for (const item of bucket) out.push(item.line);
  }
  if (tail.length > 0) out.push("", ...tail);
  return out.join("\n");
}

/**
 * Longest prefix of `s` fitting `maxChars` characters (JS string length, the
 * ZCode unit). Iterates code points so an astral character (surrogate pair)
 * is never cut in half.
 */
function takeChars(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  let used = 0;
  let end = 0;
  for (const ch of s) {
    if (used + ch.length > maxChars) break;
    used += ch.length;
    end += ch.length;
  }
  return s.slice(0, end);
}

/**
 * Character-accurate clipping: accumulate WHOLE LINES while the CHARACTER
 * budget holds (never a `Buffer.byteLength`-based cut — ZCode counts JS
 * string length, so a CJK line costs its character count, not 3× that in
 * UTF-8 bytes). A single line longer than the budget falls back to a
 * code-point-safe character prefix.
 */
function clipToCharBudget(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  const kept: string[] = [];
  let used = 0;
  for (const line of text.split("\n")) {
    const cost = line.length + (kept.length > 0 ? 1 : 0);
    if (used + cost > maxChars) break;
    kept.push(line);
    used += cost;
  }
  if (kept.length === 0) return takeChars(text, maxChars);
  return kept.join("\n");
}

/**
 * Cap MEMORY.md body; append WARNING when truncated.
 *
 * The cap is ZCode's: 200 lines / 25,000 characters (JS string length, not
 * UTF-8 bytes), and the WARNING wording mirrors ZCode's too.
 *
 * `hasArchivedMarker` says whether the ON-DISK index already carries the
 * archived tail marker. It has to be passed in rather than sniffed from
 * `content`, because the injection pipeline cuts the archived tail off
 * first — so by the time this runs the marker is gone either way, and a
 * sniff would nag a store that is already archiving correctly.
 */
export function formatMemoryIndexContent(
  content: string,
  hasArchivedMarker = false,
): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  const lines = trimmed.split("\n");
  const lineCount = lines.length;
  const characterCount = trimmed.length;
  const tooManyLines = lineCount > MAX_LINES;
  const tooManyChars = characterCount > MAX_CHARS;

  if (!tooManyLines && !tooManyChars) return trimmed;

  // Wording is ZCode `index-content.ts` verbatim (`formatBytes` still
  // displays the character count as if it were bytes).
  const reason =
    tooManyChars && !tooManyLines
      ? `${formatBytes(characterCount)} (limit: ${formatBytes(MAX_CHARS)}) — index entries are too long`
      : tooManyLines && !tooManyChars
        ? `${lineCount} lines (limit: ${MAX_LINES})`
        : `${lineCount} lines and ${formatBytes(characterCount)}`;

  const warning =
    `\n\n> WARNING: MEMORY.md is ${reason}. Only part of it was loaded. ` +
    "Keep index entries to one line under ~200 chars; move detail into topic files.";
  // Archiving is the model's job (the plugin never moves index lines), so an
  // index that overflows without a tail marker needs the reminder spelled
  // out — otherwise the cap silently clips it at injection forever.
  const archiveHint =
    "\n> MAINTENANCE: while you are next in this store, move the lowest-value / oldest index lines " +
    `below the marker \`${ARCHIVED_SECTION_MARKER}\`. Archived entries stay readable on disk but are never injected and never count toward this limit. ` +
    "Move only index lines — never delete a Topic File for this.";
  const tail = hasArchivedMarker ? warning : `${warning}${archiveHint}`;
  // The warning is part of the injected output, so the clipped body must
  // reserve room for it: the FINAL string (body + tail) stays within
  // MAX_CHARS characters even for all-CJK content.
  const bodyBudget = Math.max(0, MAX_CHARS - tail.length);
  const lineClipped = tooManyLines ? lines.slice(0, MAX_LINES).join("\n") : trimmed;
  const clipped = clipToCharBudget(lineClipped, bodyBudget);

  return `${clipped}${tail}`;
}

/**
 * Reflection-facing view (roadmap 1.1): archived lines stay visible so the
 * model can see archived topics and avoid re-proposing them.
 */
export function formatProjectMemoryIndexContent(raw: string): string {
  return formatMemoryIndexContent(
    stripTopLevelMarkdownHtmlComments(stripLeadingFrontmatter(raw)),
    /<!--[ \t]*archived:/iu.test(raw),
  );
}

/**
 * Injection-time index rendering (roadmap 1.2 + 1.3): drop the archived
 * tail, re-partition bullets when a manifest is supplied, then apply the
 * 200-line / 25,000-character cap. Archived lines never count toward the
 * cap. The on-disk MEMORY.md is never rewritten here — display layer only.
 */
export function formatIndexForInjection(
  raw: string,
  manifest?: TopicManifestEntry[],
): string {
  const wasArchived = /<!--[ \t]*archived:/iu.test(raw);
  const withoutArchived = cutAtArchivedSection(stripLeadingFrontmatter(raw));
  const withoutComments = stripTopLevelMarkdownHtmlComments(withoutArchived);
  const body = manifest
    ? renderPartitionedIndex(withoutComments, manifest)
    : withoutComments;
  return formatMemoryIndexContent(body, wasArchived);
}

/**
 * Injected memory index prefix.
 *
 * Framing matters: the previous format copied ZCode's context_prefix, which
 * opened with `# agentsMd` + "These instructions OVERRIDE any default behavior
 * and you MUST follow them exactly as written." That made models treat the
 * memory index as a command (e.g. replying "Memory loaded ... Ready.") and
 * skip the real user request that followed. The injected block is now wrapped
 * in a distinct bracket tag and explicitly labeled as reference context — not
 * a request — with the user's actual message flagged as coming after.
 */

export const MEMORY_INDEX_MAX_LINES = MAX_LINES;
export const MEMORY_INDEX_MAX_CHARS = MAX_CHARS;
/** @deprecated Budget is characters; retained for source compatibility. */
export const MEMORY_INDEX_MAX_BYTES = MAX_CHARS;
export function hasArchivedMarker(raw: string): boolean { return /<!--[ \t]*archived:/iu.test(raw); }

export function buildMemoryIndexBlock(
  memoryIndexPath: string,
  memoryIndexContent: string,
  manifest?: TopicManifestEntry[],
): string | null {
  const formatted = formatIndexForInjection(memoryIndexContent, manifest);
  if (!formatted) return null;
  return [
    `Contents of ${memoryIndexPath} (user's auto-memory, persists across conversations):`,
    '',
    formatted,
  ].join('\n');
}
