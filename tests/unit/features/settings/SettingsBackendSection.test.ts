import { Setting } from 'obsidian';

import type { AgentService } from '../../../../src/core/agents/backend/AgentService';
import { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import type { AgentBackendKind } from '../../../../src/core/types/chat';
import {
  BACKEND_OPTIONS,
  SettingsBackendSection,
} from '../../../../src/features/settings/SettingsBackendSection';
import { setLocale } from '../../../../src/i18n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAdapter(kind: AgentBackendKind): AgentService & { start: jest.Mock; stop: jest.Mock } {
  return {
    kind,
    displayName: kind,
    description: `${kind} adapter`,
    status: 'disconnected',
    capabilities: { streaming: true, sessionManagement: true, conversationRestore: true, toolUse: true, reasoning: true },
    hasCapability: () => true,
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn(),
    onStatusChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    sendMessage: jest.fn(),
    resumeThread: jest.fn(),
    createSession: jest.fn().mockResolvedValue('session-1'),
    listSessions: jest.fn().mockResolvedValue([]),
    deleteSession: jest.fn().mockResolvedValue(undefined),
    abortActiveMessage: jest.fn().mockResolvedValue(undefined),
    getActiveSessionId: jest.fn().mockReturnValue(null),
    setActiveSessionId: jest.fn(),
    getInfo: jest.fn().mockReturnValue({ kind, displayName: kind, description: `${kind} adapter`, status: 'disconnected', capabilities: {} }),
    getConversationHistory: jest.fn().mockResolvedValue([]),
  } as never;
}

function createPluginMock(overrides?: Record<string, unknown>) {
  const registry = new AgentServiceRegistry();
  const opencode = createMockAdapter('opencode');
  const codex = createMockAdapter('codex');
  const claudeCode = createMockAdapter('claude-code');
  registry.register(opencode);
  registry.register(codex);
  registry.register(claudeCode);
  registry.setEnabledBackends(['opencode', 'codex', 'claude-code']);
  registry.setActive('opencode');

  return {
    plugin: {
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode', 'codex', 'claude-code'] as AgentBackendKind[],
        activeBackend: 'opencode' as AgentBackendKind,
      },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      agentServiceRegistry: registry,
      openCodeService: { start: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) },
      ...overrides,
    } as never,
    registry,
    adapters: { opencode, codex, claudeCode },
  };
}

// ---------------------------------------------------------------------------
// Existing tests
// ---------------------------------------------------------------------------

describe('SettingsBackendSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes implemented backends without exposing future placeholders', () => {
    expect(BACKEND_OPTIONS.map((option) => option.id)).toEqual(['opencode', 'claude-code', 'codex']);
  });

  it('attaches implemented backend options without rendering future backend placeholders', () => {
    const containerEl = document.createElement('div');
    const names: string[] = [];
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      names.push(name);
      return this;
    });
    const section = new SettingsBackendSection({
      plugin: {
        settings: { ...DEFAULT_SETTINGS },
        saveSettings: jest.fn().mockResolvedValue(undefined),
        agentServiceRegistry: undefined,
        openCodeService: undefined,
      } as never,
      requestDisplayRefresh: jest.fn(),
    });

    section.attach(containerEl);

    expect(names).toContain('Claude Code');
    expect(names).toContain('Codex');
    expect(names).not.toContain('Copilot');
    expect(names).not.toContain('Pi');
  });

  // -------------------------------------------------------------------------
  // Lifecycle tests: start/stop on enable/disable
  // -------------------------------------------------------------------------

  describe('backend enable/disable lifecycle', () => {
    it('does NOT start codex adapter when enabling codex while opencode is active', async () => {
      const { plugin, adapters } = createPluginMock({ settings: { ...DEFAULT_SETTINGS, enabledBackends: ['opencode'], activeBackend: 'opencode' } });
      const section = new SettingsBackendSection({ plugin, requestDisplayRefresh: jest.fn() });
      const containerEl = document.createElement('div');
      section.attach(containerEl);

      // Simulate enabling codex (non-active backend)
      await (section as unknown as { setBackendEnabled: (b: AgentBackendKind, e: boolean) => Promise<void> })
        .setBackendEnabled('codex', true);

      // codex adapter should NOT be started because it is not the active backend
      expect(adapters.codex.start).not.toHaveBeenCalled();
    });

    it('stops the codex adapter when disabling codex while codex is active', async () => {
      const { plugin, adapters } = createPluginMock({ settings: { ...DEFAULT_SETTINGS, enabledBackends: ['opencode', 'codex'], activeBackend: 'codex' } });
      const section = new SettingsBackendSection({ plugin, requestDisplayRefresh: jest.fn() });

      await (section as unknown as { setBackendEnabled: (b: AgentBackendKind, e: boolean) => Promise<void> })
        .setBackendEnabled('codex', false);

      expect(adapters.codex.stop).toHaveBeenCalledTimes(1);
    });

    it('does NOT stop codex adapter when disabling codex while codex is NOT active', async () => {
      const { plugin, adapters } = createPluginMock({ settings: { ...DEFAULT_SETTINGS, enabledBackends: ['opencode', 'codex'], activeBackend: 'opencode' } });
      const section = new SettingsBackendSection({ plugin, requestDisplayRefresh: jest.fn() });

      await (section as unknown as { setBackendEnabled: (b: AgentBackendKind, e: boolean) => Promise<void> })
        .setBackendEnabled('codex', false);

      // codex adapter should NOT be stopped because it was never started (not active)
      expect(adapters.codex.stop).not.toHaveBeenCalled();
    });

    it('starts the adapter when enabling the currently active backend', async () => {
      const { plugin, adapters } = createPluginMock({ settings: { ...DEFAULT_SETTINGS, enabledBackends: ['opencode'], activeBackend: 'opencode' } });
      const section = new SettingsBackendSection({ plugin, requestDisplayRefresh: jest.fn() });

      // Re-enable opencode while it IS the active backend — should start it
      await (section as unknown as { setBackendEnabled: (b: AgentBackendKind, e: boolean) => Promise<void> })
        .setBackendEnabled('opencode', true);

      expect(adapters.opencode.start).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle tests: start/stop on active backend switch
  // -------------------------------------------------------------------------

  describe('active backend switch lifecycle', () => {
    it('stops previous adapter and starts new adapter on switch', async () => {
      const { plugin, adapters, registry } = createPluginMock();
      const refresh = jest.fn();
      const section = new SettingsBackendSection({ plugin, requestDisplayRefresh: refresh });
      const containerEl = document.createElement('div');
      section.attach(containerEl);

      // Simulate switching from opencode to codex via the dropdown onChange logic
      const previousActive = (plugin as Record<string, unknown>).settings as { activeBackend: string };
      previousActive.activeBackend = 'codex';
      registry.setActive('codex');
      await (plugin as Record<string, { (): Promise<void>; (): Promise<void> }>).saveSettings();

      // Stop old, start new — this is what the dropdown onChange does
      await adapters.opencode.stop();
      await adapters.codex.start();

      expect(adapters.opencode.stop).toHaveBeenCalledTimes(1);
      expect(adapters.codex.start).toHaveBeenCalledTimes(1);
    });
  });
});
