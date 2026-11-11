import type { App } from 'obsidian';

import { AssistantShellRenderer } from '../../../../src/features/chat/runtime/rendering/AssistantShellRenderer';
import {
  ChatSelectionControlsCoordinator,
  type ChatSelectionControlsCoordinatorHost,
} from '../../../../src/features/chat/services/selection/ChatSelectionControlsCoordinator';
import type { ModelSelectorSelection } from '../../../../src/features/chat/ui/modelSelector/types';

const globalApp = globalThis as typeof globalThis & { app?: unknown };
let savedApp: unknown;
let current: ChatSelectionControlsCoordinator | undefined;

async function settle(): Promise<void> {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}

async function fixture(transport: 'native' | 'acp' = 'native') {
  let own = { backend: 'dsh', backendSessionId: 'owned-native-session' };
  let selection: ModelSelectorSelection | null = null;
  let model = 'opaque/a';
  const order: string[] = [];
  const adapter = {
    getModelSelectorProviders: jest.fn(async () => [{ id: 'native-provider', name: 'Native', models: [
      { id: 'opaque/a', name: 'A', variants: model === 'opaque/a' ? ['low'] : [] },
      { id: 'opaque/b', name: 'B', variants: model === 'opaque/b' ? ['high'] : [] },
    ] }]),
    getDefaultModelSelection: jest.fn(() => ({ provider: 'native-provider', model })),
    readSessionConfiguration: jest.fn(async () => ({ sessionId: 'owned-native-session' })),
    setSessionConfigOption: jest.fn(async (_id: string, _key: string, value: string) => { order.push('native'); model = value; }),
  };
  globalApp.app = { plugins: { plugins: { opencodian: {
    settings: { activeBackend: 'codex', backendSettings: { dsh: { transport } } },
    agentServiceRegistry: { get: jest.fn((kind) => kind === 'dsh' ? adapter : undefined) },
  } } } };
  const host: jest.Mocked<ChatSelectionControlsCoordinatorHost> = {
    getOwnConversation: jest.fn(() => own), getApp: () => ({} as App), registerEscapeHandler: jest.fn(),
    loadModelCatalogData: jest.fn(async () => ({ catalogBundle: null, providers: [] })),
    getActiveTabModelOverride: jest.fn(() => selection),
    setActiveTabModelOverride: jest.fn((value) => { selection = value; return true; }),
    persistDshModelSelection: jest.fn(async (value) => { order.push('persist'); selection = value; return true; }),
    getDefaultModelSelection: jest.fn(() => null), syncActiveTabContextUsageIdentity: jest.fn(),
    getModelSourceMode: jest.fn(() => 'merge'), isModelAvailableOnServer: jest.fn(async () => false),
    resolveProviderIconUrl: jest.fn(async () => null), updateEffortSelectorDisplay: jest.fn(),
    restoreComposerInputFocus: jest.fn(), getPermissionMode: jest.fn(() => 'normal'),
    switchPermissionMode: jest.fn(async () => true), isActiveTabStreaming: jest.fn(() => false),
  };
  const toolbar = document.createElement('div');
  document.body.appendChild(toolbar);
  const coordinator = new ChatSelectionControlsCoordinator(host);
  current = coordinator;
  coordinator.build(toolbar);
  await coordinator.reloadModelCatalog();
  await settle();
  return { coordinator, adapter, host, order, switchConversation: () => { own = { backend: 'dsh', backendSessionId: 'other-native-session' }; } };
}

function select(coordinator: ChatSelectionControlsCoordinator, model: string): boolean {
  return (coordinator as unknown as { selectModel(provider: string, model: string): boolean }).selectModel('native-provider', model);
}

