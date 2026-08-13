import { readFileSync } from 'node:fs';

function getRuleBlock(stylesheet: string, selector: string): string {
  const start = stylesheet.indexOf(selector);
  if (start < 0) {
    return '';
  }

  const braceStart = stylesheet.indexOf('{', start);
  if (braceStart < 0) {
    return '';
  }

  let depth = 1;
  let cursor = braceStart + 1;
  while (cursor < stylesheet.length && depth > 0) {
    if (stylesheet[cursor] === '{') {
      depth += 1;
    } else if (stylesheet[cursor] === '}') {
      depth -= 1;
    }
    cursor += 1;
  }

  return stylesheet.slice(start, cursor);
}

describe('Markdown typography style contract', () => {
  const stylesheet = readFileSync('src/style/utils/markdown.css', 'utf8');

  it('keeps inline code as a compact shadcn-style muted token without ornamental chrome', () => {
    const inlineCodeRule = getRuleBlock(
      stylesheet,
      ':is(.opencodian-message-text, .streaming-text-block) code',
    );

    expect(inlineCodeRule).toMatch(/font-family:\s*var\(--font-monospace\)/);
    expect(inlineCodeRule).toMatch(/font-weight:\s*600/);
    expect(inlineCodeRule).toMatch(/background:\s*var\(--opencodian-markdown-inline-code-bg\)/);
    expect(inlineCodeRule).toMatch(/padding:\s*0\.2em\s+0\.3em/);
    expect(inlineCodeRule).toMatch(/border:\s*0/);
    expect(inlineCodeRule).toMatch(/box-shadow:\s*none/);
  });

  it('keeps fenced code in its own panel and clears inline-code effects from the inner code node', () => {
    const wrapperRule = getRuleBlock(stylesheet, '.markdown-code-wrapper');
    const preRule = getRuleBlock(stylesheet, '.markdown-code-wrapper pre');
    const preCodeRule = getRuleBlock(
      stylesheet,
      ':is(.opencodian-message-text, .streaming-text-block) pre code',
    );

    expect(wrapperRule).toMatch(/background:\s*var\(--opencodian-markdown-code-block-bg\)/);
    expect(wrapperRule).toMatch(/border:\s*1px\s+solid/);
    expect(wrapperRule).toMatch(/box-shadow:\s*none/);
    expect(preRule).toMatch(/background:\s*transparent/);
    expect(preRule).toMatch(/color:\s*inherit/);
    expect(preCodeRule).toMatch(/display:\s*block/);
    expect(preCodeRule).toMatch(/width:\s*100%/);
    expect(preCodeRule).toMatch(/border:\s*0/);
    expect(preCodeRule).toMatch(/box-shadow:\s*none/);
    expect(preCodeRule).toMatch(/font-family:\s*inherit/);

    const preCodePseudoRule = getRuleBlock(
      stylesheet,
      ':is(.opencodian-message-text, .streaming-text-block) pre code::before',
    );
    expect(preCodePseudoRule).toMatch(/content:\s*none/);
  });

  it('treats inline and display math as typography instead of code chrome', () => {
    const inlineMathRule = getRuleBlock(
      stylesheet,
      ':is(.opencodian-message-text, .streaming-text-block) :is(\n  .math.math-inline,',
    );
    const displayMathRule = getRuleBlock(
      stylesheet,
      ':is(.opencodian-message-text, .streaming-text-block) :is(.math.math-block, .math-block, .katex-display, mjx-container[display="true"])',
    );

    expect(inlineMathRule).toMatch(/background:\s*transparent/);
    expect(inlineMathRule).toMatch(/mjx-container:not\(\[display="true"\]\)/);
    expect(inlineMathRule).toMatch(/box-shadow:\s*none/);
    expect(displayMathRule).toMatch(/background:\s*transparent/);
    expect(displayMathRule).toMatch(/border:\s*none/);
    expect(displayMathRule).toMatch(/border-bottom:\s*none/);
    expect(displayMathRule).toMatch(/box-shadow:\s*none/);
  });
});
