import { prepareUserMessageMarkdownForDisplay } from '../../../../src/features/chat/userMessageDisplay';

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
