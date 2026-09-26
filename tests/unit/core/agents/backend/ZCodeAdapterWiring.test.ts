/**
 * ZCodeAdapterWiring.test.ts — registry registration contract.
 *
 * Verifies ZCode registers through the standard wiring and that enabling or
 * disabling it never changes the behavior of the other backends.
 */
import { describe, expect, it } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { IMPLEMENTED_AGENT_BACKENDS } from '../../../../../src/core/agents/backend';
import { wireHiddenAdapters } from '../../../../../src/core/agents/backend/AgentAdapterWiring';
import type { AgentService } from '../../../../../src/core/agents/backend/AgentService';
import { AgentServiceRegistry } from '../../../../../src/core/agents/backend/AgentServiceRegistry';
import type { AgentBackendKind } from '../../../../../src/core/types/chat';

function createMockAdapter(kind: AgentBackendKind): AgentService {
  return {
    kind,
    displayName: `Mock ${kind}`,
    description: '',
    capabilities: new Set<AgentCapability>(),
    status: 'disconnected',
    hasCapability: () => false,
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    onStatusChange: () => ({ dispose: () => {} }),
  };
}

describe('ZCode backend registration', () => {
  it('lists zcode as an implemented backend', () => {
    expect(IMPLEMENTED_AGENT_BACKENDS).toContain('zcode');
  });

  it('registers and enables/disables zcode without touching other backends', () => {
    const registry = new AgentServiceRegistry();
    const mock = createMockAdapter('opencode');
    wireHiddenAdapters({
      registry,
      adapters: [mock],
      vaultPath: '/vault',
      getZCodeSettings: () => ({ executablePath: '' }),
    });

    expect(registry.get('zcode')).toBeDefined();
    expect(registry.get('zcode')?.kind).toBe('zcode');

    registry.setEnabled('zcode');
    expect(registry.isEnabled('zcode')).toBe(true);
    // Enabling zcode must not silently change which backends run.
    expect(registry.isEnabled('opencode')).toBe(false);

    registry.setEnabled('opencode');
    registry.setDisabled('zcode');
    expect(registry.isEnabled('zcode')).toBe(false);
    expect(registry.isEnabled('opencode')).toBe(true);
    registry.dispose();
  });

  it('does not register zcode without a vault path (same contract as codex/pi)', () => {
    const registry = new AgentServiceRegistry();
    wireHiddenAdapters({
      registry,
      adapters: [],
      vaultPath: undefined,
      getZCodeSettings: () => ({ executablePath: '' }),
    });
    expect(registry.get('zcode')).toBeUndefined();
    registry.dispose();
  });
});
