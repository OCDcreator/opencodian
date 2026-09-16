/**
 * InlineEditPrompt — request construction and response parsing for inline edit.
 *
 * The wire contract with the model is Claudian's XML tag protocol, hardened per
 * docs/requirements/inline-edit.md §6:
 *
 * - the request embeds the user's instruction plus a `<editor_selection>` or
 *   `<editor_cursor>` block whose body is the note text;
 * - the response must contain exactly one top-level `<replacement>` or
 *   `<insertion>` tag, or no tag at all (question / clarification);
 * - malformed responses are rejected rather than guessed at.
 *
 * Everything here is pure so the whole contract is unit-testable without
 * Obsidian or a model.
 */

import type { Locale, TranslationKey } from '../../i18n';

// -----------------------------------------------------------------------------
// Limits (§6.1)
// -----------------------------------------------------------------------------

/** Longest selection the request builder will embed. */
export const INLINE_EDIT_MAX_SELECTION_CHARS = 20_000;
/** Longest injected surrounding context (cursor forms) in total. */
export const INLINE_EDIT_MAX_CONTEXT_CHARS = 40_000;
/** Longest note path accepted in the `path` attribute. */
export const INLINE_EDIT_MAX_PATH_CHARS = 500;
/** Longest generated result accepted from the model. */
export const INLINE_EDIT_MAX_RESULT_CHARS = 40_000;

/** Request shapes (§7.2). */
export type InlineEditRequestKind = 'selection' | 'cursor-inline' | 'cursor-inbetween';

/** Tag names that make up the protocol. */
export const INLINE_EDIT_SELECTION_TAG = 'editor_selection';
export const INLINE_EDIT_CURSOR_TAG = 'editor_cursor';
export const INLINE_EDIT_REPLACEMENT_TAG = 'replacement';
export const INLINE_EDIT_INSERTION_TAG = 'insertion';

export interface InlineEditSelectionRequest {
  readonly kind: 'selection';
  readonly instruction: string;
  readonly notePath: string;
  /** 1-based inclusive first line of the selection. */
  readonly startLine: number;
  /** 1-based inclusive last line of the selection. */
  readonly endLine: number;
  readonly selectionText: string;
}

export interface InlineEditCursorRequest {
  readonly kind: 'cursor-inline' | 'cursor-inbetween';
  readonly instruction: string;
  readonly notePath: string;
  /** 1-based line the cursor sits on. */
  readonly line: number;
  /** Text before the cursor on that line (or before the cursor in the paragraph). */
  readonly before: string;
  /** Text after the cursor on that line (or after the cursor in the paragraph). */
  readonly after: string;
}

export type InlineEditRequest = InlineEditSelectionRequest | InlineEditCursorRequest;

export type InlineEditRequestResult =
  | { readonly ok: true; readonly prompt: string }
  | { readonly ok: false; readonly error: string };

export type InlineEditResponse =
  | { readonly kind: 'replacement'; readonly text: string }
  | { readonly kind: 'insertion'; readonly text: string }
  | { readonly kind: 'clarification'; readonly text: string }
  | { readonly kind: 'error'; readonly error: string };

// -----------------------------------------------------------------------------
// System prompt
// -----------------------------------------------------------------------------

/**
 * System prompt for the auxiliary session.
 *
 * It is a *quality* layer only: read-only enforcement lives in the backend
 * (docs/requirements/inline-edit.md §5.4 / §8.1), never in this text.
 */
export function buildInlineEditSystemPrompt(locale: Locale): string {
  return locale === 'zh' ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;
}

const SYSTEM_PROMPT_EN = [
  'You are an inline text editor embedded in a note editor. The user selects text or places the cursor, then gives one instruction.',
  '',
  'Output contract — follow it exactly:',
  '- To rewrite the selected text, reply with exactly one <replacement>...</replacement> tag holding the new text.',
  '- To insert text at the cursor, reply with exactly one <insertion>...</insertion> tag holding the text to insert.',
  '- To ask a question or ask for clarification, reply with plain prose and NO tags.',
  'Never emit more than one tag. Never nest tags. Never wrap the tag in markdown fences.',
  'The tag body is used verbatim, so put nothing in it but the final text.',
  '',
  'Editing rules:',
  "- Imitate the note's existing voice, terminology, heading style, and language. Keep the author's wording wherever it already works.",
  '- Preserve markdown structure: list markers, indentation, code fences, links, and frontmatter must survive.',
  '- Match the requested scope. Rewriting one sentence is not licence to rewrite the paragraph.',
  '- Keep the reply as short as the request allows. No preamble, no explanation, no meta commentary about being an AI, no restating the instruction.',
  '- Write code and identifiers exactly as the surrounding code does.',
  '',
  'You have read-only tools. Use them silently when you need more context from the note or vault before editing — read first, then edit. Never mention the tools, and never attempt to create, modify, or delete files: writing is not available to you and the caller applies your result.',
  '',
  'If the instruction is ambiguous, ask one short, specific question instead of guessing.',
].join('\n');

