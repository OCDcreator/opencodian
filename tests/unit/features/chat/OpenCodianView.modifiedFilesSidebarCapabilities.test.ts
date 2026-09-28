import { WorkspaceLeaf } from 'obsidian';

import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import type { AgentBackendKind } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

// eslint-disable-next-line max-lines-per-function -- sidebar lifecycle scenarios share one restored-spy OpenCodianView harness.
describe('OpenCodianView modified-files capability hydration', () => {
  it('refreshes sidebar identity through the real tab activation writeback', () => {
    const plugin = {
      settings: { ...DEFAULT_SETTINGS }, openCodeService: {}, storage: {},
      claudeCodePermissionHostContext: null, codexApprovalHostContext: null,
      unregisterConversationCachePinProvider: () => {}, registerConversationCachePinProvider: () => ({}),
      app: { vault: { offref: () => {}, read: async () => '' }, workspace: { on: () => ({}), off: () => {} } },
    };
    const view = new OpenCodianView(new WorkspaceLeaf(), plugin as never);
    const runtime = view as unknown as {
      createTabActivationRuntimeHostProviderHost(): { setCurrentConversation(conversation: unknown): void };
      refreshModifiedFilesSidebar(): void;
    };
    const refresh = jest.spyOn(runtime, 'refreshModifiedFilesSidebar').mockImplementation();
    runtime.createTabActivationRuntimeHostProviderHost().setCurrentConversation({
      id: 'new-tab-conversation', backend: 'opencode2', backendSessionId: 'new-tab-session', messages: [],
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    refresh.mockRestore();
  });
  it('routes OpenCode 2 sidebar reads to its native session diff', async () => {
    const getSessionDiff = jest.fn().mockResolvedValue([{ file: 'native.md', additions: 2, deletions: 1 }]);
    const plugin = {
      settings: { ...DEFAULT_SETTINGS, enabledBackends: ['opencode2'], activeBackend: 'opencode2' },
      agentServiceRegistry: {
        get: (kind: string) => kind === 'opencode2'
          ? { capabilities: new Set([AgentCapability.Context]), getSessionDiff } : undefined,
      },
      openCodeService: { getCachedSessionDiffEntries: jest.fn() },
      storage: {},
      claudeCodePermissionHostContext: null,
      codexApprovalHostContext: null,
      unregisterConversationCachePinProvider: () => {},
      registerConversationCachePinProvider: () => ({}),
      app: { vault: { offref: () => {}, read: async () => '' }, workspace: { on: () => ({}), off: () => {} } },
    };
    const view = new OpenCodianView(new WorkspaceLeaf(), plugin as never);
    const runtime = view as unknown as {
      currentConversation: { id: string; backend: string; backendSessionId: string; messages: [] } | null;
      modifiedFilesSidebarCoordinator: {
        setVisible: jest.Mock;
        refresh: jest.Mock;
        refreshRevertState: jest.Mock;
      };
      refreshModifiedFilesSidebar(): void;
    };
    runtime.currentConversation = { id: 'conversation-2', backend: 'opencode2', backendSessionId: 'native-2', messages: [] };
    runtime.modifiedFilesSidebarCoordinator.setVisible = jest.fn();
    runtime.modifiedFilesSidebarCoordinator.refresh = jest.fn();
    runtime.modifiedFilesSidebarCoordinator.refreshRevertState = jest.fn();

    runtime.refreshModifiedFilesSidebar();
    const [sessionId, read, availability] = runtime.modifiedFilesSidebarCoordinator.refresh.mock.calls[0] as [
      string, (id: string) => Promise<unknown>, string,
    ];
    expect(sessionId).toBe('native-2');
    expect(availability).toBe('ready');
    expect(await read(sessionId)).toEqual([{ file: 'native.md', additions: 2, deletions: 1 }]);
    expect(getSessionDiff).toHaveBeenCalledWith('native-2');
    expect(plugin.openCodeService.getCachedSessionDiffEntries).not.toHaveBeenCalled();
  });

  it('refreshes stale sidebar state after creating a conversation in a new tab', async () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode'],
        activeBackend: 'opencode',
      },
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
    const view = new OpenCodianView(new WorkspaceLeaf(), plugin as never);
    const runtime = view as unknown as {
      createNewConversation(): Promise<void>;
      conversationLoadRecoveryCoordinator: { createConversationInNewTab(): Promise<void> };
      currentConversation: { id: string; openCodeSessionId?: string } | null;
      refreshModifiedFilesSidebar(): void;
    };
    runtime.currentConversation = { id: 'old-conversation', openCodeSessionId: 'old-session' };
    const createSpy = jest.spyOn(
      runtime.conversationLoadRecoveryCoordinator,
      'createConversationInNewTab',
    ).mockImplementation(async () => {
      runtime.currentConversation = { id: 'new-conversation', openCodeSessionId: 'new-session' };
    });
    let sidebarState = 'changed-old-session';
    const refreshSpy = jest.spyOn(runtime, 'refreshModifiedFilesSidebar')
      .mockImplementation(() => { sidebarState = 'reevaluated-new-session'; });

    try {
      await runtime.createNewConversation();

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(sidebarState).toBe('reevaluated-new-session');
    } finally {
      refreshSpy.mockRestore();
      createSpy.mockRestore();
    }
  });

  it('does not refresh when conversation creation returns without changing sidebar identity', async () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode'],
        activeBackend: 'opencode',
      },
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
    const view = new OpenCodianView(new WorkspaceLeaf(), plugin as never);
    const runtime = view as unknown as {
      createNewConversation(): Promise<void>;
      createConversationInCurrentTab(): Promise<void>;
      conversationLoadRecoveryCoordinator: {
        createConversationInNewTab(): Promise<void>;
        createConversationInCurrentTab(): Promise<void>;
      };
      currentConversation: { id: string; openCodeSessionId?: string } | null;
      refreshModifiedFilesSidebar(): void;
    };
    runtime.currentConversation = { id: 'same-conversation', openCodeSessionId: 'same-session' };
    const createNewTabSpy = jest.spyOn(
      runtime.conversationLoadRecoveryCoordinator,
      'createConversationInNewTab',
    ).mockResolvedValue(undefined);
    const createCurrentTabSpy = jest.spyOn(
      runtime.conversationLoadRecoveryCoordinator,
      'createConversationInCurrentTab',
    ).mockResolvedValue(undefined);
    const refreshSpy = jest.spyOn(runtime, 'refreshModifiedFilesSidebar').mockImplementation();

    try {
      await runtime.createNewConversation();
      await runtime.createConversationInCurrentTab();

      expect(createNewTabSpy).toHaveBeenCalledTimes(1);
      expect(createCurrentTabSpy).toHaveBeenCalledTimes(1);
      expect(refreshSpy).not.toHaveBeenCalled();
    } finally {
      refreshSpy.mockRestore();
      createCurrentTabSpy.mockRestore();
      createNewTabSpy.mockRestore();
    }
  });

  it('refreshes the sidebar after the first tab restore completes', async () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode'],
        activeBackend: 'opencode',
      },
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
    const view = new OpenCodianView(new WorkspaceLeaf(), plugin as never);
    const runtime = view as unknown as {
      initializeFirstTab(): Promise<void>;
      conversationTabRuntimeCoordinator: { initializeFirstTab(): Promise<void> };
      refreshModifiedFilesSidebar(): void;
    };
    const initializeSpy = jest.spyOn(
      runtime.conversationTabRuntimeCoordinator,
      'initializeFirstTab',
    ).mockResolvedValue(undefined);
    const refreshSpy = jest.spyOn(runtime, 'refreshModifiedFilesSidebar').mockImplementation();

    try {
      await runtime.initializeFirstTab();

      expect(initializeSpy).toHaveBeenCalledTimes(1);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    } finally {
      refreshSpy.mockRestore();
      initializeSpy.mockRestore();
    }
  });

  it('refreshes the sidebar after creating a conversation in the current tab', async () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode'],
        activeBackend: 'opencode',
      },
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
    const view = new OpenCodianView(new WorkspaceLeaf(), plugin as never);
    const runtime = view as unknown as {
      conversationLoadRecoveryCoordinator: { createConversationInCurrentTab(): Promise<void> };
      currentConversation: { id: string; openCodeSessionId?: string } | null;
      refreshModifiedFilesSidebar(): void;
    };
    runtime.currentConversation = { id: 'old-conversation', openCodeSessionId: 'old-session' };
    const createSpy = jest.spyOn(
      runtime.conversationLoadRecoveryCoordinator,
      'createConversationInCurrentTab',
    ).mockImplementation(async () => {
      runtime.currentConversation = { id: 'new-conversation', openCodeSessionId: 'new-session' };
    });
    const refreshSpy = jest.spyOn(runtime, 'refreshModifiedFilesSidebar').mockImplementation();

    try {
      await view.createConversationInCurrentTab();

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    } finally {
      refreshSpy.mockRestore();
      createSpy.mockRestore();
    }
  });

  it('refreshes the sidebar only when the active backend capabilities change', () => {
    let capabilitiesListener: ((backend: AgentBackendKind) => void) | undefined;
    const registry = {
      getActiveKind: jest.fn<AgentBackendKind | null, []>(() => 'opencode'),
      onActiveChange: jest.fn(() => ({ dispose: jest.fn() })),
      onCapabilitiesChange: jest.fn((listener: (backend: AgentBackendKind) => void) => {
        capabilitiesListener = listener;
        return { dispose: jest.fn() };
      }),
    };
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode'],
        activeBackend: 'opencode',
      },
      agentServiceRegistry: registry,
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
    const view = new OpenCodianView(new WorkspaceLeaf(), plugin as never);
    const runtime = view as unknown as {
      wireBackendSurfaceSwitch(): void;
      refreshModifiedFilesSidebar(): void;
      refreshComposerToolbarForActiveBackend(): void;
      activeTabContextUsageCoordinator: { syncIdentity(): void };
      codexChatSurfaceBinding: { syncSkillsChangedSubscription(): void };
    };
    const refreshSpy = jest.spyOn(runtime, 'refreshModifiedFilesSidebar').mockImplementation();
    const toolbarSpy = jest.spyOn(
      runtime,
      'refreshComposerToolbarForActiveBackend',
    ).mockImplementation();
    const contextSpy = jest.spyOn(
      runtime.activeTabContextUsageCoordinator,
      'syncIdentity',
    ).mockImplementation();
    const skillsSpy = jest.spyOn(
      runtime.codexChatSurfaceBinding,
      'syncSkillsChangedSubscription',
    ).mockImplementation();

    try {
      runtime.wireBackendSurfaceSwitch();
      expect(capabilitiesListener).toBeDefined();

      capabilitiesListener?.('codex');
      expect(refreshSpy).not.toHaveBeenCalled();

      capabilitiesListener?.('opencode');
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    } finally {
      skillsSpy.mockRestore();
      contextSpy.mockRestore();
      toolbarSpy.mockRestore();
      refreshSpy.mockRestore();
    }
  });
});
