import {
  appendIndexLines,
  buildProvenanceMemoryFile,
  indexHookText,
  memoryTitle,
  parseImportanceValue,
  planProvenanceWrites,
  provenanceTag,
  removeIndexLines,
  sanitizeMemorySlug,
  writeMemoryWrites,
  yamlScalar,
} from '../../../../src/core/memory/memoryStore';
import { InMemoryMemoryFileSystem } from '../../../../src/core/memory/memoryFileSystem';

describe('sanitizeMemorySlug', () => {
  it('produces kebab-case slugs capped at 48 chars', () => {
    expect(sanitizeMemorySlug('User Prefers Dark Theme!')).toBe('user-prefers-dark-theme');
    expect(sanitizeMemorySlug('')).toBe('');
    expect(sanitizeMemorySlug('中文记忆')).toBe('');
    expect(sanitizeMemorySlug('a'.repeat(60)).length).toBe(48);
  });
});

describe('provenance stamps (D27)', () => {
  it('tags carry the kind and the first 12 chars of the session id', () => {
    expect(provenanceTag('extracted', 'ses_abcdefghijklmnopqrstuvwxyz')).toBe('extracted ses_abcdefgh');
    expect(provenanceTag('compacted', '1234567890123456')).toBe('compacted 123456789012');
  });

  it('builds topic files with node_type memory + source + optional reflection', () => {
    const content = buildProvenanceMemoryFile({
      memory: {
        name: 'no-sudo',
        description: 'Never run sudo',
        type: 'feedback',
        body: 'Trigger: ...\n**Why:** ...\n**How to apply:** ...',
      },
      source: 'extracted ses_abc',
    });
    expect(content).toContain('node_type: memory');
    expect(content).toContain('type: feedback');
    expect(content).toContain('source: extracted ses_abc');
    expect(content).not.toContain('reflection: true');

    const reflected = buildProvenanceMemoryFile({
      memory: {
        name: 'r',
        description: 'd',
        type: 'project',
        body: 'b',
      },
      source: 'compacted ses_abc',
      reflection: true,
    });
    expect(reflected).toContain('reflection: true');
  });

  it('yamlScalar double-quotes values that would break bare scalars', () => {
    expect(yamlScalar('plain')).toBe('plain');
    expect(yamlScalar('has: colon')).toBe('"has: colon"');
    expect(yamlScalar('has "quote"')).toBe('"has \\"quote\\""');
  });
});

describe('parseImportanceValue', () => {
  it('clamps to 1-5 and defaults to 3', () => {
    expect(parseImportanceValue('5')).toBe(5);
    expect(parseImportanceValue('9')).toBe(5);
    expect(parseImportanceValue('0')).toBe(1);
    expect(parseImportanceValue('junk')).toBe(3);
    expect(parseImportanceValue(undefined)).toBe(3);
    expect(parseImportanceValue('"2"')).toBe(2);
  });
});

describe('planProvenanceWrites (dedupe / conflict skip)', () => {
  const baseMemory = {
    name: 'topic-one',
    description: 'A topic',
    type: 'feedback' as const,
    body: 'body text long enough',
  };

  it('plans a write with index line and dedupes within the batch', () => {
    const plan = planProvenanceWrites({
      memories: [baseMemory, { ...baseMemory, description: 'dup name' }],
      projectDir: '.opencodian/memory/projects/b',
      source: 'extracted s',
    });
    expect(plan.writes).toHaveLength(1);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.writes[0].filename).toBe('topic-one.md');
    expect(plan.writes[0].filePath).toBe('.opencodian/memory/projects/b/topic-one.md');
    expect(plan.writes[0].indexLine).toBe('- [Topic one](topic-one.md) — A topic');
  });

  it('skips filenames that already exist on disk or collide with MEMORY.md', () => {
    const plan = planProvenanceWrites({
      memories: [{ ...baseMemory, name: 'memory' }, { ...baseMemory, name: 'taken' }],
      projectDir: 'p',
      existingFilenames: ['taken.md'],
      source: 's',
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped.every((s) => s.reason === 'filename conflict')).toBe(true);
  });
});

describe('appendIndexLines / removeIndexLines', () => {
  it('seeds a header for an empty index and appends without duplication', () => {
    expect(appendIndexLines(null, ['- [A](a.md) — x'])).toBe(
      '# Memory Index\n\n- [A](a.md) — x\n',
    );
    expect(appendIndexLines('- [A](a.md) — x\n', ['- [A](a.md) — x'])).toBe(
      '- [A](a.md) — x\n',
    );
    expect(appendIndexLines('- [A](a.md) — x\n', ['- [B](b.md) — y'])).toBe(
      '- [A](a.md) — x\n- [B](b.md) — y\n',
    );
  });

  it('removeIndexLines drops only the lines pointing at the forgotten files', () => {
    const current = '# Memory Index\n\n- [A](a.md) — x\n- [B](b.md) — y\n- [C](c.md) — z\n';
    expect(removeIndexLines(current, new Set(['b.md']))).toBe(
      '# Memory Index\n\n- [A](a.md) — x\n- [C](c.md) — z\n',
    );
    expect(removeIndexLines(current, new Set(['nope.md']))).toBe(
      current.replace(/\r\n/g, '\n'),
    );
  });
});

describe('writeMemoryWrites (in-memory FS)', () => {
  it('writes topic files first then updates the index atomically enough for tests', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const plan = planProvenanceWrites({
      memories: [{
        name: 'alpha',
        description: 'Alpha memory',
        type: 'project',
        body: 'body',
      }],
      projectDir: '.opencodian/memory/projects/b',
      source: 'extracted s1',
    });
    const written = await writeMemoryWrites({
      fs,
      writes: plan.writes,
      indexPath: '.opencodian/memory/projects/b/MEMORY.md',
    });
    expect(written).toBe(1);
    expect(await fs.readFile('.opencodian/memory/projects/b/alpha.md')).toContain('node_type: memory');
    expect(await fs.readFile('.opencodian/memory/projects/b/MEMORY.md')).toContain(
      '- [Alpha](alpha.md) — Alpha memory',
    );
  });
});

describe('indexHookText / memoryTitle', () => {
  it('strips wrapping quotes and collapses whitespace with a length cap', () => {
    expect(indexHookText('"quoted hook"', 160)).toBe('quoted hook');
    expect(indexHookText('a\n  b', 160)).toBe('a b');
    expect(indexHookText('x'.repeat(200), 20)).toHaveLength(20);
    expect(indexHookText('x'.repeat(200), 20).endsWith('…')).toBe(true);
  });

  it('titles capitalize the first letter of the slug words', () => {
    expect(memoryTitle('deploy-on-fridays')).toBe('Deploy on fridays');
    expect(memoryTitle('')).toBe('');
  });
});
