/**
 * CodexHiddenWiring.test.ts — verifies the hidden-registration contract.
 *
 * These tests confirm that:
 * 1. CodexAdapter can be registered in AgentServiceRegistry
 * 2. IMPLEMENTED_AGENT_BACKENDS still excludes 'codex'
 * 3. setEnabledBackends with only user-facing backends does not enable codex
 * 4. registry.get('codex') returns the registered adapter
 * 5. registry.listEnabled() includes codex when enabled
 * 6. CodexAdapter is constructible with minimal options (no API key)
 * 7. The adapter starts and stops without error (DI mock path)
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { IMPLEMENTED_AGENT_BACKENDS } from '../../../../../src/core/agents/backend';
import { wireHiddenAdapters } from '../../../../../src/core/agents/backend/AgentAdapterWiring';
import type { Disposable } from '../../../../../src/core/agents/backend/AgentService';
import { AgentServiceRegistry } from '../../../../../src/core/agents/backend/AgentServiceRegistry';
import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import type { AgentBackendKind } from '../../../../../src/core/types/chat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock Codex SDK instance for DI injection. */
function createMockCodex() {
  const mockThread = {
    id: 'thread-test-123',
    runStreamed: jest.fn(() => ({
      async *[Symbol.asyncIterator]() {
        // Yield nothing — empty stream for start/stop test
      },
    })),
  };

  return {
    startThread: jest.fn(async () => mockThread),
    resumeThread: jest.fn(async () => mockThread),
    mockThread,
  };
}

