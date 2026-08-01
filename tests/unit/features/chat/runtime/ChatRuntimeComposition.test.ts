import { WorkspaceLeaf } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../../src/core/types';
import { OpenCodianView } from '../../../../../src/features/chat/OpenCodianView';

jest.mock('../../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

/**
 * ChatRuntimeComposition owner tests (plan Task 15 §768 requires this file).
 *
 * These exercise the composition owner indirectly through the real view (the owner is
 * constructed inside the view's constructor). They pin two invariants the codex/terra
 * round-1 review flagged as under-tested:
 *  1. `shouldUseAboveInputQuestionDock` reads the real `questionCardPosition` setting
 *     (a mutation to a wrong constant must fail a test).
 *  2. `tabRuntimeViewSource` is wired (assembleConversationTabRuntime receives the narrow
 *     TabRuntimeViewSource, not the full view) — the view must construct successfully and
 *     expose tab-runtime state reads through the coordinator.
 */
describe('ChatRuntimeComposition owner', () => {
  function constructView(questionCardPosition: 'above_input' | 'below_input' = 'below_input'): OpenCodianView {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode'],
        activeBackend: 'opencode',
        questionCardPosition,
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

  it('composes without throwing and populates the send pipeline (interaction phase wired)', () => {
    const view = constructView();
    const v = view as unknown as Record<string, unknown>;
    // sendPipelineRuntime is the terminal artifact of compose(); its presence proves the
    // full surface→identity→render→background→conversation→interaction chain completed.
    expect(v.sendPipelineRuntime).toBeDefined();
    expect(typeof (v.sendPipelineRuntime as { sendMessage: unknown }).sendMessage).toBe('function');
  });

  it('reads the real questionCardPosition setting into the question dock slot coordinator (mutation guard)', () => {
    // shouldUseAboveInputQuestionDock must reflect the actual setting, not a hardcoded constant.
    const viewAbove = constructView('above_input');
    const viewBelow = constructView('below_input');
    const slotAbove = (viewAbove as unknown as { questionDockSlotCoordinator: { host: { shouldUseAboveInputQuestionDock(): boolean } } }).questionDockSlotCoordinator;
    const slotBelow = (viewBelow as unknown as { questionDockSlotCoordinator: { host: { shouldUseAboveInputQuestionDock(): boolean } } }).questionDockSlotCoordinator;
    expect(slotAbove.host.shouldUseAboveInputQuestionDock()).toBe(true);
    expect(slotBelow.host.shouldUseAboveInputQuestionDock()).toBe(false);
  });

  it('wires tabRuntimeViewSource so the conversation tab runtime coordinator can read tab state (mutation guard)', () => {
    // If assembleConversationTabRuntime received the full view or an undefined port, the
    // coordinator's getActiveTabId/getRuntimeState would throw. Construction success + a
    // tab-state read through the coordinator proves the narrow TabRuntimeViewSource is wired.
    const view = constructView();
    const coordinator = (view as unknown as {
      conversationTabRuntimeCoordinator: { getActiveTabId(): string | null };
    }).conversationTabRuntimeCoordinator;
    // No tabs opened → null, but the call must not throw (proves paneCoordinator/view port wired).
    expect(coordinator.getActiveTabId()).toBeNull();
  });

  it('does not expose a showQuestionDialog method on the view (the owner inlines it via questionRuntimeServices)', () => {
    // Regression guard for codex/terra round-1 Critical #2: the owner must NOT forward to a
    // nonexistent host.showQuestionDialog. The view has no such method.
    const view = constructView();
    expect((view as unknown as { showQuestionDialog?: unknown }).showQuestionDialog).toBeUndefined();
  });
});
