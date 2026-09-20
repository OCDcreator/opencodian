/**
 * RelevantNotesModel unit tests (advantage-parity R-E3).
 *
 * Pure semantics: graph neighbours (outgoing + incoming, deduped, ranked),
 * retrieval query construction (frontmatter/code stripped, bounded), and
 * snippet folding (dedupe by best score, active note excluded, ranked).
 */

import {
  buildRetrievalQuery,
  computeGraphNeighbours,
  foldRetrievalMatches,
  noteDisplayName,
} from '../../../../src/features/chat/RelevantNotesModel';

describe('computeGraphNeighbours', () => {
  const links = {
    'notes/active.md': { 'notes/a.md': 2, 'notes/b.md': 1, 'notes/active.md': 4 },
    'notes/a.md': { 'notes/active.md': 3, 'notes/c.md': 1 },
    'notes/b.md': { 'notes/other.md': 5 },
    'notes/c.md': { 'notes/active.md': 1 },
  };

  it('combines outgoing and incoming links, excludes the active note (incl. self-links), ranks by count', () => {
    const neighbours = computeGraphNeighbours(links, 'notes/active.md');
    expect(neighbours.map((n) => n.path)).toEqual(['notes/a.md', 'notes/b.md', 'notes/c.md']);
    expect(neighbours[0]).toEqual({ path: 'notes/a.md', linkCount: 5, direction: 'both' });
    expect(neighbours[1]).toEqual({ path: 'notes/b.md', linkCount: 1, direction: 'outgoing' });
    expect(neighbours[2]).toEqual({ path: 'notes/c.md', linkCount: 1, direction: 'incoming' });
  });

  it('returns [] for an isolated note or unknown path', () => {
    expect(computeGraphNeighbours(links, 'notes/isolated.md')).toEqual([]);
  });
});

describe('buildRetrievalQuery', () => {
  it('strips frontmatter and code blocks, flattens markup, bounds length', () => {
    const note = [
      '---',
      'id: abc-123',
      'date: 2026-09-21',
      '---',
      '# 注意力机制',
      '',
      '注意力让模型学会**加权**。`code` 与 [链接](x.md) 都算正文。',
      '```js',
      'const noise = "syntax noise";',
      '```',
      '尾段。',
    ].join('\n');
    const query = buildRetrievalQuery(note);
    expect(query).not.toContain('abc-123');
    expect(query).not.toContain('syntax noise');
    expect(query).toContain('注意力机制');
    expect(query).toContain('加权');
    expect(query).toContain('尾段');
  });

  it('caps the query at the configured length', () => {
    expect(buildRetrievalQuery('x'.repeat(5000), 1000).length).toBeLessThanOrEqual(1000);
  });
});

describe('foldRetrievalMatches', () => {
  it('dedupes by best score, drops the active note, ranks and limits', () => {
    const matches = foldRetrievalMatches([
      { path: 'a.md', score: 2 },
      { path: 'a.md', score: 7 },
      { path: 'active.md', score: 99 },
      { path: 'b.md', score: 4.5 },
      { path: 'c.md', score: 7 },
    ], 'active.md', 2);
    expect(matches).toEqual([
      { path: 'a.md', score: 7 },
      { path: 'c.md', score: 7 },
    ]);
  });

  it('breaks score ties deterministically by path', () => {
    const matches = foldRetrievalMatches([
      { path: 'z.md', score: 1 },
      { path: 'a.md', score: 1 },
    ], 'active.md', 5);
    expect(matches.map((m) => m.path)).toEqual(['a.md', 'z.md']);
  });
});

describe('noteDisplayName', () => {
  it('returns the basename with extension, windows-safe', () => {
    expect(noteDisplayName('folder/sub/note.md')).toBe('note.md');
    expect(noteDisplayName('folder\\sub\\note.md')).toBe('note.md');
    expect(noteDisplayName('root.md')).toBe('root.md');
  });
});
