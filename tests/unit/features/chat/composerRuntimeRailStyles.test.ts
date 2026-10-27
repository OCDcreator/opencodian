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


describe('composer runtime rail styles', () => {
  it('keeps the single composer footer on one line with a flexible model slot', () => {
    const css = readStyleFile('src/style/features/chat-assistant.css');
    const footerRule = extractRule(css, '.opencodian-composer-footer');
    const modelSlotRule = extractRule(css, '.opencodian-composer-model-slot');
    const modelTextRule = extractRule(css, '.opencodian-composer-model-slot .opencodian-model-trigger-text');
    const effortRule = extractRule(css, '.opencodian-model-trigger-effort');

    expect(footerRule).toContain('flex-wrap: nowrap;');
    expect(modelSlotRule).toContain('min-width: 0;');
    expect(modelTextRule).toContain('min-width: 0;');
    expect(effortRule).toContain('flex: 0 0 auto;');
    expect(effortRule).toContain('white-space: nowrap;');
  });

  it('opens composer menus upward and keeps the status bar outside the composer card', () => {
    const css = readStyleFile('src/style/features/chat-assistant.css');
    const panelRule = extractRule(css, '.opencodian-composer-menu-panel');
    const statusRule = extractRule(css, '.opencodian-composer-status-bar');

    expect(panelRule).toContain('bottom: calc(100% + 6px);');
    expect(statusRule).toContain('justify-content: space-between;');
    expect(statusRule).toContain('min-height: 25px;');
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

  it('embeds bundled font bytes in the three-file stylesheet artifact', () => {
    const css = readStyleFile('styles.css');
    expect(css.match(/src: url\("data:font\/ttf;base64,/g)).toHaveLength(2);
    expect(css).not.toContain('url("assets/fonts/');
  });
});
