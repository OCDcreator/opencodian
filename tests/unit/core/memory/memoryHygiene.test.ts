import { assessHygiene, buildHygieneNotice, HYGIENE_NOTICE_MARKER } from '../../../../src/core/memory/memoryHygiene';
import type { TopicManifestEntry } from '../../../../src/core/memory/memoryManifest';

function entry(overrides: Partial<TopicManifestEntry> & { filename: string }): TopicManifestEntry {
  return {
    filePath: `p/${overrides.filename}`,
    name: overrides.filename.replace(/\.md$/u, ''),
    description: '',
    importance: 3,
    mtimeMs: 0,
    ...overrides,
  };
}

describe('assessHygiene', () => {
  const now = Date.now();

  it('is quiet on a healthy small store', () => {
    const a = assessHygiene({
      memoryIndexContent: '- [A](a.md) — hook',
      manifest: [entry({ filename: 'a.md' })],
      nowMs: now,
    });
    expect(a.needsReview).toBe(false);
    expect(a.needsAudit).toBe(false);
    expect(buildHygieneNotice(a)).toBeNull();
  });

  it('needs review at 3+ pending reflection files', () => {
    const manifest = [
      entry({ filename: 'r1.md', reflection: true }),
      entry({ filename: 'r2.md', reflection: true }),
      entry({ filename: 'r3.md', reflection: true }),
    ];
    const a = assessHygiene({ memoryIndexContent: 'x', manifest, nowMs: now });
    expect(a.reflectionPending).toBe(3);
    expect(a.needsReview).toBe(true);
    expect(buildHygieneNotice(a)).toContain(`⚠️ ${HYGIENE_NOTICE_MARKER}`);
    expect(buildHygieneNotice(a)).toContain('REVIEW: 3 unreviewed');
  });

  it('needs audit at the 150-line warning band and at 3+ archive candidates', () => {
    const longIndex = Array.from({ length: 151 }, (_, i) => `- [T${i}](t${i}.md) — h`).join('\n');
    expect(assessHygiene({ memoryIndexContent: longIndex, manifest: [], nowMs: now }).needsAudit).toBe(true);

    const stale = Array.from({ length: 3 }, (_, i) =>
      entry({ filename: `s${i}.md`, importance: 2, mtimeMs: now - 91 * 86_400_000 }));
    const a = assessHygiene({ memoryIndexContent: 'x', manifest: stale, nowMs: now });
    expect(a.archiveCandidates).toBe(3);
    expect(a.needsAudit).toBe(true);
    expect(buildHygieneNotice(a)).toContain('AUDIT');
    expect(buildHygieneNotice(a)).toContain('archive candidates');
  });

  it('combines review and audit into one notice block', () => {
    const manifest = [
      entry({ filename: 'r1.md', reflection: true }),
      entry({ filename: 'r2.md', reflection: true }),
      entry({ filename: 'r3.md', reflection: true }),
    ];
    const longIndex = Array.from({ length: 160 }, (_, i) => `- [T${i}](t${i}.md) — h`).join('\n');
    const notice = buildHygieneNotice(assessHygiene({ memoryIndexContent: longIndex, manifest, nowMs: now }));
    expect(notice).toContain('REVIEW');
    expect(notice).toContain('AUDIT');
    expect(notice).toContain('CONSENT GATE');
    expect(notice!.split(HYGIENE_NOTICE_MARKER).length - 1).toBeGreaterThanOrEqual(2);
  });
});