describe('DSH model selector ownership', () => {
  beforeEach(() => { savedApp = globalApp.app; HTMLElement.prototype.scrollIntoView = jest.fn(); });
  afterEach(() => { current?.destroy(); current = undefined; globalApp.app = savedApp; document.body.innerHTML = ''; });

  it('uses the owned DSH catalog despite a different global backend, and persists before applying natively', async () => {
    const f = await fixture();
    expect(f.host.loadModelCatalogData).not.toHaveBeenCalled();
    expect(f.coordinator.getAvailableProviders()[0].id).toBe('native-provider');
    expect(select(f.coordinator, 'opaque/b')).toBe(true);
    await settle();
    expect(f.order).toEqual(['persist', 'native']);
    expect(f.adapter.setSessionConfigOption).toHaveBeenCalledWith('owned-native-session', 'model', 'opaque/b');
    expect(f.coordinator.getAvailableProviders()[0].models[1].variants).toEqual(['high']);
  });

  it('does not mutate native configuration when persistence fails or the owned conversation changes', async () => {
    const f = await fixture();
    f.host.persistDshModelSelection!.mockRejectedValueOnce(new Error('save failed'));
    select(f.coordinator, 'opaque/b');
    await settle();
    expect(f.adapter.setSessionConfigOption).not.toHaveBeenCalled();
    let release!: (value: { sessionId: string }) => void;
    f.adapter.readSessionConfiguration.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    select(f.coordinator, 'opaque/b');
    f.switchConversation();
    release({ sessionId: 'owned-native-session' });
    await settle();
    expect(f.adapter.setSessionConfigOption).not.toHaveBeenCalled();
    expect(f.host.persistDshModelSelection).toHaveBeenCalledTimes(1);
  });

  it('mounts exactly one generic permission trigger for native DSH and no backend-only controls', async () => {
    await fixture();
    const slot = document.body.querySelector('.opencodian-permission-selector')!;
    expect(slot.querySelectorAll('.opencodian-permission-trigger')).toHaveLength(1);
    expect(slot.querySelector('.opencodian-permission-trigger')?.getAttribute('data-permission-backend')).toBe('dsh');
    expect(slot.querySelectorAll('button')).toHaveLength(0);
    expect(document.body.querySelectorAll('.opencodian-workbench-button, [class*="opencodian-dsh-"]')).toHaveLength(0);
    expect(document.body.querySelectorAll('.opencodian-model-selector')).toHaveLength(1);
  });

  it('keeps the baseline empty permission slot on ACP, where no preset mutation exists', async () => {
    const f = await fixture('acp');
    expect((f.coordinator as unknown as { permissionSelector: unknown }).permissionSelector).toBeNull();
    expect(document.body.querySelector('.opencodian-permission-selector')!.childElementCount).toBe(0);
    expect(document.body.querySelectorAll('.opencodian-model-selector')).toHaveLength(1);
  });

  it('does not apply a delayed selection after its toolbar is destroyed', async () => {
    const f = await fixture();
    let release!: (value: { sessionId: string }) => void;
    f.adapter.readSessionConfiguration.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    select(f.coordinator, 'opaque/b');
    f.coordinator.destroy();
    release({ sessionId: 'owned-native-session' });
    await settle();
    expect(f.host.persistDshModelSelection).not.toHaveBeenCalled();
    expect(f.adapter.setSessionConfigOption).not.toHaveBeenCalled();
  });
});

/** Mirrors the proven C2/C3 incident shapes: the previous session's catalog
 * lacks the fresh session's default (opaque JSON tuple ids, real provider
 * grouping). Catalogs are disjoint so every stale-snapshot answer is sharp. */
