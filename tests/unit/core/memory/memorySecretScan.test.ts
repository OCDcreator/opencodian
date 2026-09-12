import { scanForSecrets } from '../../../../src/core/memory/memorySecretScan';

describe('scanForSecrets (credential guard, tuned to prefer misses)', () => {
  it('stays quiet on normal prose', () => {
    expect(scanForSecrets('The task-list was risk-free and the bearer of responsibilities did nothing.').hit).toBe(false);
    expect(scanForSecrets('the token: important').hit).toBe(false);
    expect(scanForSecrets('a normal sentence about passwords in general').hit).toBe(false);
    expect(scanForSecrets('').hit).toBe(false);
  });

  it('catches OpenAI-style sk- keys, GitHub tokens, Slack tokens and AWS key ids', () => {
    expect(scanForSecrets('key = sk-abcdefghijklmnop1234').kinds).toContain('sk-prefix');
    expect(scanForSecrets('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ12').kinds).toContain('ghp-prefix');
    expect(scanForSecrets('xoxb-1234567890abcdefGH').kinds).toContain('xoxb-prefix');
    expect(scanForSecrets('AKIAABCDEFGHIJKLMNOP').kinds).toContain('aws-access-key-id');
  });

  it('requires 12+ token chars for sk- so prose like task-list never matches', () => {
    expect(scanForSecrets('sk-short1').hit).toBe(false);
  });

  it('catches credential-shaped assignments only with digit/symbol values', () => {
    expect(scanForSecrets('api_key = 9f8e7d6c5b4a').kinds).toContain('credential-assignment');
    expect(scanForSecrets('password: hunter2password').kinds).toContain('credential-assignment');
    expect(scanForSecrets('password: plainword').hit).toBe(false);
  });

  it('catches long hex blobs (accepted over-flag for git SHAs on lint only)', () => {
    expect(scanForSecrets('deadbeefdeadbeefdeadbeefdeadbeef').kinds).toContain('hex-blob');
    expect(scanForSecrets('deadbeef').hit).toBe(false);
  });

  it('catches mixed-case base64 blobs but not single-case letter runs', () => {
    expect(scanForSecrets('AbCdEf1234567890AbCdEf1234567890Ab').kinds).toContain('base64-blob');
    expect(scanForSecrets('abcdefghij'.repeat(5)).hit).toBe(false);
  });

  it('catches bearer header tokens with 20+ payload chars', () => {
    expect(scanForSecrets('Authorization: Bearer abcdef1234567890abcdef').kinds).toContain('bearer-token');
    expect(scanForSecrets('the bearer of responsibilities').hit).toBe(false);
  });
});
