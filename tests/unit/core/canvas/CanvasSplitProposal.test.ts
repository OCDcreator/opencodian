/**
 * CanvasSplitProposal contract tests (R-C5, design §3.3 mode 2): the model may
 * only propose; strict JSON parsing over KNOWN paths; fail-closed rejections
 * feed the announced fallback to file-reference mode.
 */

import {
  buildCanvasSplitPrompt,
  buildCanvasSplitSystemPrompt,
  CANVAS_SPLIT_MAX_CHARS_PER_NOTE,
  CANVAS_SPLIT_MAX_EXCERPT_CHARS,
  oversizeSplitNotes,
  parseCanvasSplitProposal,
} from '../../../../src/core/canvas/CanvasSplitProposal';

const KNOWN = new Set(['notes/a.md', 'notes/b.md']);

describe('parseCanvasSplitProposal', () => {
  it('accepts a well-formed proposal list over known paths', () => {
    const raw = JSON.stringify([
      { topic: 'Setup', sourcePath: 'notes/a.md', excerpt: 'step 1' },
      { topic: 'Setup', sourcePath: 'notes/a.md', excerpt: 'step 2' },
      { topic: 'Ops', sourcePath: 'notes/b.md', excerpt: 'run it' },
    ]);
    const result = parseCanvasSplitProposal(raw, KNOWN);
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      proposals: [
        { topic: 'Setup', sourcePath: 'notes/a.md', excerpt: 'step 1' },
        { topic: 'Setup', sourcePath: 'notes/a.md', excerpt: 'step 2' },
        { topic: 'Ops', sourcePath: 'notes/b.md', excerpt: 'run it' },
      ],
    });
  });

  it('tolerates exactly one code-fence wrapper', () => {
    const raw = '```json\n' + JSON.stringify([
      { topic: 'T', sourcePath: 'notes/a.md', excerpt: 'x' },
    ]) + '\n```';
    expect(parseCanvasSplitProposal(raw, KNOWN).ok).toBe(true);
  });

  it.each([
    ['empty reply', '', 'empty-response'],
    ['non-JSON prose', 'I would split it into two topics.', 'not-json'],
    ['JSON object instead of array', '{"topic":"T"}', 'not-a-nonempty-array'],
    ['empty array', '[]', 'not-a-nonempty-array'],
    ['unknown source path (invented)', JSON.stringify([{ topic: 'T', sourcePath: 'notes/invented.md', excerpt: 'x' }]), 'proposal-unknown-source-path'],
    ['missing excerpt', JSON.stringify([{ topic: 'T', sourcePath: 'notes/a.md' }]), 'proposal-missing-excerpt'],
    ['missing topic', JSON.stringify([{ sourcePath: 'notes/a.md', excerpt: 'x' }]), 'proposal-missing-topic'],
    ['non-object row', '[42]', 'proposal-not-an-object'],
  ])('rejects %s fail-closed (%s)', (_name, raw, error) => {
    expect(parseCanvasSplitProposal(raw, KNOWN)).toEqual({ ok: false, error });
  });

  it('rejects an excerpt above the length cap (never a partial accept)', () => {
    const raw = JSON.stringify([
      { topic: 'T', sourcePath: 'notes/a.md', excerpt: 'x'.repeat(CANVAS_SPLIT_MAX_EXCERPT_CHARS + 1) },
    ]);
    expect(parseCanvasSplitProposal(raw, KNOWN)).toEqual({ ok: false, error: 'proposal-excerpt-too-long' });
  });
});

describe('per-note prompt limits', () => {
  it('flags oversize notes for an explicit skip notice', () => {
    const inputs = [
      { path: 'notes/a.md', content: 'short' },
      { path: 'notes/big.md', content: 'x'.repeat(CANVAS_SPLIT_MAX_CHARS_PER_NOTE + 1) },
    ];
    expect(oversizeSplitNotes(inputs)).toEqual(['notes/big.md']);
  });

  it('embeds every note as a path-attributed block in the user prompt', () => {
    const prompt = buildCanvasSplitPrompt([
      { path: 'notes/a.md', content: 'alpha' },
      { path: 'notes/b.md', content: 'beta' },
    ]);
    expect(prompt).toContain('<note path="notes/a.md">');
    expect(prompt).toContain('alpha');
    expect(prompt).toContain('<note path="notes/b.md">');
    expect(prompt).toContain('beta');
  });

  it('system prompt demands a bare JSON array over the given paths (both locales)', () => {
    expect(buildCanvasSplitSystemPrompt('en')).toContain('ONE JSON array');
    expect(buildCanvasSplitSystemPrompt('zh')).toContain('JSON 数组');
  });
});
