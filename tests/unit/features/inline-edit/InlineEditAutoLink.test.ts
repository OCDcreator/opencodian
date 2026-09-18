/**
 * InlineEditAutoLink (R-B1) — the deterministic post-processing core:
 *
 * - links only verified reference-note headings (dead links impossible by
 *   construction);
 * - matches modulo heading level, case, and full/half width while keeping
 *   the model's original wording as the display text;
 * - never touches fenced code, inline code, or existing links;
 * - applies the distinctiveness threshold (≥2 CJK chars or ≥4 western words)
 *   and the configurable excluded-term list;
 * - treats a heading shared by two reference notes as ambiguous and skips it;
 * - leaves the text byte-identical whenever nothing qualifies.
 */

import {
  applyAutoInternalLinks,
  type AutoLinkReferenceNote,
  normalizeAutoLinkKey,
} from '../../../../src/features/inline-edit/InlineEditAutoLink';

const REF: AutoLinkReferenceNote = {
  path: 'notes/注意力笔记.md',
  headings: ['注意力机制'],
};

const OPTIONS = { style: 'wiki' as const, excludedTerms: [] as string[] };

describe('applyAutoInternalLinks', () => {
  it('links an occurrence of a verified heading (验收 1)', () => {
    const result = applyAutoInternalLinks('本节介绍注意力机制的基本原理。', [REF], OPTIONS);
    expect(result.insertedCount).toBe(1);
    expect(result.text).toBe('本节介绍[[notes/注意力笔记.md#注意力机制]]的基本原理。');
  });

  it('normalizes heading level, case, and full/half width', () => {
    expect(normalizeAutoLinkKey('## 注意力机制')).toBe('注意力机制');
    expect(normalizeAutoLinkKey('Ａｔｔｅｎｔｉｏｎ')).toBe('attention');

    const wide = applyAutoInternalLinks(
      'AB test case study shows the effect.',
      [{ path: 'a.md', headings: ['ａｂ　ｔｅｓｔ　ｃａｓｅ　ｓｔｕｄｙ'] }],
      OPTIONS,
    );
    expect(wide.text).toBe('[[a.md#ａｂ　ｔｅｓｔ　ｃａｓｅ　ｓｔｕｄｙ|AB test case study]] shows the effect.');
  });

  it('keeps the original wording as display text when the casing differs', () => {
    const result = applyAutoInternalLinks(
      'The Attention Mechanism In Transformers is key.',
      [{ path: 'notes/ref.md', headings: ['attention mechanism in transformers'] }],
      OPTIONS,
    );
    expect(result.text).toBe(
      'The [[notes/ref.md#attention mechanism in transformers|Attention Mechanism In Transformers]] is key.',
    );
  });

  it('does not link a heading word that does not exist in the reference note (验收 2 / 死链拒绝)', () => {
    const result = applyAutoInternalLinks(
      '这里讨论自注意力头与位置编码。',
      [REF],
      OPTIONS,
    );
    expect(result.insertedCount).toBe(0);
    expect(result.text).toBe('这里讨论自注意力头与位置编码。');
  });

  it('links nothing when the reference note has no headings at all', () => {
    const result = applyAutoInternalLinks('注意力机制', [{ path: 'notes/empty.md', headings: [] }], OPTIONS);
    expect(result).toEqual({ text: '注意力机制', insertedCount: 0 });
  });

  it('never links inside fenced code blocks (验收 3)', () => {
    const text = '正文注意力机制\n```\n注意力机制\n```\n结尾';
    const result = applyAutoInternalLinks(text, [REF], OPTIONS);
    expect(result.text).toBe('正文[[notes/注意力笔记.md#注意力机制]]\n```\n注意力机制\n```\n结尾');
  });

  it('never links inside inline code spans', () => {
    const result = applyAutoInternalLinks('`注意力机制` 与 注意力机制', [REF], OPTIONS);
    expect(result.text).toBe('`注意力机制` 与 [[notes/注意力笔记.md#注意力机制]]');
  });

  it('never links inside existing wikilinks or markdown links', () => {
    const wikilink = applyAutoInternalLinks('[[notes/注意力笔记.md#注意力机制]] 与 [[other|注意力机制]]', [REF], OPTIONS);
    expect(wikilink.insertedCount).toBe(0);
    expect(wikilink.text).toBe('[[notes/注意力笔记.md#注意力机制]] 与 [[other|注意力机制]]');

    const markdown = applyAutoInternalLinks('[注意力机制](notes/注意力笔记.md) 与 注意力机制', [REF], OPTIONS);
    expect(markdown.text).toBe('[注意力机制](notes/注意力笔记.md) 与 [[notes/注意力笔记.md#注意力机制]]');
  });

  it('honours the excluded-term list', () => {
    const result = applyAutoInternalLinks('注意力机制', [REF], {
      style: 'wiki',
      excludedTerms: [' 注意力机制 '],
    });
    expect(result.insertedCount).toBe(0);
    expect(result.text).toBe('注意力机制');
  });

  it('requires at least 2 CJK chars or 4 western words (误报控制)', () => {
    const oneCjk = applyAutoInternalLinks('注', [{ path: 'a.md', headings: ['注'] }], OPTIONS);
    expect(oneCjk.insertedCount).toBe(0);

    // Exactly 2 CJK chars meets the threshold; generic 2-char words are
    // controlled through the excluded-term list instead (see above).
    const twoCjk = applyAutoInternalLinks('注意', [{ path: 'a.md', headings: ['注意'] }], OPTIONS);
    expect(twoCjk.insertedCount).toBe(1);

    const threeWords = applyAutoInternalLinks(
      'the Three Word Heading appears',
      [{ path: 'a.md', headings: ['Three Word Heading'] }],
      OPTIONS,
    );
    expect(threeWords.insertedCount).toBe(0);

    const fourWords = applyAutoInternalLinks(
      'the Three Word Heading Now appears',
      [{ path: 'a.md', headings: ['Three Word Heading Now'] }],
      OPTIONS,
    );
    expect(fourWords.insertedCount).toBe(1);
  });

  it('enforces word boundaries for western headings', () => {
    const plural = applyAutoInternalLinks(
      'Attention Mechanisms In Depth are plural',
      [{ path: 'a.md', headings: ['Attention Mechanism In Depth'] }],
      OPTIONS,
    );
    expect(plural.insertedCount).toBe(0);

    const embedded = applyAutoInternalLinks(
      'preAttention Mechanism In Depthpost',
      [{ path: 'a.md', headings: ['Attention Mechanism In Depth'] }],
      OPTIONS,
    );
    expect(embedded.insertedCount).toBe(0);
  });

  it('treats a heading shared by two reference notes as ambiguous and skips it', () => {
    const result = applyAutoInternalLinks('注意力机制', [
      { path: 'a.md', headings: ['注意力机制'] },
      { path: 'b.md', headings: ['注意力机制'] },
    ], OPTIONS);
    expect(result.insertedCount).toBe(0);
    expect(result.text).toBe('注意力机制');
  });

  it('prefers the longest heading at the same position', () => {
    const result = applyAutoInternalLinks('注意力机制', [
      { path: 'a.md', headings: ['注意力', '注意力机制'] },
    ], OPTIONS);
    expect(result.text).toBe('[[a.md#注意力机制]]');
  });

  it('links every occurrence', () => {
    const result = applyAutoInternalLinks('注意力机制和注意力机制', [REF], OPTIONS);
    expect(result.insertedCount).toBe(2);
  });

  it('emits markdown links when the vault style is markdown', () => {
    const result = applyAutoInternalLinks('注意力机制', [REF], { style: 'markdown', excludedTerms: [] });
    expect(result.text).toBe('[注意力机制](notes/注意力笔记.md#注意力机制)');
  });

  it('returns the input byte-identically when nothing qualifies (开关关闭回归)', () => {
    const text = '没有匹配词的普通段落。\n```\n注意力机制\n```';
    expect(applyAutoInternalLinks(text, [REF], OPTIONS).text).toBe(text);
    expect(applyAutoInternalLinks(text, [], OPTIONS).text).toBe(text);
    expect(applyAutoInternalLinks('', [REF], OPTIONS)).toEqual({ text: '', insertedCount: 0 });
  });
});
