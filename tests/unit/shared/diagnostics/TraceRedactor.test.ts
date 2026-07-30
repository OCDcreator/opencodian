import { resolveDefaultTraceDirectory, TraceRedactor } from '../../../../src/shared/diagnostics';

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

  it('preserves Error names and object keys by default for OpenCode compatibility', () => {
    const secret = 'sk-test-secret-1234';
    const error = new Error(`message ${secret}`);
    error.name = '/vaults/main/LegacyError';
    const symbol = Symbol('/vaults/main/legacy-symbol');
    const redactor = new TraceRedactor({ vaultPath: '/vaults/main', knownSecrets: [secret] });
    const { value } = redactor.redact({
      '/vaults/main/note.md': 'path-key-value',
      [secret]: 'secret-key-value',
      error,
      symbol,
      environment: { [secret]: 'environment-secret-value' },
    }) as { value: Record<string, unknown> };

    expect(Object.keys(value)).toEqual(['/vaults/main/note.md', secret, 'error', 'symbol', 'environment']);
    expect((value.error as { name: string; message: string }).name).toBe('/vaults/main/LegacyError');
    expect((value.error as { message: string }).message).not.toContain(secret);
    expect(value.symbol).toBe('Symbol(/vaults/main/legacy-symbol)');
    expect(Object.keys(value.environment as object)).toEqual([secret]);
    expect((value.environment as Record<string, string>)[secret]).toBe('[REDACTED]');
  });

  it('redacts path and known-secret object keys without reviving colliding values', () => {
    const secret = 'sk-test-secret-1234';
    const redactor = new TraceRedactor({
      vaultPath: '/vaults/main',
      knownSecrets: [secret],
      redactionMode: 'hardened',
    });
    const { value } = redactor.redact({
      '/vaults/main/note.md': 'path-key-value',
      [secret]: 'secret-key-value',
      '[REDACTED]': 'collision-value',
    });
    const json = JSON.stringify(value);
    expect(json).not.toContain('/vaults/main');
    expect(json).not.toContain(secret);
    expect(json).toContain('$VAULT/note.md');
    expect(Object.keys(value as object)).toEqual([
      '$VAULT/note.md',
      '[REDACTED]',
      '[REDACTED]#1',
    ]);
  });

  it('redacts Error names and primitive string representations', () => {
    const secret = 'sk-test-secret-1234';
    const error = new Error(`message ${secret}`);
    error.name = `/vaults/main/${secret}`;
    const symbol = Symbol(secret);
    const fn = () => `function-body ${secret}`;
    const redactor = new TraceRedactor({
      vaultPath: '/vaults/main',
      knownSecrets: [secret],
      redactionMode: 'hardened',
    });
    const { value } = redactor.redact({ error, symbol, fn });
    const json = JSON.stringify(value);
    expect(json).not.toContain('/vaults/main');
    expect(json).not.toContain(secret);
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
