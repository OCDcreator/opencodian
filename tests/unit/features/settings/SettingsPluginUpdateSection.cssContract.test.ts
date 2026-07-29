import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readPluginUpdateCss(): string {
  return readFileSync(
    join(process.cwd(), 'src/style/components/settings-plugin-update.css'),
    'utf8',
  );
}

describe('SettingsPluginUpdateSection narrow disclosure CSS contract', () => {
  it('uses the primary surface for the single outer disclosure without a secondary mix', () => {
    const css = readPluginUpdateCss();
    const sectionBlock = css.match(/\.opencodian-plugin-update-section\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(sectionBlock).toMatch(/background:\s*var\(--background-primary\);/);
    expect(sectionBlock).not.toMatch(/opencodian-settings-section-bg|color-mix\(/);
    expect(css).not.toContain('--opencodian-settings-section-bg');
  });

  it('uses the existing form-row hover token and keeps content on the shared base', () => {
    const css = readPluginUpdateCss();
    const hoverBlock = css.match(/\.opencodian-plugin-update-heading-button:hover\s*\{([^}]*)\}/s)?.[1] ?? '';
    const contentStart = css.indexOf('.opencodian-plugin-update-content {');
    const contentEnd = css.indexOf('.opencodian-plugin-update-description', contentStart);
    const contentCss = contentStart >= 0 && contentEnd >= 0 ? css.slice(contentStart, contentEnd) : '';

    expect(hoverBlock).toContain('var(--opencodian-settings-form-row-hover-bg)');
    expect(contentCss).not.toMatch(/background\s*:/);
  });

  it('pins the resting header to the same primary surface as the outer card', () => {
    const css = readPluginUpdateCss();
    const headerBlock = css.match(/\.opencodian-plugin-update-heading-button\s*\{([^}]*)\}/s)?.[1] ?? '';
    const scopedHeaderBlock = css.match(/\.opencodian-plugin-update-section\s*>\s*\.opencodian-settings-subsection-heading\s*>\s*\.opencodian-plugin-update-heading-button\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(headerBlock).toMatch(/background:\s*var\(--background-primary\);/);
    expect(headerBlock).not.toMatch(/background:\s*transparent;/);
    expect(scopedHeaderBlock).toMatch(/background-color:\s*var\(--background-primary\);/);
  });

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
