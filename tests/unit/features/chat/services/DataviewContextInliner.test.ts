/**
 * DataviewContextInliner tests (advantage-parity R-E5).
 *
 * Blocks inline when the Dataview API renders them; missing API or failing
 * queries keep blocks verbatim WITH the explicit unavailable marker (never a
 * silent skip); repeated identical blocks inline once each; plain notes pass
 * through untouched.
 */

import {
  countDataviewBlocks,
  type DataviewApiLike,
  getDataviewApi,
  inlineDataviewBlocks,
} from '../../../../../src/features/chat/services/DataviewContextInliner';

function fakeApi(render: (query: string) => string | Promise<string>): DataviewApiLike {
  return {
    queryMarkdown: (query: string) => ({
      wait: Promise.resolve(render(query)),
    }),
  };
}

const NOTE = [
  '# 笔记',
  '',
  '```dataview',
  'LIST FROM "folder"',
  '```',
  '',
  '正文段落。',
].join('\n');

describe('getDataviewApi', () => {
  it('requires the host plugin api with queryMarkdown', () => {
    expect(getDataviewApi({ plugins: { plugins: { dataview: { api: fakeApi((q) => q) } } } } as never)).not.toBeNull();
    expect(getDataviewApi({ plugins: { plugins: { dataview: { api: {} } } } } as never)).toBeNull();
    expect(getDataviewApi({ plugins: { plugins: {} } } as never)).toBeNull();
    expect(getDataviewApi({} as never)).toBeNull();
  });
});

describe('inlineDataviewBlocks', () => {
  it('inlines rendered results and drops the code fence', async () => {
    const result = await inlineDataviewBlocks(
      fakeApi(() => '| a | b |\n| --- | --- |\n| 1 | 2 |'),
      NOTE,
      'notes/x.md',
    );
    expect(result.inlined).toBe(1);
    expect(result.leftVerbatim).toBe(0);
    expect(result.dataviewAvailable).toBe(true);
    expect(result.content).toContain('| a | b |');
    expect(result.content).not.toContain('```dataview');
    expect(result.content).toContain('正文段落。');
  });

  it('keeps blocks verbatim with the explicit marker when Dataview is unavailable', async () => {
    const result = await inlineDataviewBlocks(null, NOTE, 'notes/x.md');
    expect(result.inlined).toBe(0);
    expect(result.leftVerbatim).toBe(1);
    expect(result.dataviewAvailable).toBe(false);
    expect(result.content).toContain('```dataview');
    expect(result.content).toContain('LIST FROM "folder"');
    expect(result.content).toContain('[dataview blocks present but the Dataview plugin is unavailable');
  });

  it('degrades per-block when a query fails and still marks honestly', async () => {
    const twoBlocks = `${NOTE}\n\n\`\`\`dataview\nTABLE t\n\`\`\``;
    let call = 0;
    const result = await inlineDataviewBlocks(
      fakeApi(() => {
        call += 1;
        if (call === 1) {
          return 'rendered row';
        }
        throw new Error('query error');
      }),
      twoBlocks,
      'notes/x.md',
    );
    expect(result.inlined).toBe(1);
    expect(result.leftVerbatim).toBe(1);
    expect(result.content).toContain('rendered row');
    expect(result.content).toContain('TABLE t');
    expect(result.content).toContain('unavailable or a query failed');
  });

  it('passes plain notes through untouched', async () => {
    const plain = '# 只有正文\n\n没有块。';
    const result = await inlineDataviewBlocks(null, plain, 'notes/x.md');
    expect(result).toEqual({ content: plain, inlined: 0, leftVerbatim: 0, dataviewAvailable: false });
    expect(countDataviewBlocks(plain)).toBe(0);
    expect(countDataviewBlocks(NOTE)).toBe(1);
  });
});
