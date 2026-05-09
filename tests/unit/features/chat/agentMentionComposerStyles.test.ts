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
    const tokenRule = extractRule(css, '.opencodian-input-highlight-token');
    const agentRule = extractRule(css, '.opencodian-input-highlight-agent');

    expect(tokenRule).not.toMatch(/\bfont-weight\s*:/);
    expect(agentRule).not.toMatch(/\bpadding\s*:/);
  });
});
