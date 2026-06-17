import * as fs from 'fs';
import * as path from 'path';

function readStyleFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function extractRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('agent selector toolbar styles', () => {
  it('keeps the agent and model triggers aligned as lightweight runtime chips', () => {
    const agentRule = extractRule(
      readStyleFile('src/style/components/agent-selector.css'),
      '.opencodian-agent-trigger',
    );
    const modelRule = extractRule(
      readStyleFile('src/style/components/model-selector.css'),
      '.opencodian-model-trigger',
    );

    for (const declaration of [
      'padding: 3px 7px;',
      'border-radius: 999px;',
      'background: color-mix(in srgb, var(--background-secondary) 36%, transparent);',
      'border: 1px solid color-mix(in srgb, var(--background-modifier-border) 38%, transparent);',
      'box-shadow: none;',
      'font-size: 11px;',
      'color: color-mix(in srgb, var(--text-normal) 74%, var(--text-muted));',
    ]) {
      expect(modelRule).toContain(declaration);
      expect(agentRule).toContain(declaration);
    }
  });
});
