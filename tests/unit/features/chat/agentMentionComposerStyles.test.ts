import * as fs from 'fs';
import * as path from 'path';

function readChatAssistantCss(): string {
  return fs.readFileSync(path.join(process.cwd(), 'src/style/features/chat-assistant.css'), 'utf8');
}

function extractRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('agent mention composer styles', () => {
  it('keeps highlight tokens text-metric compatible with the textarea caret layer', () => {
    const css = readChatAssistantCss();
    const textareaRule = extractRule(css, '.opencodian-input-wrapper .opencodian-input');
    const backdropRule = extractRule(css, '.opencodian-input-wrapper .opencodian-input-highlight-backdrop');
    const tokenRule = extractRule(css, '.opencodian-input-highlight-token');
    const agentRule = extractRule(css, '.opencodian-input-highlight-agent');

    expect(textareaRule).toContain('padding: 12px 6px 10px;');
    expect(textareaRule).toContain('line-height: 1.65;');
    expect(backdropRule).toContain('padding: 12px 6px 10px;');
    expect(backdropRule).toContain('line-height: 1.65;');
    expect(tokenRule).not.toMatch(/\bfont-weight\s*:/);
    expect(agentRule).not.toMatch(/\bpadding\s*:/);
    expect(agentRule).not.toMatch(/0\s+0\s+0\s+(?:3|4)px/);
  });
});
