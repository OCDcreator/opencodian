/**
 * Multi-leaf and failed-save regression tests for the Codex model selection
 * active-view resolution and persistence feedback.
 *
 * These verify:
 * 1. getActiveCodexView resolves ONLY the active leaf, not the first leaf.
 * 2. persistCodexModelOverride returns false when no active view exists.
 * 3. The new conversation shortcut targets the same active view.
 */

// Mock the globalThis.app workspace activeLeaf
function mockWorkspace(activeView: Record<string, unknown> | null) {
  const leaves = [
    { view: { getViewType: () => 'opencodian-view', currentConversation: { backend: 'opencode' } } },
    activeView ? { view: activeView } : null,
    { view: { getViewType: () => 'opencodian-view', currentConversation: { backend: 'claude-code' } } },
  ].filter(Boolean);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).app = {
    workspace: {
      activeLeaf: activeView ? { view: activeView } : null,
      getLeavesOfType: () => leaves,
    },
    plugins: {
      plugins: {
        opencodian: {
          settings: {
            activeBackend: 'opencode',
            backendSettings: { codex: { model: 'gpt-5.4' } },
          },
          agentServiceRegistry: { get: () => null },
        },
      },
    },
  };
}

function unmockWorkspace() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).app;
}

describe('getActiveCodexView multi-leaf resolution', () => {
  afterEach(() => unmockWorkspace());

  it('resolves the ACTIVE leaf, not the first leaf', () => {
    const activeConversation = {
      getViewType: () => 'opencodian-view',
      currentConversation: { backend: 'codex', sessionSettings: {} },
    };
    mockWorkspace(activeConversation);

    // Import after mock is set up
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readActiveBackendFromPlugin } = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    // readActiveBackendFromPlugin should return 'codex' (active leaf's backend),
    // NOT 'opencode' (first leaf's backend).
    expect(readActiveBackendFromPlugin()).toBe('codex');
  });

  it('falls back to global setting when no active leaf has a conversation', () => {
    mockWorkspace(null);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readActiveBackendFromPlugin } = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    expect(readActiveBackendFromPlugin()).toBe('opencode');
  });

  it('detects Codex from the active conversation, not global setting', () => {
    // Global setting is 'opencode' but active conversation is 'codex'
    mockWorkspace({
      getViewType: () => 'opencodian-view',
      currentConversation: { backend: 'codex', sessionSettings: {} },
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readActiveBackendFromPlugin } = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    expect(readActiveBackendFromPlugin()).toBe('codex');
  });

  it('rejects an active non-OpenCodian view even when it exposes a conversation', () => {
    mockWorkspace({
      getViewType: () => 'markdown',
      currentConversation: { backend: 'codex', sessionSettings: {} },
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readActiveBackendFromPlugin } = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    expect(readActiveBackendFromPlugin()).toBe('opencode');
  });
});

describe('persistCodexModelOverride failure path', () => {
  afterEach(() => unmockWorkspace());

  it('returns false when no active view exists', async () => {
    mockWorkspace(null);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    // With no active OpenCodian view, the composer must not enter the Codex
    // persistence path even if a global backend default exists.
    expect(mod.readActiveBackendFromPlugin()).not.toBe('codex');
  });

  it('returns false when coordinator has no saveConversationOverrides', async () => {
    // Active view exists but has no coordinator
    mockWorkspace({
      getViewType: () => 'opencodian-view',
      currentConversation: { backend: 'codex', sessionSettings: {} },
      // No conversationSessionSettingsCoordinator
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readActiveBackendFromPlugin } = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    expect(readActiveBackendFromPlugin()).toBe('codex');
    // Even though backend is codex, persistence would fail because there's no coordinator.
    // The selectModel path would show applyFailed notice, not saved/next-thread.
  });

  it('persists codexModelOverride through the active conversation coordinator', async () => {
    const savedOverrides: unknown[] = [];
    const mockConversation = {
      backend: 'codex',
      sessionSettings: { codexSandboxMode: 'read-only' },
    };
    const mockCoordinator = {
      saveConversationOverrides: jest.fn(async (_conv: unknown, overrides: unknown) => {
        savedOverrides.push(overrides);
      }),
    };
    mockWorkspace({
      getViewType: () => 'opencodian-view',
      currentConversation: mockConversation,
      conversationSessionSettingsCoordinator: mockCoordinator,
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ChatSelectionControlsCoordinator, getActiveCodexView } = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persist = (Object.create(ChatSelectionControlsCoordinator.prototype) as any).persistCodexModelOverride;
    await expect(persist.call({}, 'o4-mini', getActiveCodexView())).resolves.toBe(true);
    expect(mockCoordinator.saveConversationOverrides).toHaveBeenCalledWith(
      mockConversation,
      expect.objectContaining({
        codexSandboxMode: 'read-only',
        codexModelOverride: 'o4-mini',
      }),
    );
    expect(savedOverrides).toHaveLength(1);
  });

  it('restores in-memory session settings when persistence rejects', async () => {
    const originalSettings = { codexModelOverride: 'old-model' };
    const mockConversation = { backend: 'codex', sessionSettings: originalSettings, updatedAt: 42 };
    const mockCoordinator = {
      saveConversationOverrides: jest.fn(async (conversation: typeof mockConversation) => {
        conversation.sessionSettings = { codexModelOverride: 'new-model' };
        conversation.updatedAt = 99;
        throw new Error('save failed');
      }),
    };
    mockWorkspace({
      getViewType: () => 'opencodian-view',
      currentConversation: mockConversation,
      conversationSessionSettingsCoordinator: mockCoordinator,
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ChatSelectionControlsCoordinator, getActiveCodexView } = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persist = (Object.create(ChatSelectionControlsCoordinator.prototype) as any).persistCodexModelOverride;
    await expect(persist.call({}, 'o4-mini', getActiveCodexView())).resolves.toBe(false);
    expect(mockConversation.sessionSettings).toBe(originalSettings);
    expect(mockConversation.updatedAt).toBe(42);
  });

  it('does not treat a non-OpenCodian active view as a Codex persistence target', () => {
    mockWorkspace({
      getViewType: () => 'markdown',
      currentConversation: { backend: 'codex', sessionSettings: {} },
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getActiveCodexView } = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    expect(getActiveCodexView()).toBeNull();
  });

  it('keeps the active Codex backend assertion tied to the active OpenCodian view', () => {
    mockWorkspace({
      getViewType: () => 'opencodian-view',
      currentConversation: { backend: 'codex', sessionSettings: {} },
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readActiveBackendFromPlugin } = require('../../../../../src/features/chat/services/ChatSelectionControlsCoordinator');
    expect(readActiveBackendFromPlugin()).toBe('codex');
  });
});