const SYSTEM_PROMPT_ZH = [
  '你是一个嵌入在笔记编辑器中的行内编辑助手。用户会选中一段文字或放置光标，然后给出一条指令。',
  '',
  '输出契约——必须严格遵守：',
  '- 改写选中的文字：只回复一个 <replacement>...</replacement> 标签，标签内是改写后的文字。',
  '- 在光标处插入文字：只回复一个 <insertion>...</insertion> 标签，标签内是要插入的文字。',
  '- 需要提问或澄清：直接用纯文本回复，不要使用任何标签。',
  '禁止输出多个标签，禁止标签嵌套，禁止用 markdown 代码块包裹标签。',
  '标签内的内容会被原样使用，因此只能放最终文字。',
  '',
  '编辑要求：',
  '- 模仿笔记原有的语气、术语、标题风格与语言；原文已经合适的地方就保留原话。',
  '- 保持 markdown 结构：列表符号、缩进、代码块围栏、链接、frontmatter 都不能被破坏。',
  '- 严格对应指令的范围：改一句话就不要顺手重写整段。',
  '- 回复尽量简短。不要写开场白、不要解释、不要做"我是 AI"之类的元评论、不要复述指令。',
  '- 代码与标识符要和上下文写法一致。',
  '',
  '你有只读工具。需要更多上下文时可以静默使用它们先读再改。不要提及工具，也不要尝试创建、修改或删除文件——你没有写入能力，结果由调用方应用。',
  '',
  '如果指令含糊，请只提出一个简短具体的问题，不要猜测。',
].join('\n');

// -----------------------------------------------------------------------------
// Request building (§6.1)
// -----------------------------------------------------------------------------

/** Escape a value for use inside a double-quoted XML attribute. */
export function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the prompt for one inline-edit request.
 *
 * Rejects rather than repairs when the note text would collide with the
 * protocol (a literal closing tag in the body) or exceeds the documented limits.
 */
export function buildInlineEditRequest(request: InlineEditRequest): InlineEditRequestResult {
  const instruction = request.instruction.trim();
  if (!instruction) {
    return { ok: false, error: 'empty-instruction' };
  }
  if (request.notePath.length > INLINE_EDIT_MAX_PATH_CHARS) {
    return { ok: false, error: 'path-too-long' };
  }

  if (request.kind === 'selection') {
    const body = request.selectionText;
    if (body.length > INLINE_EDIT_MAX_SELECTION_CHARS) {
      return { ok: false, error: 'selection-too-long' };
    }
    const collision = findClosingTagCollision(body, INLINE_EDIT_SELECTION_TAG);
    if (collision) {
      return { ok: false, error: 'selection-contains-protocol-tag' };
    }
    const lines = `${request.startLine}-${request.endLine}`;
    const block = `<${INLINE_EDIT_SELECTION_TAG} path="${escapeXmlAttribute(request.notePath)}" lines="${lines}">\n`
      + `${body}\n`
      + `</${INLINE_EDIT_SELECTION_TAG}>`;
    return { ok: true, prompt: `${instruction}\n\n${block}` };
  }

  const contextLength = request.before.length + request.after.length;
  if (contextLength > INLINE_EDIT_MAX_CONTEXT_CHARS) {
    return { ok: false, error: 'context-too-long' };
  }
  const collision = findClosingTagCollision(request.before, INLINE_EDIT_CURSOR_TAG)
    ?? findClosingTagCollision(request.after, INLINE_EDIT_CURSOR_TAG);
  if (collision) {
    return { ok: false, error: 'selection-contains-protocol-tag' };
  }
  const marker = request.kind === 'cursor-inline' ? '#inline' : '#inbetween';
  const block = `<${INLINE_EDIT_CURSOR_TAG} path="${escapeXmlAttribute(request.notePath)}" line="${request.line}">\n`
    + `${request.before}|${request.after} ${marker}\n`
    + `</${INLINE_EDIT_CURSOR_TAG}>`;
  return { ok: true, prompt: `${instruction}\n\n${block}` };
}

