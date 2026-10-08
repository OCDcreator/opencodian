import { WorkspaceLeaf } from 'obsidian';

import { type Conversation, DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

jest.mock('../../../../src/core/opencode', () => ({
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

  it.each(['codex', 'claude-code'] as const)('refreshes the visible settled %s footer after native identity without replacing the message body', (backend) => {
    const view = constructView();
    const v = view as unknown as {
      currentConversation: Conversation;
      messagesContainer: HTMLElement;
      getActiveTabId(): string;
      addUserMessageFooter(element: HTMLElement, message: unknown, copy: string): void;
      sendPipelineRuntime: { host: { onTurnSettled(info: { backend: string; conversationId: string; sessionId: string; tabId: string }): void } };
    };
    v.currentConversation = { id: 'cx-owned', title: 'owned', backend, backendSessionId: 'native-thread', createdAt: 1, updatedAt: 1,
      messages: [{ id: 'local-user', role: 'user', content: 'owned', timestamp: 1, sourceMessageId: 'native-user', sourceTurnId: 'native-turn' }] };
    v.messagesContainer = document.createElement('div');
    v.messagesContainer.innerHTML = '<div class="opencodian-message" data-message-id="local-user"><span class="body">owned body</span><div class="opencodian-user-message-footer">Copy only</div></div>';
    const body = v.messagesContainer.querySelector('.body');
    jest.spyOn(v, 'getActiveTabId').mockReturnValue('active-tab');
    const footer = jest.spyOn(v, 'addUserMessageFooter').mockImplementation(element => {
      element.insertAdjacentHTML('beforeend', '<div class="opencodian-user-message-footer"><button>Fork</button></div>');
    });
    const info = { backend, conversationId: 'cx-owned', sessionId: 'native-thread', tabId: 'active-tab' };
    v.sendPipelineRuntime.host.onTurnSettled({ ...info, tabId: 'background-tab' });
    expect(footer).not.toHaveBeenCalled();
    v.sendPipelineRuntime.host.onTurnSettled(info);
    expect(footer).toHaveBeenCalledTimes(1);
    expect(v.messagesContainer.querySelector('.body')).toBe(body);
    expect(v.messagesContainer.querySelectorAll('.opencodian-user-message-footer')).toHaveLength(1);
    expect(v.messagesContainer.querySelector<HTMLElement>('.opencodian-message')?.dataset.sourceMessageId).toBe('native-user');
  });

  it('reconciles completed Codex text through the composed renderer only in its visible conversation', async () => {
    const v = constructView() as unknown as {
      currentConversation: Conversation;
      getActiveTabId(): string;
      conversationRenderService: { rerenderConversationMessages(value: Conversation): Promise<void> };
      sendPipelineRuntime: { host: { reconcileCodexFinalText(value: Conversation, tabId: string): Promise<void> } };
    };
    const owned: Conversation = { id: 'cx-owned', title: 'owned', backend: 'codex', backendSessionId: 'native-thread', createdAt: 1, updatedAt: 1, messages: [] };
    v.currentConversation = owned;
    jest.spyOn(v, 'getActiveTabId').mockReturnValue('active-tab');
    const render = jest.spyOn(v.conversationRenderService, 'rerenderConversationMessages').mockResolvedValue();
    await v.sendPipelineRuntime.host.reconcileCodexFinalText(owned, 'background-tab');
    await v.sendPipelineRuntime.host.reconcileCodexFinalText({ ...owned, id: 'foreign' }, 'active-tab');
    await v.sendPipelineRuntime.host.reconcileCodexFinalText({ ...owned, backend: 'pi' }, 'active-tab');
    expect(render).not.toHaveBeenCalled();
    await v.sendPipelineRuntime.host.reconcileCodexFinalText(owned, 'active-tab');
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(owned);
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

  it('passes the narrow tabRuntimeViewSource (never the full view) to assembleConversationTabRuntime (source contract)', () => {
    // Regression guard for codex/terra round-2 Critical #2: removing `view: host.tabRuntimeViewSource`
    // from the owner source must fail this test. The owner must never pass the full view into
    // the tab-runtime assembly (no god-object leak, inventory §2.2c).
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/features/chat/runtime/ChatRuntimeComposition.ts'),
      'utf8',
    );
    // The assembleConversationTabRuntime call must wire the narrow port, not `view: this`.
    expect(source).toContain('view: host.tabRuntimeViewSource,');
    expect(source).not.toMatch(/view:\s*this\b/);
  });
});
