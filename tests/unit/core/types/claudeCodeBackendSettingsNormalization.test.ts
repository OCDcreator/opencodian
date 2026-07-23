import {
  CLAUDE_CODE_DEBUG_CHANNEL_IDS,
  getDefaultClaudeCodeBackendSettings,
  getEnabledClaudeCodeDebugChannels,
  normalizeClaudeCodeBackendSettings,
  normalizeClaudeCodeDebugChannelSettings,
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

  it('trims string entries before preserving tool names', () => {
    expect(normalizeClaudeCodeStringArray([' Read ', '\tBash', 'Grep\n'])).toEqual(['Read', 'Bash', 'Grep']);
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
    expect(defaults.restrictedBuiltinTools).toEqual([]);
    expect(defaults.maxTurns).toBeNull();
    expect(defaults.maxBudgetUsd).toBeNull();
    expect(defaults.taskBudget).toBeNull();
    expect(defaults.env).toEqual({});
    expect(defaults.debugChannels).toEqual({
      runtime: true,
      sessions: true,
      stream: true,
      permissions: true,
      mcp: true,
      experimental: false,
    });
  });

  it('returns defaults for null input', () => {
    const result = normalizeClaudeCodeBackendSettings(null);
    expect(result.allowedTools).toEqual([]);
    expect(result.disallowedTools).toEqual([]);
    expect(result.restrictedBuiltinTools).toEqual([]);
    expect(result.maxTurns).toBeNull();
    expect(result.maxBudgetUsd).toBeNull();
    expect(result.taskBudget).toBeNull();
    expect(result.env).toEqual({});
    expect(result.debugChannels).toEqual(getDefaultClaudeCodeBackendSettings().debugChannels);
  });

  it('normalizes all new fields from valid input', () => {
    const result = normalizeClaudeCodeBackendSettings({
      allowedTools: [' Read ', 'Bash', 'Read'],
      disallowedTools: [' Write '],
      restrictedBuiltinTools: ['Read', ' Grep ', 'Read'],
      maxTurns: 100,
      maxBudgetUsd: 10.5,
      taskBudget: 50000,
      env: { API_KEY: 'test', DEBUG: 'true' },
      debugChannels: {
        runtime: false,
        sessions: false,
        stream: true,
        permissions: false,
        mcp: true,
        experimental: true,
      },
    });
    expect(result.allowedTools).toEqual(['Read', 'Bash']);
    expect(result.disallowedTools).toEqual(['Write']);
    expect(result.restrictedBuiltinTools).toEqual(['Read', 'Grep']);
    expect(result.maxTurns).toBe(100);
    expect(result.maxBudgetUsd).toBe(10.5);
    expect(result.taskBudget).toBe(50000);
    expect(result.env).toEqual({ API_KEY: 'test', DEBUG: 'true' });
    expect(result.debugChannels).toEqual({
      runtime: false,
      sessions: false,
      stream: true,
      permissions: false,
      mcp: true,
      experimental: true,
    });
  });

  it('normalizes invalid new fields to defaults', () => {
    const result = normalizeClaudeCodeBackendSettings({
      allowedTools: 'not-array',
      disallowedTools: 42,
      restrictedBuiltinTools: 'bad',
      maxTurns: -5,
      maxBudgetUsd: 'free',
      taskBudget: 'unlimited',
      env: 'nope',
      debugChannels: {
        runtime: 'yes',
        stream: false,
        unknown: true,
      },
    });
    expect(result.allowedTools).toEqual([]);
    expect(result.disallowedTools).toEqual([]);
    expect(result.maxTurns).toBeNull();
    expect(result.maxBudgetUsd).toBeNull();
    expect(result.taskBudget).toBeNull();
    expect(result.env).toEqual({});
    expect(result.debugChannels).toEqual({
      runtime: true,
      sessions: true,
      stream: false,
      permissions: true,
      mcp: true,
      experimental: false,
    });
  });
});

