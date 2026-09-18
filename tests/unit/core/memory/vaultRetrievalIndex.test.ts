import {
  buildVaultIndexEntry,
  chunkNote,
  fitShardToBudget,
  hashNoteContent,
  isExcludedPath,
  isIndexablePath,
  isVaultVerbatimHit,
  noteTitleOf,
  scoreChunk,
  selectVaultSnippets,
  shardNameFor,
  truncateNoteSnippet,
  VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_DEFAULT,
  type VaultIndexEntry,
} from '../../../../src/core/memory/vaultRetrievalIndex';

function entry(overrides: Partial<VaultIndexEntry> & { path: string }): VaultIndexEntry {
  return {
    mtimeMs: 0,
    title: noteTitleOf(overrides.path),
    contentHash: 'hash',
    titleTokens: [],
    chunks: [],
    ...overrides,
  };
}

describe('isExcludedPath / isIndexablePath', () => {
  it('excludes dot-prefixed segments unconditionally (built-in defaults)', () => {
    expect(isExcludedPath('.obsidian/plugins/foo.md', [])).toBe(true);
    expect(isExcludedPath('.opencodian/vault-index/manifest.json', [])).toBe(true);
    expect(isExcludedPath('notes/.hidden.md', [])).toBe(true);
  });

  it('does not let user rules re-include dot directories', () => {
    expect(isExcludedPath('.obsidian/workspace.json', ['!obsidian'])).toBe(true);
  });

  it('matches directory prefixes case-insensitively', () => {
    expect(isExcludedPath('Templates/note.md', ['templates/'])).toBe(true);
    expect(isExcludedPath('templates/sub/deep.md', ['templates'])).toBe(true);
    expect(isExcludedPath('template-other/note.md', ['templates'])).toBe(false);
    expect(isExcludedPath('notes/note.md', ['templates/'])).toBe(false);
  });

  it('supports * wildcards within one path segment only', () => {
    // `*` covers exactly one segment (design: wildcard within a segment);
    // a subtree exclusion is written as a plain prefix rule instead.
    expect(isExcludedPath('archive/2024.md', ['archive/*'])).toBe(true);
    expect(isExcludedPath('archive/2024/old.md', ['archive/*'])).toBe(false);
    expect(isExcludedPath('archive/old.md', ['archive/temp*'])).toBe(false);
    expect(isExcludedPath('archive/temp-2024.md', ['archive/temp*'])).toBe(true);
    expect(isExcludedPath('archive/2024/old.md', ['archive'])).toBe(true);
    expect(isExcludedPath('notes/sub/meeting.md', ['notes/*'])).toBe(false);
  });

  it('isIndexablePath applies built-in defaults plus user rules', () => {
    expect(isIndexablePath('notes/idea.md', [])).toBe(true);
    expect(isIndexablePath('templates/weekly.md', ['templates/'])).toBe(false);
    expect(isIndexablePath('.opencodian/memory/MEMORY.md', [])).toBe(false);
  });
});

describe('chunkNote', () => {
  it('splits at ATX headings into sections with 1-based inclusive lines', () => {
    const text = ['intro', '', '# One', 'a', 'b', '', '## Two', 'c'].join('\n');
    const chunks = chunkNote(text);
    expect(chunks).toEqual([
      { startLine: 1, endLine: 2, kind: 'section' },
      { startLine: 3, endLine: 6, kind: 'section' },
      { startLine: 7, endLine: 8, kind: 'section' },
    ]);
  });

  it('splits setext headings (underlined line heads the new section)', () => {
    const text = ['before', 'Title', '=====', 'body'].join('\n');
    const chunks = chunkNote(text);
    expect(chunks[0]).toEqual({ startLine: 1, endLine: 1, kind: 'section' });
    expect(chunks[1].startLine).toBe(2);
    expect(chunks[1].endLine).toBe(4);
  });

  it('never splits inside a code fence', () => {
    const fenceLines = ['```js', ...Array.from({ length: 30 }, (_, i) => `line ${i} code`), '```'];
    const text = ['# Sec', ...fenceLines].join('\n');
    // The whole fenced block must stay inside a single chunk.
    const chunks = chunkNote(text, 100);
    expect(chunks.length).toBe(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(33);
  });

  it('bisects oversized sections at blank lines into paragraph chunks', () => {
    const paragraphs = Array.from({ length: 8 }, (_, i) => [`para ${i} ` + 'x'.repeat(200), ''].join('\n'));
    const text = ['# Big', '', ...paragraphs].join('\n');
    const chunks = chunkNote(text, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const size = text.split('\n').slice(chunk.startLine - 1, chunk.endLine).join('\n').length;
      // Nothing except a single paragraph may exceed the soft cap by much.
      expect(size).toBeLessThan(900);
    }
    // Chunks cover the section without overlap or gaps.
    const sorted = [...chunks].sort((a, b) => a.startLine - b.startLine);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startLine).toBe(sorted[i - 1].endLine + 1);
    }
  });

  it('skips YAML frontmatter entirely', () => {
    const text = ['---', 'tags: x', '---', '', 'body text'].join('\n');
    const chunks = chunkNote(text);
    expect(chunks).toEqual([{ startLine: 4, endLine: 5, kind: 'section' }]);
  });
});

