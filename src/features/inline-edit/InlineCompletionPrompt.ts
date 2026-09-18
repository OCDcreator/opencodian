/**
 * InlineCompletionPrompt — the R-C3 completion output contract.
 *
 * A deliberately separate protocol from inline edit's XML contract
 * (docs/requirements/flowtext-c3-design.md §3.5): short plain-text
 * continuation, bounded length, no prefix repetition, no protocol tags. The
 * separation is the point — a completion reply that leaks inline-edit markup
 * must never reach ghost text, and the validator here rejects exactly that.
 *
 * Everything is pure so the whole contract is unit-testable without Obsidian
 * or a model.
 */

import {
  INLINE_COMPLETION_PREFIX_WINDOW_CHARS,
  INLINE_COMPLETION_SUFFIX_WINDOW_CHARS,
} from '../../core/agents/backend/AgentInlineCompletionCapability';
import type { Locale } from '../../i18n';

/** Longest tail of the prefix kept for the duplicate check (design §3.5). */
export const INLINE_COMPLETION_PREFIX_TAIL_CHARS = 200;

/** Longest overlap between the suggestion start and the prefix tail, as a
 * fraction of the shorter side, before the suggestion is a "repeater". */
const PREFIX_DUPLICATE_OVERLAP_RATIO = 0.5;

/**
 * Request windows (design §3.5): the text before the cursor, truncated to the
 * window cap on a whole-line boundary so the model never sees half a line at
 * the seam, plus the text after the cursor, truncated at the cap.
 */
export interface InlineCompletionWindows {
  readonly prefix: string;
  readonly suffix: string;
}

/**
 * Split `docText` at `cursor` into the prompt windows.
 *
 * The prefix is cut on a line boundary (the earliest whole line that still
 * fits the cap); the suffix is hard-cut at its cap. An empty document yields
 * empty windows (first-line trigger = pure continuation).
 */
export function buildInlineCompletionWindows(
  docText: string,
  cursor: number,
  prefixCap = INLINE_COMPLETION_PREFIX_WINDOW_CHARS,
  suffixCap = INLINE_COMPLETION_SUFFIX_WINDOW_CHARS,
): InlineCompletionWindows {
  const safeCursor = Math.max(0, Math.min(cursor, docText.length));
  let prefix = docText.slice(0, safeCursor);
  if (prefix.length > prefixCap) {
    // Keep the newest whole lines that fit: cut at the earliest line boundary
    // at or after the cap edge, so the window is the longest line-aligned
    // prefix that never exceeds the cap and never shows the model half a
    // line at its seam. A window that is one single oversized line (no
    // boundary inside) is hard-cut at the cap instead.
    const edge = prefix.length - prefixCap;
    const newline = prefix.indexOf('\n', edge);
    const start = newline >= 0 && newline + 1 < prefix.length ? newline + 1 : edge;
    prefix = prefix.slice(start);
  }
  const suffix = docText.slice(safeCursor, safeCursor + suffixCap);
  return { prefix, suffix };
}

/** The prefix tail the duplicate check compares against (design §3.5). */
export function inlineCompletionPrefixTail(prefix: string): string {
  return prefix.length > INLINE_COMPLETION_PREFIX_TAIL_CHARS
    ? prefix.slice(prefix.length - INLINE_COMPLETION_PREFIX_TAIL_CHARS)
    : prefix;
}

/** Validation outcome of one completion suggestion. */
export type InlineCompletionValidation =
  | { readonly ok: true; readonly text: string }
  | {
    readonly ok: false;
    readonly reason: 'empty' | 'too-long' | 'prefix-duplicate' | 'protocol-tag';
  };

/**
 * Validate (and hard-cap) a completion suggestion (design §3.5).
 *
 * Rules, in order:
 * 1. `maxChars` is a hard cap: the text is truncated to it *before* the other
 *    checks (acceptance 5). `too-long` therefore only fires for malformed
 *    inputs that are still over the cap after trimming — it is a defensive
 *    outcome, not the primary length rule.
 * 2. `prefix-duplicate`: the longest overlap between the suggestion's start
 *    and the prefix tail's end exceeding half of the shorter side means the
 *    model is repeating existing text — reject.
 * 3. `protocol-tag`: any inline-edit XML tag in the output means cross-contract
 *    interference — reject (never rendered).
 * 4. `empty`: whitespace-only output shows nothing.
 *
 * Rejections are silent for the user (completion is a low-interruption
 * interaction) and only surface in debug counters.
 */
