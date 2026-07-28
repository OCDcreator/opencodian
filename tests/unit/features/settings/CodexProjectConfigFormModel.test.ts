import {
  applyTomlScalarEdits,
  buildProjectConfigEdits,
  CODEX_PROJECT_ALLOWED_KEYS,
  CODEX_PROJECT_FORBIDDEN_KEY_PATTERNS,
  type CodexProjectConfigFormValues,
  EMPTY_CODEX_PROJECT_CONFIG_VALUES,
  parseProjectConfigFormValues,
  validateCodexProjectTomlContent,
  validateCodexProjectTomlKeys,
} from '../../../../src/features/settings/CodexProjectConfigFormModel';

describe('CodexProjectConfigFormModel allowlist', () => {
  it('allows only the safe behavior keys', () => {
    expect([...CODEX_PROJECT_ALLOWED_KEYS].sort()).toEqual([
      'additional_directories',
      'approval_policy',
      'model',
      'model_reasoning_effort',
      'network_access',
      'sandbox_mode',
      'web_search',
    ]);
  });

  it('forbids model_provider, openai_base_url, auth, notification, telemetry', () => {
    const labels = CODEX_PROJECT_FORBIDDEN_KEY_PATTERNS.map((p) => p.label);
    expect(labels).toContain('model_provider');
    expect(labels).toContain('openai_base_url');
    expect(labels).toContain('[model_providers]');
    expect(labels).toContain('auth');
    expect(labels).toContain('notification');
    expect(labels).toContain('telemetry');
    expect(labels).toContain('env_key');
    expect(labels).toContain('http_headers');
    expect(labels).toContain('query_params');
  });
});

