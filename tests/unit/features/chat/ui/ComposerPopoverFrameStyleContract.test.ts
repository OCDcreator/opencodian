import { readFileSync } from 'fs';

function getReducedMotionBlock(stylesheet: string): string {
  const marker = '@media (prefers-reduced-motion: reduce)';
  const start = stylesheet.indexOf(marker);
  if (start < 0) {
    return '';
  }

  const end = stylesheet.indexOf('\n}', start);
  return end < 0 ? '' : stylesheet.slice(start, end + 2);
}

function getRuleBlock(stylesheet: string, selector: string): string {
  const start = stylesheet.indexOf(selector);
  if (start < 0) {
    return '';
  }

  const braceStart = stylesheet.indexOf('{', start);
  if (braceStart < 0) {
    return '';
  }

  let depth = 1;
  let cursor = braceStart + 1;
  while (cursor < stylesheet.length && depth > 0) {
    const next = stylesheet[cursor];
    if (next === '{') {
      depth += 1;
    } else if (next === '}') {
      depth -= 1;
    }
    cursor += 1;
  }

  return stylesheet.slice(start, cursor);
}

describe('ComposerPopoverFrame style contract', () => {
  it('defines the shared flat frame selectors and disables row/frame motion under reduced motion', () => {
    const stylesheet = readFileSync('src/style/components/composer-popover-frame.css', 'utf8');

    expect(stylesheet).toContain('.opencodian-composer-popover-frame');
    expect(stylesheet).toContain('.opencodian-composer-popover-header');
    expect(stylesheet).toContain('.opencodian-composer-popover-footer');
    expect(stylesheet).toContain('.opencodian-composer-popover-option');
    expect(stylesheet).toContain('.is-selected');
    expect(stylesheet).toContain(':focus-visible');
    expect(stylesheet).toContain('prefers-reduced-motion');
    expect(stylesheet).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.opencodian-composer-popover-frame[\s\S]*transition: none/);
  });

  it('uses the shadcn Command 10px surface radius', () => {
    const stylesheet = readFileSync('src/style/components/composer-popover-frame.css', 'utf8');
    const frameRule = getRuleBlock(stylesheet, '.opencodian-composer-popover-frame');

    expect(frameRule).toMatch(/border-radius:\s*10px/);
  });

  it('keeps the shared surface free of glass, gradients, and colored rails', () => {
    const stylesheet = readFileSync('src/style/components/composer-popover-frame.css', 'utf8');

    expect(stylesheet).not.toContain('backdrop-filter');
    expect(stylesheet).not.toContain('linear-gradient');
    expect(stylesheet).not.toContain('radial-gradient');
  });

  it('renders Command item selection without outlines, shadows, or colored rail backgrounds', () => {
    const stylesheet = readFileSync('src/style/components/composer-popover-frame.css', 'utf8');
    const selectedRule = getRuleBlock(
      stylesheet,
      '.opencodian-composer-popover-option.is-selected',
    );

    expect(selectedRule).not.toMatch(/box-shadow/);
    expect(selectedRule).not.toMatch(/border-color/);
    expect(selectedRule).not.toMatch(/inset\s+-?\d/);
    expect(selectedRule).toMatch(/background:\s*var\(--background-modifier-hover\)/);
  });

  it('uses one neutral hover/highlight surface for Command items', () => {
    const stylesheet = readFileSync('src/style/components/composer-popover-frame.css', 'utf8');

    const hoverRule = getRuleBlock(
      stylesheet,
      '.opencodian-composer-popover-option:hover',
    );
    const highlightRule = getRuleBlock(
      stylesheet,
      '.opencodian-composer-popover-option.is-highlighted',
    );

    expect(hoverRule).toMatch(/background:\s*var\(--background-modifier-hover\)/);
    expect(highlightRule).toMatch(/background:\s*var\(--background-modifier-hover\)/);
  });

  it('disables the Agent dropdown opening animation under reduced motion', () => {
    const stylesheet = readFileSync('src/style/components/agent-selector.css', 'utf8');
    const reducedMotionBlock = getReducedMotionBlock(stylesheet);

    expect(reducedMotionBlock).toMatch(
      /\.opencodian-agent-dropdown\s*\{[^}]*animation:\s*none;/,
    );
  });

  it('uses compact 6px Command item radius', () => {
    const stylesheet = readFileSync('src/style/components/composer-popover-frame.css', 'utf8');
    const optionRule = getRuleBlock(
      stylesheet,
      '.opencodian-composer-popover-option',
    );

    expect(optionRule).toMatch(/border-radius:\s*6px/);
  });

  it('uses the normal text token for the selected model checkmark', () => {
    const stylesheet = readFileSync('src/style/components/model-selector.css', 'utf8');
    const selectedCheckRule = getRuleBlock(
      stylesheet,
      '.opencodian-model-option.is-selected .opencodian-model-option-check',
    );

    expect(selectedCheckRule).toMatch(/color:\s*var\(--text-normal\)/);
    expect(selectedCheckRule).toMatch(/opacity:\s*1/);
  });
});
