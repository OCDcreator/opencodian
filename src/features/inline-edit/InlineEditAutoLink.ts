/**
 * InlineEditAutoLink — deterministic post-processing that links occurrences
 * of verified reference-note headings in generated text
 * (docs/requirements/flowtext-parity.md R-B1).
 *
 * This is the *mechanism* layer: the prompt may ask the model to keep
 * recognizable wording, but every inserted link comes from here, never from
 * model output. Rules:
 *
 * - a link target must be a heading that really exists in the reference
 *   note's `CachedMetadata.headings` — otherwise no link is inserted
 *   （宁可不链，不产生死链）;
 * - matching is exact modulo heading level, case, and full/half width
 *   (per-character NFKC + lowercase with an index map back to the original
 *   text, so the display text keeps the model's original wording);
 * - fenced code blocks, inline code spans, and existing wikilink/markdown
 *   links are never touched;
 * - a heading links only when it is distinctive enough: ≥ 2 CJK characters
 *   or ≥ 4 western words, and not in the user's excluded-term list;
 * - the same heading text in two reference notes is ambiguous and never
 *   linked;
 * - insertion happens on the final text before the user sees it — for the
 *   inline-edit path on the strictly-parsed result before the diff preview
 *   is rendered, for the chat path once the turn's assistant text is final —
 *   so the user sees every link and stored and rendered text agree.
 *
 * Everything except the small Obsidian-facing factory at the bottom is pure
 * and unit-testable without Obsidian or a model.
 */

import type { App, Vault } from 'obsidian';
import { TFile } from 'obsidian';

/** Link syntax follows the vault config (R-B1). */
export type AutoLinkStyle = 'wiki' | 'markdown';

/** One reference note with the headings verified to exist in it. */
export interface AutoLinkReferenceNote {
  readonly path: string;
  readonly headings: readonly string[];
}

export interface AutoInternalLinkOptions {
  readonly style: AutoLinkStyle;
  /** Original-wording terms that must never be linked (R-B1 误报控制). */
  readonly excludedTerms: readonly string[];
}

export interface AutoInternalLinkResult {
  readonly text: string;
  /** How many links were inserted (0 ⇒ byte-identical to the input). */
  readonly insertedCount: number;
}

/** Distinctiveness threshold: CJK headings need at least this many chars. */
export const AUTO_LINK_MIN_CJK_CHARS = 2;
/** Distinctiveness threshold: western headings need at least this many words. */
export const AUTO_LINK_MIN_WESTERN_WORDS = 4;

interface AutoLinkCandidate {
  readonly key: string;
  readonly path: string;
  readonly heading: string;
  readonly western: boolean;
}

interface ProtectedZone {
  readonly start: number;
  readonly end: number;
}

interface AcceptedMatch {
  readonly start: number;
  readonly stop: number;
  readonly candidate: AutoLinkCandidate;
}

/**
 * Insert internal links for verified reference-note headings into `text`.
 * Pure: callers supply the verified headings, so a dead link can never be
 * produced by construction.
 */
export function applyAutoInternalLinks(
  text: string,
  references: readonly AutoLinkReferenceNote[],
  options: AutoInternalLinkOptions,
): AutoInternalLinkResult {
  if (!text || references.length === 0) return { text, insertedCount: 0 };

  const candidates = buildCandidates(references, options.excludedTerms);
  if (candidates.length === 0) return { text, insertedCount: 0 };

  const zones = computeProtectedZones(text);
  const { folded, map } = foldWithMap(text);

  // Longest key first, so "注意力机制" wins over "注意力" at the same spot;
  // ties broken by path for a fully deterministic result.
  const ordered = [...candidates].sort((a, b) =>
    b.key.length - a.key.length || a.path.localeCompare(b.path));

  const accepted: AcceptedMatch[] = [];
  for (const candidate of ordered) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(candidate.key, from);
      if (at < 0) break;
      const end = at + candidate.key.length;
      from = end;
      const start = map[at] ?? 0;
      const stop = end < folded.length ? (map[end] ?? text.length) : text.length;
      if (candidate.western && !hasWordBoundaries(text, start, stop)) continue;
      if (intersectsZones(zones, start, stop)) continue;
      if (accepted.some((m) => start < m.stop && stop > m.start)) continue;
      accepted.push({ start, stop, candidate });
    }
  }

  if (accepted.length === 0) return { text, insertedCount: 0 };

  accepted.sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const match of accepted) {
    out += text.slice(cursor, match.start);
    const display = text.slice(match.start, match.stop);
    out += formatAutoLink(options.style, match.candidate, display);
    cursor = match.stop;
  }
  out += text.slice(cursor);
  return { text: out, insertedCount: accepted.length };
}

