import { readFileSync } from 'node:fs';

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

describe('Chat header status chip style contract', () => {
  it('keeps a 28px header footprint while the hover label overlays to the left', () => {
    const stylesheet = readFileSync('src/style/base/core.css', 'utf8');
    const statusGroupRule = getRuleBlock(stylesheet, '.opencodian-header-status-group');
    const statusSlotRule = getRuleBlock(stylesheet, '.opencodian-header-status-group::before');
    const badgeRule = getRuleBlock(stylesheet, '.opencodian-server-status-badge');
    const badgeTooltipRule = getRuleBlock(
      stylesheet,
      '.opencodian-server-status-badge.opencodian-tooltip-trigger',
    );
    const expandedBadgeRule = getRuleBlock(
      stylesheet,
      '.opencodian-server-status-badge:hover,\n.opencodian-server-status-badge:focus-visible',
    );

    expect(statusGroupRule).toMatch(/position:\s*relative/);
    expect(statusSlotRule).toMatch(/content:\s*["']{2}/);
    expect(statusSlotRule).toMatch(/flex:\s*0\s+0\s+28px/);
    expect(badgeRule).toMatch(/position:\s*absolute/);
    expect(badgeRule).toMatch(/inset-inline-end:\s*calc\(100%\s*-\s*28px\)/);
    expect(badgeTooltipRule).toMatch(/position:\s*absolute/);
    expect(expandedBadgeRule).toMatch(/width:\s*min\(220px,\s*48vw\)/);
    expect(expandedBadgeRule).toMatch(/z-index:\s*8/);
  });

  it('reveals the complete bounded status label without an ellipsis', () => {
    const stylesheet = readFileSync('src/style/base/core.css', 'utf8');
    const statusTextRule = getRuleBlock(stylesheet, '.opencodian-server-status-text');
    const expandedTextRule = getRuleBlock(
      stylesheet,
      '.opencodian-server-status-badge:hover .opencodian-server-status-text,\n.opencodian-server-status-badge:focus-visible .opencodian-server-status-text',
    );

    expect(statusTextRule).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(statusTextRule).toMatch(/max-width\s+0\.16s/);
    expect(expandedTextRule).toMatch(/max-width:\s*calc\(min\(220px,\s*48vw\)\s*-\s*44px\)/);
  });
});
