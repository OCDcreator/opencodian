import type { App } from 'obsidian';

import type { Conversation } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { presentPiUiRequest } from '../../../../src/features/chat/services/integrations/PiExtensionUiHost';

interface ViewSeams {
  createTabActivationRuntimeHostProviderHost(): { setCurrentConversation(conversation: Conversation | null): void };
  scheduleComposerLayoutSync(): void;
  onClose(): Promise<void>;
}
const seams = OpenCodianView.prototype as unknown as ViewSeams;
const controllers: AbortController[] = [];

function conversation(sessionId: string, backend: 'pi' | 'codex' = 'pi'): Conversation {
  return { id: backend + sessionId, backend, backendSessionId: sessionId, title: 'Persistent ' + sessionId,
    createdAt: 1, updatedAt: 1, messages: [] };
}

function mount(container: HTMLElement): void {
  container.replaceChildren();
  container.createDiv({ cls: 'opencodian-header', text: 'OpenCodian' });
  const area = container.createDiv({ cls: 'opencodian-input-area' });
  const content = area.createDiv({ cls: 'opencodian-composer-content' });
  content.createDiv({ cls: 'opencodian-input-highlight-container' }).createEl('textarea', { cls: 'opencodian-input' });
  content.createDiv({ cls: 'opencodian-composer-input-row' });
}

function fixture() {
  const containerEl = document.body.createDiv({ cls: 'opencodian-container' });
  mount(containerEl);
  const cleanup = {
    dispose: jest.fn(), destroy: jest.fn(), disposeNativeTaskWatch: jest.fn(),
    clearGraph: jest.fn(), hide: jest.fn(), cancelAll: jest.fn(), destroyAll: jest.fn(),
    clearSessionApprovals: jest.fn(), destroyTabSystem: jest.fn(), stop: jest.fn(), unload: jest.fn(),
    stopConversationSyncLoop: jest.fn(),
  };
  const views: Array<{ containerEl: HTMLElement; currentConversation: Conversation | null }> = [];
  const app = { workspace: { getLeavesOfType: () => views.map(view => ({ view })) }, vault: { offref: jest.fn() } } as unknown as App;
  const layout = jest.fn();
  const view = {
    app, containerEl, currentConversation: conversation('A') as Conversation | null,
    plugin: { app, unregisterConversationCachePinProvider: jest.fn(), openCodeService: {}, saveConversation: jest.fn() },
    refreshModifiedFilesSidebar: jest.fn(),
    childSessionGraphCoordinator: cleanup,
    composerInputShellCoordinator: { scheduleLayoutSync: layout, destroy: cleanup.destroy },
    conversationSyncBridgePorts: { getLoopControl: () => cleanup },
    persistTabState: jest.fn(), clearSlashCommandMenuPreload: jest.fn(),
    clearScheduledComposerLayoutSync: jest.fn(), clearScheduledScrollToBottom: jest.fn(),
    eventRefs: [], messageComponent: cleanup,
  };
  const closeFields = [
    'activeTabContextUsageCoordinator', 'backgroundTaskInlinePanelRenderer', 'chatHeaderPresenter',
    'conversationHistoryActionsCoordinator', 'conversationSessionRailCoordinator', 'chatVimNavigationCoordinator',
    'composerContextViewFacade', 'chatSurfaceAppearanceCoordinator', 'titleGenerationService',
    'chatSelectionControlsCoordinator', 'inputPanelAppearanceCoordinator', 'vaultRetrievalComposerCoordinator',
    'modifiedFilesSidebarCoordinator', 'chatVisualDemoCoordinator', 'permissionInlineCardRenderer',
    'codexChatSurfaceBinding', 'conversationTabRuntimeCoordinator', 'questionDockSlotCoordinator',
    'sessionTodoCoordinator', 'conversationSessionSignalRuntime',
  ];
  for (const field of closeFields) Object.assign(view, { [field]: cleanup });
  views.push(view);
  const controller = new AbortController();
  controllers.push(controller);
  return { view, views, app, containerEl, layout, cleanup, signal: controller.signal,
    identity: seams.createTabActivationRuntimeHostProviderHost.call(view as never) };
}

async function title(app: App, sessionId: string, signal: AbortSignal, text: string): Promise<void> {
  await presentPiUiRequest(app, { type: 'extension_ui_request', id: 'owned', method: 'setTitle', sessionId, title: text }, signal);
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort();
  document.body.replaceChildren();
});

describe('Pi text UI through the existing View forwarding seams', () => {
  it('uses actual activation writeback to remove/restore tab, backend and null identity projections', async () => {
    const f = fixture();
    const before = JSON.stringify(f.view.currentConversation);
    await title(f.app, 'A', f.signal, 'A visible title');
    expect(f.containerEl.textContent).toContain('A visible title');
    for (const next of [conversation('B'), conversation('A', 'codex'), null]) {
      f.identity.setCurrentConversation(next);
      expect(f.containerEl.textContent).toBe('OpenCodian');
      await title(f.app, 'A', f.signal, 'Background A latest');
      expect(f.containerEl.textContent).toBe('OpenCodian');
    }
    f.identity.setCurrentConversation(conversation('A'));
    expect(f.containerEl.textContent).toContain('Background A latest');
    expect(JSON.stringify(f.view.currentConversation)).toBe(before);
    expect(f.view.plugin.saveConversation).not.toHaveBeenCalled();
  });

  it('hydrates rebuilt DOM in the real layout forwarding method without changing scroll ownership', async () => {
    const f = fixture();
    await title(f.app, 'A', f.signal, 'Hydrated title');
    mount(f.containerEl);
    expect(f.containerEl.textContent).toBe('OpenCodian');
    seams.scheduleComposerLayoutSync.call(f.view as never);
    expect(f.containerEl.textContent).toContain('Hydrated title');
    expect(f.layout).toHaveBeenCalledTimes(1);
    const node = f.containerEl.querySelector('.opencodian-pi-extension-title');
    seams.scheduleComposerLayoutSync.call(f.view as never);
    expect(f.containerEl.querySelector('.opencodian-pi-extension-title')).toBe(node);
    expect(f.layout).toHaveBeenCalledTimes(2);
  });

  it('releases before the real onClose teardown and keeps a shared-session second leaf live', async () => {
    const f = fixture();
    const second = document.body.createDiv({ cls: 'opencodian-container' });
    mount(second);
    f.views.push({ containerEl: second, currentConversation: conversation('A') });
    await title(f.app, 'A', f.signal, 'Shared v1');
    expect(f.containerEl.textContent).toContain('Shared v1');
    expect(second.textContent).toContain('Shared v1');
    f.cleanup.dispose.mockImplementation(() => {
      expect(f.containerEl.textContent).toBe('OpenCodian');
    });
    await seams.onClose.call(f.view as never);
    expect(f.signal.aborted).toBe(false);
    await title(f.app, 'A', f.signal, 'Shared v2');
    expect(f.containerEl.textContent).toBe('OpenCodian');
    expect(second.textContent).toContain('Shared v2');
    expect(f.view.plugin.saveConversation).not.toHaveBeenCalled();
  });
});
