/**
 * `MEMORY.md` index rendering and budget caps.
 *
 * zmem twin (D13/D18/D28 + roadmap 1.2/1.3): 200 lines / 25KB cap with a
 * WARNING footer, archived-tail cut, type partitioning (feedback → user →
 * project → reference) sorted by importance × recency, and a MAINTENANCE
 * hint when the cap clips an index that has no archived marker. The on-disk
 * index is never rewritten here — display layer only.
 */

import type { TopicManifestEntry } from './memoryManifest';
import { byteLength } from './memoryTypes';

const MAX_LINES = 200;
const MAX_BYTES = 25_000;
const FRONTMATTER_RE = /^---\s*\n[\s\S]*?---\s*\n?/u;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/gu;

/**
 * Tail marker separating archived index lines. Everything from this marker
 * on stays on disk but is never injected.
 */
export const ARCHIVED_SECTION_MARKER =
  '<!-- archived: still on disk, not injected by default -->';

/** Fixed type partition order: feedback first, procedural value highest. */
export const INDEX_SECTION_ORDER = ['feedback', 'user', 'project', 'reference'] as const;

export const MEMORY_INDEX_MAX_LINES = MAX_LINES;
export const MEMORY_INDEX_MAX_BYTES = MAX_BYTES;

function formatBytes(n: number): string {
  const kb = n / 1024;
  if (kb < 1) return `${n} bytes`;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\.0$/u, '')}KB`;
  const mb = kb / 1024;
  return mb < 1024
    ? `${mb.toFixed(1).replace(/\.0$/u, '')}MB`
    : `${(mb / 1024).toFixed(1).replace(/\.0$/u, '')}GB`;
}

/** Strip leading YAML frontmatter if present. */
export function stripLeadingFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, '');
}

/** Strip top-level HTML comments (archived marker is handled before this). */
export function stripTopLevelMarkdownHtmlComments(content: string): string {
  if (!content.includes('<!--')) return content;
  return content.replace(HTML_COMMENT_RE, '');
}

/**
 * Drop the archived tail: everything from the `<!-- archived: ... -->`
 * marker on is not injected. Cuts at the marker position so the marker
 * itself never leaks through.
 */
export function cutAtArchivedSection(content: string): string {
  const idx = content.search(/<!--[ \t]*archived:/iu);
  return idx === -1 ? content : content.slice(0, idx);
}

/** Does the raw on-disk index carry the archived tail marker? */
export function hasArchivedMarker(content: string): boolean {
  return /<!--[ \t]*archived:/iu.test(content);
}

const INDEX_LINE_RE = /^-\s+\[[^\]]*\]\(([^)\s]+)\)/u;
const SECTION_HEADER_RE = /^#{1,6}\s+\S/u;

/**
 * Re-render a pure bullet index grouped by type partition, each section
 * sorted by importance desc × recency. Bullets not backed by a manifest
 * entry keep their original order at the tail. Content that is not a pure
 * bullet index passes through unchanged, so old-format indexes keep
 * injecting as before.
 */
export function renderPartitionedIndex(
  content: string,
  manifest: TopicManifestEntry[],
): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');

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
  if (bullets.length === 0 || sawOther) return content.replace(/\r\n/g, '\n');

  const byFilename = new Map(
    manifest.map((e) => [e.filename.toLowerCase(), e]),
  );
  const sections = new Map<string, Array<TopicManifestEntry & { line: string; order: number }>>();
  for (const b of bullets) {
    const target = basename(b.target.split('#')[0] ?? b.target);
    const entry = byFilename.get(target.toLowerCase());
    if (!entry) {
      tail.push(b.line);
      continue;
    }
    const known = (INDEX_SECTION_ORDER as readonly string[]).includes(
      entry.type ?? '',
    );
    const section = known ? (entry.type as string) : 'project';
    const bucket = sections.get(section) ?? [];
    bucket.push({ ...entry, line: b.line, order: b.order });
    sections.set(section, bucket);
  }

  const out: string[] = [header ?? '# Memory Index'];
  for (const section of INDEX_SECTION_ORDER) {
    const bucket = sections.get(section);
    if (!bucket?.length) continue;
    bucket.sort(
      (a, b) =>
        b.importance - a.importance ||
        b.mtimeMs - a.mtimeMs ||
        a.order - b.order,
    );
    out.push('', `## ${section.charAt(0).toUpperCase()}${section.slice(1)}`);
    for (const item of bucket) out.push(item.line);
  }
  if (tail.length > 0) out.push('', ...tail);
  return out.join('\n');
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx === -1 ? p : p.slice(idx + 1);
}

