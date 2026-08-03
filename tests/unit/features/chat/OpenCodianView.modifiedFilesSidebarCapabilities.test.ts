import { WorkspaceLeaf } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import type { AgentBackendKind } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

// eslint-disable-next-line max-lines-per-function -- sidebar lifecycle scenarios share one restored-spy OpenCodianView harness.
describe('OpenCodianView modified-files capability hydration', () => {
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
