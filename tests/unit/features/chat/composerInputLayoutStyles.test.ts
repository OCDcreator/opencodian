import * as fs from 'fs';
import * as path from 'path';

function readChatAssistantCss(): string {
  return fs.readFileSync(path.join(process.cwd(), 'src/style/features/chat-assistant.css'), 'utf8');
}

function readCoreCss(): string {
  return fs.readFileSync(path.join(process.cwd(), 'src/style/base/core.css'), 'utf8');
}

function extractRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('input-position composer layout styles', () => {
  it('removes hidden Todo and question slots from the input flex layout', () => {
    const css = readChatAssistantCss();
    const todoRule = extractRule(
      css,
      '.opencodian-input-area > .opencodian-session-todo-slot:has(> .opencodian-session-todo-dock.is-hidden)',
    );
    const questionRule = extractRule(
      css,
      '.opencodian-input-area > .opencodian-question-dock-slot:has(> .opencodian-question-dock.is-hidden)',
    );

    expect(todoRule).toContain('display: none;');
    expect(questionRule).toContain('display: none;');
  });

  it('removes an empty input tab slot so disabled tabs do not reserve composer space', () => {
    const css = readChatAssistantCss();
    const tabSlotRule = extractRule(css, '.opencodian-input-area > .opencodian-tab-bar-slot--input:empty');

    expect(tabSlotRule).toContain('display: none;');
  });

  it('uses the input-area gap as the only spacing between visible tabs and the composer', () => {
    const inputTabSlotRule = extractRule(readCoreCss(), '.opencodian-tab-bar-slot--input');

    expect(inputTabSlotRule).toContain('margin-bottom: 0;');
  });
});
