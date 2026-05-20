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
});