async function fixtureSessionCatalogs(transport: 'native' | 'acp' = 'acp') {
  const catalogs: Record<string, Array<{ id: string; name: string }>> = {
    'old-4888-session': [{ id: '["deepseek-official","deepseek-flash"]', name: 'deepseek-official: deepseek-flash' }],
    'c3-session': [
      { id: '["deepseek-official","deepseek-v4-flash"]', name: 'deepseek-official: deepseek-v4-flash' },
      { id: '["deepseek-official","deepseek-v4-pro"]', name: 'deepseek-official: deepseek-v4-pro' },
    ],
  };
  const defaults: Record<string, { provider: string; model: string }> = {
    'old-4888-session': { provider: 'deepseek-official', model: '["deepseek-official","deepseek-flash"]' },
    'c3-session': { provider: 'deepseek-official', model: '["deepseek-official","deepseek-v4-flash"]' },
  };
  const calls: Array<string | undefined> = [];
  let own: { backend: string; backendSessionId?: string } = { backend: 'dsh', backendSessionId: 'old-4888-session' };
  const adapter = {
    status: 'connected' as const,
    getModelSelectorProviders: jest.fn(async (sessionId?: string) => {
      calls.push(sessionId);
      return [{ id: 'deepseek-official', name: 'deepseek-official', models: sessionId ? catalogs[sessionId] ?? [] : catalogs['old-4888-session'] ?? [] }];
    }),
    getDefaultModelSelection: jest.fn((sessionId?: string) => (sessionId ? defaults[sessionId] ?? null : null)),
    readSessionConfiguration: jest.fn(async () => ({ sessionId: own.backendSessionId })),
    setSessionConfigOption: jest.fn(async (_id: string, _key: string, value: string) => { void value; }),
  };
  globalApp.app = { plugins: { plugins: { opencodian: {
    settings: { activeBackend: 'codex', backendSettings: { dsh: { transport } } },
    agentServiceRegistry: { get: jest.fn((kind) => kind === 'dsh' ? adapter : undefined) },
  } } } };
  const host: jest.Mocked<ChatSelectionControlsCoordinatorHost> = {
    getOwnConversation: jest.fn(() => own), getApp: () => ({} as App), registerEscapeHandler: jest.fn(),
    loadModelCatalogData: jest.fn(async () => ({ catalogBundle: null, providers: [] })),
    getActiveTabModelOverride: jest.fn(() => null), setActiveTabModelOverride: jest.fn((value) => { void value; return true; }),
    persistDshModelSelection: jest.fn(async (value) => { void value; return true; }),
    getDefaultModelSelection: jest.fn(() => null), syncActiveTabContextUsageIdentity: jest.fn(),
    getModelSourceMode: jest.fn(() => 'merge'), isModelAvailableOnServer: jest.fn(async () => false),
    resolveProviderIconUrl: jest.fn(async () => null), updateEffortSelectorDisplay: jest.fn(),
    restoreComposerInputFocus: jest.fn(), getPermissionMode: jest.fn(() => 'normal'),
    switchPermissionMode: jest.fn(async () => true), isActiveTabStreaming: jest.fn(() => false),
  };
  const toolbar = document.createElement('div');
  document.body.appendChild(toolbar);
  const coordinator = new ChatSelectionControlsCoordinator(host);
  current = coordinator;
  coordinator.build(toolbar);
  await coordinator.reloadModelCatalog();
  await settle();
  return {
    coordinator, adapter, host, calls,
    switchConversation: (backendSessionId: string) => { own = { backend: 'dsh', backendSessionId }; },
    unbindConversation: () => { own = { backend: 'dsh' }; },
  };
}

