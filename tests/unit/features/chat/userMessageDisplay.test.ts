import {
  applyUserMessageTextHighlightSpans,
  extractUserMessageTextHighlightSpans,
  prepareUserMessageMarkdownForDisplay,
} from '../../../../src/features/chat/userMessageDisplay';

describe('prepareUserMessageMarkdownForDisplay', () => {
  it('converts raw style blocks into css code fences', () => {
    const markdown = '说明如下：\n<style>\n.foo {\n  color: red;\n}\n</style>\n结束';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '说明如下：\n\n```css\n.foo {\n  color: red;\n}\n```\n\n结束',
    );
  });

  it('does not touch existing fenced code blocks', () => {
    const markdown = '```html\n<style>\n.foo { color: red; }\n</style>\n```';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(markdown);
  });

  it('converts raw script blocks into javascript code fences', () => {
    const markdown = '示例：\n<script>\nconst button = document.querySelector(".demo");\nbutton?.click();\n</script>';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '示例：\n\n```javascript\nconst button = document.querySelector(".demo");\nbutton?.click();\n```\n',
    );
  });

  it('converts standalone html blocks into html code fences', () => {
    const markdown = '结构如下：\n<div class="demo">\n  <span>Hello</span>\n</div>\n完成';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '结构如下：\n\n```html\n<div class="demo">\n  <span>Hello</span>\n</div>\n```\n\n完成',
    );
  });

  it('converts standalone svg blocks into html code fences', () => {
    const markdown = '<svg viewBox="0 0 10 10">\n  <circle cx="5" cy="5" r="4" />\n</svg>';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '\n```html\n<svg viewBox="0 0 10 10">\n  <circle cx="5" cy="5" r="4" />\n</svg>\n```\n',
    );
  });

  it('converts xml declaration plus svg block into one html code fence', () => {
    const markdown = '<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 10 10">\n  <rect width="10" height="10" />\n</svg>';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '\n```html\n<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 10 10">\n  <rect width="10" height="10" />\n</svg>\n```\n',
    );
  });

  it('converts doctype plus html block into one html code fence', () => {
    const markdown = '<!DOCTYPE html>\n<html>\n  <body>\n    <iframe src="https://example.com"></iframe>\n  </body>\n</html>';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '\n```html\n<!DOCTYPE html>\n<html>\n  <body>\n    <iframe src="https://example.com"></iframe>\n  </body>\n</html>\n```\n',
    );
  });

  it('converts standalone mathml blocks into html code fences', () => {
    const markdown = '<math>\n  <mrow><mi>x</mi><mo>=</mo><mn>1</mn></mrow>\n</math>';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '\n```html\n<math>\n  <mrow><mi>x</mi><mo>=</mo><mn>1</mn></mrow>\n</math>\n```\n',
    );
  });

  it('converts standalone html comments into html code fences', () => {
    const markdown = '<!-- hidden block -->';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '\n```html\n<!-- hidden block -->\n```\n',
    );
  });

  it('converts standalone cdata blocks into html code fences', () => {
    const markdown = '<![CDATA[<svg><rect /></svg>]]>';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '\n```html\n<![CDATA[<svg><rect /></svg>]]>\n```\n',
    );
  });

  it('escapes unmatched style tags outside code blocks', () => {
    const markdown = '<style scoped>body { color: red; }';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '&lt;style scoped&gt;body { color: red; }',
    );
  });

  it('escapes inline html tags that are not standalone code blocks', () => {
    const markdown = '这里有 <div>inline</div> 标签';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '这里有 &lt;div&gt;inline&lt;/div&gt; 标签',
    );
  });

  it('escapes inline xml declarations outside standalone blocks', () => {
    const markdown = '片段： <?xml version="1.0"?>';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '片段： &lt;?xml version="1.0"?&gt;',
    );
  });

  it('escapes inline html comments outside standalone blocks', () => {
    const markdown = '说明 <!-- hidden --> 继续';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '说明 &lt;!-- hidden --&gt; 继续',
    );
  });

  it('escapes dangling markup starters outside code blocks', () => {
    const markdown = '残缺片段： <!-- 和 <?xml';

    expect(prepareUserMessageMarkdownForDisplay(markdown)).toBe(
      '残缺片段： &lt;!-- 和 &lt;?xml',
    );
  });
});