/**
 * Longest prefix of `s` fitting `maxBytes` UTF-8 bytes. Iterates code points
 * so a multibyte character is never cut in half.
 */
function takeBytes(s: string, maxBytes: number): string {
  let used = 0;
  let end = 0;
  for (const ch of s) {
    const cost = byteLength(ch);
    if (used + cost > maxBytes) break;
    used += cost;
    end += ch.length;
  }
  return s.slice(0, end);
}

/**
 * Byte-accurate clipping: accumulate WHOLE LINES while the UTF-8 byte budget
 * holds (a char-index cut overshoots for CJK content, 3 bytes per char). A
 * single line longer than the budget falls back to a code-point-safe byte
 * prefix.
 */
function clipToByteBudget(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (byteLength(text) <= maxBytes) return text;
  const kept: string[] = [];
  let used = 0;
  for (const line of text.split('\n')) {
    const cost = byteLength(line) + (kept.length > 0 ? 1 : 0);
    if (used + cost > maxBytes) break;
    kept.push(line);
    used += cost;
  }
  if (kept.length === 0) return takeBytes(text, maxBytes);
  return kept.join('\n');
}

/**
 * Cap the index body; append WARNING when truncated. `hasArchivedMarkerOnDisk`
 * is passed in (not sniffed) because the injection pipeline cuts the
 * archived tail first — a sniff would nag a store that already archives.
 */
export function formatMemoryIndexContent(
  content: string,
  hasArchivedMarkerOnDisk = false,
): string {
  const trimmed = content.trim();
  if (!trimmed) return '';

  const lines = trimmed.split('\n');
  const lineCount = lines.length;
  const indexBytes = byteLength(trimmed);
  const tooManyLines = lineCount > MAX_LINES;
  const tooManyBytes = indexBytes > MAX_BYTES;

  if (!tooManyLines && !tooManyBytes) return trimmed;

  const reason =
    tooManyBytes && !tooManyLines
      ? `${formatBytes(indexBytes)} (limit: ${formatBytes(MAX_BYTES)}) — index entries are too long`
      : tooManyLines && !tooManyBytes
        ? `${lineCount} lines (limit: ${MAX_LINES})`
        : `${lineCount} lines and ${formatBytes(indexBytes)}`;

  const warning =
    `\n\n> WARNING: MEMORY.md is ${reason}. Only part of it was loaded. ` +
    'Keep index entries to one line under ~200 chars; move detail into topic files.';
  // Archiving is the model's job (the plugin never moves index lines), so an
  // index that overflows without a tail marker needs the reminder spelled
  // out — otherwise the cap silently clips it at injection forever.
  const archiveHint =
    '\n> MAINTENANCE: while you are next in this store, move the lowest-value / oldest index lines ' +
    `below the marker \`${ARCHIVED_SECTION_MARKER}\`. Archived entries stay readable on disk but are never injected and never count toward this limit. ` +
    'Move only index lines — never delete a Topic File for this.';
  const tail = hasArchivedMarkerOnDisk ? warning : `${warning}${archiveHint}`;
  // The tail is part of the injected output, so the clipped body reserves
  // room for it: body + tail stays within MAX_BYTES even for all-CJK text.
  const bodyBudget = Math.max(0, MAX_BYTES - byteLength(tail));
  const lineClipped = tooManyLines ? lines.slice(0, MAX_LINES).join('\n') : trimmed;
  const clipped = clipToByteBudget(lineClipped, bodyBudget);

  return `${clipped}${tail}`;
}

/**
 * Reflection-facing view: archived lines stay visible so the model can see
 * archived topics and avoid re-proposing them.
 */
export function formatProjectMemoryIndexContent(raw: string): string {
  return formatMemoryIndexContent(
    stripTopLevelMarkdownHtmlComments(stripLeadingFrontmatter(raw)),
    hasArchivedMarker(raw),
  );
}

/**
 * Injection-time index rendering: drop the archived tail, re-partition
 * bullets when a manifest is supplied, then apply the cap. Archived lines
 * never count toward the cap.
 */
export function formatIndexForInjection(
  raw: string,
  manifest?: TopicManifestEntry[],
): string {
  const wasArchived = hasArchivedMarker(raw);
  const withoutArchived = cutAtArchivedSection(stripLeadingFrontmatter(raw));
  const withoutComments = stripTopLevelMarkdownHtmlComments(withoutArchived);
  const body = manifest
    ? renderPartitionedIndex(withoutComments, manifest)
    : withoutComments;
  return formatMemoryIndexContent(body, wasArchived);
}

/**
 * The index block body injected per epoch: the agentsMd-style header line
 * plus the capped index content. Outer NOT-a-request framing lives in the
 * injection planner (memoryInjection.ts), not here.
 */
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
