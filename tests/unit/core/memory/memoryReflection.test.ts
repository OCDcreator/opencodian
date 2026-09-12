import {
  buildReflectionUserPrompt,
  parseReflectionResponse,
  planReflectionWrites,
  reflectionSourceTag,
} from '../../../../src/core/memory/memoryReflection';

describe('parseReflectionResponse (defensive, ≤3 per compaction)', () => {
  it('parses valid reflection JSON and caps at 3', () => {
    const four = JSON.stringify({
      memories: [1, 2, 3, 4].map((i) => ({
        name: `mem-${i}`,
        description: `d${i}`,
        type: 'project',
        body: `b${i}`,
      })),
    });
    const out = parseReflectionResponse(four);
    expect(out).toHaveLength(3);
    expect(out.map((m) => m.name)).toEqual(['mem-1', 'mem-2', 'mem-3']);
  });

  it('rejects user-type memories (reflection distills findings only)', () => {
    const out = parseReflectionResponse(JSON.stringify({
      memories: [{ name: 'who-user-is', description: 'd', type: 'user', body: 'b' }],
    }));
    expect(out).toHaveLength(0);
  });

  it('accepts fenced output and fails soft to []', () => {
    expect(parseReflectionResponse('```\n{"memories":[{"name":"a-b","description":"d","type":"feedback","body":"b"}]}\n```')).toHaveLength(1);
    expect(parseReflectionResponse('garbage')).toEqual([]);
  });

  it('clamps body and description sizes', () => {
    const out = parseReflectionResponse(JSON.stringify({
      memories: [{ name: 'big', description: 'd'.repeat(400), type: 'project', body: 'b'.repeat(9000) }],
    }));
    expect(out[0].description.length).toBe(200);
    expect(out[0].body.length).toBe(4000);
  });
});

describe('planReflectionWrites', () => {
  it('stamps compacted provenance with reflection flag and skips conflicts', () => {
    const plan = planReflectionWrites({
      memories: [
        { name: 'release-window', description: 'Ship on Tuesdays', type: 'project', body: 'b' },
        { name: 'taken', description: 'd', type: 'reference', body: 'b' },
      ],
      projectDir: '.opencodian/memory/projects/b',
      existingFilenames: ['taken.md'],
      sourceSessionID: 'ses_session0001',
    });
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].content).toContain('source: compacted ses_session0');
    expect(plan.writes[0].content).toContain('reflection: true');
    expect(plan.skipped).toEqual([{ name: 'taken', reason: 'filename conflict' }]);
  });
});

describe('buildReflectionUserPrompt', () => {
  it('includes index and transcript with truncation markers', () => {
    const prompt = buildReflectionUserPrompt({ transcript: '[user] t', indexContent: '- [X](x.md) — h' });
    expect(prompt).toContain('- [X](x.md) — h');
    expect(prompt).toContain('[user] t');
    expect(prompt).toContain('at most 3 durable observations');
  });
});

describe('reflectionSourceTag', () => {
  it('carries the compaction kind', () => {
    expect(reflectionSourceTag('abcdefghijk')).toBe('compacted abcdefghijk');
  });
});