describe('normalizeClaudeProviderSettings', () => {
  it('always restores the immutable official preset and removes reserved extra env keys', () => {
    const result = normalizeClaudeCodeBackendSettings({
      providers: {
        activePresetId: 'gateway',
        modelMigrationDone: true,
        lastAppliedManagedEnvKeys: ['FOO', 'ANTHROPIC_AUTH_TOKEN'],
        presets: [
          { id: 'official', name: 'Edited official', baseUrl: 'https://bad.example', extraEnv: {} },
          {
            id: 'gateway',
            name: ' Gateway ',
            baseUrl: 'https://gateway.example.com/',
            authToken: ' token ',
            model: ' model ',
            fallbackModel: ' fallback ',
            haikuModel: ' haiku ',
            extraEnv: { FOO: '1', ANTHROPIC_AUTH_TOKEN: 'must-not-survive' },
          },
        ],
      },
    });

    expect(result.providers).toEqual({
      activePresetId: 'gateway',
      modelMigrationDone: true,
      lastAppliedManagedEnvKeys: ['FOO'],
      presets: [
        expect.objectContaining({ id: 'official', name: 'Anthropic Official', baseUrl: '' }),
        {
          id: 'gateway',
          name: 'Gateway',
          baseUrl: 'https://gateway.example.com',
          authToken: 'token',
          model: 'model',
          fallbackModel: 'fallback',
          haikuModel: 'haiku',
          extraEnv: { FOO: '1' },
        },
      ],
    });
  });
});

describe('normalizeClaudeCodeSandboxSettings', () => {
  it('returns default sandbox policy for undefined', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.sandbox).toEqual({
      enabled: false,
      failIfUnavailable: false,
      autoAllowBashIfSandboxed: false,
      excludedCommands: [],
      allowUnsandboxedCommands: true,
      filesystem: { allowWrite: [], denyWrite: [], denyRead: [] },
      network: { allowedDomains: [], deniedDomains: [] },
      enableWeakerNestedSandbox: false,
      enableWeakerNetworkIsolation: false,
      ripgrep: { command: '', args: [] },
    });
  });

  it('returns default sandbox policy when sandbox is not an object', () => {
    const result = normalizeClaudeCodeBackendSettings({ sandbox: 'bad' });
    expect(result.sandbox).toEqual(getDefaultClaudeCodeBackendSettings().sandbox);
  });

  it('normalizes partial sandbox input, coercing non-booleans to false', () => {
    const result = normalizeClaudeCodeBackendSettings({
      sandbox: {
        ...getDefaultClaudeCodeBackendSettings().sandbox,
        enabled: true,
        failIfUnavailable: 'yes',
        autoAllowBashIfSandboxed: 1,
      },
    });
    expect(result.sandbox).toEqual({
      ...getDefaultClaudeCodeBackendSettings().sandbox,
      enabled: true,
    });
  });

  it('normalizes full basic sandbox input', () => {
    const result = normalizeClaudeCodeBackendSettings({
      sandbox: {
        ...getDefaultClaudeCodeBackendSettings().sandbox,
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: true,
      },
    });
    expect(result.sandbox).toEqual({
      ...getDefaultClaudeCodeBackendSettings().sandbox,
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
    });
  });

  it('normalizes sandbox filesystem sub-policy', () => {
    const result = normalizeClaudeCodeBackendSettings({
      sandbox: {
        filesystem: {
          allowWrite: [' /tmp/build ', '/tmp/build', 42],
          denyWrite: ['/etc'],
          denyRead: ['~/.aws/credentials'],
        },
      },
    });
    expect(result.sandbox.filesystem).toEqual({
      allowWrite: ['/tmp/build'],
      denyWrite: ['/etc'],
      denyRead: ['~/.aws/credentials'],
    });
  });

  it('normalizes sandbox network sub-policy', () => {
    const result = normalizeClaudeCodeBackendSettings({
      sandbox: {
        network: {
          allowedDomains: [' github.com ', 'github.com', null],
          deniedDomains: ['internal.example.com'],
        },
      },
    });
    expect(result.sandbox.network).toEqual({
      allowedDomains: ['github.com'],
      deniedDomains: ['internal.example.com'],
    });
  });

  it('normalizes sandbox ripgrep config', () => {
    const result = normalizeClaudeCodeBackendSettings({
      sandbox: {
        ripgrep: {
          command: ' /usr/local/bin/rg ',
          args: [' --max-count=100 ', '--max-count=100', 100],
        },
      },
    });
    expect(result.sandbox.ripgrep).toEqual({ command: '/usr/local/bin/rg', args: ['--max-count=100'] });
  });

  it('preserves allowUnsandboxedCommands=false and normalizes excludedCommands', () => {
    const result = normalizeClaudeCodeBackendSettings({
      sandbox: {
        allowUnsandboxedCommands: false,
        excludedCommands: [' docker * ', 'docker *', '', 'podman *'],
      },
    });
    expect(result.sandbox.allowUnsandboxedCommands).toBe(false);
    expect(result.sandbox.excludedCommands).toEqual(['docker *', 'podman *']);
  });
});

