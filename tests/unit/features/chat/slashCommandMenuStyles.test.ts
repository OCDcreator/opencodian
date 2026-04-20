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

describe('slash command menu styles', () => {
  it('prevents option rows from shrinking under the menu max-height', () => {
    const css = readChatAssistantCss();
    const itemRule = extractRule(css, '.opencodian-slash-command-menu-item');

    expect(itemRule).toContain('flex: 0 0 auto;');
    expect(itemRule).toContain('overflow: hidden;');
  });

  it('clips long command descriptions instead of letting them overlap other rows', () => {
    const css = readChatAssistantCss();
    const titleRule = extractRule(css, '.opencodian-slash-command-menu-title');
    const descriptionRule = extractRule(css, '.opencodian-slash-command-menu-description');

    expect(titleRule).toContain('white-space: nowrap;');
    expect(titleRule).toContain('text-overflow: ellipsis;');
    expect(descriptionRule).toContain('white-space: nowrap;');
    expect(descriptionRule).toContain('text-overflow: ellipsis;');
  });
});
