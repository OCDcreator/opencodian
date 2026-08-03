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
    const triggerRule = css.match(/\.opencodian-modified-files-trigger-strip\s*\{([^}]+)\}/)?.[1] ?? '';
    const panelRule = css.match(/\.opencodian-modified-files-sidebar\s*\{([^}]+)\}/)?.[1] ?? '';
    const hoverBaseRule = css.match(/\.opencodian-modified-files-hover-zone\s*\{([^}]+)\}/)?.[1] ?? '';
    const expandedRule = css.match(/\.opencodian-modified-files-hover-zone\.is-expanded\s*\{([^}]+)\}/)?.[1] ?? '';

    expect(triggerRule).toContain('min-width: 44px');
    expect(triggerRule).toContain('height: 32px');
    expect(triggerRule).toContain('border-radius: 999px');
    expect(triggerRule).toContain('gap: 4px');
    expect(triggerRule).toContain('opacity: 0');
    expect(triggerRule).toContain('pointer-events: none');
    expect(panelRule).toContain('right: 8px');
    expect(panelRule).toContain('width: min(288px, calc(100% - 16px))');
    expect(panelRule).toContain('top: 40px');
    expect(hoverBaseRule).toContain('top: 76px');
    expect(hoverBaseRule).toContain('width: 48px');
    expect(hoverBaseRule).toContain('height: 40px');
    expect(expandedRule).toContain('width: min(304px, calc(100% - 8px))');
    expect(expandedRule).toContain('height: var(--opencodian-modified-files-expanded-height)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('outline: 2px solid var(--interactive-accent)');
    const summaryRule = css.match(/\.opencodian-modified-files-sidebar-summary\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(summaryRule).toContain('min-width: 0');
    expect(summaryRule).toContain('text-overflow: ellipsis');
    expect(css).toContain('.opencodian-modified-files-hover-zone:hover .opencodian-modified-files-trigger-strip');
    expect(css).toContain('.opencodian-modified-files-hover-zone:focus-within .opencodian-modified-files-trigger-strip');
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