describe('extractUserMessageTextHighlightSpans', () => {
  it('extracts valid native agent source spans from message parts', () => {
    expect(extractUserMessageTextHighlightSpans('Ask @reviewer to inspect this', [
      {
        type: 'agent',
        name: 'reviewer',
        source: {
          value: '@reviewer',
          start: 4,
          end: 13,
        },
      },
    ])).toEqual([
      {
        kind: 'agent',
        value: '@reviewer',
        start: 4,
        end: 13,
      },
    ]);
  });

  it('ignores stale or overlapping agent spans', () => {
    expect(extractUserMessageTextHighlightSpans('Ask @reviewer now', [
      {
        type: 'agent',
        source: {
          value: '@planner',
          start: 4,
          end: 12,
        },
      },
      {
        type: 'agent',
        source: {
          value: '@reviewer',
          start: 4,
          end: 13,
        },
      },
      {
        type: 'agent',
        source: {
          value: '@viewer',
          start: 8,
          end: 15,
        },
      },
    ])).toEqual([
      {
        kind: 'agent',
        value: '@reviewer',
        start: 4,
        end: 13,
      },
    ]);
  });

  it('extracts slash command and direct skill spans from visible text', () => {
    expect(extractUserMessageTextHighlightSpans(
      '你好 /writing-skills 为什么 /writing-skills',
      [
        {
          type: 'text',
          text: '<skill_content name="writing-skills">...</skill_content>',
          synthetic: true,
          metadata: {
            kind: 'skill-expansion',
            skillName: 'writing-skills',
          },
        },
      ],
    )).toEqual([
      {
        kind: 'command',
        value: '/writing-skills',
        start: 3,
        end: 18,
      },
      {
        kind: 'command',
        value: '/writing-skills',
        start: 23,
        end: 38,
      },
    ]);
  });

  it('extracts prefixed skills-command spans including the skill name', () => {
    expect(extractUserMessageTextHighlightSpans(
      'Run /skills writing-skills now',
      [
        {
          type: 'text',
          text: '<skill_content name="writing-skills">...</skill_content>',
          synthetic: true,
          metadata: {
            kind: 'skill-expansion',
            skillName: 'writing-skills',
          },
        },
      ],
    )).toEqual([
      {
        kind: 'command',
        value: '/skills writing-skills',
        start: 4,
        end: 26,
      },
    ]);
  });

  it('does not extract slash spans when the token is not a known expanded skill', () => {
    expect(extractUserMessageTextHighlightSpans(
      '你好 /not-a-skill 为什么',
      [],
    )).toEqual([]);
  });
});

describe('applyUserMessageTextHighlightSpans', () => {
  it('wraps agent spans in rendered text while preserving surrounding text nodes', () => {
    const container = document.createElement('div');
    container.textContent = 'Ask @reviewer now';

    expect(applyUserMessageTextHighlightSpans(container, 'Ask @reviewer now', [
      {
        kind: 'agent',
        value: '@reviewer',
        start: 4,
        end: 13,
      },
    ])).toBe(true);

    const highlight = container.querySelector<HTMLElement>('.opencodian-message-highlight-agent');
    expect(container.textContent).toBe('Ask @reviewer now');
    expect(highlight?.textContent).toBe('@reviewer');
    expect(highlight?.dataset.highlight).toBe('agent');
  });

  it('wraps slash command spans with command highlight styling', () => {
    const container = document.createElement('div');
    container.textContent = '你好 /writing-skills 为什么';

    expect(applyUserMessageTextHighlightSpans(container, '你好 /writing-skills 为什么', [
      {
        kind: 'command',
        value: '/writing-skills',
        start: 3,
        end: 18,
      },
    ])).toBe(true);

    const highlight = container.querySelector<HTMLElement>('.opencodian-message-highlight-command');
    expect(container.textContent).toBe('你好 /writing-skills 为什么');
    expect(highlight?.textContent).toBe('/writing-skills');
    expect(highlight?.dataset.highlight).toBe('command');
  });

  it('wraps multiple slash skill spans in one rendered user message', () => {
    const container = document.createElement('div');
    container.textContent = '先 /writing-skills 再 /agent-browser';

    expect(applyUserMessageTextHighlightSpans(
      container,
      '先 /writing-skills 再 /agent-browser',
      extractUserMessageTextHighlightSpans(
        '先 /writing-skills 再 /agent-browser',
        [
          {
            type: 'text',
            text: '<skill_content name="writing-skills">...</skill_content>',
            synthetic: true,
            metadata: {
              kind: 'skill-expansion',
              skillName: 'writing-skills',
            },
          },
          {
            type: 'text',
            text: '<skill_content name="agent-browser">...</skill_content>',
            synthetic: true,
            metadata: {
              kind: 'skill-expansion',
              skillName: 'agent-browser',
            },
          },
        ],
      ),
    )).toBe(true);

    const highlights = Array.from(
      container.querySelectorAll<HTMLElement>('.opencodian-message-highlight-command'),
      (element) => element.textContent,
    );
    expect(highlights).toEqual(['/writing-skills', '/agent-browser']);
  });

  it('does not wrap slash command styling when no known skill span exists', () => {
    const container = document.createElement('div');
    container.textContent = '你好 /not-a-skill 为什么';

    expect(applyUserMessageTextHighlightSpans(
      container,
      '你好 /not-a-skill 为什么',
      extractUserMessageTextHighlightSpans('你好 /not-a-skill 为什么', []),
    )).toBe(false);
    expect(container.querySelector('.opencodian-message-highlight-command')).toBeNull();
  });

  it('skips wrapping when rendered text no longer matches the source content', () => {
    const container = document.createElement('div');
    container.textContent = 'Ask reviewer now';

    expect(applyUserMessageTextHighlightSpans(container, 'Ask @reviewer now', [
      {
        kind: 'agent',
        value: '@reviewer',
        start: 4,
        end: 13,
      },
    ])).toBe(false);
    expect(container.querySelector('.opencodian-message-highlight-agent')).toBeNull();
  });
});