describe('normalizeClaudeCodeBackendSettings promptSuggestions', () => {
  it('defaults promptSuggestions to false', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.promptSuggestions).toBe(false);
  });

  it('normalizes promptSuggestions true', () => {
    const result = normalizeClaudeCodeBackendSettings({ promptSuggestions: true });
    expect(result.promptSuggestions).toBe(true);
  });

  it('coerces non-boolean promptSuggestions to false', () => {
    const result = normalizeClaudeCodeBackendSettings({ promptSuggestions: 'yes' });
    expect(result.promptSuggestions).toBe(false);
  });

  it('preserves promptSuggestions false explicitly', () => {
    const result = normalizeClaudeCodeBackendSettings({ promptSuggestions: false });
    expect(result.promptSuggestions).toBe(false);
  });
});

describe('normalizeClaudeCodeDebugChannelSettings', () => {
  it('defines the product debug workbench channel ids in stable order', () => {
    expect(CLAUDE_CODE_DEBUG_CHANNEL_IDS).toEqual([
      'runtime',
      'sessions',
      'stream',
      'permissions',
      'mcp',
      'experimental',
    ]);
  });

  it('normalizes partial persisted channel settings over defaults', () => {
    expect(normalizeClaudeCodeDebugChannelSettings({
      runtime: false,
      experimental: true,
      stale: false,
    })).toEqual({
      runtime: false,
      sessions: true,
      stream: true,
      permissions: true,
      mcp: true,
      experimental: true,
    });
  });

  it('returns enabled channel ids for logging callers', () => {
    expect(getEnabledClaudeCodeDebugChannels({
      runtime: true,
      sessions: false,
      stream: true,
      permissions: false,
      mcp: true,
      experimental: false,
    })).toEqual(['runtime', 'stream', 'mcp']);
  });
});

describe('normalizeClaudeCodeBackendSettings planModeInstructions', () => {
  it('defaults planModeInstructions to empty string', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.planModeInstructions).toBe('');
  });

  it('normalizes planModeInstructions from valid string', () => {
    const result = normalizeClaudeCodeBackendSettings({ planModeInstructions: 'Use TDD.' });
    expect(result.planModeInstructions).toBe('Use TDD.');
  });

  it('trims planModeInstructions whitespace', () => {
    const result = normalizeClaudeCodeBackendSettings({ planModeInstructions: '  Use TDD.  ' });
    expect(result.planModeInstructions).toBe('Use TDD.');
  });

  it('normalizes whitespace-only planModeInstructions to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ planModeInstructions: '   \t\n  ' });
    expect(result.planModeInstructions).toBe('');
  });

  it('normalizes non-string planModeInstructions to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ planModeInstructions: 42 as unknown as string });
    expect(result.planModeInstructions).toBe('');
  });
});

describe('normalizeClaudeCodeBackendSettings debug', () => {
  it('defaults debug to false', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.debug).toBe(false);
  });

  it('normalizes debug true', () => {
    const result = normalizeClaudeCodeBackendSettings({ debug: true });
    expect(result.debug).toBe(true);
  });

  it('coerces non-boolean debug to false', () => {
    const result = normalizeClaudeCodeBackendSettings({ debug: 'yes' as unknown as boolean });
    expect(result.debug).toBe(false);
  });

  it('preserves debug false explicitly', () => {
    const result = normalizeClaudeCodeBackendSettings({ debug: false });
    expect(result.debug).toBe(false);
  });
});

describe('normalizeClaudeCodeBackendSettings toolAliases', () => {
  it('defaults toolAliases to empty object', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.toolAliases).toEqual({});
  });

  it('normalizes toolAliases from valid object', () => {
    const result = normalizeClaudeCodeBackendSettings({ toolAliases: { Fetch: 'Read', Search: 'Grep' } });
    expect(result.toolAliases).toEqual({ Fetch: 'Read', Search: 'Grep' });
  });

  it('trims toolAliases keys and values', () => {
    const result = normalizeClaudeCodeBackendSettings({ toolAliases: { ' Fetch ': ' Read ', 'Search': ' Grep ' } });
    expect(result.toolAliases).toEqual({ Fetch: 'Read', Search: 'Grep' });
  });

  it('drops non-string values and empty keys', () => {
    const result = normalizeClaudeCodeBackendSettings({ toolAliases: { Fetch: 'Read', Bad: 42 as unknown as string, '': 'Grep', AlsoBad: '' } });
    expect(result.toolAliases).toEqual({ Fetch: 'Read' });
  });

  it('normalizes non-object toolAliases to empty object', () => {
    const result = normalizeClaudeCodeBackendSettings({ toolAliases: 'not-object' as unknown as Record<string, string> });
    expect(result.toolAliases).toEqual({});
  });

  it('normalizes array toolAliases to empty object', () => {
    const result = normalizeClaudeCodeBackendSettings({ toolAliases: ['Read'] as unknown as Record<string, string> });
    expect(result.toolAliases).toEqual({});
  });
});

