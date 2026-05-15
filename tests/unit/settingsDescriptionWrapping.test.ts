import * as fs from 'fs';
import * as path from 'path';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', relativePath), 'utf8');
}

function escapeSelector(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCssRuleBlock(css: string, selector: string): string {
  const escapedSelector = escapeSelector(selector);
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('settings description wrapping', () => {
  it('does not hard-limit settings section descriptions with character-based max widths', () => {
    const settingsLayoutCss = readRepoFile('src/style/components/settings-layout-contract.css');
    const modalCss = readRepoFile('src/style/modals/config-editor-modal.css');

    expect(getCssRuleBlock(settingsLayoutCss, '.opencodian-settings .opencodian-share-policy-desc')).not.toMatch(/max-width\s*:/);
    expect(settingsLayoutCss).not.toMatch(new RegExp(`${escapeSelector('.opencodian-settings .opencodian-shared-sessions-desc')}[\\s\\S]{0,120}max-width\\s*:`, 'm'));
    expect(getCssRuleBlock(modalCss, '.opencodian-plugin-block-desc')).not.toMatch(/max-width\s*:/);
  });
});
