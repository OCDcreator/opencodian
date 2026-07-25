/**
 * CodexAppServerClient — listSkills result normalization.
 *
 * The real Codex app-server replies to `skills/list` with an array of GROUP
 * envelopes `[{ cwd, skills, errors }]`, not a flat `AppServerSkill[]`. These
 * tests cover every observed shape: flat arrays, `{data}` wrappers, single and
 * multiple group envelopes, malformed entries, and unavailable replies. The
 * normalizer must never fabricate skills.
 */
import {
  normalizeSkillsListGroupedResult,
  normalizeSkillsListResult,
} from '../../../../../src/core/agents/backend/CodexAppServerClient';

describe('normalizeSkillsListGroupedResult', () => {
  it('preserves multiple cwd groups, skill source metadata, and server errors', () => {
    const result = normalizeSkillsListGroupedResult({
      data: [
        {
          cwd: '/vault',
          skills: [{ name: 'project-skill', source: 'repo', scope: 'repo' }],
          errors: [{ path: '/vault/.agents/skills/broken/SKILL.md', message: 'invalid frontmatter' }],
        },
        {
          cwd: '/home/user',
          skills: [{ name: 'user-skill', source: 'user', shortDescription: 'User skill' }],
          errors: [],
        },
      ],
    });

    expect(result).toEqual([
      {
        cwd: '/vault',
        skills: [{ name: 'project-skill', source: 'repo', scope: 'repo' }],
        errors: [{ path: '/vault/.agents/skills/broken/SKILL.md', message: 'invalid frontmatter' }],
      },
      {
        cwd: '/home/user',
        skills: [{ name: 'user-skill', source: 'user', shortDescription: 'User skill' }],
        errors: [],
      },
    ]);
  });

  it('uses an explicit default cwd for legacy flat or cwd-less replies and otherwise reports null', () => {
    expect(normalizeSkillsListGroupedResult([{ name: 'legacy' }], '/requested')).toEqual([
      { cwd: '/requested', skills: [{ name: 'legacy' }], errors: [] },
    ]);
    expect(normalizeSkillsListGroupedResult({ skills: [{ name: 'cwd-less' }], errors: [] })).toEqual([
      { cwd: null, skills: [{ name: 'cwd-less' }], errors: [] },
    ]);
  });

  it('fails soft for malformed group fields while retaining valid skills and errors', () => {
    expect(normalizeSkillsListGroupedResult([
      null,
      { unrelated: true },
      {
        cwd: '/partially-broken',
        skills: [{ name: 'valid' }, { name: '' }, 42],
        errors: [{ message: 'read failed' }, { path: '/bad', message: '' }, 7],
      },
      {
        cwd: 99,
        skills: 'not-an-array',
        errors: [{ path: '/still-useful', message: 'parse failed' }],
      },
    ])).toEqual([
      {
        cwd: '/partially-broken',
        skills: [{ name: 'valid' }],
        errors: [{ message: 'read failed' }],
      },
      {
        cwd: null,
        skills: [],
        errors: [{ path: '/still-useful', message: 'parse failed' }],
      },
    ]);
  });

  it('returns [] for unavailable or wholly malformed replies', () => {
    expect(normalizeSkillsListGroupedResult(undefined)).toEqual([]);
    expect(normalizeSkillsListGroupedResult(null)).toEqual([]);
    expect(normalizeSkillsListGroupedResult('invalid')).toEqual([]);
    expect(normalizeSkillsListGroupedResult([{ cwd: 42, skills: 'invalid', errors: 'invalid' }])).toEqual([]);
  });
});

describe('normalizeSkillsListResult', () => {
  it('flattens an array of group envelopes (the real server shape)', () => {
    const result = normalizeSkillsListResult([
      { cwd: '/vault', skills: [{ name: 'a', description: 'A' }, { name: 'b' }], errors: [] },
      { cwd: '/home', skills: [{ name: 'global-skill', scope: 'global' }], errors: [] },
    ]);

    expect(result).toEqual([
      { name: 'a', description: 'A' },
      { name: 'b' },
      { name: 'global-skill', scope: 'global' },
    ]);
  });

  it('accepts a flat AppServerSkill[]', () => {
    const result = normalizeSkillsListResult([{ name: 'flat', description: 'd' }]);
    expect(result).toEqual([{ name: 'flat', description: 'd' }]);
  });

  it('accepts a { data: [...] } wrapper', () => {
    const result = normalizeSkillsListResult({ data: [{ name: 'wrapped' }] });
    expect(result).toEqual([{ name: 'wrapped' }]);
  });

  it('accepts a single top-level group envelope (no outer array)', () => {
    const result = normalizeSkillsListResult({ cwd: '/vault', skills: [{ name: 'solo' }] });
    expect(result).toEqual([{ name: 'solo' }]);
  });

  it('preserves name/description/path/enabled/scope and drops unknown extras', () => {
    const result = normalizeSkillsListResult([
      { name: 'full', description: 'd', path: '/p', enabled: true, scope: 'project', bogus: 'x' },
    ]);
    expect(result).toEqual([{ name: 'full', description: 'd', path: '/p', enabled: true, scope: 'project' }]);
    expect((result[0] as unknown as { bogus?: unknown }).bogus).toBeUndefined();
  });

  it('keeps the legacy flat API shape and order when grouped-only metadata is present', () => {
    const result = normalizeSkillsListResult([
      { cwd: '/vault', skills: [{ name: 'first', source: 'repo' }], errors: [{ message: 'ignored by flat API' }] },
      { cwd: '/home', skills: [{ name: 'second', source: 'user' }], errors: [] },
    ]);

    expect(result).toEqual([
      { name: 'first' },
      { name: 'second' },
    ]);
  });

  it('drops malformed entries (missing/empty/non-string name) without throwing', () => {
    const result = normalizeSkillsListResult([
      { name: 'ok' },
      { description: 'no name' },
      { name: '' },
      { name: 123 },
      null,
      'string-entry',
      { skills: [{ name: 'in-group' }, { name: '' }] },
    ]);
    expect(result).toEqual([{ name: 'ok' }, { name: 'in-group' }]);
  });

  it('returns [] for undefined / null / non-shaped replies (never fabricates)', () => {
    expect(normalizeSkillsListResult(undefined)).toEqual([]);
    expect(normalizeSkillsListResult(null)).toEqual([]);
    expect(normalizeSkillsListResult({})).toEqual([]);
    expect(normalizeSkillsListResult({ unrelated: 1 })).toEqual([]);
    expect(normalizeSkillsListResult('not-an-array')).toEqual([]);
  });

  it('returns [] for an empty group array', () => {
    expect(normalizeSkillsListResult([])).toEqual([]);
    expect(normalizeSkillsListResult([{ cwd: '/vault', skills: [], errors: [] }])).toEqual([]);
  });
});
