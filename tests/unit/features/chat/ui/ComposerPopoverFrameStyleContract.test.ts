import { readFileSync } from 'fs';

describe('ComposerPopoverFrame style contract', () => {
  it('defines the shared flat frame selectors and motion boundary', () => {
    const stylesheet = readFileSync('src/style/components/composer-popover-frame.css', 'utf8');

    expect(stylesheet).toContain('.opencodian-composer-popover-frame');
    expect(stylesheet).toContain('.opencodian-composer-popover-header');
    expect(stylesheet).toContain('.opencodian-composer-popover-footer');
    expect(stylesheet).toContain('.opencodian-composer-popover-option');
    expect(stylesheet).toContain('.is-selected');
    expect(stylesheet).toContain(':focus-visible');
    expect(stylesheet).toContain('prefers-reduced-motion');
  });

  it('excludes glass and gradient effects', () => {
    const stylesheet = readFileSync('src/style/components/composer-popover-frame.css', 'utf8');

    expect(stylesheet).not.toContain('backdrop-filter');
    expect(stylesheet).not.toContain('linear-gradient');
    expect(stylesheet).not.toContain('radial-gradient');
  });
});