/** Normalize one heading for comparison: strip level marks, trim, fold. */
export function normalizeAutoLinkKey(raw: string): string {
  return foldWithMap(raw.replace(/^#+\s*/, '').trim()).folded;
}

function buildCandidates(
  references: readonly AutoLinkReferenceNote[],
  excludedTerms: readonly string[],
): AutoLinkCandidate[] {
  const excluded = new Set(excludedTerms.map((term) => normalizeAutoLinkKey(term)));
  const byKey = new Map<string, AutoLinkCandidate>();
  const ambiguous = new Set<string>();

  for (const note of references) {
    const noteKeys = new Set<string>();
    for (const heading of note.headings) {
      const key = normalizeAutoLinkKey(heading);
      if (!key || noteKeys.has(key)) continue;
      noteKeys.add(key);
      const existing = byKey.get(key);
      if (existing && existing.path !== note.path) {
        // Same heading text in two reference notes: never guess (R-B1).
        ambiguous.add(key);
        continue;
      }
      byKey.set(key, { key, path: note.path, heading: heading.trim(), western: !containsCjk(key) });
    }
  }

  const candidates: AutoLinkCandidate[] = [];
  for (const candidate of byKey.values()) {
    if (ambiguous.has(candidate.key)) continue;
    if (excluded.has(candidate.key)) continue;
    if (!isDistinctive(candidate.key, candidate.western)) continue;
    candidates.push(candidate);
  }
  return candidates;
}

function containsCjk(folded: string): boolean {
  for (const ch of folded) {
    if (isCjkCodePoint(ch.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

function isCjkCodePoint(code: number): boolean {
  return (code >= 0x4E00 && code <= 0x9FFF)
    || (code >= 0x3400 && code <= 0x4DBF)
    || (code >= 0xF900 && code <= 0xFAFF)
    || (code >= 0x3040 && code <= 0x30FF)
    || (code >= 0xAC00 && code <= 0xD7AF);
}

function isDistinctive(foldedKey: string, western: boolean): boolean {
  if (western) {
    const words = foldedKey.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
    return words.length >= AUTO_LINK_MIN_WESTERN_WORDS;
  }
  let cjk = 0;
  for (const ch of foldedKey) {
    if (isCjkCodePoint(ch.codePointAt(0) ?? 0)) cjk += 1;
  }
  return cjk >= AUTO_LINK_MIN_CJK_CHARS;
}

/**
 * Fold the text (per code point: NFKC + lowercase) and remember, for every
 * folded character, the index of the original character it came from, so a
 * folded match can be mapped back to the original wording.
 */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length;) {
    const code = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(code);
    i += ch.length;
    const piece = ch.normalize('NFKC').toLowerCase();
    for (let p = 0; p < piece.length; p += 1) {
      folded += piece[p];
      map.push(i - ch.length);
    }
  }
  return { folded, map };
}

function hasWordBoundaries(text: string, start: number, end: number): boolean {
  return !isWordCodePoint(codePointBefore(text, start))
    && !isWordCodePoint(codePointAtOrNull(text, end));
}

function isWordCodePoint(code: number | null): boolean {
  if (code === null) return false;
  return /[\p{L}\p{N}_]/u.test(String.fromCodePoint(code));
}

function codePointBefore(text: string, index: number): number | null {
  if (index <= 0) return null;
  const previous = text.charCodeAt(index - 1);
  if (previous >= 0xDC00 && previous <= 0xDFFF && index >= 2) {
    return text.codePointAt(index - 2) ?? null;
  }
  return previous;
}

function codePointAtOrNull(text: string, index: number): number | null {
  if (index >= text.length) return null;
  return text.codePointAt(index) ?? null;
}

function intersectsZones(zones: readonly ProtectedZone[], start: number, end: number): boolean {
  return zones.some((zone) => start < zone.end && end > zone.start);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regions where links are never inserted: fenced code blocks (``` or ~~~),
 * inline code spans, wikilinks, and markdown links (R-B1).
 */
function computeProtectedZones(text: string): ProtectedZone[] {
  const zones: ProtectedZone[] = [];
  const lines = text.split('\n');
  let offset = 0;
  let fence: { marker: string; start: number } | null = null;
  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    if (fence) {
      if (new RegExp(`^\\s{0,3}${escapeRegExp(fence.marker)}\\s*$`).test(line)) {
        zones.push({ start: fence.start, end: offset - 1 });
        fence = null;
      }
      continue;
    }
    const open = /^\s{0,3}(```+|~~~+)/.exec(line);
    if (open) fence = { marker: open[1] ?? '```', start: lineStart };
  }
  if (fence) zones.push({ start: fence.start, end: text.length });

  const inlinePatterns = [
    /\[\[[^\]\n]*\]\]/g, // wikilink
    /\[[^\]\n]*\]\([^)\n]*\)/g, // markdown link / image
    /`[^`\n]*`/g, // inline code
  ];
  for (const pattern of inlinePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (!intersectsZones(zones, start, end)) zones.push({ start, end });
    }
  }
  return zones.sort((a, b) => a.start - b.start);
}

function formatAutoLink(style: AutoLinkStyle, candidate: AutoLinkCandidate, display: string): string {
  const target = `${candidate.path}#${candidate.heading}`;
  if (style === 'wiki') {
    // No pipe when the wording already equals the heading: the shortest
    // link form renders identically and stays idiomatic.
    return display === candidate.heading ? `[[${target}]]` : `[[${target}|${display}]]`;
  }
  const destination = /[\s()]/.test(target) ? `<${target}>` : target;
  return `[${display}](${destination})`;
}

