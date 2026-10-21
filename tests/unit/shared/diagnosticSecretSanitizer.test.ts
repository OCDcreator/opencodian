import {
  DIAGNOSTIC_REDACTION_PATTERNS,
  sanitizeDiagnosticReport,
} from '../../../src/shared/diagnosticSecretSanitizer';

describe('sanitizeDiagnosticReport', () => {
  it('returns non-string input unchanged', () => {
    // The function accepts string but has an internal typeof guard
    expect(sanitizeDiagnosticReport(null as unknown as string)).toBe(null);
  });

  it('returns empty string unchanged', () => {
    expect(sanitizeDiagnosticReport('')).toBe('');
  });

  it('returns clean text unchanged', () => {
    const text = 'Hello world\nNo secrets here';
    expect(sanitizeDiagnosticReport(text)).toBe(text);
  });

  // --- Authorization / Bearer patterns ---

  it('redacts Authorization: Bearer tokens', () => {
    const input = 'Authorization: Bearer tok_abc123def456';
    expect(sanitizeDiagnosticReport(input)).toBe('Authorization: Bearer [REDACTED]');
  });

  it('redacts authorization=bearer query style', () => {
    const input = 'authorization=bearer tok_abc123def456';
    expect(sanitizeDiagnosticReport(input)).toBe('authorization=bearer [REDACTED]');
  });

  it('redacts non-bearer Authorization values', () => {
    const input = 'Authorization: Basic dXNlcjpwYXNz';
    expect(sanitizeDiagnosticReport(input)).toContain('[REDACTED]');
  });

  it('redacts standalone bearer tokens', () => {
    const input = 'bearer sk-abc123def456ghi789';
    expect(sanitizeDiagnosticReport(input)).toBe('bearer [REDACTED]');
  });

  // --- API key / token / secret / password assignments ---

  it('redacts api_key=value', () => {
    const input = 'api_key: sk-ant-api03-longkeyvalue123456';
    expect(sanitizeDiagnosticReport(input)).toBe('api_key: [REDACTED]');
  });

  it('redacts token=value', () => {
    const input = 'token: abc123def456';
    expect(sanitizeDiagnosticReport(input)).toBe('token: [REDACTED]');
  });

  it('redacts secret=value', () => {
    const input = 'secret=my-super-secret-value';
    expect(sanitizeDiagnosticReport(input)).toBe('secret=[REDACTED]');
  });

  it('redacts password=value', () => {
    const input = 'password=hunter2';
    expect(sanitizeDiagnosticReport(input)).toBe('password=[REDACTED]');
  });

  it('redacts api-key with hyphen variant', () => {
    const input = 'api-key: some-key-value';
    expect(sanitizeDiagnosticReport(input)).toBe('api-key: [REDACTED]');
  });

  // --- CLI flag patterns ---

  it('redacts --token CLI flag', () => {
    const input = '--token abc123def456';
    expect(sanitizeDiagnosticReport(input)).toBe('--token [REDACTED]');
  });

  it('redacts --api-key CLI flag', () => {
    const input = '--api-key sk-ant-api03-xyz';
    expect(sanitizeDiagnosticReport(input)).toContain('[REDACTED]');
  });

  it('redacts --secret CLI flag', () => {
    const input = '--secret mysecret123';
    expect(sanitizeDiagnosticReport(input)).toBe('--secret [REDACTED]');
  });

  it('redacts --password CLI flag', () => {
    const input = '--password hunter2';
    expect(sanitizeDiagnosticReport(input)).toBe('--password [REDACTED]');
  });

  // --- URL-embedded credentials ---

  it('redacts HTTP URL-embedded passwords', () => {
    const input = 'https://user:mysecretpassword@host.example.com/path';
    expect(sanitizeDiagnosticReport(input)).toBe('https://user:[REDACTED]@host.example.com/path');
  });

  it('redacts non-HTTP scheme embedded passwords', () => {
    const input = 'mongodb://admin:password123@db.example.com:27017';
    expect(sanitizeDiagnosticReport(input)).toBe('mongodb://admin:[REDACTED]@db.example.com:27017');
  });

  // --- Query-string params ---

  it('redacts ?token= in URLs', () => {
    const input = 'https://api.example.com/endpoint?token=abc123&other=value';
    expect(sanitizeDiagnosticReport(input)).toBe('https://api.example.com/endpoint?token=[REDACTED]&other=value');
  });

  it('redacts ?api_key= in URLs', () => {
    const input = 'https://api.example.com/endpoint?api_key=abc123';
    expect(sanitizeDiagnosticReport(input)).toBe('https://api.example.com/endpoint?api_key=[REDACTED]');
  });

  it('redacts fuzzy query param containing "token"', () => {
    const input = 'https://api.example.com/endpoint?access_token=abc123';
    expect(sanitizeDiagnosticReport(input)).toBe('https://api.example.com/endpoint?access_token=[REDACTED]');
  });

  // --- Environment variable patterns ---

  it('redacts MY_API_KEY=value at line start', () => {
    const input = 'MY_API_KEY=sk-ant-api03-abc123';
    expect(sanitizeDiagnosticReport(input)).toContain('[REDACTED]');
  });

  it('redacts ANTHROPIC_API_KEY=sk-ant-... pattern', () => {
    const input = 'ANTHROPIC_API_KEY=sk-ant-api03-longvalue123';
    expect(sanitizeDiagnosticReport(input)).toContain('[REDACTED]');
  });

  // --- Anthropic API key prefix ---

  it('redacts sk-ant-api03- prefix anywhere in text', () => {
    const input = 'Using key: sk-ant-api03-abc123def456ghi789jkl012';
    expect(sanitizeDiagnosticReport(input)).toBe('Using key: sk-ant-api03-[REDACTED]');
  });

  it('redacts multiple Anthropic keys in one report', () => {
    const input = 'Key 1: sk-ant-api03-abc123\nKey 2: sk-ant-api03-xyz789';
    const result = sanitizeDiagnosticReport(input);
    expect(result).not.toContain('abc123');
    expect(result).not.toContain('xyz789');
    expect(result).toContain('[REDACTED]');
  });

  // --- PEM private key blocks ---

  it('redacts entire PEM private key block', () => {
    const input = [
      'Before key',
      '-----BEGIN PRIVATE KEY-----',
      'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7x7',
      'more base64 encoded key material here...',
      '-----END PRIVATE KEY-----',
      'After key',
    ].join('\n');
    const result = sanitizeDiagnosticReport(input);
    expect(result).not.toContain('MIIEvgIB');
    expect(result).not.toContain('-----BEGIN PRIVATE KEY-----');
    expect(result).not.toContain('-----END PRIVATE KEY-----');
    expect(result).toContain('[REDACTED]');
    expect(result).toContain('Before key');
    expect(result).toContain('After key');
  });

  // --- Generic long tokens ---

  it('redacts key=<20+ char alphanumeric token>', () => {
    const input = 'key=abc123def456ghi789jkl012';
    expect(sanitizeDiagnosticReport(input)).toBe('key=[REDACTED]');
  });

  it('redacts token=<20+ char token>', () => {
    const input = 'token=abcdefghijklmnopqrstuv';
    expect(sanitizeDiagnosticReport(input)).toBe('token=[REDACTED]');
  });

  // --- Realistic diagnostic report ---

  it('sanitizes a realistic mixed diagnostic report', () => {
    const input = [
      '# OpenCodian Diagnostic Report',
      '',
      '## Server',
      'Health: ok',
      '',
      '## Claude Code',
      'Model: claude-sonnet-4-20250514',
      'Permission mode: default',
      '',
      '## Recent Logs',
      '[info] Sending message with authorization: Bearer sk-ant-api03-abc123def456',
      '[debug] Connecting to mongodb://admin:s3cretP@ss@db.example.com:27017',
      '[info] Using API key: MY_API_KEY=sk-ant-api03-xyz789',
      '[debug] URL: https://api.example.com/v1/chat?token=secret123&model=claude',
    ].join('\n');

    const result = sanitizeDiagnosticReport(input);

    // Report structure preserved
    expect(result).toContain('# OpenCodian Diagnostic Report');
    expect(result).toContain('Model: claude-sonnet-4-20250514');
    expect(result).toContain('Permission mode: default');

    // Secrets redacted
    expect(result).not.toContain('sk-ant-api03-abc123def456');
    expect(result).not.toContain('sk-ant-api03-xyz789');
    expect(result).not.toContain('s3cretP');
    expect(result).not.toContain('secret123');
    expect(result).toContain('[REDACTED]');
  });

  // --- Edge cases ---

  it('handles text with no secrets efficiently', () => {
    const input = 'Just a normal log line\nAnother normal line';
    expect(sanitizeDiagnosticReport(input)).toBe(input);
  });

  it('handles multi-line text with secrets on multiple lines', () => {
    const input = 'api_key: secret1\ntoken: secret2\npassword: secret3';
    const result = sanitizeDiagnosticReport(input);
    expect(result).not.toContain('secret1');
    expect(result).not.toContain('secret2');
    expect(result).not.toContain('secret3');
  });

  it('preserves non-secret content around redacted values', () => {
    const input = 'Config loaded with api_key: mykey123 and model=claude-sonnet';
    const result = sanitizeDiagnosticReport(input);
    expect(result).toContain('Config loaded with');
    expect(result).toContain('and model=claude-sonnet');
    expect(result).toContain('[REDACTED]');
  });
});