describe('normalizeClaudeCodeBackendSettings strictMcpConfig', () => {
  it('defaults strictMcpConfig to false', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.strictMcpConfig).toBe(false);
  });

  it('normalizes strictMcpConfig true', () => {
    const result = normalizeClaudeCodeBackendSettings({ strictMcpConfig: true });
    expect(result.strictMcpConfig).toBe(true);
  });

  it('coerces non-boolean strictMcpConfig to false', () => {
    const result = normalizeClaudeCodeBackendSettings({ strictMcpConfig: 'yes' as unknown as boolean });
    expect(result.strictMcpConfig).toBe(false);
  });

  it('preserves strictMcpConfig false explicitly', () => {
    const result = normalizeClaudeCodeBackendSettings({ strictMcpConfig: false });
    expect(result.strictMcpConfig).toBe(false);
  });
});

describe('normalizeClaudeCodeBackendSettings enableContext1mBeta', () => {
  it('defaults enableContext1mBeta to false', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.enableContext1mBeta).toBe(false);
  });

  it('normalizes enableContext1mBeta true', () => {
    const result = normalizeClaudeCodeBackendSettings({ enableContext1mBeta: true });
    expect(result.enableContext1mBeta).toBe(true);
  });

  it('coerces non-boolean enableContext1mBeta to false', () => {
    const result = normalizeClaudeCodeBackendSettings({ enableContext1mBeta: 'yes' as unknown as boolean });
    expect(result.enableContext1mBeta).toBe(false);
  });

  it('preserves enableContext1mBeta false explicitly', () => {
    const result = normalizeClaudeCodeBackendSettings({ enableContext1mBeta: false });
    expect(result.enableContext1mBeta).toBe(false);
  });
});

describe('normalizeClaudeCodeBackendSettings jsRuntime', () => {
  it('defaults jsRuntime to empty string (auto)', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.jsRuntime).toBe('');
  });

  it('normalizes jsRuntime to node', () => {
    const result = normalizeClaudeCodeBackendSettings({ jsRuntime: 'node' });
    expect(result.jsRuntime).toBe('node');
  });

  it('normalizes jsRuntime to bun', () => {
    const result = normalizeClaudeCodeBackendSettings({ jsRuntime: 'bun' });
    expect(result.jsRuntime).toBe('bun');
  });

  it('normalizes jsRuntime to deno', () => {
    const result = normalizeClaudeCodeBackendSettings({ jsRuntime: 'deno' });
    expect(result.jsRuntime).toBe('deno');
  });

  it('coerces invalid jsRuntime to empty string (auto)', () => {
    const result = normalizeClaudeCodeBackendSettings({ jsRuntime: 'python' as unknown as string });
    expect(result.jsRuntime).toBe('');
  });

  it('coerces non-string jsRuntime to empty string (auto)', () => {
    const result = normalizeClaudeCodeBackendSettings({ jsRuntime: 42 as unknown as string });
    expect(result.jsRuntime).toBe('');
  });

  it('preserves jsRuntime empty string explicitly', () => {
    const result = normalizeClaudeCodeBackendSettings({ jsRuntime: '' });
    expect(result.jsRuntime).toBe('');
  });
});

describe('normalizeClaudeCodeBackendSettings debugFile', () => {
  it('defaults debugFile to empty string', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.debugFile).toBe('');
  });

  it('normalizes debugFile from valid string', () => {
    const result = normalizeClaudeCodeBackendSettings({ debugFile: '/tmp/debug.log' });
    expect(result.debugFile).toBe('/tmp/debug.log');
  });

  it('trims debugFile whitespace', () => {
    const result = normalizeClaudeCodeBackendSettings({ debugFile: '  /tmp/debug.log  ' });
    expect(result.debugFile).toBe('/tmp/debug.log');
  });

  it('normalizes whitespace-only debugFile to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ debugFile: '   \t\n  ' });
    expect(result.debugFile).toBe('');
  });

  it('normalizes non-string debugFile to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ debugFile: 42 as unknown as string });
    expect(result.debugFile).toBe('');
  });
});