/**
 * Apply the R-B1 auto-internal-link pass to one strictly-parsed result.
 * Pure orchestration: maps the edit's attached entries to the wire shape and
 * delegates to the host seam; a host without the seam (setting off) leaves
 * the text byte-identical.
 */
export function applyInlineEditAutoLinks(
  link: AutoInternalLinkProcessor | undefined,
  contextFiles: readonly { readonly path: string; readonly kind?: 'file' | 'folder' }[],
  text: string,
): string {
  if (!link) return text;
  const attachedNotes = contextFiles.map((file) => ({
    path: file.path,
    ...(file.kind ? { kind: file.kind } : {}),
  }));
  return link(text, attachedNotes);
}

// -----------------------------------------------------------------------------
// Obsidian-facing glue (the only non-pure part of R-B1)
// -----------------------------------------------------------------------------

/**
 * The R-B1 host seam shared by the inline-edit path and the chat path: given
 * the final generated text and the turn's attached note entries, returns the
 * text with verified internal links inserted (or byte-identically unchanged
 * when the setting is off, nothing is attached, or nothing qualifies).
 */
export type AutoInternalLinkProcessor = (
  text: string,
  attachedNotes: readonly { readonly path: string; readonly kind?: 'file' | 'folder' }[],
) => string;

export interface InlineEditAutoLinkProcessorDeps {
  readonly app: App;
  readonly isEnabled: () => boolean;
  readonly getExcludedTerms: () => readonly string[];
}

/**
 * Build the R-B1 auto-internal-link processor. Both consumers — the inline
 * edit controller (before the diff preview) and the chat finalization
 * service (once the turn's assistant text is final) — call this same seam,
 * so matching/verification semantics cannot drift between the two paths.
 * Returns the text unchanged (byte-identical) whenever the feature is off,
 * nothing is attached, or no heading matches — so the off path is a strict
 * regression of the previous behaviour.
 */
export function createInlineEditAutoLinkProcessor(
  deps: InlineEditAutoLinkProcessorDeps,
): AutoInternalLinkProcessor {
  return (text, attachedNotes) => {
    if (!deps.isEnabled()) return text;
    const references = collectReferenceNotes(deps.app, attachedNotes);
    if (references.length === 0) return text;
    return applyAutoInternalLinks(text, references, {
      style: resolveVaultLinkStyle(deps.app),
      excludedTerms: deps.getExcludedTerms(),
    }).text;
  };
}

/**
 * The vault's "Use [[Wikilinks]]" setting decides the link syntax (R-B1).
 * `Vault.getConfig` is not in the public type declarations but is the
 * documented runtime seam plugins use for vault config; when it is missing
 * the wikilink form is the safe default.
 */
function resolveVaultLinkStyle(app: App): AutoLinkStyle {
  const vault = app.vault as Vault & { getConfig?: (key: string) => unknown };
  return vault.getConfig?.('useWikiLinks') === false ? 'markdown' : 'wiki';
}

function collectReferenceNotes(
  app: App,
  attachedNotes: readonly { path: string; kind?: 'file' | 'folder' }[],
): AutoLinkReferenceNote[] {
  const references: AutoLinkReferenceNote[] = [];
  for (const note of attachedNotes) {
    // Directory entries carry no verifiable headings of their own; the model
    // reads them on demand. Only file entries can ground a link (R-B1).
    if (note.kind === 'folder') continue;
    const abstract = app.vault.getAbstractFileByPath(note.path);
    if (!(abstract instanceof TFile)) continue;
    const headings = app.metadataCache.getFileCache(abstract)?.headings?.map((h) => h.heading) ?? [];
    if (headings.length > 0) references.push({ path: abstract.path, headings });
  }
  return references;
}
