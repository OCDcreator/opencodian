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
      pathToClaudeCodeExecutable: '/usr/local/bin/claude',
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
});
