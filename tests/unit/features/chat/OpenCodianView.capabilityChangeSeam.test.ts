import { WorkspaceLeaf } from 'obsidian';

import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import type { AgentBackendKind } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

type CapabilityListener = (backend: AgentBackendKind) => void;

interface RegistryMock {
  getActiveKind: jest.Mock<AgentBackendKind | null, []>;
  get: jest.Mock;
  onActiveChange: jest.Mock;
  onCapabilitiesChange: jest.Mock;
}

function createPlugin(registry?: RegistryMock) {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode'],
      activeBackend: 'opencode',
    },
    ...(registry ? { agentServiceRegistry: registry } : {}),
    openCodeService: {},
    storage: {},
    claudeCodePermissionHostContext: null,
    codexApprovalHostContext: null,
    unregisterConversationCachePinProvider: () => {},
    registerConversationCachePinProvider: () => ({}),
    app: {
      vault: { offref: () => {}, read: async () => '' },
      workspace: { on: () => ({}), off: () => {} },
    },
  };
}

function createRegistry(capabilities: Set<AgentCapability>): {
  registry: RegistryMock;
  capabilitiesListener: () => CapabilityListener | undefined;
} {
  let listener: CapabilityListener | undefined;
  const registry: RegistryMock = {
    getActiveKind: jest.fn<AgentBackendKind | null, []>(() => 'opencode'),
    get: jest.fn((kind: string) => (kind === 'opencode' ? { capabilities } : undefined)),
    onActiveChange: jest.fn(() => ({ dispose: jest.fn() })),
    onCapabilitiesChange: jest.fn((cb: CapabilityListener) => {
      listener = cb;
      return { dispose: jest.fn() };
    }),
  };
  return { registry, capabilitiesListener: () => listener };
}

interface ViewRuntime {
  wireBackendSurfaceSwitch(): void;
  refreshComposerToolbarForActiveBackend(): void;
  refreshModifiedFilesSidebar(): void;
  refreshQueuedFollowUpBar(): void;
  activeTabContextUsageCoordinator: { syncIdentity(): void };
  codexChatSurfaceBinding: { syncSkillsChangedSubscription(): void };
  currentConversation: { id: string; backend: string; backendSessionId: string; messages: [] } | null;
  contextRing: { destroy(): void } | null;
  contextRingContainerEl: unknown;
  composerInputShellCoordinator: { refreshToolbarControls(): void };
  chatSelectionControlsCoordinator: { destroy(): void };
  backendCapabilityChangeDisposable: { dispose(): void } | null;
  backendActiveChangeDisposable: { dispose(): void } | null;
}

