/**
 * CanvasSplitProposal — the AI topic-split input contract for canvas
 * generation (R-C5, flowtext-c5-design §3.3 mode 2).
 *
 * The model may only PROPOSE: a strict-JSON list of `{topic, sourcePath,
 * excerpt}` rows. The plugin turns excerpts into text nodes and clusters them
 * into group nodes — the model never writes anything. Parsing is fail-closed
 * (§6.4): anything but a well-formed proposal list over the known note paths
 * is rejected, and the caller then falls back to file-reference mode with an
 * explicit notice instead of silently degrading.
 *
 * Pure module: no Obsidian imports.
 */

/** Longest per-note body the split prompt may embed (over-limit → refuse that note). */
export const CANVAS_SPLIT_MAX_CHARS_PER_NOTE = 20_000;
/** Most notes one split request may carry (fail-closed over-limit refusal). */
export const CANVAS_SPLIT_MAX_NOTES = 50;
/** Longest single excerpt accepted from the model. */
export const CANVAS_SPLIT_MAX_EXCERPT_CHARS = 4_000;
/** Most proposals accepted from one reply (garbage amplifier guard). */
export const CANVAS_SPLIT_MAX_PROPOSALS = 200;

export interface CanvasSplitProposal {
  /** Group label; becomes the group node's label verbatim. */
  topic: string;
  /** Vault-relative path of the source note; must be one of the offered notes. */
  sourcePath: string;
  /** Verbatim excerpt from that note; becomes a text node's text. */
  excerpt: string;
}

/** One note offered to the split prompt (path + body). */
export interface CanvasSplitNoteInput {
  path: string;
  content: string;
}

export type CanvasSplitParseResult =
  | { readonly ok: true; readonly proposals: readonly CanvasSplitProposal[] }
  | { readonly ok: false; readonly error: string };

export function buildCanvasSplitSystemPrompt(locale: 'en' | 'zh'): string {
  return locale === 'zh'
    ? [
        '你是一个笔记主题拆分助手。用户会给出若干笔记（带路径），请把它们按主题拆分为片段。',
        '输出契约——必须严格遵守：只输出一个 JSON 数组，不要 markdown 代码块，不要解释。',
        '数组每个元素形如 {"topic":"主题名","sourcePath":"笔记路径","excerpt":"原文摘录"}。',
        'excerpt 必须是 sourcePath 笔记的原文逐字摘录（不得改写、不得拼接多篇）；topic 是简短主题名；sourcePath 必须原样使用给定路径之一。',
        '同一主题的多个摘录用多个相邻元素表达。不要发明笔记里不存在的路径，不要输出空摘录。',
      ].join('\n')
    : [
        'You are a note topic-splitting assistant. The user gives several notes (with paths); split them into topic excerpts.',
        'Output contract — follow it exactly: reply with ONE JSON array, no markdown fences, no prose.',
        'Every element has the shape {"topic":"topic name","sourcePath":"note path","excerpt":"verbatim excerpt"}.',
        'The excerpt must be a verbatim excerpt of the sourcePath note (never rewrite, never merge notes); topic is a short topic name; sourcePath must be copied from the given paths.',
        'Use several adjacent elements for multiple excerpts of the same topic. Never invent paths, never emit empty excerpts.',
      ].join('\n');
}

/** Build the user turn: every note as a fenced block with its path. */
export function buildCanvasSplitPrompt(notes: readonly CanvasSplitNoteInput[]): string {
  const blocks = notes.map((note) =>
    `<note path="${note.path}">\n${note.content}\n</note>`);
  return blocks.join('\n\n');
}

/** Notes whose body exceeds the per-note cap (the caller refuses them explicitly). */
export function oversizeSplitNotes(notes: readonly CanvasSplitNoteInput[]): readonly string[] {
  return notes
    .filter((note) => note.content.length > CANVAS_SPLIT_MAX_CHARS_PER_NOTE)
    .map((note) => note.path);
}

/**
 * Strict proposal parse. The trimmed reply must be a JSON array (one optional
 * code-fence wrapper tolerated); every row must carry non-empty strings and a
 * `sourcePath` that is one of the notes actually offered. Anything else is
 * `ok: false` — never a partial accept.
 */
export function parseCanvasSplitProposal(
  raw: string,
  knownPaths: ReadonlySet<string>,
): CanvasSplitParseResult {
  const text = (raw ?? '').trim();
  if (!text) {
    return { ok: false, error: 'empty-response' };
  }
  const unfenced = stripOneCodeFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: 'not-a-nonempty-array' };
  }
  if (parsed.length > CANVAS_SPLIT_MAX_PROPOSALS) {
    return { ok: false, error: 'too-many-proposals' };
  }
  const proposals: CanvasSplitProposal[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { ok: false, error: 'proposal-not-an-object' };
    }
    const row = entry as Record<string, unknown>;
    const topic = row.topic;
    const sourcePath = row.sourcePath;
    const excerpt = row.excerpt;
    if (typeof topic !== 'string' || topic.trim() === '') {
      return { ok: false, error: 'proposal-missing-topic' };
    }
    if (typeof sourcePath !== 'string' || !knownPaths.has(sourcePath)) {
      return { ok: false, error: 'proposal-unknown-source-path' };
    }
    if (typeof excerpt !== 'string' || excerpt.trim() === '') {
      return { ok: false, error: 'proposal-missing-excerpt' };
    }
    if (excerpt.length > CANVAS_SPLIT_MAX_EXCERPT_CHARS) {
      return { ok: false, error: 'proposal-excerpt-too-long' };
    }
    proposals.push({ topic, sourcePath, excerpt });
  }
  return { ok: true, proposals };
}

function stripOneCodeFence(text: string): string {
  if (!text.startsWith('```')) {
    return text;
  }
  const firstBreak = text.indexOf('\n');
  if (firstBreak === -1) {
    return text;
  }
  const body = text.slice(firstBreak + 1);
  const closing = body.lastIndexOf('```');
  return closing === -1 ? body : body.slice(0, closing);
}
