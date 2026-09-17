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
import type { InlineEditAnchor } from './InlineEditTypes';

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
/**
 * Most notes one request may carry as attached context.
 *
 * Attached notes ride along as paths only (§6.1: never inline extra vault text,
 * the read-only tools do the reading), so the cap keeps the block a hint rather
 * than a payload.
 */
export const INLINE_EDIT_MAX_ATTACHED_NOTES = 5;

/** Request shapes (§7.2). */
export type InlineEditRequestKind = 'selection' | 'cursor-inline' | 'cursor-inbetween';

/** Tag names that make up the protocol. */
export const INLINE_EDIT_SELECTION_TAG = 'editor_selection';
export const INLINE_EDIT_CURSOR_TAG = 'editor_cursor';
export const INLINE_EDIT_CONTEXT_TAG = 'attached_context';
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
  /** Vault-relative paths the user attached; rendered as a read-hint block. */
  readonly attachedNotes?: readonly string[];
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
  /** Vault-relative paths the user attached; rendered as a read-hint block. */
  readonly attachedNotes?: readonly string[];
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
  'Images: when a request carries an image, answer from its content and put the final text in the tag as usual — never describe the image, never mention being unable to see it. Mathematical notation in the image defaults to LaTeX, delimited as the request states for its anchor form.',
  '',
  'Editing rules:',
  "- Imitate the note's existing voice, terminology, heading style, and language. Keep the author's wording wherever it already works.",
  '- Preserve markdown structure: list markers, indentation, code fences, links, and frontmatter must survive.',
  '- Match the requested scope. Rewriting one sentence is not licence to rewrite the paragraph.',
  '- Keep the reply as short as the request allows. No preamble, no explanation, no meta commentary about being an AI, no restating the instruction.',
  '- Write code and identifiers exactly as the surrounding code does.',
  '',
  'You have read-only tools. Use them silently when you need more context from the note or vault before editing — read first, then edit. Never mention the tools, and never attempt to create, modify, or delete files: writing is not available to you and the caller applies your result.',
  'An <attached_context> block means the user attached those notes on purpose: read them with your tools before deciding, and treat them as reference for the edit rather than as text to rewrite.',
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
  '图片：当请求附带图片时，根据图片内容直接作答，并像往常一样把最终文字放入协议标签——不要描述图片，也不要提及看不见图片。图片中的数学公式默认输出 LaTeX，定界符按请求中注明的本次锚点形态使用。',
  '',
  '编辑要求：',
  '- 模仿笔记原有的语气、术语、标题风格与语言；原文已经合适的地方就保留原话。',
  '- 保持 markdown 结构：列表符号、缩进、代码块围栏、链接、frontmatter 都不能被破坏。',
  '- 严格对应指令的范围：改一句话就不要顺手重写整段。',
  '- 回复尽量简短。不要写开场白、不要解释、不要做"我是 AI"之类的元评论、不要复述指令。',
  '- 代码与标识符要和上下文写法一致。',
  '',
  '你有只读工具。需要更多上下文时可以静默使用它们先读再改。不要提及工具，也不要尝试创建、修改或删除文件——你没有写入能力，结果由调用方应用。',
  '出现 <attached_context> 块表示用户特意附上了这些笔记：先用工具读取它们再决定，把它们当作本次修改的参考资料，而不是要改写的正文。',
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
  const attachedError = validateAttachedNotes(request.attachedNotes);
  if (attachedError) {
    return { ok: false, error: attachedError };
  }
  const attached = renderAttachedContextBlock(request.attachedNotes);
  const lead = attached ? `${instruction}\n\n${attached}\n\n` : `${instruction}\n\n`;

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
    return { ok: true, prompt: `${lead}${block}` };
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
  return { ok: true, prompt: `${lead}${block}` };
}