// eslint-disable-next-line max-lines-per-function -- seam scenarios share one harness; each case is a focused assertion block.
describe('OpenCodianView capability-change seam (A3)', () => {
  it('rebuilds capability-gated composer UI when a relevant capability disappears mid-mount', () => {
    const capabilities = new Set<AgentCapability>([
      AgentCapability.Context,
      AgentCapability.TurnSteering,
      AgentCapability.Models,
      AgentCapability.Permissions,
      AgentCapability.Subagents,
      AgentCapability.Thinking,
    ]);
    const { registry, capabilitiesListener } = createRegistry(capabilities);
    const view = new OpenCodianView(new WorkspaceLeaf(), createPlugin(registry) as never);
    const runtime = view as unknown as ViewRuntime;
    runtime.currentConversation = {
      id: 'conv-1', backend: 'opencode', backendSessionId: 'session-1', messages: [],
    };
    const toolbarSpy = jest.spyOn(runtime, 'refreshComposerToolbarForActiveBackend').mockImplementation();
    const sidebarSpy = jest.spyOn(runtime, 'refreshModifiedFilesSidebar').mockImplementation();
    const queueBarSpy = jest.spyOn(runtime, 'refreshQueuedFollowUpBar').mockImplementation();
    const contextSpy = jest.spyOn(runtime.activeTabContextUsageCoordinator, 'syncIdentity').mockImplementation();
    const skillsSpy = jest.spyOn(runtime.codexChatSurfaceBinding, 'syncSkillsChangedSubscription').mockImplementation();

    try {
      runtime.wireBackendSurfaceSwitch();
      const listener = capabilitiesListener();
      expect(listener).toBeDefined();

      // Codex drops AgentCapability.Context when falling back from app-server
      // to SDK: the ContextRing teardown + toolbar remount must run again.
      capabilities.delete(AgentCapability.Context);
      listener?.('opencode');
      expect(toolbarSpy).toHaveBeenCalledTimes(1);
      expect(queueBarSpy).toHaveBeenCalledTimes(1);
      expect(sidebarSpy).toHaveBeenCalledTimes(1);
      expect(contextSpy).toHaveBeenCalledTimes(1);
      expect(skillsSpy).toHaveBeenCalledTimes(1);

      // Context reappears (app-server negotiation succeeded): re-mount again.
      capabilities.add(AgentCapability.Context);
      listener?.('opencode');
      expect(toolbarSpy).toHaveBeenCalledTimes(2);
      expect(queueBarSpy).toHaveBeenCalledTimes(2);
    } finally {
      skillsSpy.mockRestore();
      contextSpy.mockRestore();
      queueBarSpy.mockRestore();
      sidebarSpy.mockRestore();
      toolbarSpy.mockRestore();
    }
  });

  it('no-ops when the relevant capability set is unchanged (no toolbar churn)', () => {
    const capabilities = new Set<AgentCapability>([
      AgentCapability.Context,
      AgentCapability.Models,
      AgentCapability.Permissions,
      AgentCapability.Subagents,
      AgentCapability.Thinking,
    ]);
    const { registry, capabilitiesListener } = createRegistry(capabilities);
    const view = new OpenCodianView(new WorkspaceLeaf(), createPlugin(registry) as never);
    const runtime = view as unknown as ViewRuntime;
    runtime.currentConversation = {
      id: 'conv-1', backend: 'opencode', backendSessionId: 'session-1', messages: [],
    };
    const toolbarSpy = jest.spyOn(runtime, 'refreshComposerToolbarForActiveBackend').mockImplementation();
    const queueBarSpy = jest.spyOn(runtime, 'refreshQueuedFollowUpBar').mockImplementation();
    const sidebarSpy = jest.spyOn(runtime, 'refreshModifiedFilesSidebar').mockImplementation();

    try {
      runtime.wireBackendSurfaceSwitch();
      const listener = capabilitiesListener();

      listener?.('opencode');
      expect(toolbarSpy).toHaveBeenCalledTimes(1);

      // Adapter re-fires onCapabilitiesChange without an actual capability
      // delta: identical outcome, so the composer must not rebuild again.
      listener?.('opencode');
      expect(toolbarSpy).toHaveBeenCalledTimes(1);
      expect(queueBarSpy).toHaveBeenCalledTimes(1);
      expect(sidebarSpy).toHaveBeenCalledTimes(1);
    } finally {
      sidebarSpy.mockRestore();
      queueBarSpy.mockRestore();
      toolbarSpy.mockRestore();
    }
  });

  it('ignores changes to capabilities the composer refresh path does not re-evaluate', () => {
    const capabilities = new Set<AgentCapability>([
      AgentCapability.Context,
      AgentCapability.Models,
      AgentCapability.Permissions,
      AgentCapability.Subagents,
      AgentCapability.Thinking,
      AgentCapability.Todos,
      AgentCapability.Compaction,
    ]);
    const { registry, capabilitiesListener } = createRegistry(capabilities);
    const view = new OpenCodianView(new WorkspaceLeaf(), createPlugin(registry) as never);
    const runtime = view as unknown as ViewRuntime;
    runtime.currentConversation = {
      id: 'conv-1', backend: 'opencode', backendSessionId: 'session-1', messages: [],
    };
    const toolbarSpy = jest.spyOn(runtime, 'refreshComposerToolbarForActiveBackend').mockImplementation();
    const queueBarSpy = jest.spyOn(runtime, 'refreshQueuedFollowUpBar').mockImplementation();
    const sidebarSpy = jest.spyOn(runtime, 'refreshModifiedFilesSidebar').mockImplementation();

    try {
      runtime.wireBackendSurfaceSwitch();
      const listener = capabilitiesListener();

      listener?.('opencode');
      expect(toolbarSpy).toHaveBeenCalledTimes(1);

      // Todos/Questions/Compaction gates are read lazily by their own owners
      // (docks at shell build, session settings modal, message footer) — the
      // capability-change refresh path does not re-evaluate them, so a delta
      // confined to those capabilities must not rebuild the composer.
      capabilities.delete(AgentCapability.Todos);
      capabilities.delete(AgentCapability.Compaction);
      listener?.('opencode');
      expect(toolbarSpy).toHaveBeenCalledTimes(1);
      expect(queueBarSpy).toHaveBeenCalledTimes(1);
      expect(sidebarSpy).toHaveBeenCalledTimes(1);
    } finally {
      sidebarSpy.mockRestore();
      queueBarSpy.mockRestore();
      toolbarSpy.mockRestore();
    }
  });

  it('refreshes the queued follow-up bar when only TurnSteering changes', () => {
    const capabilities = new Set<AgentCapability>([
      AgentCapability.Context,
      AgentCapability.Models,
      AgentCapability.Permissions,
      AgentCapability.Subagents,
      AgentCapability.Thinking,
    ]);
    const { registry, capabilitiesListener } = createRegistry(capabilities);
    const view = new OpenCodianView(new WorkspaceLeaf(), createPlugin(registry) as never);
    const runtime = view as unknown as ViewRuntime;
    runtime.currentConversation = {
      id: 'conv-1', backend: 'opencode', backendSessionId: 'session-1', messages: [],
    };
    const toolbarSpy = jest.spyOn(runtime, 'refreshComposerToolbarForActiveBackend').mockImplementation();
    const queueBarSpy = jest.spyOn(runtime, 'refreshQueuedFollowUpBar').mockImplementation();
    const sidebarSpy = jest.spyOn(runtime, 'refreshModifiedFilesSidebar').mockImplementation();

    try {
      runtime.wireBackendSurfaceSwitch();
      const listener = capabilitiesListener();

      listener?.('opencode');
      expect(queueBarSpy).toHaveBeenCalledTimes(1);

      // Codex starts declaring TurnSteering once its app-server path is
      // active: the visible queue bar must re-render its steer affordance.
      capabilities.add(AgentCapability.TurnSteering);
      listener?.('opencode');
      expect(toolbarSpy).toHaveBeenCalledTimes(2);
      expect(queueBarSpy).toHaveBeenCalledTimes(2);
      expect(sidebarSpy).toHaveBeenCalledTimes(2);
    } finally {
      sidebarSpy.mockRestore();
      queueBarSpy.mockRestore();
      toolbarSpy.mockRestore();
    }
  });

  it('keeps wiring inert when no agent service registry is present', () => {
    const view = new OpenCodianView(new WorkspaceLeaf(), createPlugin() as never);
    const runtime = view as unknown as ViewRuntime;

    expect(() => runtime.wireBackendSurfaceSwitch()).not.toThrow();
    expect(runtime.backendCapabilityChangeDisposable).toBeNull();
    expect(runtime.backendActiveChangeDisposable).toBeNull();
  });

  it('refreshComposerToolbarForActiveBackend tears down the ContextRing before the remount', () => {
    const view = new OpenCodianView(new WorkspaceLeaf(), createPlugin() as never);
    const runtime = view as unknown as ViewRuntime;
    const ringDestroy = jest.fn();
    runtime.contextRing = { destroy: ringDestroy };
    runtime.contextRingContainerEl = {};
    const refreshControlsSpy = jest
      .spyOn(runtime.composerInputShellCoordinator, 'refreshToolbarControls')
      .mockImplementation();
    const selectionDestroySpy = jest
      .spyOn(runtime.chatSelectionControlsCoordinator, 'destroy')
      .mockImplementation();

    try {
      runtime.refreshComposerToolbarForActiveBackend();

      expect(ringDestroy).toHaveBeenCalledTimes(1);
      expect(runtime.contextRing).toBeNull();
      expect(runtime.contextRingContainerEl).toBeNull();
      expect(selectionDestroySpy).toHaveBeenCalledTimes(1);
      expect(refreshControlsSpy).toHaveBeenCalledTimes(1);
    } finally {
      selectionDestroySpy.mockRestore();
      refreshControlsSpy.mockRestore();
    }
  });
});
