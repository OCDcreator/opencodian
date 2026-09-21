/**
 * DataviewContextInliner — R-E5 (advantage-parity): execute ```dataview
 * blocks when a note's text is materialized as context.
 *
 * Requirement: inline the executed results when the host Dataview plugin's
 * API is available; `.base` files enter context as plain text; when Dataview
 * is unavailable the blocks stay verbatim with an explicit marker — never a
 * silent skip.
 *
 * Where it applies: text snapshots materialized by the plugin (remote-server
 * mode / selection snapshots). In local-server mode the backend agent reads
 * the raw file by URL — the unexecuted block is what it sees; that mode
 * boundary is documented on the builder call site.
 *
 * API surface (host Dataview plugin): `app.plugins.plugins.dataview.api`
 * exposes `queryMarkdown(query, sourcePath)` → Promise<{ wait: Promise<string> }>.
 * Guarded structurally — the API is community-plugin surface, not obsidian.d.ts.
 */

import type { App } from 'obsidian';

/** The slice of the Dataview API this inliner needs (structural). */
export interface DataviewApiLike {
  queryMarkdown(query: string, sourcePath: string): { wait: Promise<string> };
}

export interface InlineDataviewResult {
  content: string;
  /** Blocks successfully replaced with their rendered result. */
  inlined: number;
  /** Blocks left verbatim (Dataview missing, or a query failed). */
  leftVerbatim: number;
  /** True when Dataview was present at all. */
  dataviewAvailable: boolean;
}

const DATAVIEW_BLOCK = /```dataview(?:js)?\n([\s\S]*?)```/g;
const UNAVAILABLE_MARKER = '[dataview blocks present but the Dataview plugin is unavailable or a query failed; shown unexecuted]';

export function getDataviewApi(app: App): DataviewApiLike | null {
  const dataview = (app as unknown as {
    plugins?: { plugins?: Record<string, { api?: unknown } | undefined> };
  }).plugins?.plugins?.dataview;
  const api = dataview?.api as Partial<DataviewApiLike> | undefined;
  if (api && typeof api.queryMarkdown === 'function') {
    return api as DataviewApiLike;
  }
  return null;
}

export function countDataviewBlocks(content: string): number {
  return (content.match(/```dataview(?:js)?\n/g) ?? []).length;
}

/**
 * Replace every ```dataview block with its rendered markdown. Pure-ish: the
 * only effect is the Dataview query itself (read-only by Dataview's design).
 * Failures degrade per-block to the verbatim source; when nothing could be
 * inlined and blocks exist, an explicit marker line is appended.
 */
export async function inlineDataviewBlocks(
  api: DataviewApiLike | null,
  content: string,
  sourcePath: string,
): Promise<InlineDataviewResult> {
  const dataviewAvailable = api !== null;
  if (!countDataviewBlocks(content)) {
    return { content, inlined: 0, leftVerbatim: 0, dataviewAvailable };
  }
  if (!api) {
    return {
      content: `${content}\n\n${UNAVAILABLE_MARKER}`,
      inlined: 0,
      leftVerbatim: countDataviewBlocks(content),
      dataviewAvailable: false,
    };
  }

  let inlined = 0;
  let leftVerbatim = 0;
  const replacements = new Map<string, string>();
  for (const match of content.matchAll(DATAVIEW_BLOCK)) {
    const block = match[0];
    if (replacements.has(block)) {
      continue;
    }
    const query = match[1];
    try {
      const rendered = (await api.queryMarkdown(query, sourcePath).wait).trim();
      if (rendered.length > 0) {
        replacements.set(block, rendered);
        inlined += 1;
        continue;
      }
    } catch {
      // Per-block degradation: keep the source for THIS block only.
    }
    leftVerbatim += 1;
  }

  let next = content;
  for (const [block, rendered] of replacements) {
    next = next.split(block).join(rendered);
  }
  if (leftVerbatim > 0) {
    next = `${next}\n\n${UNAVAILABLE_MARKER}`;
  }
  return { content: next, inlined, leftVerbatim, dataviewAvailable };
}
