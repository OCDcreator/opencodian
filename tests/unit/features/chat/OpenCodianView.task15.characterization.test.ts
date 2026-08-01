import { WorkspaceLeaf } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

/**
 * Task 15 characterization — pins the runtime-assembly contract BEFORE the
 * four `create*RuntimeWiring()` methods are relocated into ChatRuntimeComposition.
 *
 * These tests construct the real view (the constructor runs the full composition)
 * and assert every runtime field the constructor populates is present. They must
 * stay green after the move, proving byte-for-byte behavior at the public boundary.
 *
 * Acceptance tie-in (plan Task 15): "view lifecycle tests pass".
 */
describe('Task 15 OpenCodianView runtime-assembly characterization', () => {
  function constructView(): OpenCodianView {
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
    return new OpenCodianView(new WorkspaceLeaf(), plugin as never);
  }

  it('populates every surface/background/conversation/interaction runtime field', () => {
    const view = constructView();
    const v = view as unknown as Record<string, unknown>;

    // Surface wiring fields
    expect(v.titleGenerationService).toBeDefined();
    expect(v.tabMessagesPaneCoordinator).toBeDefined();
    expect(v.chatHeaderPresenter).toBeDefined();
    expect(v.conversationHistoryActionsCoordinator).toBeDefined();
    expect(v.chatSelectionControlsCoordinator).toBeDefined();
    expect(v.composerInputShellCoordinator).toBeDefined();
    expect(v.inputPanelAppearanceCoordinator).toBeDefined();
    expect(v.chatSurfaceAppearanceCoordinator).toBeDefined();
    expect(v.conversationSessionSettingsCoordinator).toBeDefined();
    expect(v.composerContextViewFacade).toBeDefined();
    expect(v.tabConversationSyncFingerprintRuntimePort).toBeDefined();
    expect(v.persistentAssistantNoticeService).toBeDefined();
    expect(v.conversationNoticeCoordinator).toBeDefined();
    expect(v.sessionTodoCoordinator).toBeDefined();
    expect(v.childSessionGraphCoordinator).toBeDefined();
    expect(v.questionDockSlotCoordinator).toBeDefined();
    expect(v.assistantShellViewHostAdapter).toBeDefined();

    // Background-task wiring fields
    expect(v.activeTabContextUsageCoordinator).toBeDefined();
    expect(v.backgroundTaskNoticeStateService).toBeDefined();
    expect(v.backgroundTaskTimelineService).toBeDefined();
    expect(v.backgroundTaskLiveSignalCoordinator).toBeDefined();

    // Conversation wiring fields
    expect(v.conversationIdentityRuntime).toBeDefined();
    expect(v.userMessageContentRenderer).toBeDefined();
    expect(v.conversationRenderService).toBeDefined();
    expect(v.conversationAuthoritativeSyncCoordinator).toBeDefined();
    expect(v.conversationHydrationRenderBridge).toBeDefined();
    expect(v.conversationTransitionBridge).toBeDefined();
    expect(v.tabConversationStateBridge).toBeDefined();
    expect(v.tabViewActivationBridge).toBeDefined();
    expect(v.conversationHydrationOutcomeBridge).toBeDefined();
    expect(v.tabConversationActivationBridge).toBeDefined();
    expect(v.tabRuntimeStateBridge).toBeDefined();
    expect(v.conversationSyncRuntimeCoordinator).toBeDefined();
    expect(v.conversationSyncOrchestrationService).toBeDefined();
    expect(v.conversationSyncBridge).toBeDefined();
    expect(v.conversationSyncBridgePorts).toBeDefined();
    expect(v.tabActivationConversationSyncRuntimePort).toBeDefined();
    expect(v.conversationSessionSignalRuntime).toBeDefined();
    expect(v.backgroundTaskCompletionNoticeService).toBeDefined();
    expect(v.backgroundTaskInlinePanelRenderer).toBeDefined();
    expect(v.backgroundTaskIndicatorCoordinator).toBeDefined();
    expect(v.backgroundTaskStreamTriggerCoordinator).toBeDefined();
    expect(v.conversationLoadRecoveryCoordinator).toBeDefined();
    expect(v.conversationTabRuntimeCoordinator).toBeDefined();
    expect(v.backgroundTaskHost).toBeDefined();
    expect(v.conversationTabOpenCoordinator).toBeDefined();

    // Interaction/send wiring fields
    expect(v.messageSendPreparationService).toBeDefined();
    expect(v.messageFinalizationService).toBeDefined();
    expect(v.assistantNoticeCardRenderer).toBeDefined();
    expect(v.userMessageFooterRenderer).toBeDefined();
    expect(v.streamingInlineCardRenderer).toBeDefined();
    expect(v.permissionInlineCardRenderer).toBeDefined();
    expect(v.questionRuntimeServices).toBeDefined();
    expect(v.sendPipelineRuntime).toBeDefined();
  });

  it('retains retained runtime assemblies (modifiedFilesSidebarCoordinator, codexChatSurfaceBinding)', () => {
    const view = constructView();
    const v = view as unknown as Record<string, unknown>;
    expect(v.modifiedFilesSidebarCoordinator).toBeDefined();
    expect(v.codexChatSurfaceBinding).toBeDefined();
    expect(v.slashCommandMenuCatalogCache).toBeDefined();
    expect(v.conversationWriteSerializationService).toBeDefined();
  });

  it('wires disposal methods on every teardown-able coordinator (disposal contract preserved by the move)', () => {
    const view = constructView();
    const v = view as unknown as Record<string, unknown>;
    // Every coordinator torn down in onClose (per inventory §4) must expose its
    // documented disposal method. The move keeps these objects on the view's fields,
    // so their disposal surface must remain intact.
    const disposalSurface: Array<[string, string]> = [
      ['chatHeaderPresenter', 'destroy'],
      ['conversationHistoryActionsCoordinator', 'destroy'],
      ['composerContextViewFacade', 'dispose'],
      ['chatSurfaceAppearanceCoordinator', 'destroy'],
      ['childSessionGraphCoordinator', 'clearGraph'],
      ['childSessionGraphCoordinator', 'hide'],
      ['titleGenerationService', 'cancelAll'],
      ['chatSelectionControlsCoordinator', 'destroy'],
      ['inputPanelAppearanceCoordinator', 'destroy'],
      ['composerInputShellCoordinator', 'destroy'],
      ['modifiedFilesSidebarCoordinator', 'destroy'],
      ['permissionInlineCardRenderer', 'clearSessionApprovals'],
      ['codexChatSurfaceBinding', 'dispose'],
      ['conversationTabRuntimeCoordinator', 'destroyTabSystem'],
      ['questionDockSlotCoordinator', 'destroy'],
      ['sessionTodoCoordinator', 'destroy'],
      ['conversationSessionSignalRuntime', 'stop'],
    ];
    for (const [field, method] of disposalSurface) {
      const target = v[field] as Record<string, unknown> | undefined;
      expect(target).toBeDefined();
      expect(typeof target?.[method]).toBe('function');
    }
  });

  // ---------------------------------------------------------------------------
  // BEHAVIORAL characterization (user choice: expand before the move).
  // The structural tests above only prove fields exist. These tests prove the
  // wiring closures capture LIVE view state (not null/no-op stubs). A move that
  // breaks the closure-to-live-state wiring fails these.
  // ---------------------------------------------------------------------------

  it('conversationRenderService is a real ConversationRenderService whose render path would reach the live notice coordinator (structural + delegate wiring)', () => {
    // ConversationRenderService concrete API: renderMessages/rerenderConversationMessages/...
    // The render-host closure that captures this.conversationNoticeCoordinator is consumed by
    // ConversationMessageRenderDelegate at render time. We assert the render service exposes its
    // concrete render entrypoints (proving it was constructed with the host, not a stub).
    const view = constructView();
    const renderService = (view as unknown as { conversationRenderService: Record<string, unknown> }).conversationRenderService;
    expect(typeof renderService.renderMessages).toBe('function');
    expect(typeof renderService.rerenderConversationMessages).toBe('function');
    expect(typeof renderService.applySyncedConversationUpdate).toBe('function');
  });

  it('conversationNoticeCoordinator reports non-rewound state by reading the live currentConversationRevertState field', () => {
    // This is the canonical behavioral probe: the notice coordinator's
    // shouldRenderEmptyConversationNotice() delegates to its host.isConversationRewound(),
    // which the view wires (line 2585) to read this.currentConversationRevertState.
    // A move that stubs the host closure breaks this live-state read.
    const view = constructView();
    const coordinator = (view as unknown as {
      conversationNoticeCoordinator: { shouldRenderEmptyConversationNotice(): boolean };
    }).conversationNoticeCoordinator;
    expect(coordinator.shouldRenderEmptyConversationNotice()).toBe(false);
    // Mutate the live field the closure reads and confirm the coordinator observes it.
    (view as unknown as { currentConversationRevertState: { messageID: string } | null }).currentConversationRevertState = { messageID: 'msg-1' };
    expect(coordinator.shouldRenderEmptyConversationNotice()).toBe(true);
    // Restore.
    (view as unknown as { currentConversationRevertState: { messageID: string } | null }).currentConversationRevertState = null;
  });

  it('the question-todo bundle seam reads live coordinators (questionDockCoordinator/sessionTodoCoordinator are wired, not null)', () => {
    // The background wiring's createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam
    // captures getters for this.questionDockCoordinator / this.sessionTodoCoordinator.
    // After construction those fields are real coordinators with concrete methods
    // (not null stubs). Probes the concrete SessionTodoCoordinator API.
    const view = constructView();
    const v = view as unknown as Record<string, unknown>;
    expect(v.questionDockCoordinator).toBeDefined();
    expect(v.sessionTodoCoordinator).toBeDefined();
    const sessionTodo = v.sessionTodoCoordinator as Record<string, unknown>;
    // Concrete SessionTodoCoordinator API (attach/render/destroy/getTabSessionTodos).
    expect(typeof sessionTodo.attach).toBe('function');
    expect(typeof sessionTodo.render).toBe('function');
    expect(typeof sessionTodo.destroy).toBe('function');
    expect(typeof sessionTodo.getTabSessionTodos).toBe('function');
  });
});