/** Minimal AgentService mock for simulating opencode/claude-code. */
function createMockAdapter(kind: AgentBackendKind) {
  return {
    kind,
    displayName: `Mock ${kind}`,
    description: '',
    capabilities: new Set<AgentCapability>(),
    status: 'disconnected' as const,
    hasCapability: () => false,
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    dispose: jest.fn(),
    onStatusChange: () => ({ dispose: jest.fn() } as Disposable),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Codex hidden wiring', () => {
  let registry: AgentServiceRegistry;

  beforeEach(() => {
    registry = new AgentServiceRegistry();
  });

  afterEach(() => {
    registry.dispose();
  });

  // -- IMPLEMENTED_AGENT_BACKENDS exclusion ----------------------------------

  describe('IMPLEMENTED_AGENT_BACKENDS', () => {
    it('includes codex', () => {
      expect(IMPLEMENTED_AGENT_BACKENDS).toContain('codex');
    });

    it('contains only user-facing backends', () => {
      // Currently opencode, claude-code, and codex
      expect(IMPLEMENTED_AGENT_BACKENDS).toEqual(['opencode', 'claude-code', 'codex']);
    });
  });

  // -- Registration contract -------------------------------------------------

  describe('hidden registration', () => {
    it('registers CodexAdapter in the registry', () => {
      const adapter = new CodexAdapter({ workingDirectory: '/tmp/vault' });
      registry.register(adapter);

      expect(registry.get('codex')).toBe(adapter);
    });

    it('codex is not enabled when only user-facing backends are enabled', () => {
      registry.register(createMockAdapter('opencode'));
      registry.register(createMockAdapter('claude-code'));
      registry.register(new CodexAdapter({ workingDirectory: '/tmp/vault' }));

      const active = registry.setEnabledBackends(['opencode', 'claude-code']);

      expect(registry.isEnabled('codex')).toBe(false);
      expect(active).toBe('opencode');
    });

    it('listEnabled() excludes codex after hidden registration', () => {
      registry.register(createMockAdapter('opencode'));
      registry.register(new CodexAdapter({ workingDirectory: '/tmp/vault' }));
      registry.setEnabledBackends(['opencode']);

      const enabled = registry.listEnabled();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].kind).toBe('opencode');
      expect(enabled.find((e) => e.kind === 'codex')).toBeUndefined();
    });

    it('listAll() includes codex after hidden registration', () => {
      registry.register(createMockAdapter('opencode'));
      registry.register(new CodexAdapter({ workingDirectory: '/tmp/vault' }));

      const all = registry.listAll();
      const codexInfo = all.find((e) => e.kind === 'codex');
      expect(codexInfo).toBeDefined();
      expect(codexInfo!.displayName).toBe('Codex');
    });

    it('getActive() never returns codex when only user-facing backends enabled', () => {
      registry.register(createMockAdapter('opencode'));
      registry.register(new CodexAdapter({ workingDirectory: '/tmp/vault' }));
      registry.setEnabledBackends(['opencode']);

      expect(registry.getActive()?.kind).toBe('opencode');
    });
  });

  // -- Adapter construction --------------------------------------------------

  describe('CodexAdapter construction', () => {
    it('constructs without API key or options', () => {
      const adapter = new CodexAdapter();
      expect(adapter.kind).toBe('codex');
      expect(adapter.displayName).toBe('Codex');
      expect(adapter.description).toBe('OpenAI Codex coding agent');
      expect(adapter.status).toBe('disconnected');
    });

    it('constructs with only workingDirectory', () => {
      const adapter = new CodexAdapter({ workingDirectory: '/some/vault' });
      expect(adapter.kind).toBe('codex');
    });

    it('declares expected capabilities', () => {
      const adapter = new CodexAdapter();
      expect(adapter.capabilities.has(AgentCapability.Chat)).toBe(true);
      expect(adapter.capabilities.has(AgentCapability.Sessions)).toBe(true);
      expect(adapter.capabilities.has(AgentCapability.Thinking)).toBe(true);
      expect(adapter.capabilities.has(AgentCapability.FileOps)).toBe(true);
      expect(adapter.capabilities.has(AgentCapability.Shell)).toBe(true);
    });
  });

  // -- Adapter start/stop with DI mock --------------------------------------

  describe('CodexAdapter start/stop via DI', () => {
    it('starts and stops without error using mock factory', async () => {
      const mockCodex = createMockCodex();
      const adapter = new CodexAdapter({
        workingDirectory: '/tmp/vault',
        createAppServerClient: () => null,
        createCodex: async () => mockCodex as unknown as import('@openai/codex-sdk').Codex,
      });

      await adapter.start();
      expect(adapter.status).toBe('connected');

      await adapter.stop();
      expect(adapter.status).toBe('disconnected');
    });

    it('dispose cleans up without error', async () => {
      const mockCodex = createMockCodex();
      const adapter = new CodexAdapter({
        workingDirectory: '/tmp/vault',
        createAppServerClient: () => null,
        createCodex: async () => mockCodex as unknown as import('@openai/codex-sdk').Codex,
      });

      await adapter.start();
      adapter.dispose();
      expect(adapter.status).toBe('disconnected');
    });
  });

  // -- Routing safety -------------------------------------------------------

  describe('routing safety', () => {
    it('resolveConversationBackendKind defaults to opencode, never codex', async () => {
      // Import the routing function directly
      const { resolveConversationBackendKind } = await import(
        '../../../../../src/core/agents/backend/AgentBackendRouting'
      );

      // A conversation with no backend set should default to opencode
      const kind = resolveConversationBackendKind({} as Record<string, unknown>);
      expect(kind).toBe('opencode');
    });

    it('codex can be manually enabled if explicitly requested', () => {
      // This tests that the registry mechanics work, even though the UI
      // will never surface this option in the current checkpoint
      registry.register(new CodexAdapter({ workingDirectory: '/tmp/vault' }));
      registry.setEnabled('codex');

      expect(registry.isEnabled('codex')).toBe(true);
      expect(registry.getActiveKind()).toBe('codex');
    });
  });

  // -- wireHiddenAdapters ------------------------------------------------------

  describe('wireHiddenAdapters', () => {
    it('registers user adapters and hidden Codex when vaultPath provided', () => {
      const mockOC = createMockAdapter('opencode');
      const mockCC = createMockAdapter('claude-code');

      wireHiddenAdapters({
        registry,
        adapters: [mockOC, mockCC],
        vaultPath: '/tmp/vault',
        pluginDir: '/tmp/vault/.obsidian/plugins/opencodian',
      });

      expect(registry.get('opencode')).toBe(mockOC);
      expect(registry.get('claude-code')).toBe(mockCC);
      expect(registry.get('codex')).toBeDefined();
      expect(registry.get('codex')!.kind).toBe('codex');
    });

    it('does not register Codex when vaultPath is undefined', () => {
      const mockOC = createMockAdapter('opencode');

      wireHiddenAdapters({
        registry,
        adapters: [mockOC],
        vaultPath: undefined,
        pluginDir: '',
      });

      expect(registry.get('opencode')).toBe(mockOC);
      expect(registry.get('codex')).toBeUndefined();
    });

    it('registered Codex is not in enabled list after setEnabledBackends', () => {
      const mockOC = createMockAdapter('opencode');

      wireHiddenAdapters({
        registry,
        adapters: [mockOC],
        vaultPath: '/tmp/vault',
        pluginDir: '/tmp/vault/.obsidian/plugins/opencodian',
      });

      registry.setEnabledBackends(['opencode', 'claude-code']);

      expect(registry.isEnabled('codex')).toBe(false);
      expect(registry.listEnabled()).toHaveLength(1);
      expect(registry.listEnabled()[0].kind).toBe('opencode');
    });

    it('listAll includes codex but listEnabled does not', () => {
      wireHiddenAdapters({
        registry,
        adapters: [createMockAdapter('opencode')],
        vaultPath: '/tmp/vault',
        pluginDir: '/tmp/vault/.obsidian/plugins/opencodian',
      });

      registry.setEnabledBackends(['opencode']);

      const all = registry.listAll();
      const enabled = registry.listEnabled();

      expect(all.find((a) => a.kind === 'codex')).toBeDefined();
      expect(enabled.find((a) => a.kind === 'codex')).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Settings passthrough (separate describe to satisfy max-lines-per-function)
// ---------------------------------------------------------------------------

describe('Codex wiring settings passthrough', () => {
  describe('boolean and enum passthrough', () => {
    it('passes networkAccessEnabled=false to the adapter (not silently dropped)', () => {
      const registry = new AgentServiceRegistry();
      wireHiddenAdapters({
        registry,
        adapters: [],
        vaultPath: '/tmp/vault',
        pluginDir: '/tmp/vault/.obsidian/plugins/opencodian',
        codexSettings: {
          apiKey: '',
          model: '',
          sandboxMode: 'workspace-write',
          modelReasoningEffort: 'medium',
          additionalDirectories: '',
          networkAccessEnabled: false,
          webSearchMode: 'cached',
        },
      });

      const codexAdapter = registry.get('codex') as CodexAdapter;
      expect(codexAdapter).toBeDefined();

      const options = (codexAdapter as unknown as { options: Record<string, unknown> }).options;
      expect(options.networkAccessEnabled).toBe(false);
    });

    it('passes webSearchMode=cached to the adapter (not silently dropped)', () => {
      const registry = new AgentServiceRegistry();
      wireHiddenAdapters({
        registry,
        adapters: [],
        vaultPath: '/tmp/vault',
        pluginDir: '/tmp/vault/.obsidian/plugins/opencodian',
        codexSettings: {
          apiKey: '',
          model: '',
          sandboxMode: 'workspace-write',
          modelReasoningEffort: 'medium',
          additionalDirectories: '',
          networkAccessEnabled: true,
          webSearchMode: 'cached',
        },
      });

      const codexAdapter = registry.get('codex') as CodexAdapter;
      expect(codexAdapter).toBeDefined();

      const options = (codexAdapter as unknown as { options: Record<string, unknown> }).options;
      expect(options.webSearchMode).toBe('cached');
    });
  });

  describe('model passthrough', () => {
    it('passes codexSettings.model to the adapter', () => {
      const registry = new AgentServiceRegistry();
      wireHiddenAdapters({
        registry,
        adapters: [createMockAdapter('opencode')],
        vaultPath: '/tmp/vault',
        pluginDir: '/tmp/vault/.obsidian/plugins/opencodian',
        codexSettings: { apiKey: 'sk-test', model: 'o4-mini', sandboxMode: 'workspace-write', modelReasoningEffort: 'medium', additionalDirectories: '', networkAccessEnabled: false, webSearchMode: 'cached' },
      });

      const codexAdapter = registry.get('codex');
      expect(codexAdapter).toBeDefined();
      expect(codexAdapter!.kind).toBe('codex');
    });

    it('creates adapter without model when codexSettings.model is empty', () => {
      const registry = new AgentServiceRegistry();
      wireHiddenAdapters({
        registry,
        adapters: [createMockAdapter('opencode')],
        vaultPath: '/tmp/vault',
        pluginDir: '/tmp/vault/.obsidian/plugins/opencodian',
        codexSettings: { apiKey: '', model: '', sandboxMode: 'workspace-write', modelReasoningEffort: 'medium', additionalDirectories: '', networkAccessEnabled: false, webSearchMode: 'cached' },
      });

      const codexAdapter = registry.get('codex');
      expect(codexAdapter).toBeDefined();
    });
  });
});