describe('normalizeClaudeCodeBackendSettings loadTimeoutMs', () => {
  it('defaults loadTimeoutMs to null', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.loadTimeoutMs).toBeNull();
  });

  it('normalizes loadTimeoutMs from valid positive integer', () => {
    const result = normalizeClaudeCodeBackendSettings({ loadTimeoutMs: 30000 });
    expect(result.loadTimeoutMs).toBe(30000);
  });

  it('floors decimal loadTimeoutMs values', () => {
    const result = normalizeClaudeCodeBackendSettings({ loadTimeoutMs: 30000.7 });
    expect(result.loadTimeoutMs).toBe(30000);
  });

  it('coerces non-number loadTimeoutMs to null', () => {
    const result = normalizeClaudeCodeBackendSettings({ loadTimeoutMs: 'fast' as unknown as number });
    expect(result.loadTimeoutMs).toBeNull();
  });

  it('coerces zero and negative loadTimeoutMs to null', () => {
    const resultZero = normalizeClaudeCodeBackendSettings({ loadTimeoutMs: 0 });
    expect(resultZero.loadTimeoutMs).toBeNull();
    const resultNegative = normalizeClaudeCodeBackendSettings({ loadTimeoutMs: -1000 });
    expect(resultNegative.loadTimeoutMs).toBeNull();
  });

  it('coerces NaN and Infinity loadTimeoutMs to null', () => {
    const resultNaN = normalizeClaudeCodeBackendSettings({ loadTimeoutMs: NaN });
    expect(resultNaN.loadTimeoutMs).toBeNull();
    const resultInf = normalizeClaudeCodeBackendSettings({ loadTimeoutMs: Infinity });
    expect(resultInf.loadTimeoutMs).toBeNull();
  });

  it('preserves loadTimeoutMs null explicitly', () => {
    const result = normalizeClaudeCodeBackendSettings({ loadTimeoutMs: null });
    expect(result.loadTimeoutMs).toBeNull();
  });
});

describe('normalizeClaudeCodeBackendSettings systemPrompt', () => {
  it('defaults systemPrompt to empty string', () => {
    const defaults = getDefaultClaudeCodeBackendSettings();
    expect(defaults.systemPrompt).toBe('');
  });

  it('normalizes systemPrompt from valid string', () => {
    const result = normalizeClaudeCodeBackendSettings({ systemPrompt: 'Always use TypeScript.' });
    expect(result.systemPrompt).toBe('Always use TypeScript.');
  });

  it('trims systemPrompt whitespace', () => {
    const result = normalizeClaudeCodeBackendSettings({ systemPrompt: '  Always use TypeScript.  ' });
    expect(result.systemPrompt).toBe('Always use TypeScript.');
  });

  it('normalizes whitespace-only systemPrompt to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ systemPrompt: '   \t\n  ' });
    expect(result.systemPrompt).toBe('');
  });

  it('normalizes non-string systemPrompt to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ systemPrompt: 42 as unknown as string });
    expect(result.systemPrompt).toBe('');
  });
});

describe('normalizeClaudeCodeBackendSettings askUserQuestionPreviewFormat', () => {
  it('defaults to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({});
    expect(result.askUserQuestionPreviewFormat).toBe('');
  });

  it('preserves markdown value', () => {
    const result = normalizeClaudeCodeBackendSettings({ askUserQuestionPreviewFormat: 'markdown' });
    expect(result.askUserQuestionPreviewFormat).toBe('markdown');
  });

  it('preserves html value', () => {
    const result = normalizeClaudeCodeBackendSettings({ askUserQuestionPreviewFormat: 'html' });
    expect(result.askUserQuestionPreviewFormat).toBe('html');
  });

  it('falls invalid values back to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ askUserQuestionPreviewFormat: 'latex' as unknown as 'markdown' });
    expect(result.askUserQuestionPreviewFormat).toBe('');
  });

  it('falls non-string values back to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ askUserQuestionPreviewFormat: 42 as unknown as 'markdown' });
    expect(result.askUserQuestionPreviewFormat).toBe('');
  });
});

describe('normalizeClaudeCodeBackendSettings outputStyle', () => {
  it('defaults to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({});
    expect(result.outputStyle).toBe('');
  });

  it('preserves valid string value trimmed', () => {
    const result = normalizeClaudeCodeBackendSettings({ outputStyle: '  Explanatory  ' });
    expect(result.outputStyle).toBe('Explanatory');
  });

  it('trims whitespace-only to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ outputStyle: '   \t\n  ' });
    expect(result.outputStyle).toBe('');
  });

  it('falls non-string values back to empty string', () => {
    const result = normalizeClaudeCodeBackendSettings({ outputStyle: 42 as unknown as string });
    expect(result.outputStyle).toBe('');
  });
});