export function validateCompletion(input: {
  readonly prefixTail: string;
  readonly text: string;
  readonly maxChars: number;
}): InlineCompletionValidation {
  const maxChars = Math.max(1, Math.floor(input.maxChars));
  // Rule 1 — hard length cap applied before everything else. The text is used
  // verbatim otherwise: leading newlines can be the legitimate start of a new
  // paragraph and must survive into the ghost.
  const text = input.text.length > maxChars ? input.text.slice(0, maxChars) : input.text;
  if (!text.trim()) return { ok: false, reason: 'empty' };
  if (text.length > maxChars) return { ok: false, reason: 'too-long' };
  if (findProtocolTag(text)) return { ok: false, reason: 'protocol-tag' };
  if (overlapsPrefixTail(input.prefixTail, text)) {
    return { ok: false, reason: 'prefix-duplicate' };
  }
  return { ok: true, text };
}

/**
 * Longest-overlap duplicate check (design §3.5): find the largest `k` such
 * that the prefix tail ends with the suggestion's first `k` characters;
 * reject when `k` is more than half of the shorter of the two lengths.
 */
export function overlapsPrefixTail(prefixTail: string, text: string): boolean {
  if (!prefixTail || !text) return false;
  const limit = Math.min(prefixTail.length, text.length);
  let overlap = 0;
  for (let k = limit; k >= 1; k -= 1) {
    if (prefixTail.endsWith(text.slice(0, k))) {
      overlap = k;
      break;
    }
  }
  return overlap > limit * PREFIX_DUPLICATE_OVERLAP_RATIO;
}

/**
 * Inline-edit protocol tags the completion output must never contain.
 * Derived from the inline-edit contract's own tag names so the two protocols
 * cannot drift apart silently.
 */
const FORBIDDEN_TAG_PATTERNS: readonly RegExp[] = [
  /<\s*im[\s>/]/i,
  /<\s*clarify[\s>/]/i,
  /<\s*replacement[\s>/]/i,
  /<\s*insertion[\s>/]/i,
  /<\s*editor_[a-z]+[\s>/]/i,
  /<\s*attached_context[\s>/]/i,
  /<\s*\/\s*(replacement|insertion|clarify|im)\s*>/i,
];

/** True when the text contains any inline-edit protocol tag. */
export function findProtocolTag(text: string): boolean {
  return FORBIDDEN_TAG_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * System prompt for the completion session (bilingual, i18n-picked).
 *
 * Quality layer only — read-only enforcement lives in the backend sessions.
 * The output contract mirrors `validateCompletion`: continuation only, bounded
 * length, no prefix repetition, no tags of any kind.
 */
export function buildInlineCompletionSystemPrompt(locale: Locale, maxChars: number): string {
  return locale === 'zh' ? SYSTEM_PROMPT_ZH(maxChars) : SYSTEM_PROMPT_EN(maxChars);
}

function SYSTEM_PROMPT_EN(maxChars: number): string {
  return [
    'You are a ghost-text completion engine embedded in a note editor.',
    'The user places the cursor and triggers a completion; you complete the current sentence or paragraph at the caret.',
    '',
    'Output contract — follow it exactly:',
    `- Reply with the continuation ONLY: at most ${maxChars} characters.`,
    '- Start exactly where the text before the caret stops. Never repeat or re-emit any part of it.',
    '- Stop at the first natural sentence or paragraph boundary. Complete at most one paragraph.',
    '- If the caret sits inside a word, complete that word first.',
    '- Output plain text only. Never output XML/markup tags, code fences, or commentary.',
    '- Match the language, register, terminology, and markdown style of the surrounding text.',
    '',
    'You have read-only tools and normally need none: the request already contains the text before and after the caret.',
    'Never create, modify, or delete files — writing is not available to you, and your reply is a suggestion the user has to accept.',
  ].join('\n');
}

function SYSTEM_PROMPT_ZH(maxChars: number): string {
  return [
    '你是一个嵌入在笔记编辑器中的 ghost text 补全引擎。',
    '用户把光标放在某个位置并触发补全；你负责在光标处续写当前的句子或段落。',
    '',
    '输出契约——必须严格遵守：',
    `- 只回复续写内容：不超过 ${maxChars} 个字符。`,
    '- 从光标前文本的停止处无缝接续，绝不重复或复述光标前的任何内容。',
    '- 在第一个自然的句子或段落边界停住，一次最多补全一个段落。',
    '- 如果光标停在一个单词中间，先补完这个单词。',
    '- 只输出纯文本。禁止输出任何 XML/标记标签、代码块围栏或说明文字。',
    '- 与上下文的语言、语气、术语和 markdown 风格保持一致。',
    '',
    '你拥有只读工具，但通常用不到：请求已包含光标前后的文本。',
    '绝不创建、修改或删除文件——你没有写能力，你的回复只是供用户采纳的建议。',
  ].join('\n');
}
