import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readPluginUpdateCss(): string {
  return readFileSync(
    join(process.cwd(), 'src/style/components/settings-plugin-update.css'),
    'utf8',
  );
}

describe('SettingsPluginUpdateSection narrow disclosure CSS contract', () => {
  it('overrides Obsidian compact button height so the header can grow for its metadata row', () => {
    const css = readPluginUpdateCss();

    expect(css).toMatch(
      /\.opencodian-plugin-update-heading-button\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;[^}]*min-width:\s*0;/s,
    );
  });

  it('places header metadata on the second responsive grid row without horizontal overflow', () => {
    const css = readPluginUpdateCss();
    const narrowCss = css.slice(css.indexOf('@media (max-width: 720px)'));

    expect(narrowCss).toMatch(
      /\.opencodian-plugin-update-heading-button\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\);/s,
    );
    expect(narrowCss).toMatch(
      /\.opencodian-plugin-update-heading-meta\s*\{[^}]*grid-column:\s*2;[^}]*justify-content:\s*flex-start;/s,
    );
  });
});
