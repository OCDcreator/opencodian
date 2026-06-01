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

describe('ClaudeCodeOptionsBuilder limits, env, and toggles', () => {
  it('omits maxTurns/maxBudgetUsd when null', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('maxTurns');
    expect(options).not.toHaveProperty('maxBudgetUsd');
  });

  it('passes maxTurns and maxBudgetUsd when set', () => {
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      maxTurns: 50,
      maxBudgetUsd: 5.0,
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
    });

    expect(options.maxTurns).toBe(50);
    expect(options.maxBudgetUsd).toBe(5.0);
  });

  it('omits env when empty', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('env');
  });

  it('passes env when set', () => {
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      env: { CLAUDE_AGENT_SDK_CLIENT_APP: 'opencodian/1.0.0' },
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
    });

    expect(options.env).toEqual({ CLAUDE_AGENT_SDK_CLIENT_APP: 'opencodian/1.0.0' });
  });

  it('defensively copies settings.env so caller mutation does not leak into options snapshot', () => {
    const env: Record<string, string> = { KEY_A: 'value_a', KEY_B: 'value_b' };
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      env,
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
    });

    expect(options.env).toEqual({ KEY_A: 'value_a', KEY_B: 'value_b' });

    env.KEY_A = 'mutated';
    env.KEY_C = 'injected';

    expect(options.env).toEqual({ KEY_A: 'value_a', KEY_B: 'value_b' });
    expect(options.env).not.toBe(env);
  });

  it('passes verified Claude Code SDK capability toggles only when enabled', () => {
    const defaultOptions = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });
    const enabledOptions = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableFileCheckpointing: true,
        includeHookEvents: true,
        forwardSubagentText: true,
        agentProgressSummaries: true,
      },
    });

    expect(defaultOptions).not.toHaveProperty('enableFileCheckpointing');
    expect(defaultOptions).not.toHaveProperty('includeHookEvents');
    expect(defaultOptions).not.toHaveProperty('forwardSubagentText');
    expect(defaultOptions).not.toHaveProperty('agentProgressSummaries');
    expect(enabledOptions.enableFileCheckpointing).toBe(true);
    expect(enabledOptions.includeHookEvents).toBe(true);
    expect(enabledOptions.forwardSubagentText).toBe(true);
    expect(enabledOptions.agentProgressSummaries).toBe(true);
  });
});

describe('ClaudeCodeOptionsBuilder runtime injections', () => {
  it('passes experimental SDK options without adding settings fields', () => {
    const hooks = { SessionStart: [{ hooks: [jest.fn()] }] };
    const sessionStore = { append: jest.fn(), load: jest.fn() };
    const outputFormat = {
      type: 'json_schema',
      schema: { type: 'object', properties: { result: { type: 'string' } } },
    };
    const plugins = [{ type: 'local', path: './claude-plugin' }];
    const agents = {
      reviewer: {
        description: 'Reviews current changes',
        prompt: 'Review the code.',
      },
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
      hooks,
      sessionStore,
      sessionStoreFlush: 'eager',
      outputFormat,
      plugins,
      skills: ['review'],
      agent: 'reviewer',
      agents,
    });

    expect(options.hooks).toBe(hooks);
    expect(options.sessionStore).toBe(sessionStore);
    expect(options.sessionStoreFlush).toBe('eager');
    expect(options.outputFormat).toBe(outputFormat);
    expect(options.plugins).toEqual(plugins);
    expect(options.plugins).not.toBe(plugins);
    expect(options.skills).toEqual(['review']);
    expect(options.agent).toBe('reviewer');
    expect(options.agents).toEqual(agents);
    expect(options.agents).not.toBe(agents);
  });

  it('passes the SDK all-skills sentinel', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
      skills: 'all',
    });

    expect(options.skills).toBe('all');
  });

  it('supports diagnostic runtime overrides without adding saved settings fields', () => {
    const outputFormat = {
      type: 'json_schema',
      schema: { type: 'object', properties: { status: { type: 'string' } } },
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableFileCheckpointing: true,
      },
      outputFormat,
      persistSession: false,
      enableFileCheckpointing: false,
      includeHookEvents: true,
      forwardSubagentText: true,
      agentProgressSummaries: true,
    });

    expect(options.outputFormat).toBe(outputFormat);
    expect(options.persistSession).toBe(false);
    expect(options.includeHookEvents).toBe(true);
    expect(options.forwardSubagentText).toBe(true);
    expect(options.agentProgressSummaries).toBe(true);
    expect(options.enableFileCheckpointing).toBeUndefined();
  });

  it('lets fallbackModel override take precedence over settings fallbackModel', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        fallbackModel: 'claude-sonnet-4-5',
      },
      fallbackModel: 'claude-haiku-4-5',
    });

    expect(options.fallbackModel).toBe('claude-haiku-4-5');
  });

  it('falls back to settings fallbackModel when no override is provided', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        fallbackModel: 'claude-sonnet-4-5',
      },
    });

    expect(options.fallbackModel).toBe('claude-sonnet-4-5');
  });
});

describe('ClaudeCodeOptionsBuilder sandbox', () => {
  it('omits sandbox when all fields are false (default)', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('sandbox');
  });

  it('passes sandbox to SDK when enabled is true', () => {
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      sandbox: { enabled: true, failIfUnavailable: false, autoAllowBashIfSandboxed: false },
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
    });

    expect(options.sandbox).toEqual({ enabled: true });
  });

  it('passes all three sandbox fields when all are true', () => {
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      sandbox: { enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: true },
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
    });

    expect(options.sandbox).toEqual({
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
    });
  });

  it('does not pass sandbox when enabled is false even if other fields are true', () => {
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      sandbox: { enabled: false, failIfUnavailable: true, autoAllowBashIfSandboxed: true },
    };
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
    });

    expect(options).not.toHaveProperty('sandbox');
  });
});

describe('ClaudeCodeOptionsBuilder title', () => {
  it('omits title when not provided', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('title');
  });

  it('passes title to SDK when provided', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
      title: 'My Custom Session Title',
    });

    expect(options.title).toBe('My Custom Session Title');
  });

  it('omits title when empty string', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
      title: '',
    });

    expect(options).not.toHaveProperty('title');
  });

  it('omits title when whitespace-only string', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
      title: '   ',
    });

    expect(options).not.toHaveProperty('title');
  });
});
