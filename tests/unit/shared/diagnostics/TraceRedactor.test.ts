import { resolveDefaultTraceDirectory,TraceRedactor } from '../../../../src/shared/diagnostics';

describe('TraceRedactor (shared)', () => {
  it('redacts known secrets and vault paths', () => {
    const redactor = new TraceRedactor({ vaultPath: '/vaults/main', knownSecrets: ['sk-test-secret-1234'] });
    const { value, stats } = redactor.redact({ message: 'token sk-test-secret-1234 in /vaults/main/note.md' });
    expect(JSON.stringify(value)).not.toContain('sk-test-secret-1234');
    expect(JSON.stringify(value)).toContain('$VAULT');
    expect(stats.secretsRemoved).toBeGreaterThan(0);
  });

  it('redacts sensitive object keys', () => {
    const redactor = new TraceRedactor();
    const { value } = redactor.redact({ authorization: 'Bearer abc', nested: { api_key: 'xyz' } });
    expect((value as { authorization: string }).authorization).toBe('[REDACTED]');
    expect((value as { nested: { api_key: string } }).nested.api_key).toBe('[REDACTED]');
  });
});

describe('resolveDefaultTraceDirectory', () => {
  it('appends the backend segment under OpenCodian/diagnostics', () => {
    expect(resolveDefaultTraceDirectory('codex')).toMatch(/OpenCodian[/\\]diagnostics[/\\]codex$/);
    expect(resolveDefaultTraceDirectory('opencode')).toMatch(/OpenCodian[/\\]diagnostics[/\\]opencode$/);
  });
});
