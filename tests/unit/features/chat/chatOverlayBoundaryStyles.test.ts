import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readStyleFile(name: string): string {
  return readFileSync(join(process.cwd(), 'src/style/components', name), 'utf8');
}

describe('Chat overlay boundary CSS contracts', () => {
  it.each([
    ['agent-selector.css', '.opencodian-agent-dropdown'],
    ['permission-mode-selector.css', '.opencodian-permission-dropdown'],
    ['effort-selector.css', '.opencodian-effort-options'],
  ])('uses border-box sizing for measured overlays in %s', (fileName, selector) => {
    const css = readStyleFile(fileName);
    const escapedSelector = selector.replace('.', '\\.');
    const rule = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))?.[1] ?? '';

    expect(rule).toContain('box-sizing: border-box');
  });

  it('shrinks the modified-files panel and hover zone inside their containing block', () => {
    const css = readStyleFile('modified-files-sidebar.css');
    const panelRule = css.match(/\.opencodian-modified-files-sidebar\s*\{([^}]+)\}/)?.[1] ?? '';
    const hoverRule = css.match(/\.opencodian-modified-files-hover-zone:hover\s*\{([^}]+)\}/)?.[1] ?? '';

    expect(panelRule).toContain('right: 8px');
    expect(panelRule).toContain('width: min(280px, calc(100% - 16px))');
    expect(hoverRule).toContain('width: min(300px, calc(100% - 8px))');
  });

  it('does not size chat dropdowns from the viewport width', () => {
    const css = [
      readStyleFile('agent-selector.css'),
      readStyleFile('permission-mode-selector.css'),
      readStyleFile('effort-selector.css'),
    ].join('\n');

    expect(css).not.toContain('100vw');
  });
});