describe('scoring and selection', () => {
  const makeEntry = (path: string, content: string, mtimeMs = 0): VaultIndexEntry =>
    buildVaultIndexEntry({ path, mtimeMs, content });

  it('weights title > heading > body and counts each query token once', () => {
    const entryObj = entry({
      path: 'deploy.md',
      titleTokens: ['deploy'],
      chunks: [{ startLine: 1, endLine: 2, kind: 'section', headingTokens: ['friday'], bodyTokens: ['deploy'] }],
    });
    // 'deploy' hits title (3); 'friday' hits heading (2); duplicated 'deploy' counted once.
    const hit = scoreChunk(['deploy', 'friday', 'deploy'], entryObj, entryObj.chunks[0]);
    expect(hit.score).toBe(5);
    expect(hit.distinctHits).toBe(2);
    expect(hit.titleHit).toBe(true);
  });

  it('gates out single-token body-only hits but keeps title/heading hits', () => {
    const bodyOnly = entry({
      path: 'a.md',
      titleTokens: ['alpha'],
      chunks: [{ startLine: 1, endLine: 1, kind: 'section', headingTokens: [], bodyTokens: ['common'] }],
    });
    const headingHit = entry({
      path: 'b.md',
      titleTokens: ['alpha'],
      chunks: [{ startLine: 1, endLine: 1, kind: 'section', headingTokens: ['common'], bodyTokens: [] }],
    });
    const ranked = selectVaultSnippets({ query: 'common', entries: [bodyOnly, headingHit], topK: 6 });
    // Only the heading hit survives; the lone body bigram is suppressed.
    expect(ranked.map((s) => s.path)).toEqual(['b.md']);
  });

  it('one snippet per note and topK hard cap', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry(`note-${i}.md`, `# note ${i}\nunique-token-${i} shared-a shared-b`));
    const ranked = selectVaultSnippets({ query: 'shared-a shared-b', entries, topK: 6 });
    expect(ranked.length).toBe(6);
    const paths = new Set(ranked.map((s) => s.path));
    expect(paths.size).toBe(6);
  });

  it('verbatim title mention ranks above higher-scoring entries and sorts stably', () => {
    const verbatim = makeEntry('friday-deploy-checklist.md', 'unrelated body here', 5);
    const strong = makeEntry('deploy.md', '# deploy\nfriday deploy friday deploy friday deploy', 100);
    const ranked = selectVaultSnippets({
      query: 'what does the friday deploy checklist say',
      entries: [strong, verbatim],
      topK: 6,
    });
    expect(ranked[0].path).toBe('friday-deploy-checklist.md');
    expect(ranked[0].verbatim).toBe(true);
  });

  it('expands the best chunk by one neighbor in each direction', () => {
    const entryObj = makeEntry(
      'long.md',
      [
        '# alpha section',
        'para-a unique-alpha',
        '',
        '# beta section',
        'para-b unique-beta',
        '',
        '# gamma section',
        'para-c unique-gamma',
      ].join('\n'),
    );
    expect(entryObj.chunks.length).toBe(3);
    const ranked = selectVaultSnippets({ query: 'unique-beta', entries: [entryObj], topK: 1 });
    expect(ranked.length).toBe(1);
    // Middle chunk selected; neighbors pulled in on both sides.
    expect(ranked[0].startLine).toBeLessThan(entryObj.chunks[1].startLine);
    expect(ranked[0].endLine).toBeGreaterThan(entryObj.chunks[1].endLine);
  });

  it('returns empty for empty queries or empty topK', () => {
    const entryObj = makeEntry('a.md', 'body words here');
    expect(selectVaultSnippets({ query: '', entries: [entryObj], topK: 6 })).toEqual([]);
    expect(selectVaultSnippets({ query: 'body', entries: [entryObj], topK: 0 })).toEqual([]);
  });

  it('isVaultVerbatimHit requires a meaningful title match', () => {
    expect(isVaultVerbatimHit('open the friday-deploy file', 'friday-deploy')).toBe(true);
    expect(isVaultVerbatimHit('open the ab file', 'ab')).toBe(false);
    expect(isVaultVerbatimHit('unrelated', 'friday-deploy')).toBe(false);
  });
});

