import * as fs from 'fs';
import * as path from 'path';

function readSettingsLayoutCss(): string {
  return fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'src/style/components/settings-layout-contract.css'),
    'utf8',
  );
}

function getCssRuleBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('project command advanced layout', () => {
  it('uses a compact disclosure and preserves space between its field cards', () => {
    const css = readSettingsLayoutCss();
    const summary = getCssRuleBlock(
      css,
      '.opencodian-settings .opencodian-command-editor-advanced > summary',
    );
    const focusedSummary = getCssRuleBlock(
      css,
      '.opencodian-settings .opencodian-command-editor-advanced > summary:focus-visible',
    );
    const body = getCssRuleBlock(css, '.opencodian-settings .opencodian-command-editor-advanced-body');
    const field = getCssRuleBlock(
      css,
      '.opencodian-settings .opencodian-command-editor-advanced-body > .setting-item',
    );

    expect(summary).toMatch(/list-style\s*:\s*none\s*;/);
    expect(summary).toMatch(/min-height\s*:\s*40px\s*;/);
    expect(focusedSummary).toMatch(/outline-offset\s*:\s*2px\s*;/);
    expect(body).toMatch(/display\s*:\s*flex\s*;/);
    expect(body).toMatch(/gap\s*:\s*var\(--opencodian-settings-space-md\)\s*;/);
    expect(field).toMatch(/padding\s*:\s*var\(--opencodian-settings-space-md\) var\(--opencodian-settings-space-lg\)\s*;/);
  });

  it('keeps disclosure motion optional', () => {
    const css = readSettingsLayoutCss();

    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.opencodian-command-editor-advanced > summary::after[\s\S]*transition:\s*none/su,
    );
  });
});
