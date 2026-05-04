const MARKDOWN_CODE_SEGMENT_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\r\n]+`/g;
const STYLE_BLOCK_REGEX = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const SCRIPT_BLOCK_REGEX = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const MARKUP_PREAMBLE_PATTERN = String.raw`(?:<\?[\s\S]*?\?>\s*|<!DOCTYPE[\s\S]*?>\s*|<!--[\s\S]*?-->\s*|<!\[CDATA\[[\s\S]*?\]\]>\s*)*`;
const MARKUP_BODY_PATTERN = String.raw`(?:<(?!\/?(?:style|script)\b)(?<pairedTag>[A-Za-z][\w:-]*)(?:\s[^>\n]*)?>[\s\S]*?<\/\k<pairedTag>>|<(?!\/?(?:style|script)\b)(?<selfClosingTag>[A-Za-z][\w:-]*)(?:\s[^>\n]*)?\/?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[\s\S]*?>|<\?[\s\S]*?\?>)`;
const HTML_BLOCK_REGEX = new RegExp(
  String.raw`(^|\n)([ \t]*(${MARKUP_PREAMBLE_PATTERN}${MARKUP_BODY_PATTERN})[ \t]*(?=\n|$))`,
  'gi',
);
const MARKUP_TOKEN_REGEX =
  /<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z][\w:-]*(?:\s[^>\n]*)?>|<!--|<!\[CDATA\[|<\?[A-Za-z][\w:-]*/gi;

export interface UserMessageTextHighlightSpan {
  kind: 'agent';
  value: string;
  start: number;
  end: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function replaceOutsideMarkdownCode(
  markdown: string,
  replaceSegment: (segment: string) => string,
): string {
  let result = '';
  let lastIndex = 0;

  for (const match of markdown.matchAll(MARKDOWN_CODE_SEGMENT_REGEX)) {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;
    result += replaceSegment(markdown.slice(lastIndex, matchIndex));
    result += matchText;
    lastIndex = matchIndex + matchText.length;
  }

  result += replaceSegment(markdown.slice(lastIndex));
  return result;
}

function trimFenceContent(content: string): string {
  return content.replace(/^\r?\n+/, '').replace(/\r?\n+$/, '');
}

function buildCodeFence(language: string, content: string): string {
  const trimmedContent = trimFenceContent(content);
  return `\n\`\`\`${language}\n${trimmedContent}\n\`\`\`\n`;
}

function escapeHtmlTags(markdown: string): string {
  return markdown.replace(MARKUP_TOKEN_REGEX, (tag) => tag.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

export function prepareUserMessageMarkdownForDisplay(markdown: string): string {
  if (!markdown) {
    return markdown;
  }

  return replaceOutsideMarkdownCode(markdown, (segment) => {
    const withCssCodeBlocks = segment.replace(STYLE_BLOCK_REGEX, (_match, cssContent: string) =>
      buildCodeFence('css', cssContent),
    );
    const withScriptCodeBlocks = withCssCodeBlocks.replace(SCRIPT_BLOCK_REGEX, (_match, jsContent: string) =>
      buildCodeFence('javascript', jsContent),
    );
    const withHtmlCodeBlocks = withScriptCodeBlocks.replace(
      HTML_BLOCK_REGEX,
      (_match, lineBreak: string, htmlBlock: string) => `${lineBreak}${buildCodeFence('html', htmlBlock)}`,
    );

    return replaceOutsideMarkdownCode(withHtmlCodeBlocks, escapeHtmlTags);
  });
}

export function extractUserMessageAgentHighlightSpans(
  visibleText: string,
  parts: unknown,
): UserMessageTextHighlightSpan[] {
  if (!visibleText || !Array.isArray(parts)) {
    return [];
  }

  const spans: UserMessageTextHighlightSpan[] = [];
  for (const part of parts) {
    if (!isRecord(part) || part.type !== 'agent' || !isRecord(part.source)) {
      continue;
    }

    const { value, start, end } = part.source;
    if (
      typeof value !== 'string'
      || typeof start !== 'number'
      || typeof end !== 'number'
      || !Number.isInteger(start)
      || !Number.isInteger(end)
      || start < 0
      || end <= start
      || end > visibleText.length
      || visibleText.slice(start, end) !== value
    ) {
      continue;
    }

    spans.push({
      kind: 'agent',
      value,
      start,
      end,
    });
  }

  let lastEnd = -1;
  return spans
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((span) => {
      if (span.start < lastEnd) {
        return false;
      }
      lastEnd = span.end;
      return true;
    });
}

export function applyUserMessageTextHighlightSpans(
  container: HTMLElement,
  visibleText: string,
  spans: readonly UserMessageTextHighlightSpan[],
): boolean {
  if (spans.length === 0 || container.textContent !== visibleText) {
    return false;
  }

  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  const ownerDocument = container.ownerDocument;
  const showText = ownerDocument.defaultView?.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = ownerDocument.createTreeWalker(container, showText);
  let offset = 0;
  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    const start = offset;
    const end = start + textNode.data.length;
    textNodes.push({ node: textNode, start, end });
    offset = end;
    currentNode = walker.nextNode();
  }

  let didWrap = false;
  for (const span of [...spans].reverse()) {
    const entry = textNodes.find((candidate) =>
      candidate.start <= span.start && candidate.end >= span.end);
    if (!entry) {
      continue;
    }

    const localStart = span.start - entry.start;
    const localEnd = span.end - entry.start;
    if (localStart < 0 || localEnd > entry.node.data.length || localEnd <= localStart) {
      continue;
    }

    entry.node.splitText(localEnd);
    const highlightedNode = entry.node.splitText(localStart);
    const wrapper = ownerDocument.createElement('span');
    wrapper.classList.add('opencodian-message-highlight-agent');
    wrapper.dataset.highlight = 'agent';
    highlightedNode.parentNode?.insertBefore(wrapper, highlightedNode);
    wrapper.appendChild(highlightedNode);
    didWrap = true;
  }

  return didWrap;
}
