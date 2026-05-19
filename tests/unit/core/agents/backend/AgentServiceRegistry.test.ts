import { afterEach,beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AgentCapability, OPENCODE_FULL_CAPABILITIES } from '../../../../../src/core/agents/AgentCapability';
import type {
  AgentConnectionStatus,
  AgentService,
  Disposable,
} from '../../../../../src/core/agents/backend/AgentService';
import {
  AgentServiceRegistry,
} from '../../../../../src/core/agents/backend/AgentServiceRegistry';
import type { AgentBackendKind } from '../../../../../src/core/types/chat';

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

function createMockAdapter(kind: AgentBackendKind, caps = OPENCODE_FULL_CAPABILITIES): AgentService {
  return {
    kind,
    displayName: `Mock ${kind}`,
    description: `Mock ${kind} adapter`,
    capabilities: caps,
    status: 'disconnected' as AgentConnectionStatus,
    hasCapability(cap: AgentCapability) { return caps.has(cap); },
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    dispose: jest.fn(),
    onStatusChange(_handler) {
      return { dispose: jest.fn() } as Disposable;
    },
  } as unknown as AgentService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentServiceRegistry', () => {
  let registry: AgentServiceRegistry;

  beforeEach(() => {
    registry = new AgentServiceRegistry();
  });

  afterEach(() => {
    registry.dispose();
  });

  // -- Registration -----------------------------------------------------------

  describe('register', () => {
    it('registers an adapter', () => {
      const adapter = createMockAdapter('opencode');
      registry.register(adapter);
      expect(registry.get('opencode')).toBe(adapter);
    });

    it('replaces existing adapter on re-register', () => {
      const a1 = createMockAdapter('opencode');
      const a2 = createMockAdapter('opencode');
      registry.register(a1);
      registry.register(a2);
      expect(registry.get('opencode')).toBe(a2);
    });
  });

  describe('unregister', () => {
    it('removes an adapter', () => {
      const adapter = createMockAdapter('opencode');
      registry.register(adapter);
      registry.setEnabled('opencode');
      registry.unregister('opencode');
      expect(registry.get('opencode')).toBeUndefined();
    });
  });

  // -- Enable / Disable -------------------------------------------------------

  describe('setEnabled', () => {
    it('enables a registered adapter', () => {
      registry.register(createMockAdapter('opencode'));
      registry.setEnabled('opencode');
      expect(registry.isEnabled('opencode')).toBe(true);
    });

    it('makes it active if no active adapter', () => {
      registry.register(createMockAdapter('opencode'));
      registry.setEnabled('opencode');
      expect(registry.getActiveKind()).toBe('opencode');
    });

    it('does not change active if one is already set', () => {
      registry.register(createMockAdapter('opencode'));
      registry.register(createMockAdapter('claude-code'));
      registry.setEnabled('opencode');
      registry.setEnabled('claude-code');
      expect(registry.getActiveKind()).toBe('opencode');
    });

    it('ignores unregistered kind', () => {
      registry.setEnabled('codex');
      expect(registry.isEnabled('codex')).toBe(false);
    });
  });

  describe('setDisabled', () => {
    it('disables an adapter', () => {
      registry.register(createMockAdapter('opencode'));
      registry.setEnabled('opencode');
      const newActive = registry.setDisabled('opencode');
      expect(registry.isEnabled('opencode')).toBe(false);
      expect(newActive).toBeNull();
    });
  });

  describe('setEnabledBackends', () => {
    it('sets multiple enabled backends', () => {
      registry.register(createMockAdapter('opencode'));
      registry.register(createMockAdapter('claude-code'));
      const active = registry.setEnabledBackends(['opencode', 'claude-code']);
      expect(registry.isEnabled('opencode')).toBe(true);
      expect(registry.isEnabled('claude-code')).toBe(true);
      expect(active).toBe('opencode');
    });

    it('prefers opencode as default active', () => {
      registry.register(createMockAdapter('claude-code'));
      registry.register(createMockAdapter('opencode'));
      const active = registry.setEnabledBackends(['claude-code', 'opencode']);
      expect(active).toBe('opencode');
    });

    it('uses first enabled if opencode not available', () => {
      registry.register(createMockAdapter('claude-code'));
      const active = registry.setEnabledBackends(['claude-code']);
      expect(active).toBe('claude-code');
    });

    it('skips unregistered backends', () => {
      registry.register(createMockAdapter('opencode'));
      registry.setEnabledBackends(['opencode', 'codex']);
      expect(registry.isEnabled('opencode')).toBe(true);
      expect(registry.isEnabled('codex')).toBe(false);
    });

    it('returns null when none enabled', () => {
      const active = registry.setEnabledBackends([]);
      expect(active).toBeNull();
    });
  });

  // -- Query ------------------------------------------------------------------

  describe('getActive', () => {
    it('returns null when nothing enabled', () => {
      expect(registry.getActive()).toBeNull();
    });

    it('returns the active adapter', () => {
      const adapter = createMockAdapter('opencode');
      registry.register(adapter);
      registry.setEnabled('opencode');
      expect(registry.getActive()).toBe(adapter);
    });
  });

  describe('listEnabled', () => {
    it('returns info for enabled adapters', () => {
      registry.register(createMockAdapter('opencode'));
      registry.register(createMockAdapter('claude-code'));
      registry.setEnabledBackends(['opencode']);
      const enabled = registry.listEnabled();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].kind).toBe('opencode');
    });
  });

  describe('listAll', () => {
    it('returns info for all registered adapters', () => {
      registry.register(createMockAdapter('opencode'));
      registry.register(createMockAdapter('claude-code'));
      const all = registry.listAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('hasActive', () => {
    it('returns false when nothing enabled', () => {
      expect(registry.hasActive()).toBe(false);
    });

    it('returns true when adapter is active', () => {
      registry.register(createMockAdapter('opencode'));
      registry.setEnabled('opencode');
      expect(registry.hasActive()).toBe(true);
    });
  });

  // -- Events -----------------------------------------------------------------

  describe('onActiveChange', () => {
    it('fires when active changes', () => {
      const handler = jest.fn();
      registry.onActiveChange(handler);
      registry.register(createMockAdapter('opencode'));
      registry.setEnabled('opencode');
      expect(handler).toHaveBeenCalledWith('opencode');
    });

    it('unsubscribes via dispose', () => {
      const handler = jest.fn();
      const sub = registry.onActiveChange(handler);
      sub.dispose();
      registry.register(createMockAdapter('opencode'));
      registry.setEnabled('opencode');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -- Dispose ----------------------------------------------------------------

  describe('dispose', () => {
    it('disposes all adapters', () => {
      const adapter = createMockAdapter('opencode');
      registry.register(adapter);
      registry.dispose();
      expect(adapter.dispose).toHaveBeenCalled();
    });

    it('clears all state', () => {
      registry.register(createMockAdapter('opencode'));
      registry.setEnabled('opencode');
      registry.dispose();
      expect(registry.getActive()).toBeNull();
      expect(registry.listAll()).toHaveLength(0);
    });
  });
});
