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

  it('keeps structured output aliases normalized for internal filtering', () => {
    expect(getNormalizedToolName('StructuredOutput')).toBe('structuredoutput');
    expect(getNormalizedToolName('structured_output')).toBe('structuredoutput');
  });
});
