import {
  ARCHIVED_SECTION_MARKER,
  buildMemoryIndexBlock,
  cutAtArchivedSection,
  formatIndexForInjection,
  formatMemoryIndexContent,
  formatProjectMemoryIndexContent,
  hasArchivedMarker,
  renderPartitionedIndex,
  stripLeadingFrontmatter,
} from '../../../../src/core/memory/memoryIndexFormat';
import type { TopicManifestEntry } from '../../../../src/core/memory/memoryManifest';
import { byteLength } from '../../../../src/core/memory/memoryTypes';

function entry(overrides: Partial<TopicManifestEntry> & { filename: string }): TopicManifestEntry {
  return {
    filePath: `.opencodian/memory/projects/bucket/${overrides.filename}`,
    name: overrides.filename.replace(/\.md$/u, ''),
    description: '',
    importance: 3,
    mtimeMs: 0,
    ...overrides,
  };
}

describe('formatMemoryIndexContent caps (D13/D28)', () => {
  it('passes through small indexes unchanged', () => {
    const content = '# Memory Index\n\n- [A](a.md) — hook';
    expect(formatMemoryIndexContent(content)).toBe(content);
  });

  it('appends WARNING only (no MAINTENANCE) when the on-disk index already has an archived marker', () => {
    const big = ['# Memory Index', ...Array.from({ length: 220 }, (_, i) => `- [T${i}](t${i}.md) — hook ${i}`)].join('\n');
    const out = formatMemoryIndexContent(big, true);
    expect(out).toContain('> WARNING: MEMORY.md is 221 lines (limit: 200)');
    expect(out).not.toContain('> MAINTENANCE:');
  });

  it('appends WARNING + MAINTENANCE when clipping without an archived marker', () => {
    const big = ['# Memory Index', ...Array.from({ length: 220 }, (_, i) => `- [T${i}](t${i}.md) — hook ${i}`)].join('\n');
    const out = formatMemoryIndexContent(big, false);
    expect(out).toContain('> WARNING:');
    expect(out).toContain('> MAINTENANCE:');
    expect(out).toContain(ARCHIVED_SECTION_MARKER);
  });

  it('caps at 200 lines of body before the tail', () => {
    const big = [...Array.from({ length: 260 }, (_, i) => `- [T${i}](t${i}.md) — hook ${i}`)].join('\n');
    const out = formatMemoryIndexContent(big, true);
    const bodyLines = out.split('> WARNING:')[0].trim().split('\n');
    expect(bodyLines.length).toBeLessThanOrEqual(200);
  });

  it('keeps the final output within the 25KB UTF-8 budget for all-CJK content', () => {
    const cjkLine = (i: number) => `- [主题${i}](topic-${i}.md) — ${'很长的中文钩子描述'.repeat(12)}`;
    const big = [...Array.from({ length: 240 }, (_, i) => cjkLine(i))].join('\n');
    expect(byteLength(big)).toBeGreaterThan(25_000);
    const out = formatMemoryIndexContent(big, true);
    expect(byteLength(out)).toBeLessThanOrEqual(25_000);
  });

  it('never cuts a multibyte character in half (CJK byte safety)', () => {
    const big = [...Array.from({ length: 240 }, (_, i) => `- [主题${i}](topic-${i}.md) — ${'中文内容持续追加以达到字节上限'.repeat(14)}`)].join('\n');
    const out = formatMemoryIndexContent(big, true);
    const body = out.split('> WARNING:')[0];
    // The clipped body must end at a code-point boundary: no lone surrogates.
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
    expect(loneSurrogate.test(body)).toBe(false);
  });

  it('returns empty for empty/whitespace input', () => {
    expect(formatMemoryIndexContent('')).toBe('');
    expect(formatMemoryIndexContent('   \n  ')).toBe('');
  });
});

