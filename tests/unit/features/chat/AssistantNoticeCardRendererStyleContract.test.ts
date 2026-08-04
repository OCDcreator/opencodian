import { readFileSync } from 'node:fs';

function getRuleBlocks(stylesheet: string, selector: string): string[] {
  const blocks: string[] = [];
  let cursor = 0;
  while (cursor < stylesheet.length) {
    const start = stylesheet.indexOf(selector, cursor);
    if (start < 0) {
      break;
    }
    const braceStart = stylesheet.indexOf('{', start);
    if (braceStart < 0) {
      break;
    }
    let depth = 1;
    let end = braceStart + 1;
    while (end < stylesheet.length && depth > 0) {
      if (stylesheet[end] === '{') {
        depth += 1;
      } else if (stylesheet[end] === '}') {
        depth -= 1;
      }
      end += 1;
    }
    blocks.push(stylesheet.slice(start, end));
    cursor = end;
  }
  return blocks;
}

function getRuleBlock(stylesheet: string, selector: string): string {
  return getRuleBlocks(stylesheet, selector)[0] ?? '';
}

describe('AssistantNoticeCardRenderer turn-diff style contract', () => {
  const stylesheet = readFileSync('src/style/features/chat-assistant.css', 'utf8');

  it('keeps turn-diff rows on a single nowrap line at roughly 30px with a 4px list gap', () => {
    const rowRule = getRuleBlock(
      stylesheet,
      '.opencodian-chat-notice-card.is-turn-diff button.opencodian-turn-diff-row',
    );
    const listRule = getRuleBlock(stylesheet, '.opencodian-turn-diff-list');
    const pathRule = getRuleBlock(stylesheet, '.opencodian-turn-diff-path');
    const metaRule = getRuleBlock(stylesheet, '.opencodian-turn-diff-meta');

    expect(rowRule).toMatch(/white-space:\s*nowrap/);
    expect(rowRule).toMatch(/min-height:\s*30px/);
    expect(rowRule).toMatch(/background:\s*transparent/);
    expect(rowRule).toMatch(/box-shadow:\s*none/);
    expect(listRule).toMatch(/gap:\s*4px/);
    expect(listRule).toMatch(/margin-top:\s*10px/);
    expect(pathRule).toMatch(/min-width:\s*0/);
    expect(pathRule).toMatch(/overflow:\s*hidden/);
    expect(metaRule).toMatch(/white-space:\s*nowrap/);
    expect(metaRule).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('styles hover and keyboard focus without hiding rows behind heavy effects', () => {
    const hoverRule = getRuleBlock(stylesheet, '.opencodian-turn-diff-row:hover');
    const focusRule = getRuleBlock(stylesheet, '.opencodian-turn-diff-row:focus-visible');

    expect(hoverRule).toMatch(/background/);
    expect(hoverRule).not.toMatch(/transform/);
    expect(hoverRule).toMatch(/box-shadow:\s*none/);
    expect(focusRule).toMatch(/outline/);
  });

  it('uses subtle semantic success/error backgrounds with tabular numbers on stat badges', () => {
    const additionsRule = getRuleBlock(stylesheet, '.opencodian-turn-diff-stat.is-additions');
    const deletionsRule = getRuleBlock(stylesheet, '.opencodian-turn-diff-stat.is-deletions');
    const statRule = getRuleBlock(stylesheet, '.opencodian-turn-diff-stat {');

    expect(additionsRule).toMatch(/color:\s*var\(--opencodian-status-success\)/);
    expect(additionsRule).toMatch(/background:\s*var\(--opencodian-status-success-subtle\)/);
    expect(deletionsRule).toMatch(/color:\s*var\(--opencodian-status-error\)/);
    expect(deletionsRule).toMatch(/background:\s*var\(--opencodian-status-error-subtle\)/);
    expect(statRule).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(statRule).not.toMatch(/box-shadow/);
  });

  it('scopes every turn-diff rule to the dedicated namespace without global side effects', () => {
    expect(stylesheet).not.toMatch(/\.opencodian-chat-notice-icon\s*\{[^}]*display:\s*none/);
    expect(stylesheet).not.toContain('.is-turn-diff .opencodian-chat-notice-icon');

    const turnDiffBlocks = getRuleBlocks(stylesheet, '.opencodian-turn-diff');
    expect(turnDiffBlocks.length).toBeGreaterThan(0);
    for (const block of turnDiffBlocks) {
      expect(block).not.toMatch(/overflow-y:\s*(auto|scroll)/);
      expect(block).not.toMatch(/overflow:\s*(auto|scroll)/);
      expect(block).not.toMatch(/max-height/);
      const shadowValues = Array.from(
        block.matchAll(/box-shadow:\s*([^;]+);/g),
        (match) => match[1].trim(),
      );
      expect(shadowValues.every((value) => value === 'none')).toBe(true);
    }

    const rowRule = getRuleBlock(
      stylesheet,
      '.opencodian-chat-notice-card.is-turn-diff button.opencodian-turn-diff-row',
    );
    expect(rowRule).not.toMatch(/border:\s*1px\s+solid/);

    const genericIconRule = getRuleBlock(stylesheet, '.opencodian-chat-notice-icon');
    expect(genericIconRule).toMatch(/display:\s*flex/);
  });
});
