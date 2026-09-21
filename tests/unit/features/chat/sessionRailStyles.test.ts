import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function extractRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('session rail wide-pane style contract', () => {
  it('keeps a rail item tall enough for distinct title and date lines despite host button heights', () => {
    const css = readFileSync(join(process.cwd(), 'src/style/base/core.css'), 'utf8');
    const itemRule = extractRule(css, '.opencodian-session-rail button.opencodian-session-rail-item');
    const lineRule = extractRule(css, '.opencodian-session-rail-item-title,\n  .opencodian-session-rail-item-date');

    expect(itemRule).toContain('height: auto !important;');
    expect(itemRule).toContain('min-height: 52px;');
    expect(itemRule).toContain('grid-template-rows: auto auto;');
    expect(lineRule).toContain('display: block;');
    expect(lineRule).toContain('line-height: 1.4;');
  });
});
