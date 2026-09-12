import type { TopicManifestEntry } from '../../../../src/core/memory/memoryManifest';
import type { SelectedMemory } from '../../../../src/core/memory/memoryRecall';
import {
  assembleRelevantMemory,
  formatRecalledTopicFile,
  lexicalCandidates,
  rankLexically,
  tokenize,
} from '../../../../src/core/memory/memoryRecall';

function entry(overrides: Partial<TopicManifestEntry> & { filename: string }): TopicManifestEntry {
  return {
    filePath: `.opencodian/memory/projects/b/${overrides.filename}`,
    name: overrides.filename.replace(/\.md$/u, ''),
    description: '',
    importance: 3,
    mtimeMs: 0,
    ...overrides,
  };
}

describe('tokenize (CJK-aware)', () => {
  it('splits latin words and CJK bigrams with stopwords dropped', () => {
    expect(tokenize('Deploy the model')).toEqual(['deploy', 'model']);
    expect(tokenize('部署模型')).toEqual(['部署', '署模', '模型']);
    expect(tokenize('什么')).toEqual([]);
    expect(tokenize('导出PDF')).toEqual(['pdf', '导出']);
  });
});

describe('rankLexically / lexicalCandidates', () => {
  const manifest = [
    entry({ filename: 'deploy-friday.md', name: 'deploy-friday', description: 'never deploy on fridays' }),
    entry({ filename: 'pdf-export.md', name: 'pdf-export', description: 'exports notes to pdf' }),
    entry({ filename: 'unrelated.md', name: 'unrelated', description: 'nothing relevant' }),
  ];

  it('ranks by weighted overlap: name > stem > description', () => {
    const ranked = rankLexically('deploy', manifest);
    expect(ranked[0].entry.filename).toBe('deploy-friday.md');
    expect(ranked.some((r) => r.entry.filename === 'unrelated.md')).toBe(false);
    // description-only hit ranks below name hit but is included
    const byDesc = rankLexically('fridays', manifest);
    expect(byDesc[0].entry.filename).toBe('deploy-friday.md');
  });

  it('treats a verbatim filename mention as a hit with zero other overlap', () => {
    const ranked = rankLexically('see pdf-export please', manifest);
    expect(ranked[0].entry.filename).toBe('pdf-export.md');
    expect(ranked[0].verbatim).toBe(true);
  });

  it('caps the candidate shortlist', () => {
    const many = Array.from({ length: 30 }, (_, i) => entry({ filename: `topic-${i}.md` }));
    expect(lexicalCandidates('topic', many, 10)).toHaveLength(10);
  });
});

describe('formatRecalledTopicFile', () => {
  it('adds a fresh header and caps long bodies by bytes and lines', () => {
    const now = Date.now();
    const fresh = formatRecalledTopicFile({
      filePath: '/abs/mem/x.md',
      mtimeMs: now - 1000,
      nowMs: now,
      rawContent: 'body line',
    });
    expect(fresh.content.startsWith('Memory: /abs/mem/x.md:')).toBe(true);

    const old = formatRecalledTopicFile({
      filePath: '/abs/mem/x.md',
      mtimeMs: now - 40 * 86_400_000,
      nowMs: now,
      rawContent: 'body',
    });
    expect(old.content).toContain('This memory is 40 days old');

    const truncated = formatRecalledTopicFile({
      filePath: '/abs/mem/x.md',
      mtimeMs: now,
      nowMs: now,
      rawContent: Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n'),
    });
    expect(truncated.content).toContain('> This memory file was truncated (first 200 lines)');
    expect(truncated.content).toContain('/abs/mem/x.md');
  });
});

describe('assembleRelevantMemory (guard + budget + framing)', () => {
  const selected = (filePath: string, content: string): SelectedMemory => ({ filePath, content });

  it('returns null for nothing selected', () => {
    const out = assembleRelevantMemory({ selected: [] });
    expect(out.relevantMemory).toBeNull();
    expect(out.recalledPaths).toEqual([]);
  });

  it('frames bodies inside a system-reminder with the marker line and verification hint', () => {
    const out = assembleRelevantMemory({
      selected: [selected('/m/a.md', 'alpha body'), selected('/m/b.md', 'beta body')],
    });
    expect(out.relevantMemory).toContain('<system-reminder>');
    expect(out.relevantMemory).toContain(
      'Retrieved for possible relevance — use only if it actually applies to what the user asked.',
    );
    expect(out.relevantMemory).toContain('alpha body');
    expect(out.relevantMemory).toContain('beta body');
    expect(out.relevantMemory).toContain('If any recalled memory above is outdated or wrong');
    expect(out.recalledPaths).toEqual(['/m/a.md', '/m/b.md']);
    expect(out.recalledContentCharacters).toBe('alpha body'.length + 'beta body'.length);
  });

  it('withholds secret-tainted bodies entirely but still reports the note', () => {
    const out = assembleRelevantMemory({
      selected: [
        selected('/m/clean.md', 'clean'),
        selected('/m/secret.md', 'api_key = 9f8e7d6c5b4a'),
      ],
    });
    expect(out.relevantMemory).toContain('clean');
    expect(out.relevantMemory).not.toContain('9f8e7d6c5b4a');
    expect(out.skippedSecretGuard).toEqual(['/m/secret.md']);
    expect(out.relevantMemory).toContain('secret guard');
  });

  it('emits a note-only reminder when every selected file trips the guard', () => {
    const out = assembleRelevantMemory({
      selected: [selected('/m/secret.md', 'api_key = 9f8e7d6c5b4a')],
    });
    expect(out.relevantMemory).toContain('<system-reminder>');
    expect(out.relevantMemory).toContain('1 recalled topic file(s) skipped');
  });

  it('skips already-recalled paths and stops at the session budget', () => {
    const out = assembleRelevantMemory({
      selected: [selected('/m/a.md', 'a'), selected('/m/b.md', 'b')],
      alreadyRecalledPaths: ['/m/a.md'],
    });
    expect(out.recalledPaths).toEqual(['/m/b.md']);

    const budgeted = assembleRelevantMemory({
      selected: [selected('/m/big.md', 'x'.repeat(50))],
      alreadyRecalledContentCharacters: 61_440 - 10,
    });
    expect(budgeted.relevantMemory).toBeNull();
  });
});
