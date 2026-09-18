import { describe, expect, it } from '@jest/globals';

import {
  canComputeWordDiff,
  computeWordDiff,
  INLINE_EDIT_DIFF_MAX_INPUT_CHARS,
  type InlineEditDiffOp,
  isDiffEmpty,
  renderDiffInto,
  tokenizeForDiff,
} from '../../../../src/features/inline-edit/InlineEditDiff';

/** Rebuild both sides from the ops so alignment losses are visible. */
function rebuild(ops: readonly InlineEditDiffOp[]): { before: string; after: string } {
  let before = '';
  let after = '';
  for (const op of ops) {
    if (op.type === 'equal') { before += op.text; after += op.text; continue; }
    if (op.type === 'delete') { before += op.text; continue; }
    after += op.text;
  }
  return { before, after };
}

describe('tokenizeForDiff', () => {
  it('splits latin text into words and separate whitespace runs', () => {
    expect(tokenizeForDiff('the cat sat')).toEqual(['the', ' ', 'cat', ' ', 'sat']);
  });

  it('splits CJK into single characters', () => {
    expect(tokenizeForDiff('你好世界')).toEqual(['你', '好', '世', '界']);
  });

  it('keeps line breaks as their own token so markdown structure survives', () => {
    expect(tokenizeForDiff('- a\n- b')).toEqual(['-', ' ', 'a', '\n', '-', ' ', 'b']);
  });

  it('handles mixed Chinese and English', () => {
    expect(tokenizeForDiff('用 read 工具')).toEqual(['用', ' ', 'read', ' ', '工', '具']);
  });
});

describe('computeWordDiff', () => {
  it('reports no change for identical input', () => {
    const ops = computeWordDiff('same text', 'same text');
    expect(ops).not.toBeNull();
    expect(isDiffEmpty(ops as InlineEditDiffOp[])).toBe(true);
  });

  it('marks a pure insertion', () => {
    const ops = computeWordDiff('the cat', 'the big cat') as InlineEditDiffOp[];
    expect(rebuild(ops)).toEqual({ before: 'the cat', after: 'the big cat' });
    expect(ops.some((op) => op.type === 'insert' && op.text.includes('big'))).toBe(true);
    expect(ops.some((op) => op.type === 'delete')).toBe(false);
  });

  it('marks a pure deletion', () => {
    const ops = computeWordDiff('the big cat', 'the cat') as InlineEditDiffOp[];
    expect(rebuild(ops)).toEqual({ before: 'the big cat', after: 'the cat' });
    expect(ops.some((op) => op.type === 'delete' && op.text.includes('big'))).toBe(true);
    expect(ops.some((op) => op.type === 'insert')).toBe(false);
  });

  it('handles a mixed rewrite', () => {
    const ops = computeWordDiff('The cat sat on the mat.', 'The sleek cat lounged on the mat.') as InlineEditDiffOp[];
    expect(rebuild(ops)).toEqual({
      before: 'The cat sat on the mat.',
      after: 'The sleek cat lounged on the mat.',
    });
    expect(ops.some((op) => op.type === 'insert')).toBe(true);
    expect(ops.some((op) => op.type === 'delete')).toBe(true);
  });

  it('aligns Chinese text per character', () => {
    const ops = computeWordDiff('今天天气很好', '今天天气非常好') as InlineEditDiffOp[];
    expect(rebuild(ops)).toEqual({ before: '今天天气很好', after: '今天天气非常好' });
    // 很 → 非常 is a substitution, so the diff shows exactly one deleted
    // character and two inserted ones, all whole characters.
    const changed = ops.filter((op) => op.type !== 'equal');
    expect(changed.map((op) => `${op.type}:${op.text}`).sort())
      .toEqual(['delete:很', 'insert:非常']);
    for (const op of ops) {
      for (const char of op.text) {
        expect(char).toHaveLength(1);
      }
    }
  });

  it('preserves list structure and fences across a rewrite', () => {
    const before = '- one\n- two\n\n```ts\nconst a = 1;\n```\n';
    const after = '- one\n- two changed\n\n```ts\nconst a = 2;\n```\n';
    const ops = computeWordDiff(before, after) as InlineEditDiffOp[];
    expect(rebuild(ops)).toEqual({ before, after });
    const deletes = ops.filter((op) => op.type === 'delete').map((op) => op.text).join('');
    expect(deletes).not.toContain('-');
    expect(deletes).not.toContain('```');
  });

  it('inserts nothing when the text is unchanged apart from whitespace runs', () => {
    const ops = computeWordDiff('a b', 'a  b') as InlineEditDiffOp[];
    expect(rebuild(ops)).toEqual({ before: 'a b', after: 'a  b' });
  });
});

describe('renderDiffInto degraded view (R-A6)', () => {
  it('renders whole before/after blocks with an explicit degradation label', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const huge = 'word '.repeat(Math.ceil(INLINE_EDIT_DIFF_MAX_INPUT_CHARS / 5) + 20);
    const rendered = renderDiffInto(container, huge, 'replacement', {
      insert: 'ins',
      delete: 'del',
      fallbackLabel: '内容过大，仅显示前后对照',
    });
    expect(rendered).toBe(false);
    expect(container.classList.contains('opencodian-inline-edit-fallback')).toBe(true);
    const label = container.querySelector('.opencodian-inline-edit-fallback-label');
    expect(label?.textContent).toBe('内容过大，仅显示前后对照');
    const blocks = container.querySelectorAll(':scope > div:not(.opencodian-inline-edit-fallback-label)');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].textContent).toBe(huge);
    expect(blocks[1].textContent).toBe('replacement');
  });

  it('omits the label header when no fallback label is provided (legacy callers)', () => {
    const container = document.createElement('div');
    const huge = 'word '.repeat(Math.ceil(INLINE_EDIT_DIFF_MAX_INPUT_CHARS / 5) + 20);
    renderDiffInto(container, huge, 'replacement', { insert: 'ins', delete: 'del' });
    expect(container.querySelector('.opencodian-inline-edit-fallback-label')).toBeNull();
  });
});

describe('canComputeWordDiff', () => {
  it('refuses inputs beyond the documented size bound', () => {
    const huge = 'x '.repeat(Math.ceil(INLINE_EDIT_DIFF_MAX_INPUT_CHARS / 2) + 10);
    expect(canComputeWordDiff(huge, 'small')).toBe(false);
    expect(computeWordDiff(huge, 'small')).toBeNull();
  });

  it('refuses an empty side', () => {
    expect(canComputeWordDiff('', 'text')).toBe(false);
  });

  it('accepts ordinary note-sized text', () => {
    expect(canComputeWordDiff('The cat sat.', 'The sleek cat lounged.')).toBe(true);
  });
});
