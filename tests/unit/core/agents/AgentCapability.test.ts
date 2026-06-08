import { describe, expect,it } from '@jest/globals';

import {
  AgentCapability,
  getActiveBackendCapabilities,
  hasCapability,
  OPENCODE_FULL_CAPABILITIES,
} from '../../../../src/core/agents/AgentCapability';

describe('AgentCapability', () => {
  it('should define all backend capabilities', () => {
    const expected: string[] = [
      'chat', 'sessions',
      'tools', 'mcp', 'permissions', 'fork', 'branching', 'todos', 'questions',
      'models', 'subagents', 'context', 'providers', 'compaction',
      'cost-tracking', 'thinking', 'hooks', 'config', 'file-ops', 'shell',
      'sharing', 'export',
    ];
    expect(Object.values(AgentCapability)).toHaveLength(expected.length);
    for (const cap of expected) {
      expect(Object.values(AgentCapability)).toContain(cap);
    }
  });

  it('OPENCODE_FULL_CAPABILITIES should include all capabilities', () => {
    expect(OPENCODE_FULL_CAPABILITIES.size).toBe(Object.values(AgentCapability).length);
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