describe('validateCodexProjectTomlKeys', () => {
  it('passes when only allowed keys are present', () => {
    const result = validateCodexProjectTomlKeys({
      model: 'gpt-5.4',
      sandbox_mode: 'workspace-write',
    });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('blocks model_provider with a forbidden diagnostic', () => {
    const result = validateCodexProjectTomlKeys({
      model: 'gpt-5.4',
      model_provider: 'proxy',
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ key: 'model_provider', kind: 'forbidden' }),
    );
  });

  it('blocks [model_providers] table', () => {
    const result = validateCodexProjectTomlKeys({
      model_providers: { proxy: { base_url: 'http://evil.example.com' } },
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].kind).toBe('forbidden');
  });

  it('blocks auth, notification, telemetry, env_key', () => {
    const result = validateCodexProjectTomlKeys({
      auth: { command: 'evil' },
      notification: { enabled: true },
      telemetry: { enabled: true },
      env_key: 'STOLEN_KEY',
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toHaveLength(4);
    expect(result.diagnostics.every((d) => d.kind === 'forbidden')).toBe(true);
  });

  it('blocks unknown keys with an unknown diagnostic', () => {
    const result = validateCodexProjectTomlKeys({
      model: 'gpt-5.4',
      unknown_setting: true,
      another_unknown: 'value',
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.every((d) => d.kind === 'unknown')).toBe(true);
  });

  it('blocks ALL forbidden + unknown keys, never strips or silently preserves', () => {
    const result = validateCodexProjectTomlKeys({
      model: 'ok',
      model_provider: 'blocked',
      random_key: 'blocked',
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toHaveLength(2);
  });

  it('P1/Fix5: rejects [model] table as invalid-shape (nested table bypass)', () => {
    const result = validateCodexProjectTomlKeys({
      model: { nested: 'table-value' },
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ key: 'model', kind: 'invalid-shape' }),
    );
  });

  it('P1/Fix5: rejects non-string model value (number)', () => {
    const result = validateCodexProjectTomlKeys({
      model: 42,
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].kind).toBe('invalid-shape');
  });

  it('P1/Fix5: rejects invalid enum value for sandbox_mode', () => {
    const result = validateCodexProjectTomlKeys({
      sandbox_mode: 'evil-mode',
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].kind).toBe('invalid-shape');
    expect(result.diagnostics[0].reasonKey).toBe('settings.codex.projectConfig.diagnostic.invalidShape.invalidEnum');
    expect(result.diagnostics[0].params?.allowed).toContain('read-only');
  });

  it('P1/Fix5: rejects invalid enum value for approval_policy', () => {
    const result = validateCodexProjectTomlKeys({
      approval_policy: 'always-approve',
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].kind).toBe('invalid-shape');
  });

  it('P1/Fix5: rejects invalid enum value for model_reasoning_effort', () => {
    const result = validateCodexProjectTomlKeys({
      model_reasoning_effort: 'ultra',
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].kind).toBe('invalid-shape');
  });

  it('P1/Fix5: rejects non-array additional_directories', () => {
    const result = validateCodexProjectTomlKeys({
      additional_directories: '/some/path',
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].kind).toBe('invalid-shape');
  });

  it('P1/Fix5: rejects array with non-string elements in additional_directories', () => {
    const result = validateCodexProjectTomlKeys({
      additional_directories: ['/ok', 42, true],
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].kind).toBe('invalid-shape');
  });

  it('P1/Fix5: accepts all valid shapes', () => {
    const result = validateCodexProjectTomlKeys({
      model: 'gpt-5.4',
      model_reasoning_effort: 'high',
      sandbox_mode: 'workspace-write',
      approval_policy: 'never',
      network_access: true,
      web_search: 'live',
      additional_directories: ['/path/a', '/path/b'],
    });
    expect(result.valid).toBe(true);
  });

  it('P1/scope: rejects non-boolean network_access', () => {
    const result = validateCodexProjectTomlKeys({ network_access: 'yes' });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].kind).toBe('invalid-shape');
    expect(result.diagnostics[0].params?.expected).toBe('boolean');
  });

  it('P1/scope: rejects invalid web_search enum value', () => {
    const result = validateCodexProjectTomlKeys({ web_search: 'maybe' });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].kind).toBe('invalid-shape');
    expect(result.diagnostics[0].reasonKey).toContain('invalidEnum');
  });

  it('P1/scope: accepts valid web_search enum and boolean network_access', () => {
    expect(validateCodexProjectTomlKeys({ network_access: true, web_search: 'disabled' }).valid).toBe(true);
    expect(validateCodexProjectTomlKeys({ network_access: false, web_search: 'cached' }).valid).toBe(true);
    expect(validateCodexProjectTomlKeys({ network_access: true, web_search: 'live' }).valid).toBe(true);
  });
});

describe('validateCodexProjectTomlContent', () => {
  it('validates raw TOML string content', () => {
    const result = validateCodexProjectTomlContent(`
model = "gpt-5.4"
sandbox_mode = "workspace-write"
`);
    expect(result.valid).toBe(true);
  });

  it('returns parse diagnostic for invalid TOML without throwing', () => {
    const result = validateCodexProjectTomlContent(`
model = "unterminated
`);
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].key).toBe('(parse)');
  });

  it('returns root diagnostic when TOML root is not a table', () => {
    expect(validateCodexProjectTomlContent('just a string').valid).toBe(false);
  });
});

