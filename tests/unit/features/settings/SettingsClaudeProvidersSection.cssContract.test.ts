import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('SettingsClaudeProvidersSection narrow CSS contract', () => {
  it('shrinks provider descendants at the 346px settings width', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/components/settings-claude-providers.css'),
      'utf8',
    );
    const narrowCss = css.slice(css.indexOf('@media (max-width: 720px)'));

    expect(narrowCss).toMatch(/\[data-claude-code-section=['"]providers['"]\]/);
    expect(narrowCss).toMatch(
      /\[data-claude-code-section=['"]providers['"]\][^{]*\{[^}]*box-sizing:\s*border-box;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s,
    );
    expect(narrowCss).toMatch(
      /\[data-claude-code-section=['"]providers['"]\][^{]*\.setting-item[^}]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s,
    );
    expect(narrowCss).toMatch(
      /\.setting-item-name,\s*\.opencodian-settings\s+\[data-claude-code-section=['"]providers['"]\]\s+\.setting-item-description[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/s,
    );
    expect(narrowCss).toMatch(
      /\.opencodian-claude-provider-global-summary\s*>\s*\*[^}]*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/s,
    );
  });

  it('protects the exact 87px provider column from heading and card intrinsic widths', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/components/settings-claude-providers.css'),
      'utf8',
    );
    const narrowCss = css.slice(css.indexOf('@media (max-width: 720px)'));

    expect(narrowCss).toMatch(
      /\[data-claude-code-section=['"]providers['"]\]\s+\.opencodian-settings-section-heading[^}]*box-sizing:\s*border-box;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/s,
    );
    expect(narrowCss).toMatch(
      /\[data-claude-code-section=['"]providers['"]\]\s+\.opencodian-claude-provider-list[^}]*box-sizing:\s*border-box;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s,
    );
    expect(narrowCss).toMatch(
      /\[data-claude-code-section=['"]providers['"]\]\s+\.opencodian-claude-provider-list\s*>\s*\.opencodian-claude-provider-card[^}]*box-sizing:\s*border-box;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s,
    );
  });

  it('lets the narrow provider block contribute its height to the parent settings scroller', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/components/settings-claude-providers.css'),
      'utf8',
    );
    const narrowCss = css.slice(css.indexOf('@media (max-width: 720px)'));

    expect(narrowCss).toMatch(
      /\[data-claude-code-section=['"]providers['"]\]\.opencodian-settings-block\.opencodian-settings-section[^}]*flex:\s*0\s+0\s+auto;[^}]*height:\s*auto;[^}]*max-height:\s*none;[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*visible;/s,
    );
  });
});
