/**
 * RelevantNotesModel — R-E3 (advantage-parity): pure computation for the
 * relevant-notes side panel (Copilot's Relevant Notes, local-first).
 *
 * Two channels, grouped and independently collapsible:
 * - graph: outgoing + incoming link neighbours of the active note, read from
 *   Obsidian's resolvedLinks map — same source of truth as the backlinks
 *   pane, so the two agree by construction;
 * - retrieval: the R-C1 whole-vault index (`VaultIndexService.select`),
 *   queried with the active note's own text — no second index is ever built
 *   (hard constraint: reuse `.opencodian/vault-index/`).
 *
 * Pure by design: every function takes plain data so the grouping, ranking
 * and query-building semantics stay unit-testable without Obsidian.
 */

/** One resolvedLinks map entry: note path → linked note path → count. */
export type ResolvedLinksMap = Record<string, Record<string, number>>;

export interface GraphNeighbour {
  path: string;
  /** Combined outgoing + incoming link count against the active note. */
  linkCount: number;
  direction: 'outgoing' | 'incoming' | 'both';
}

/**
 * Graph-channel computation: neighbours of `activePath` in the resolved link
 * graph. The active note itself never appears; results rank by combined link
 * count (desc) then path for determinism.
 */
export function computeGraphNeighbours(
  resolvedLinks: ResolvedLinksMap,
  activePath: string,
): GraphNeighbour[] {
  const neighbours = new Map<string, { outgoing: number; incoming: number }>();
  const activeOutgoing = resolvedLinks[activePath] ?? {};
  for (const [target, count] of Object.entries(activeOutgoing)) {
    if (target === activePath) {
      continue;
    }
    const entry = neighbours.get(target) ?? { outgoing: 0, incoming: 0 };
    entry.outgoing += count;
    neighbours.set(target, entry);
  }
  for (const [source, links] of Object.entries(resolvedLinks)) {
    if (source === activePath) {
      continue;
    }
    const count = links[activePath] ?? 0;
    if (count === 0) {
      continue;
    }
    const entry = neighbours.get(source) ?? { outgoing: 0, incoming: 0 };
    entry.incoming += count;
    neighbours.set(source, entry);
  }
  return [...neighbours.entries()]
    .map(([path, counts]) => ({
      path,
      linkCount: counts.outgoing + counts.incoming,
      direction: counts.outgoing > 0 && counts.incoming > 0
        ? ('both' as const)
        : counts.outgoing > 0 ? ('outgoing' as const) : ('incoming' as const),
    }))
    .sort((a, b) => b.linkCount - a.linkCount || a.path.localeCompare(b.path));
}

/**
 * Retrieval-channel query: the active note's headings and prose, bounded —
 * the index ranks by token intersection, so title + first body chunk carries
 * the note's vocabulary without feeding the whole file through ranking.
 */
export function buildRetrievalQuery(noteContent: string, maxChars = 2000): string {
  const normalized = noteContent
    .replace(/^---[\s\S]*?---\s*/u, '') // frontmatter: ids/dates add noise
    .replace(/```[\s\S]*?```/gu, ' ') // code blocks: syntax noise
    .replace(/[#*`>[\]]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized.slice(0, maxChars);
}

export interface RetrievalMatch {
  path: string;
  score: number;
}

/**
 * Fold raw index snippets into per-note matches: dedupe by path keeping the
 * best score, drop the active note itself, rank by score (desc).
 */
export function foldRetrievalMatches(
  snippets: ReadonlyArray<{ path: string; score: number }>,
  activePath: string,
  limit: number,
): RetrievalMatch[] {
  const best = new Map<string, number>();
  for (const snippet of snippets) {
    if (snippet.path === activePath) {
      continue;
    }
    const current = best.get(snippet.path);
    if (current === undefined || snippet.score > current) {
      best.set(snippet.path, snippet.score);
    }
  }
  return [...best.entries()]
    .map(([path, score]) => ({ path, score }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, Math.max(0, limit));
}

/** Display basename for a vault path (extension kept, folders dropped). */
export function noteDisplayName(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/');
  return segments[segments.length - 1] ?? path;
}
