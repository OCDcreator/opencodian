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
  it('keeps the agent trigger container aligned with the model trigger container', () => {
    const agentRule = extractRule(
      readStyleFile('src/style/components/agent-selector.css'),
      '.opencodian-agent-trigger',
    );
    const modelRule = extractRule(
      readStyleFile('src/style/components/model-selector.css'),
      '.opencodian-model-trigger',
    );

    for (const declaration of [
      'padding: 4px 10px;',
      'border: 1px solid color-mix(in srgb, var(--background-modifier-border) 54%, transparent);',
      'box-shadow: 0 1px 0 color-mix(in srgb, var(--opencodian-glass-specular) 30%, transparent) inset;',
      'color: var(--text-normal);',
    ]) {
      expect(modelRule).toContain(declaration);
      expect(agentRule).toContain(declaration);
    }
  });
});
