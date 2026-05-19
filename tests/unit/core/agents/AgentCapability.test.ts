import { describe, it, expect } from '@jest/globals';
import {
  AgentCapability,
  OPENCODE_FULL_CAPABILITIES,
  getActiveBackendCapabilities,
  hasCapability,
} from '../../../../src/core/agents/AgentCapability';

describe('AgentCapability', () => {
  it('should define all 18 capabilities', () => {
    const expected: string[] = [
      'tools', 'mcp', 'permissions', 'branching', 'todos', 'questions',
      'models', 'subagents', 'context', 'providers', 'compaction',
      'cost-tracking', 'thinking', 'hooks', 'config', 'file-ops', 'shell', 'export',
    ];
    expect(Object.values(AgentCapability)).toHaveLength(18);
    for (const cap of expected) {
      expect(Object.values(AgentCapability)).toContain(cap);
    }
  });

  it('OPENCODE_FULL_CAPABILITIES should include all capabilities', () => {
    expect(OPENCODE_FULL_CAPABILITIES.size).toBe(18);
  });

  it('getActiveBackendCapabilities returns full set for default opencode', () => {
    const caps = getActiveBackendCapabilities();
    expect(caps).toEqual(OPENCODE_FULL_CAPABILITIES);
  });

  it('hasCapability returns true for known capability in full set', () => {
    expect(hasCapability(OPENCODE_FULL_CAPABILITIES, AgentCapability.Tools)).toBe(true);
  });

  it('hasCapability returns false for capability not in set', () => {
    const empty = new Set<AgentCapability>();
    expect(hasCapability(empty, AgentCapability.Tools)).toBe(false);
  });
});
