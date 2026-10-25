import type { App } from 'obsidian';

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

async function fixture() {
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
    settings: { activeBackend: 'codex' }, agentServiceRegistry: { get: jest.fn((kind) => kind === 'dsh' ? adapter : undefined) },
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

  it('does not mount an OpenCode permission-mode control for a DSH conversation', async () => {
    const f = await fixture();
    expect((f.coordinator as unknown as { permissionSelector: unknown }).permissionSelector).toBeNull();
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
