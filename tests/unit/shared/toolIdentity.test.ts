import { getNormalizedToolName,getToolIdentity } from '../../../src/shared';

describe('toolIdentity', () => {
  it('treats Claudian MCP names as MCP tools', () => {
    expect(getToolIdentity('mcp__exa__search')).toMatchObject({
      normalizedName: 'mcp__exa__search',
      kind: 'mcp',
      icon: 'opencodian-tool-mcp',
      isMcp: true,
    });
  });

  it('treats exact OpenCode MCP names as MCP when present in the known catalog', () => {
    expect(getToolIdentity('exa_search', {
      source: 'opencode',
      observedExternalTools: ['exa_search'],
    })).toMatchObject({
      normalizedName: 'exa_search',
      kind: 'mcp',
      icon: 'opencodian-tool-mcp',
      isMcp: true,
    });
  });

  it.each([
    ['Bash', 'bash', 'builtin', 'terminal'],
    ['bash', 'bash', 'builtin', 'terminal'],
    ['read', 'read', 'builtin', 'file-text'],
    ['apply_patch', 'apply_patch', 'builtin', 'file-pen'],
    ['task', 'task', 'task', 'git-branch'],
    ['question', 'question', 'question', 'message-square'],
    ['skill', 'skill', 'skill', 'brain'],
    ['enter_plan_mode', 'enter_plan_mode', 'plan', 'list'],
  ])('normalizes %s', (rawName, normalizedName, kind, icon) => {
    expect(getToolIdentity(rawName)).toMatchObject({
      normalizedName,
      kind,
      icon,
    });
  });

  it('classifies Claude Code built-in tools using the shared dictionary', () => {
    expect(getToolIdentity('Bash', { source: 'claude-code' })).toMatchObject({
      normalizedName: 'bash',
      kind: 'builtin',
      icon: 'terminal',
      isMcp: false,
    });
  });

  it('classifies Claude Code MCP-prefixed tools as MCP', () => {
    expect(getToolIdentity('mcp__some_server_tool', { source: 'claude-code' })).toMatchObject({
      normalizedName: 'mcp__some_server_tool',
      kind: 'mcp',
      icon: 'opencodian-tool-mcp',
      isMcp: true,
    });
  });

  it('falls back OpenCode external tools to custom styling', () => {
    expect(getToolIdentity('exa_search', { source: 'opencode' })).toMatchObject({
      normalizedName: 'exa_search',
      kind: 'custom',
      icon: 'layers',
      isMcp: false,
    });
  });

  it('classifies tool registry entries as custom', () => {
    expect(getToolIdentity('vault_tool', {
      source: 'opencode',
      registryTools: ['vault_tool'],
    })).toMatchObject({
      normalizedName: 'vault_tool',
      kind: 'custom',
      icon: 'layers',
      isMcp: false,
    });
  });

  it('preserves registry tool as custom even when also observed as external', () => {
    expect(getToolIdentity('my_mcp_search', {
      source: 'opencode',
      registryTools: ['my_mcp_search'],
      observedExternalTools: ['my_mcp_search'],
    })).toMatchObject({
      normalizedName: 'my_mcp_search',
      kind: 'custom',
      icon: 'layers',
      isMcp: false,
    });
  });

  it('classifies observed external tools as mcp over the opencode external fallback', () => {
    expect(getToolIdentity('some_mcp_tool', {
      source: 'opencode',
      observedExternalTools: ['some_mcp_tool'],
    })).toMatchObject({
      normalizedName: 'some_mcp_tool',
      kind: 'mcp',
      icon: 'opencodian-tool-mcp',
      isMcp: true,
    });
  });

  it('classifies known MCP tools as mcp even without observed context', () => {
    expect(getToolIdentity('context7_search', {
      source: 'opencode',
      knownMcpTools: ['context7_search'],
    })).toMatchObject({
      normalizedName: 'context7_search',
      kind: 'mcp',
      icon: 'opencodian-tool-mcp',
      isMcp: true,
    });
  });

  it('keeps structured output aliases normalized for internal filtering', () => {
    expect(getNormalizedToolName('StructuredOutput')).toBe('structuredoutput');
    expect(getNormalizedToolName('structured_output')).toBe('structuredoutput');
  });
});
