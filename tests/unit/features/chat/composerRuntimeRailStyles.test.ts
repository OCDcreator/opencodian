import * as fs from 'fs';
import * as path from 'path';

function readStyleFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function extractRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

function extractRules(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = Array.from(css.matchAll(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'gm')));
  expect(matches.length).toBeGreaterThan(0);
  return matches.map(match => match[1] ?? '').join('\n');
}

describe('composer runtime rail styles', () => {
  it('keeps the runtime toolbar full width so overflow can anchor to the right edge', () => {
    const css = readStyleFile('src/style/features/chat-assistant.css');
    const toolbarRule = extractRule(css, '.opencodian-input-toolbar');

    expect(toolbarRule).toContain('width: 100%;');
  });

  it('places the runtime overflow trigger as the final right-side rail affordance', () => {
    const css = readStyleFile('src/style/features/chat-assistant.css');
    const effortRule = extractRules(css, '.opencodian-input-toolbar .opencodian-effort-slot');
    const overflowRule = extractRule(css, '.opencodian-runtime-overflow');

    expect(effortRule).toContain('order: 998;');
    expect(effortRule).toContain('margin-left: auto;');
    expect(overflowRule).toContain('order: 999;');
    expect(overflowRule).not.toContain('margin-left: auto;');
  });

  it('uses a local bundled Newsreader face for composer input text', () => {
    const css = readStyleFile('src/style/features/chat-assistant.css');
    const inputAreaRule = extractRule(css, '.opencodian-input-area');
    const textareaRule = extractRule(css, '.opencodian-input-wrapper .opencodian-input');
    const backdropRule = extractRule(css, '.opencodian-input-highlight-backdrop');
    const placeholderRule = extractRule(css, '.opencodian-input-placeholder');

    expect(css).toContain('font-family: "OpenCodian Newsreader";');
    expect(css).toContain('assets/fonts/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf');
    expect(inputAreaRule).toContain('font-family: inherit;');
    expect(textareaRule).toContain('font-family: var(--opencodian-composer-font-family, "OpenCodian Newsreader"');
    expect(backdropRule).toContain('font-family: var(--opencodian-composer-font-family, "OpenCodian Newsreader"');
    expect(placeholderRule).toContain('font-family: var(--opencodian-composer-font-family, "OpenCodian Newsreader"');
  });
});
