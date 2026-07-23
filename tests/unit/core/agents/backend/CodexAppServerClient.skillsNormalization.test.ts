/**
 * CodexAppServerClient — listSkills result normalization.
 *
 * The real Codex app-server replies to `skills/list` with an array of GROUP
 * envelopes `[{ cwd, skills, errors }]`, not a flat `AppServerSkill[]`. These
 * tests cover every observed shape: flat arrays, `{data}` wrappers, single and
 * multiple group envelopes, malformed entries, and unavailable replies. The
 * normalizer must never fabricate skills.
 */
import { normalizeSkillsListResult } from '../../../../../src/core/agents/backend/CodexAppServerClient';

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