describe('applyTomlScalarEdits', () => {
  const ORIGINAL = `# My Codex project config
# Managed by OpenCodian

model = "gpt-5.4"
sandbox_mode = "read-only"

[model_providers]
# This should be preserved
`;

  it('updates an existing top-level scalar value preserving comments', () => {
    const result = applyTomlScalarEdits(ORIGINAL, [
      { key: 'model', value: 'o4-mini' },
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain('# My Codex project config');
    expect(result).toContain('model = "o4-mini"');
    expect(result).not.toContain('model = "gpt-5.4"');
    expect(result).toContain('# This should be preserved');
  });

  it('inserts a new top-level key before the first table header', () => {
    const result = applyTomlScalarEdits(ORIGINAL, [
      { key: 'approval_policy', value: 'never' },
    ]);
    expect(result).not.toBeNull();
    // New key should appear before [model_providers]
    const approvalIndex = result!.indexOf('approval_policy');
    const tableIndex = result!.indexOf('[model_providers]');
    expect(approvalIndex).toBeGreaterThan(-1);
    expect(approvalIndex).toBeLessThan(tableIndex);
  });

  it('removes a key when value is null (inherit global)', () => {
    const result = applyTomlScalarEdits(ORIGINAL, [
      { key: 'model', value: null },
    ]);
    expect(result).not.toBeNull();
    expect(result).not.toContain('model =');
    expect(result).toContain('# My Codex project config');
    expect(result).toContain('sandbox_mode = "read-only"');
  });

  it('preserves key order and formatting', () => {
    const result = applyTomlScalarEdits(ORIGINAL, [
      { key: 'sandbox_mode', value: 'workspace-write' },
    ]);
    expect(result).not.toBeNull();
    const modelIndex = result!.indexOf('model =');
    const sandboxIndex = result!.indexOf('sandbox_mode =');
    expect(modelIndex).toBeLessThan(sandboxIndex);
  });

  it('returns null when key exists as unclosed multi-line array (cannot safely edit)', () => {
    const multiLineArray = `model = [
  "a",
  "b",
]`;
    const result = applyTomlScalarEdits(multiLineArray, [
      { key: 'model', value: 'gpt-5.4' },
    ]);
    expect(result).toBeNull();
  });

  it('escapes special characters in string values', () => {
    const result = applyTomlScalarEdits('model = "old"\n', [
      { key: 'model', value: 'path\\with"quotes' },
    ]);
    expect(result).toContain('model = "path\\\\with\\"quotes"');
  });

  it('inserts into empty content', () => {
    const result = applyTomlScalarEdits('', [
      { key: 'model', value: 'gpt-5.4' },
    ]);
    expect(result).toContain('model = "gpt-5.4"');
  });

  it('does not touch keys inside [table] sections', () => {
    const withTable = `model = "top"

[some_table]
model = "inside_table"
`;
    const result = applyTomlScalarEdits(withTable, [
      { key: 'model', value: 'changed' },
    ]);
    expect(result).not.toBeNull();
    // Top-level model changed
    expect(result).toMatch(/^model = "changed"/m);
    // Table model preserved
    expect(result).toContain('model = "inside_table"');
  });

  it('P1/Fix7: preserves trailing inline comment when updating scalar value', () => {
    const withComment = 'model = "old" # my preferred model\n';
    const result = applyTomlScalarEdits(withComment, [
      { key: 'model', value: 'new' },
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain('# my preferred model');
    expect(result).toContain('model = "new"');
  });

  it('P1/Fix7: preserves trailing comment after bare value', () => {
    const withComment = 'model_reasoning_effort = "high" # keep this\n';
    const result = applyTomlScalarEdits(withComment, [
      { key: 'model_reasoning_effort', value: 'low' },
    ]);
    expect(result).toContain('# keep this');
    expect(result).toContain('"low"');
  });

  it('P1/Fix7: preserves comment with hash inside string value', () => {
    const withHash = 'model = "gpt#5"\n';
    const result = applyTomlScalarEdits(withHash, [
      { key: 'model', value: 'changed' },
    ]);
    expect(result).toContain('model = "changed"');
  });

  it('P2/format: preserves original equals spacing (key  =  value)', () => {
    const spaced = 'model  =  "old"\n';
    const result = applyTomlScalarEdits(spaced, [{ key: 'model', value: 'new' }]);
    expect(result).not.toBeNull();
    expect(result).toContain('model  =  "new"');
  });

  it('P2/format: preserves tight equals (key=value)', () => {
    const tight = 'model="old"\n';
    const result = applyTomlScalarEdits(tight, [{ key: 'model', value: 'new' }]);
    expect(result).not.toBeNull();
    expect(result).toContain('model="new"');
  });
});

describe('parseProjectConfigFormValues', () => {
  it('extracts allowed keys from valid TOML', () => {
    const values = parseProjectConfigFormValues(`
model = "gpt-5.4"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"
approval_policy = "on-request"
network_access = true
web_search = "live"
additional_directories = ["/path/a", "/path/b"]
`);
    expect(values).toEqual({
      model: 'gpt-5.4',
      modelReasoningEffort: 'high',
      sandboxMode: 'workspace-write',
      approvalPolicy: 'on-request',
      networkAccess: true,
      webSearch: 'live',
      additionalDirectories: ['/path/a', '/path/b'],
    });
  });

  it('returns empty values for missing keys (inherit)', () => {
    const values = parseProjectConfigFormValues(`# empty config`);
    expect(values).toEqual(EMPTY_CODEX_PROJECT_CONFIG_VALUES);
  });

  it('returns empty values for unparseable TOML', () => {
    const values = parseProjectConfigFormValues(`model = "unterminated`);
    expect(values).toEqual(EMPTY_CODEX_PROJECT_CONFIG_VALUES);
  });

  it('silently ignores forbidden keys (validator catches them separately)', () => {
    const values = parseProjectConfigFormValues(`
model = "gpt-5.4"
model_provider = "proxy"
`);
    expect(values.model).toBe('gpt-5.4');
    // model_provider is not in the form values
    expect(values).not.toHaveProperty('modelProvider');
  });
});

describe('buildProjectConfigEdits', () => {
  it('builds scalar edits for non-null values and null for inherited', () => {
    const values: CodexProjectConfigFormValues = {
      model: 'gpt-5.4',
      modelReasoningEffort: null,
      sandboxMode: 'workspace-write',
      approvalPolicy: null,
      networkAccess: true,
      webSearch: null,
      additionalDirectories: null,
    };
    const edits = buildProjectConfigEdits(values);
    const map = Object.fromEntries(edits.map((e) => [e.key, e.value]));
    expect(map['model']).toBe('gpt-5.4');
    expect(map['model_reasoning_effort']).toBeNull();
    expect(map['sandbox_mode']).toBe('workspace-write');
    expect(map['approval_policy']).toBeNull();
    expect(map['network_access']).toBe('true');
    expect(map['web_search']).toBeNull();
  });
});

describe('i18n diagnostic structure (Fix 1)', () => {
  it('forbidden diagnostic carries reasonKey + params, not hard-coded English', () => {
    const result = validateCodexProjectTomlKeys({ model_provider: 'proxy' });
    expect(result.diagnostics[0]).not.toHaveProperty('reason');
    expect(result.diagnostics[0].reasonKey).toBe('settings.codex.projectConfig.diagnostic.forbidden');
    expect(result.diagnostics[0].params).toEqual({ key: 'model_provider', label: 'model_provider' });
  });

  it('invalid-shape diagnostic carries reasonKey + params for wrong type', () => {
    const result = validateCodexProjectTomlKeys({ model: { nested: true } });
    expect(result.diagnostics[0].reasonKey).toBe('settings.codex.projectConfig.diagnostic.invalidShape.wrongType');
    expect(result.diagnostics[0].params).toMatchObject({ key: 'model', expected: 'string', actual: 'table' });
  });

  it('unknown diagnostic carries reasonKey + params', () => {
    const result = validateCodexProjectTomlKeys({ random_key: 'x' });
    expect(result.diagnostics[0].reasonKey).toBe('settings.codex.projectConfig.diagnostic.unknown');
    expect(result.diagnostics[0].params?.key).toBe('random_key');
    expect(result.diagnostics[0].params?.allowed).toContain('model');
  });

  it('parse failure carries reasonKey, not English text', () => {
    const result = validateCodexProjectTomlContent('model = "unterminated\n');
    expect(result.diagnostics[0].reasonKey).toBe('settings.codex.projectConfig.diagnostic.parseFailed');
    expect(result.diagnostics[0]).not.toHaveProperty('reason');
  });
});

describe('en/zh locale diagnostic keys exist (Fix 1)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const en = require('../../../../src/i18n/locales/en').enTranslations as Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zh = require('../../../../src/i18n/locales/zh').zhTranslations as Record<string, string>;

  const DIAGNOSTIC_KEYS = [
    'settings.codex.projectConfig.diagnostic.forbidden',
    'settings.codex.projectConfig.diagnostic.unknown',
    'settings.codex.projectConfig.diagnostic.invalidShape.wrongType',
    'settings.codex.projectConfig.diagnostic.invalidShape.invalidEnum',
    'settings.codex.projectConfig.diagnostic.invalidShape.arrayElementNotString',
    'settings.codex.projectConfig.diagnostic.parseFailed',
    'settings.codex.projectConfig.diagnostic.rootNotTable',
  ];

  for (const key of DIAGNOSTIC_KEYS) {
    it(`en has ${key}`, () => {
      expect(en[key]).toBeDefined();
      expect(typeof en[key]).toBe('string');
    });
    it(`zh has ${key}`, () => {
      expect(zh[key]).toBeDefined();
      expect(typeof zh[key]).toBe('string');
    });
  }
});