/**
 * Per-request image note (R-A4), appended to the prompt only when the turn
 * carries an image attachment.
 *
 * The system prompt states the image contract in general; this note pins the
 * LaTeX delimiter form to the anchor shape for this specific request:
 * - `cursor-inline` (anchor inside a line of text) → inline math `$…$`;
 * - `cursor-inbetween` (anchor on its own empty line) → display math `$$…$$`;
 * - `selection` → display math `$$…$$` (the common OCR case: the rewritten
 *   block stands on its own).
 */
export function buildInlineEditImageNote(locale: Locale, request: InlineEditRequest): string {
  const inline = request.kind === 'cursor-inline';
  return locale === 'zh'
    ? `（图片输入）本次请求附带 1 张图片：请依据图片内容直接作答，把最终文字放入协议标签内，`
      + `不要描述图片本身，也不要输出标签以外的任何内容。图片中的数学公式默认输出 LaTeX；`
      + `本次锚点为${inline ? '行内' : '行间'}形态，公式请用 ${inline ? '$…$' : '$$…$$'} 定界。`
    : `(Image input) This request carries 1 image: answer directly from its content and put the `
      + `final text inside the protocol tag — do not describe the image and emit nothing outside `
      + `the tag. Mathematical notation in the image defaults to LaTeX; this anchor is an `
      + `${inline ? 'inline' : 'display'} form, so delimit formulas as ${inline ? '$…$' : '$$…$$'}.`;
}

/**
 * Validate the attached-note list before it reaches the prompt.
 *
 * Fail-closed, like the rest of this builder: an unusable attachment is an
 * error rather than something silently dropped, so the user never believes
 * context was sent that was not.
 */
function validateAttachedNotes(notes: readonly string[] | undefined): string | null {
  if (!notes || notes.length === 0) return null;
  if (notes.length > INLINE_EDIT_MAX_ATTACHED_NOTES) return 'too-many-attached-notes';
  for (const note of notes) {
    if (note.length > INLINE_EDIT_MAX_PATH_CHARS) return 'attached-note-path-too-long';
    // Angle brackets would break the tag protocol. The picker never offers such
    // paths; this is the backstop that keeps the block unbreakable.
    if (/[<>]/.test(note)) return 'attached-note-path-invalid';
  }
  return null;
}

/**
 * `<attached_context>` block, `''` when nothing is attached.
 *
 * Paths only: per §6.1 the prompt never inlines extra vault text, and the
 * system prompt tells the model to read them with its read-only tools.
 */
function renderAttachedContextBlock(notes: readonly string[] | undefined): string {
  if (!notes || notes.length === 0) return '';
  const lines = notes.map((note) => `- ${note}`).join('\n');
  return `<${INLINE_EDIT_CONTEXT_TAG}>\n${lines}\n</${INLINE_EDIT_CONTEXT_TAG}>`;
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
 * Build the request payload for one anchored edit (docs/requirements/inline-edit.md
 * §6.1: attached notes travel as paths only — the read-only tools do the
 * reading; an empty list leaves the field out entirely).
 */
export function buildInlineEditRequestForAnchor(
  anchor: InlineEditAnchor,
  instruction: string,
  contextFiles: readonly { readonly path: string }[] = [],
): InlineEditRequest {
  const attachedNotes = contextFiles.length > 0 ? contextFiles.map((file) => file.path) : undefined;
  if (anchor.mode === 'selection') {
    return {
      kind: 'selection',
      instruction,
      notePath: anchor.notePath,
      startLine: anchor.startLine,
      endLine: anchor.endLine,
      selectionText: anchor.snapshot,
      attachedNotes,
    };
  }
  return {
    kind: anchor.mode,
    instruction,
    notePath: anchor.notePath,
    line: anchor.startLine,
    before: anchor.before,
    after: anchor.after,
    attachedNotes,
  };
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
    case 'too-many-attached-notes': return 'inlineEdit.error.tooManyAttachedNotes';
    case 'attached-note-path-too-long': return 'inlineEdit.error.attachedNotePathTooLong';
    case 'attached-note-path-invalid': return 'inlineEdit.error.attachedNotePathInvalid';
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
