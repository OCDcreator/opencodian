import {
  getDefaultClaudeCodeBackendSettings,
  normalizeClaudeCodeBackendSettings,
  normalizeClaudeCodeEnv,
  normalizeClaudeCodeNullablePositiveInt,
  normalizeClaudeCodeNullablePositiveNumber,
  normalizeClaudeCodeStringArray,
} from '../../../../src/core/types';

describe('normalizeClaudeCodeStringArray', () => {
  it('returns empty array for undefined', () => {
    expect(normalizeClaudeCodeStringArray(undefined)).toEqual([]);
  });

  it('returns empty array for non-array', () => {
    expect(normalizeClaudeCodeStringArray('not-array')).toEqual([]);
    expect(normalizeClaudeCodeStringArray(42)).toEqual([]);
    expect(normalizeClaudeCodeStringArray(null)).toEqual([]);
  });

  it('filters non-string entries and empty strings', () => {
    expect(normalizeClaudeCodeStringArray([1, '', 'valid', null, '  ', 'also-valid'])).toEqual(['valid', 'also-valid']);
  });

  it('deduplicates entries', () => {
    expect(normalizeClaudeCodeStringArray(['Read', 'Read', 'Bash'])).toEqual(['Read', 'Bash']);
  });

  it('passes valid arrays through', () => {
    expect(normalizeClaudeCodeStringArray(['Read', 'Bash', 'Edit'])).toEqual(['Read', 'Bash', 'Edit']);
  });
});

describe('normalizeClaudeCodeNullablePositiveInt', () => {
  it('returns null for undefined', () => {
    expect(normalizeClaudeCodeNullablePositiveInt(undefined)).toBeNull();
  });

  it('returns null for non-number', () => {
    expect(normalizeClaudeCodeNullablePositiveInt('5')).toBeNull();
    expect(normalizeClaudeCodeNullablePositiveInt(null)).toBeNull();
  });

  it('returns null for zero and negative', () => {
    expect(normalizeClaudeCodeNullablePositiveInt(0)).toBeNull();
    expect(normalizeClaudeCodeNullablePositiveInt(-5)).toBeNull();
  });

  it('returns null for NaN and Infinity', () => {
    expect(normalizeClaudeCodeNullablePositiveInt(NaN)).toBeNull();
    expect(normalizeClaudeCodeNullablePositiveInt(Infinity)).toBeNull();
  });

  it('floors and returns positive integers', () => {
    expect(normalizeClaudeCodeNullablePositiveInt(50)).toBe(50);
    expect(normalizeClaudeCodeNullablePositiveInt(50.9)).toBe(50);
    expect(normalizeClaudeCodeNullablePositiveInt(1)).toBe(1);
  });
});

describe('normalizeClaudeCodeNullablePositiveNumber', () => {
  it('returns null for undefined', () => {
    expect(normalizeClaudeCodeNullablePositiveNumber(undefined)).toBeNull();
  });

  it('returns null for non-number', () => {
    expect(normalizeClaudeCodeNullablePositiveNumber('5.0')).toBeNull();
  });

  it('preserves decimal values', () => {
    expect(normalizeClaudeCodeNullablePositiveNumber(5.5)).toBe(5.5);
    expect(normalizeClaudeCodeNullablePositiveNumber(0.01)).toBe(0.01);
  });

  it('returns null for zero and negative', () => {
    expect(normalizeClaudeCodeNullablePositiveNumber(0)).toBeNull();
    expect(normalizeClaudeCodeNullablePositiveNumber(-1)).toBeNull();
  });
});

describe('normalizeClaudeCodeEnv', () => {
  it('returns empty object for undefined', () => {
    expect(normalizeClaudeCodeEnv(undefined)).toEqual({});
  });

  it('returns empty object for non-object', () => {
    expect(normalizeClaudeCodeEnv('string')).toEqual({});
    expect(normalizeClaudeCodeEnv(42)).toEqual({});
    expect(normalizeClaudeCodeEnv(null)).toEqual({});
    expect(normalizeClaudeCodeEnv([])).toEqual({});
  });

  it('keeps string values and drops non-string values', () => {
    expect(normalizeClaudeCodeEnv({ KEY: 'val', NUM: 42, NIL: null })).toEqual({ KEY: 'val' });
  });

  it('passes valid env through', () => {
    expect(normalizeClaudeCodeEnv({ A: '1', B: '2' })).toEqual({ A: '1', B: '2' });
  });
});

describe('normalizeClaudeCodeBackendSettings (new fields)', () => {
  it('provides defaults for all new fields', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.allowedTools).toEqual([]);
    expect(defaults.disallowedTools).toEqual([]);
    expect(defaults.maxTurns).toBeNull();
    expect(defaults.maxBudgetUsd).toBeNull();
    expect(defaults.env).toEqual({});
  });

  it('returns defaults for null input', () => {
    const result = normalizeClaudeCodeBackendSettings(null);
    expect(result.allowedTools).toEqual([]);
    expect(result.disallowedTools).toEqual([]);
    expect(result.maxTurns).toBeNull();
    expect(result.maxBudgetUsd).toBeNull();
    expect(result.env).toEqual({});
  });

  it('normalizes all new fields from valid input', () => {
    const result = normalizeClaudeCodeBackendSettings({
      allowedTools: ['Read', 'Bash', 'Read'],
      disallowedTools: ['Write'],
      maxTurns: 100,
      maxBudgetUsd: 10.5,
      env: { API_KEY: 'test', DEBUG: 'true' },
    });
    expect(result.allowedTools).toEqual(['Read', 'Bash']);
    expect(result.disallowedTools).toEqual(['Write']);
    expect(result.maxTurns).toBe(100);
    expect(result.maxBudgetUsd).toBe(10.5);
    expect(result.env).toEqual({ API_KEY: 'test', DEBUG: 'true' });
  });

  it('normalizes invalid new fields to defaults', () => {
    const result = normalizeClaudeCodeBackendSettings({
      allowedTools: 'not-array',
      disallowedTools: 42,
      maxTurns: -5,
      maxBudgetUsd: 'free',
      env: 'nope',
    });
    expect(result.allowedTools).toEqual([]);
    expect(result.disallowedTools).toEqual([]);
    expect(result.maxTurns).toBeNull();
    expect(result.maxBudgetUsd).toBeNull();
    expect(result.env).toEqual({});
  });
});
