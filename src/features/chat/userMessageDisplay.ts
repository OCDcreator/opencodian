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