describe('DSH catalog rebinding to the owned session', () => {
  beforeEach(() => { savedApp = globalApp.app; HTMLElement.prototype.scrollIntoView = jest.fn(); });
  afterEach(() => { current?.destroy(); current = undefined; globalApp.app = savedApp; document.body.innerHTML = ''; });

  it('resolves the fresh session default on first send without any manual picker', async () => {
    const f = await fixtureSessionCatalogs();
    expect(f.coordinator.getAvailableProviders()[0].models.map(m => m.id)).toEqual(['["deepseek-official","deepseek-flash"]']);
    f.switchConversation('c3-session');
    const available = await f.coordinator.ensureSelectedModelAvailable('deepseek-official', '["deepseek-official","deepseek-v4-flash"]');
    expect(available).toBe(true);
    expect(f.coordinator.getAvailableProviders()[0].models.map(m => m.id)).toEqual([
      '["deepseek-official","deepseek-v4-flash"]', '["deepseek-official","deepseek-v4-pro"]',
    ]);
    expect(f.coordinator.getCurrentSessionModel()).toEqual({ provider: 'deepseek-official', model: '["deepseek-official","deepseek-v4-flash"]' });
    expect(f.calls).not.toContain(undefined);
    expect(f.host.loadModelCatalogData).not.toHaveBeenCalled();
  });

  it('drops a load whose owned session changed mid-flight instead of publishing it', async () => {
    const f = await fixtureSessionCatalogs();
    f.switchConversation('c3-session');
    let releaseC3!: () => void;
    const base = f.adapter.getModelSelectorProviders.getMockImplementation()!;
    f.adapter.getModelSelectorProviders.mockImplementation(async (sessionId?: string) => {
      if (sessionId === 'c3-session' && !releaseC3) {
        return new Promise<Array<{ id: string; name: string }>>((resolve) => {
          releaseC3 = () => { void Promise.resolve(base(sessionId)).then(resolve); };
        });
      }
      return base(sessionId);
    });
    const freshGate = f.coordinator.ensureSelectedModelAvailable('deepseek-official', '["deepseek-official","deepseek-v4-flash"]');
    await settle();
    // The owned session switches back while the c3 load is still in flight:
    // the late completion must be dropped and never published into the old
    // scope; from the old session the fresh default is honestly unavailable.
    f.switchConversation('old-4888-session');
    releaseC3();
    await expect(freshGate).resolves.toBe(false);
    await settle();
    expect(f.coordinator.getAvailableProviders()[0].models.map(m => m.id)).toEqual(['["deepseek-official","deepseek-flash"]']);
    expect(f.calls).not.toContain(undefined);
    // Returning to the fresh conversation rebinding despite the non-empty old
    // snapshot: its own default resolves on the next decision, no manual picker.
    f.switchConversation('c3-session');
    await expect(f.coordinator.ensureSelectedModelAvailable('deepseek-official', '["deepseek-official","deepseek-v4-flash"]')).resolves.toBe(true);
    expect(f.coordinator.getAvailableProviders()[0].models.map(m => m.id)).toEqual([
      '["deepseek-official","deepseek-v4-flash"]', '["deepseek-official","deepseek-v4-pro"]',
    ]);
  });

  it('does not borrow another live session catalog when the own session is absent', async () => {
    const f = await fixtureSessionCatalogs();
    f.unbindConversation();
    const available = await f.coordinator.ensureSelectedModelAvailable('deepseek-official', '["deepseek-official","deepseek-flash"]');
    expect(available).toBe(false);
    expect(f.coordinator.getAvailableProviders()).toEqual([]);
    expect(f.adapter.getModelSelectorProviders).not.toHaveBeenCalledWith(undefined);
  });

  it('repaints restored historical footers with friendly names after the own-session catalog reload, without any picker', async () => {
    const f = await fixtureSessionCatalogs();
    const turnBody = document.createElement('div');
    document.body.appendChild(turnBody);
    const renderer = new AssistantShellRenderer({
      getModelDisplayName: (id) => f.coordinator.getModelDisplayName(id),
      getActiveTabId: () => 'tab', getTabRuntimeState: () => null,
      ensureTurnBody: () => turnBody, shouldAutoScroll: () => false,
      scheduleSettledScrollToBottomIfNeeded: jest.fn(), setStreamingAssistantMessageVisibility: jest.fn(),
    });
    // A restored conversation labels from its own recorded references while
    // the stale snapshot from the previous session cannot resolve them.
    f.switchConversation('c3-session');
    for (const [index, ref] of [
      'deepseek-official/["deepseek-official","deepseek-v4-flash"]',
      'deepseek-official/["deepseek-official","deepseek-v4-pro"]',
    ].entries()) {
      const { messageEl } = renderer.createPersistedAssistantMessageElement({
        message: { id: `restored-${index}`, sourceMessageId: `native-${index}` }, tabId: 'tab',
      });
      renderer.addTimestampWithCopyButton({ messageEl, timestamp: index + 1, modelId: ref });
    }
    const labels = () => [...turnBody.querySelectorAll<HTMLElement>('.opencodian-message-model-id')]
      .map((label) => label.firstChild?.textContent ?? '');
    expect(labels().every((text) => text.includes('deepseek-official/["deepseek-official"'))).toBe(true);
    // The post-restore own-session reload chains the historical-label refresh:
    // recorded references resolve against the owned catalog, no picker opened.
    f.host.refreshHistoricalModelDisplayNames = () => renderer.refreshModelDisplayNames(turnBody);
    await f.coordinator.reloadModelCatalog();
    await settle();
    expect(labels()).toEqual(['· deepseek-official: deepseek-v4-flash', '· deepseek-official: deepseek-v4-pro']);
    for (const label of turnBody.querySelectorAll<HTMLElement>('.opencodian-message-model-id')) {
      expect(label.getAttribute('data-tooltip')).toContain(label.dataset.modelId!);
    }
  });
});