describe('DIAGNOSTIC_REDACTION_PATTERNS', () => {
  it('is a non-empty readonly array of RegExp', () => {
    expect(DIAGNOSTIC_REDACTION_PATTERNS.length).toBeGreaterThan(0);
    for (const pattern of DIAGNOSTIC_REDACTION_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });

  it('all patterns have global flag', () => {
    for (const pattern of DIAGNOSTIC_REDACTION_PATTERNS) {
      expect(pattern.flags).toContain('g');
    }
  });
});

describe('MATRIX010 strict URL output policy', () => {
  it('hides complete userinfo and fragments while preserving endpoint and safe query', () => {
    const input = 'https://ordinary-user:private-value@example.test/mcp?access_token=query-value&mode=safe#opaque-fragment';
    expect(sanitizeDiagnosticReport(input, { urlPolicy: 'strict' })).toBe(
      'https://[REDACTED]@example.test/mcp?access_token=[REDACTED]&mode=safe#[REDACTED]',
    );
  });

  it('keeps the default username contract and leaves unrelated text intact in strict mode', () => {
    const url = 'https://ordinary-user:private-value@example.test/mcp?mode=safe#section';
    expect(sanitizeDiagnosticReport(url)).toBe('https://ordinary-user:[REDACTED]@example.test/mcp?mode=safe#section');
    const ordinary = 'safe-mcp ready; https://example.test/mcp?mode=safe --port 4096';
    expect(sanitizeDiagnosticReport(ordinary, { urlPolicy: 'strict' })).toBe(ordinary);
  });

  it('preserves JSON and multiple URL boundaries with repeated credentials', () => {
    const input = JSON.stringify({ first: 'https://shared-value:shared-value@example.test/a?token=shared-value&mode=safe#shared-value', second: 'ssh://shared-value@example.test/b?mode=safe#shared-value', note: 'safe tail' });
    const output = sanitizeDiagnosticReport(input, { urlPolicy: 'strict' });
    expect(JSON.parse(output)).toEqual({
      first: 'https://[REDACTED]@example.test/a?token=[REDACTED]&mode=safe#[REDACTED]',
      second: 'ssh://[REDACTED]@example.test/b?mode=safe#[REDACTED]',
      note: 'safe tail',
    });
    expect(output).not.toContain('shared-value');
  });

  it('keeps punctuation and neighbouring prose outside URL fragments', () => {
    const input = '(https://alice:secret@example.test/a?mode=safe#hidden), https://bob@example.test/b#hidden. safe tail';
    expect(sanitizeDiagnosticReport(input, { urlPolicy: 'strict' })).toBe(
      '(https://[REDACTED]@example.test/a?mode=safe#[REDACTED]), https://[REDACTED]@example.test/b#[REDACTED]. safe tail',
    );
  });
});

describe('MATRIX010 sensitive flags', () => {
  it.each(['--token', '-token', '--api-key', '--api_key', '--client_secret', '--PASSWORD', '--secret', '--credentials', '--authorization', '--TOKEN', '-API_KEY', '--Authorization', '--Client-Secret']) (
    'redacts separate and equal %s values without removing a following port or adjacent flag', (flag) => {
      const input = `safe-mcp ${flag} FAKE_MATRIX010_FIRST ${flag}=FAKE_MATRIX010_SECOND --port 4096`;
      const output = sanitizeDiagnosticReport(input);
      expect(output).toBe(`safe-mcp ${flag} [REDACTED] ${flag}=[REDACTED] --port 4096`);
    },
  );

  it('preserves a following CLI flag when a sensitive flag has no value', () => {
    const input = 'safe-mcp --token --port 4096 --authorization=FAKE_MATRIX010_AUTH --verbose';
    expect(sanitizeDiagnosticReport(input)).toBe('safe-mcp --token --port 4096 --authorization=[REDACTED] --verbose');
  });

  it('redacts a quoted value and labelled assignments without changing unrelated words', () => {
    const input = 'safe-mcp --credentials "FAKE_MATRIX010 quoted value" client_secret=FAKE_MATRIX010_CLIENT credentials: FAKE_MATRIX010_CREDENTIALS --port 4096';
    const output = sanitizeDiagnosticReport(input);
    expect(output).toBe('safe-mcp --credentials [REDACTED] client_secret=[REDACTED] credentials: [REDACTED] --port 4096');
    const ordinary = 'tokenizer credentials-file --tokenizer public --port 4096';
    expect(sanitizeDiagnosticReport(ordinary)).toBe(ordinary);
  });
});
