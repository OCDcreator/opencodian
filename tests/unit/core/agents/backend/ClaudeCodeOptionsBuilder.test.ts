import { buildClaudeCodeOptions } from '../../../../../src/core/agents/backend';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

describe('ClaudeCodeOptionsBuilder', () => {
  it('maps explicit settings to SDK options shape without relying on settingSources defaults', () => {
    const canUseTool = jest.fn();
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        executablePath: '/usr/local/bin/claude',
        settingSources: ['project', 'user'],
        permissionMode: 'plan',
        thinking: { type: 'fixed', budgetTokens: 8192 },
        effort: 'high',
        additionalDirectories: ['/outside/context'],
        model: 'claude-opus-4-6',
        fallbackModel: 'claude-sonnet-4-5',
      },
      canUseTool,
      mcpServers: {
        filesystem: { command: 'npx', args: ['server'] },
      },
    });

    expect(options).toEqual({
      cwd: '/vault/project',
      includePartialMessages: true,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: ['project', 'user'],
      permissionMode: 'plan',
      thinking: { type: 'enabled', budgetTokens: 8192 },
      effort: 'high',
      model: 'claude-opus-4-6',
      fallbackModel: 'claude-sonnet-4-5',
      additionalDirectories: ['/outside/context'],
      canUseTool,
      mcpServers: {
        filesystem: { command: 'npx', args: ['server'] },
      },
    });
  });

  it('keeps empty settingSources explicit and omits empty optional fields', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        settingSources: [],
      },
    });

    expect(options).toEqual({
      cwd: '/vault/project',
      includePartialMessages: true,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: [],
      permissionMode: 'default',
      thinking: { type: 'adaptive' },
      effort: 'medium',
    });
    expect(options).not.toHaveProperty('pathToClaudeCodeExecutable');
    expect(options).not.toHaveProperty('additionalDirectories');
  });

  it('lets process resolution override the configured executable path', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        executablePath: '/configured/claude',
      },
      pathToClaudeCodeExecutable: '/resolved/claude',
    });

    expect(options.pathToClaudeCodeExecutable).toBe('/resolved/claude');
  });

  it('does not pass the raw configured executable path before process resolution validates it', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        executablePath: '/configured/but-unverified/claude',
      },
    });

    expect(options).not.toHaveProperty('pathToClaudeCodeExecutable');
  });

  it('enables Claude Code preset prompt and default tools for real coding sessions', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options.systemPrompt).toEqual({ type: 'preset', preset: 'claude_code' });
    expect(options.tools).toEqual({ type: 'preset', preset: 'claude_code' });
  });

  it('sets the SDK-required explicit bypass acknowledgement only for bypass permission mode', () => {
    const defaultOptions = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });
    const bypassOptions = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        permissionMode: 'bypassPermissions',
      },
    });

    expect(defaultOptions).not.toHaveProperty('allowDangerouslySkipPermissions');
    expect(bypassOptions.permissionMode).toBe('bypassPermissions');
    expect(bypassOptions.allowDangerouslySkipPermissions).toBe(true);
  });

  it('maps a captured SDK session id to resume options for later sends', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
      resumeSessionId: 'sdk-session-1',
    });

    expect(options.resume).toBe('sdk-session-1');
  });
});

describe('ClaudeCodeOptionsBuilder debug option', () => {
  it('omits debug when settings.debug is false', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('debug');
  });

  it('passes debug when settings.debug is true', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debug: true,
      },
    });

    expect(options.debug).toBe(true);
  });
});

describe('ClaudeCodeOptionsBuilder debugFile option', () => {
  it('omits debugFile when settings.debugFile is empty', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('debugFile');
  });

  it('omits debugFile when settings.debugFile is whitespace-only', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debugFile: '   \t\n  ',
      },
    });

    expect(options).not.toHaveProperty('debugFile');
  });

  it('passes trimmed debugFile when settings.debugFile is non-empty', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debugFile: '  /tmp/debug.log  ',
      },
    });

    expect(options.debugFile).toBe('/tmp/debug.log');
  });
});

describe('ClaudeCodeOptionsBuilder strictMcpConfig option', () => {
  it('omits strictMcpConfig when settings.strictMcpConfig is false', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('strictMcpConfig');
  });

  it('passes strictMcpConfig when settings.strictMcpConfig is true', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        strictMcpConfig: true,
      },
    });

    expect(options.strictMcpConfig).toBe(true);
  });
});

describe('ClaudeCodeOptionsBuilder betas option (1M Context Beta)', () => {
  it('omits betas when settings.enableContext1mBeta is false', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('betas');
  });

  it('passes betas with exactly one entry when settings.enableContext1mBeta is true', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableContext1mBeta: true,
      },
    });

    expect(options.betas).toEqual(['context-1m-2025-08-07']);
  });

  it('does not pass betas when settings.enableContext1mBeta is undefined', () => {
    const settings = getDefaultClaudeCodeBackendSettings();
    delete (settings as Record<string, unknown>).enableContext1mBeta;
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
    });

    expect(options).not.toHaveProperty('betas');
  });
});

describe('ClaudeCodeOptionsBuilder tool restrictions', () => {
  it('omits allowedTools/disallowedTools when empty', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('allowedTools');
    expect(options).not.toHaveProperty('disallowedTools');
  });

  it('passes allowedTools and disallowedTools when set', () => {
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      allowedTools: ['Read', 'Grep', 'Glob'],
      disallowedTools: ['Bash'],
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
    });

    expect(options.allowedTools).toEqual(['Read', 'Grep', 'Glob']);
    expect(options.disallowedTools).toEqual(['Bash']);
  });

  it('keeps default preset tools when restrictedBuiltinTools is empty', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options.tools).toEqual({ type: 'preset', preset: 'claude_code' });
  });

  it('overrides tools with restrictedBuiltinTools when set', () => {
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      restrictedBuiltinTools: ['Read', 'Grep'],
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
    });

    expect(options.tools).toEqual(['Read', 'Grep']);
  });

  it('omits toolConfig when askUserQuestionPreviewFormat is empty', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('toolConfig');
  });

  it('wires markdown preview format into toolConfig', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        askUserQuestionPreviewFormat: 'markdown',
      },
    });

    expect(options.toolConfig).toEqual({
      askUserQuestion: { previewFormat: 'markdown' },
    });
  });

  it('wires html preview format into toolConfig', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        askUserQuestionPreviewFormat: 'html',
      },
    });

    expect(options.toolConfig).toEqual({
      askUserQuestion: { previewFormat: 'html' },
    });
  });
});

describe('ClaudeCodeOptionsBuilder outputStyle option', () => {
  it('omits settings when outputStyle is empty', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('settings');
  });

  it('does not create top-level outputStyle', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        outputStyle: 'Explanatory',
      },
    });

    expect(options).not.toHaveProperty('outputStyle');
  });

  it('maps non-empty outputStyle to options.settings.outputStyle trimmed', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        outputStyle: '  Explanatory  ',
      },
    });

    expect(options.settings).toEqual({ outputStyle: 'Explanatory' });
  });

  it('omits settings when outputStyle is whitespace-only', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        outputStyle: '   \t\n  ',
      },
    });

    expect(options).not.toHaveProperty('settings');
  });
});
