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

describe('share policy layout', () => {
  it('removes the hidden-info grid track so the visible controls can align to the right edge', () => {
    const css = readSettingsLayoutCss();

    expect(getCssRuleBlock(
      css,
      '.opencodian-settings .opencodian-share-policy-setting.setting-item',
    )).toMatch(/display\s*:\s*block\s*;/);
    expect(getCssRuleBlock(
      css,
      '.opencodian-settings .opencodian-share-policy-setting .setting-item-control',
    )).toMatch(/width\s*:\s*100%\s*;/);
  });
});
