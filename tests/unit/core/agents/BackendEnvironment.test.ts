/**
 * advantage-parity R-F7: BackendEnvironment pure-function tests — domain
 * normalization, resolve merge order (legacy wins), fingerprint stability and
 * changed-backend detection.
 */

import {
  computeBackendEnvironmentFingerprints,
  computeEnvironmentFingerprint,
  detectChangedBackends,
  normalizeEnvironmentVariablesDomains,
  resolveBackendEnvironment,
} from '../../../../src/core/agents/BackendEnvironment';

describe('normalizeEnvironmentVariablesDomains', () => {
  it('returns empty domains for non-record input', () => {
    expect(normalizeEnvironmentVariablesDomains(undefined)).toEqual({ shared: {}, providers: {} });
    expect(normalizeEnvironmentVariablesDomains(null)).toEqual({ shared: {}, providers: {} });
    expect(normalizeEnvironmentVariablesDomains('x')).toEqual({ shared: {}, providers: {} });
    expect(normalizeEnvironmentVariablesDomains([1, 2])).toEqual({ shared: {}, providers: {} });
  });

  it('trims keys and values and drops empty keys', () => {
    expect(normalizeEnvironmentVariablesDomains({
      shared: { ' ANTHROPIC_API_KEY ': ' sk-1 ', '': 'dropped', '   ': 'dropped' },
    })).toEqual({ shared: { ANTHROPIC_API_KEY: 'sk-1' }, providers: {} });
  });

  it('drops non-string values', () => {
    expect(normalizeEnvironmentVariablesDomains({
      shared: { GOOD: '1', BAD_NUMBER: 42, BAD_OBJECT: { a: 1 }, BAD_NULL: null, BAD_BOOL: true },
    })).toEqual({ shared: { GOOD: '1' }, providers: {} });
  });

  it('normalizes provider keys (trim, drop empties) and their maps', () => {
    expect(normalizeEnvironmentVariablesDomains({
      providers: {
        ' claude-code ': { KEY: ' v ', JUNK: 3 },
        '': { ANY: 'x' },
      },
    })).toEqual({ shared: {}, providers: { 'claude-code': { KEY: 'v' } } });
  });
});

describe('resolveBackendEnvironment', () => {
  const domains = normalizeEnvironmentVariablesDomains({
    shared: { SHARED: 's', BOTH: 'from-shared' },
    providers: {
      'claude-code': { CLAUDE: 'c', BOTH: 'from-provider' },
      pi: { PI: 'p' },
    },
  });

  it('merges shared and provider domains for the backend', () => {
    expect(resolveBackendEnvironment(domains, 'claude-code')).toEqual({
      SHARED: 's', BOTH: 'from-provider', CLAUDE: 'c',
    });
  });

  it('omits other providers domains', () => {
    expect(resolveBackendEnvironment(domains, 'codex')).toEqual({ SHARED: 's', BOTH: 'from-shared' });
  });

  it('gives the legacy env map final override priority', () => {
    expect(resolveBackendEnvironment(domains, 'claude-code', { BOTH: 'from-legacy', ONLY: 'legacy' })).toEqual({
      SHARED: 's', BOTH: 'from-legacy', CLAUDE: 'c', ONLY: 'legacy',
    });
  });
});

describe('computeEnvironmentFingerprint', () => {
  it('is stable for the same map', () => {
    const env = { A: '1', B: '2' };
    expect(computeEnvironmentFingerprint(env)).toBe(computeEnvironmentFingerprint({ A: '1', B: '2' }));
  });

  it('is independent of key order', () => {
    expect(computeEnvironmentFingerprint({ A: '1', B: '2', C: '3' }))
      .toBe(computeEnvironmentFingerprint({ C: '3', A: '1', B: '2' }));
  });

  it('changes when a value changes', () => {
    expect(computeEnvironmentFingerprint({ A: '1' })).not.toBe(computeEnvironmentFingerprint({ A: '2' }));
  });

  it('changes when a key is added or removed', () => {
    const base = computeEnvironmentFingerprint({ A: '1' });
    expect(computeEnvironmentFingerprint({ A: '1', B: '' })).not.toBe(base);
    expect(computeEnvironmentFingerprint({})).not.toBe(base);
  });

  it('returns a fixed 16-hex-character digest, including for the empty map', () => {
    expect(computeEnvironmentFingerprint({})).toMatch(/^[0-9a-f]{16}$/);
    expect(computeEnvironmentFingerprint({ SOME: 'value' })).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('detectChangedBackends', () => {
  it('reports added, modified backends and skips unchanged ones', () => {
    const changed = detectChangedBackends(
      { opencode: 'aa', 'claude-code': 'bb', codex: 'cc' },
      { opencode: 'aa', 'claude-code': 'zz', codex: 'cc', pi: 'dd' },
    );
    expect(changed).toEqual(['claude-code', 'pi']);
  });

  it('uses the current key set: backends removed from configuration are not reported', () => {
    expect(detectChangedBackends({ opencode: 'aa', legacy: 'bb' }, { opencode: 'aa' })).toEqual([]);
  });

  it('reports a backend missing from the previous run', () => {
    expect(detectChangedBackends({}, { pi: 'aa' })).toEqual(['pi']);
  });
});

describe('computeBackendEnvironmentFingerprints', () => {
  it('fingerprints each backend with its legacy map included', () => {
    const domains = normalizeEnvironmentVariablesDomains({ shared: { S: '1' }, providers: { pi: { P: '2' } } });
    const fingerprints = computeBackendEnvironmentFingerprints(
      domains,
      ['opencode', 'claude-code', 'pi'],
      (backend) => (backend === 'claude-code' ? { LEGACY: '3' } : undefined),
    );
    expect(Object.keys(fingerprints).sort()).toEqual(['claude-code', 'opencode', 'pi']);
    expect(fingerprints['claude-code']).toBe(computeEnvironmentFingerprint({ S: '1', LEGACY: '3' }));
    expect(fingerprints.pi).toBe(computeEnvironmentFingerprint({ S: '1', P: '2' }));
    expect(fingerprints.opencode).toBe(computeEnvironmentFingerprint({ S: '1' }));
  });
});