/** True when `body` contains a literal closing tag for the given protocol tag. */
function findClosingTagCollision(body: string, tag: string): boolean {
  return body.includes(`</${tag}>`);
}

// -----------------------------------------------------------------------------
// Response parsing (§6.2)
// -----------------------------------------------------------------------------

const TAG_SCAN = /<(\/?)(replacement|insertion)>/g;

/**
 * Parse the model's reply into an apply-able result.
 *
 * Rules (all unit-tested):
 * 1. exactly one top-level tag, closed, not nested;
 * 2. an unclosed or duplicated tag is an error, never a partial apply;
 * 3. tag content is taken verbatim;
 * 4. no tag at all means the reply is a question or clarification;
 * 5. an empty reply or an over-long result is an error.
 */
export function parseInlineEditResponse(raw: string): InlineEditResponse {
  const text = raw ?? '';
  if (!text.trim()) {
    return { kind: 'error', error: 'empty-response' };
  }

  const matches = [...text.matchAll(TAG_SCAN)];
  if (matches.length === 0) {
    return { kind: 'clarification', text: text.trim() };
  }
  if (matches.length === 1) {
    return { kind: 'error', error: 'unclosed-tag' };
  }
  if (matches.length > 2) {
    return { kind: 'error', error: 'multiple-tags' };
  }

  const [open, close] = matches;
  if (open[1] === '/' || close[1] !== '/') {
    return { kind: 'error', error: 'malformed-tag' };
  }
  if (open[2] !== close[2]) {
    return { kind: 'error', error: 'multiple-tags' };
  }

  const openEnd = (open.index ?? 0) + open[0].length;
  const closeStart = close.index ?? 0;
  if (closeStart < openEnd) {
    return { kind: 'error', error: 'malformed-tag' };
  }
  const content = text.slice(openEnd, closeStart);
  if (!content.trim()) {
    return { kind: 'error', error: 'empty-result' };
  }
  if (content.length > INLINE_EDIT_MAX_RESULT_CHARS) {
    return { kind: 'error', error: 'result-too-long' };
  }
  return open[2] === INLINE_EDIT_REPLACEMENT_TAG
    ? { kind: 'replacement', text: normalizeInsertionText(content) }
    : { kind: 'insertion', text: normalizeInsertionText(content) };
}

/**
 * Normalise model result text: drop leading and trailing blank lines only.
 *
 * Models routinely wrap the tag content in newlines (`<replacement>\n…\n
 * </replacement>`); those edge blank lines would otherwise land in the note.
 * Indentation inside the first and last surviving lines is preserved so pasted
 * blocks keep their structure (docs/requirements/inline-edit.md §7.5).
 */
export function normalizeInsertionText(text: string): string {
  const lines = text.split('\n');
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end).join('\n');
}

/** Translation key describing why a request or response was rejected. */
export function describeInlineEditFailure(reason: string): TranslationKey {
  switch (reason) {
    case 'empty-instruction': return 'inlineEdit.error.emptyInstruction';
    case 'path-too-long': return 'inlineEdit.error.pathTooLong';
    case 'selection-too-long': return 'inlineEdit.error.selectionTooLong';
    case 'context-too-long': return 'inlineEdit.error.contextTooLong';
    case 'selection-contains-protocol-tag': return 'inlineEdit.error.protocolTagInSelection';
    case 'empty-response': return 'inlineEdit.error.emptyResponse';
    case 'empty-result': return 'inlineEdit.error.emptyResult';
    case 'result-too-long': return 'inlineEdit.error.resultTooLong';
    case 'unclosed-tag': return 'inlineEdit.error.unclosedTag';
    case 'multiple-tags': return 'inlineEdit.error.multipleTags';
    case 'malformed-tag': return 'inlineEdit.error.malformedTag';
    default: return 'inlineEdit.error.generic';
  }
}
