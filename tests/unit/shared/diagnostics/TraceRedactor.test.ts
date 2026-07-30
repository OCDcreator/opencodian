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

  it('falls back to the platform-specific obsidian directory when @electron/remote is unavailable', () => {
    // Jest runs in plain Node, so the @electron/remote require cannot resolve
    // and the platform fallback branch is exercised directly.
    const resolved = resolveDefaultTraceDirectory('codex');
    const expectedBase: Record<string, RegExp> = {
      darwin: /Library[/\\]Application Support[/\\]obsidian[/\\]/,
      win32: /AppData[/\\]Roaming[/\\]obsidian[/\\]/,
    };
    const pattern = expectedBase[process.platform] ?? /\.config[/\\]obsidian[/\\]/;
    expect(resolved).toMatch(pattern);
    expect(resolved).toMatch(/OpenCodian[/\\]diagnostics[/\\]codex$/);
  });
});