describe('archived tail handling (roadmap 1.3)', () => {
  it('cuts everything from the archived marker on', () => {
    const content = '- [A](a.md) — hook\n- [B](b.md) — old\n<!-- archived: still on disk, not injected by default -->\n- [C](c.md) — archived';
    expect(cutAtArchivedSection(content)).toBe('- [A](a.md) — hook\n- [B](b.md) — old\n');
    expect(hasArchivedMarker(content)).toBe(true);
    expect(hasArchivedMarker('- [A](a.md) — hook')).toBe(false);
  });

  it('injection rendering drops the archived tail and archived lines never count toward the cap', () => {
    const lines = Array.from({ length: 190 }, (_, i) => `- [T${i}](t${i}.md) — hook ${i}`);
    const content = [
      ...lines,
      ARCHIVED_SECTION_MARKER,
      ...Array.from({ length: 100 }, (_, i) => `- [Old${i}](old${i}.md) — archived`),
    ].join('\n');
    const out = formatIndexForInjection(content);
    expect(out).not.toContain('Old50');
    expect(out).not.toContain('> WARNING:');
  });

  it('reflection view keeps archived lines visible', () => {
    const content = `- [A](a.md) — hook\n${ARCHIVED_SECTION_MARKER}\n- [B](b.md) — archived`;
    expect(formatProjectMemoryIndexContent(content)).toContain('- [B](b.md) — archived');
  });
});

describe('renderPartitionedIndex (roadmap 1.2 + 1.3)', () => {
  it('groups bullets feedback → user → project → reference and sorts by importance then recency', () => {
    const manifest = [
      entry({ filename: 'ref-1.md', type: 'reference', importance: 5 }),
      entry({ filename: 'proj-1.md', type: 'project', importance: 2, mtimeMs: 10 }),
      entry({ filename: 'proj-2.md', type: 'project', importance: 4, mtimeMs: 5 }),
      entry({ filename: 'fb-1.md', type: 'feedback', importance: 3 }),
      entry({ filename: 'user-1.md', type: 'user', importance: 4 }),
    ];
    const content = [
      '# Memory Index',
      '- [Ref 1](ref-1.md) — r',
      '- [Proj 1](proj-1.md) — p1',
      '- [Proj 2](proj-2.md) — p2',
      '- [Fb 1](fb-1.md) — f',
      '- [User 1](user-1.md) — u',
    ].join('\n');
    const out = renderPartitionedIndex(content, manifest);
    const fbIdx = out.indexOf('## Feedback');
    const userIdx = out.indexOf('## User');
    const projIdx = out.indexOf('## Project');
    const refIdx = out.indexOf('## Reference');
    expect(fbIdx).toBeGreaterThan(-1);
    expect(fbIdx).toBeLessThan(userIdx);
    expect(userIdx).toBeLessThan(projIdx);
    expect(projIdx).toBeLessThan(refIdx);
    // proj-2 (importance 4) before proj-1 (importance 2)
    expect(out.indexOf('proj-2.md')).toBeLessThan(out.indexOf('proj-1.md'));
  });

  it('puts unknown-type entries into the project partition and unbacked bullets at the tail', () => {
    const manifest = [entry({ filename: 'weird.md' })]; // no type
    const content = '- [Weird](weird.md) — w\n- [Ghost](ghost.md) — no manifest entry';
    const out = renderPartitionedIndex(content, manifest);
    expect(out.indexOf('## Project')).toBeGreaterThan(-1);
    expect(out.indexOf('weird.md')).toBeLessThan(out.indexOf('ghost.md'));
  });

  it('passes non-bullet content through unchanged', () => {
    const content = 'Some free text\nwith paragraphs.';
    expect(renderPartitionedIndex(content, [])).toBe(content);
  });
});

describe('stripLeadingFrontmatter', () => {
  it('removes a leading YAML block', () => {
    expect(stripLeadingFrontmatter('---\nname: x\n---\nbody')).toBe('body');
    expect(stripLeadingFrontmatter('plain body')).toBe('plain body');
  });
});

describe('buildMemoryIndexBlock', () => {
  it('renders the agentsMd-style header plus capped content', () => {
    const out = buildMemoryIndexBlock('/abs/vault/.opencodian/memory/projects/b/MEMORY.md', '- [A](a.md) — hook');
    expect(out?.startsWith("Contents of /abs/vault/.opencodian/memory/projects/b/MEMORY.md (user's auto-memory, persists across conversations):")).toBe(true);
    expect(out).toContain('- [A](a.md) — hook');
  });

  it('returns null for empty index content (D21)', () => {
    expect(buildMemoryIndexBlock('/x/MEMORY.md', '')).toBeNull();
    expect(buildMemoryIndexBlock('/x/MEMORY.md', '   ')).toBeNull();
  });
});