describe('truncateNoteSnippet', () => {
  const build = (lines: string[]): string => lines.join('\n');

  it('returns untouched input below the cap', () => {
    const text = build(['a', 'b']);
    expect(truncateNoteSnippet(text, 1000)).toEqual({ text, truncated: false });
  });

  it('falls back to the last paragraph boundary outside the cap', () => {
    const text = build(['first para', '', 'second para', '', 'third para that is long '.repeat(40)]);
    const { text: out, truncated } = truncateNoteSnippet(text, 60);
    expect(truncated).toBe(true);
    // Cut lands on the nearest complete paragraph boundary within the cap.
    expect(out).toBe('first para\n\nsecond para');
  });

  it('never cuts inside an unclosed code fence (drops the whole block)', () => {
    const text = build([
      'intro line',
      '',
      '```python',
      'def secret():',
      '    return 1',
      '```',
      '',
      'tail',
    ]);
    // Cap exactly between fence opening and close: the fence must be excluded.
    const cap = text.indexOf('def secret') - 1;
    const { text: out, truncated } = truncateNoteSnippet(text, cap);
    expect(truncated).toBe(true);
    expect(out).not.toContain('```python');
    expect(out).not.toContain('def secret');
    expect(out).toContain('intro line');
  });

  it('keeps a fence that closes within the cap', () => {
    const text = build(['```', 'code', '```', '', 'tail '.repeat(200)]);
    const { text: out, truncated } = truncateNoteSnippet(text, 30);
    expect(out).toBe(build(['```', 'code', '```']));
    expect(truncated).toBe(true);
  });

  it('truncates at the default cap without cutting code blocks mid-way', () => {
    const code = build(['```js', ...Array.from({ length: 50 }, () => 'const x = 1;'), '```']);
    const text = build(['head', '', ...code.split('\n'), '', 'tail']);
    const { text: out } = truncateNoteSnippet(text, VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_DEFAULT);
    const fenceCount = (out.match(/```/gu) ?? []).length;
    // Every fence that made the cut must be closed.
    expect(fenceCount % 2).toBe(0);
  });
});

describe('entry building and shard guards', () => {
  it('hashes content and names shards by path', () => {
    expect(hashNoteContent('abc')).toHaveLength(16);
    expect(hashNoteContent('abc')).toBe(hashNoteContent('abc'));
    expect(hashNoteContent('abd')).not.toBe(hashNoteContent('abc'));
    const shardA = shardNameFor('notes/a.md');
    expect(shardA).toMatch(/^[a-f0-9]{40}\.json$/u);
    expect(shardNameFor('notes/b.md')).not.toBe(shardA);
    // Path hash is stable across separators and casing.
    expect(shardNameFor('notes\\A.md')).toBe(shardNameFor('notes/a.md'));
  });

  it('routes heading-line tokens to headingTokens and the rest to bodyTokens', () => {
    const built = buildVaultIndexEntry({
      path: 'notes/战略规划.md',
      mtimeMs: 1,
      content: '# 部署模型\n\n正文提到 deploy。',
    });
    expect(built.title).toBe('战略规划');
    expect(built.titleTokens).toEqual(['战略', '略规', '规划']);
    expect(built.chunks[0].headingTokens).toEqual(['部署', '署模', '模型']);
    expect(built.chunks[0].bodyTokens).toContain('deploy');
  });

  it('marks shards partial when they exceed the size budget', () => {
    const hugeChunk = 'x'.repeat(700 * 1024);
    const entryObj: VaultIndexEntry = {
      path: 'big.md',
      mtimeMs: 0,
      title: 'big',
      contentHash: 'h',
      titleTokens: [],
      chunks: [
        { startLine: 1, endLine: 2, kind: 'section', headingTokens: [], bodyTokens: ['a'] },
        { startLine: 3, endLine: 4, kind: 'section', headingTokens: [], bodyTokens: [hugeChunk] },
      ],
    };
    const { entry: fitted, truncated } = fitShardToBudget(entryObj);
    expect(truncated).toBe(true);
    expect(fitted.partial).toBe(true);
    expect(JSON.stringify(fitted).length).toBeLessThanOrEqual(512 * 1024);
  });
});
