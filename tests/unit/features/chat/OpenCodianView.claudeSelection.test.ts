import type { App } from 'obsidian';

import type { ClaudeCodeModelCatalogEntry } from '../../../../src/core/agents/backend/BackendModelCatalog';
import { ClaudeCodeAdapter } from '../../../../src/core/agents/backend/ClaudeCodeAdapter';
import type { ClaudeCodeSdkOptionsShape } from '../../../../src/core/agents/backend/ClaudeCodeOptionsBuilder';
import type { ResolvedModelSelection } from '../../../../src/core/config/modelConfig';
import type { Conversation } from '../../../../src/core/types/chat';
import { type ClaudeCodeBackendSettings, getDefaultClaudeCodeBackendSettings } from '../../../../src/core/types/settings';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ChatSelectionControlsCoordinator, type ChatSelectionControlsCoordinatorHost } from '../../../../src/features/chat/services/ChatSelectionControlsCoordinator';
import type { ModelSelectionRuntime, ModelSelectionRuntimeHost } from '../../../../src/features/chat/services/ModelSelectionRuntime';
import type { ModelSelectorProvider, ModelSelectorSelection } from '../../../../src/features/chat/ui/modelSelector/types';

type SendOptions = { provider?: string; model?: string; variant?: string };
type ViewHarness = {
  app: App;
  currentConversation: Conversation;
  currentVariant?: string;
  plugin: {
    settings: {
      activeBackend: string;
      defaultProvider: string;
      defaultModel: string;
      modelSourceMode: 'merge';
      providerIconLibrary: 'none';
      backendSettings: { claudeCode: ClaudeCodeBackendSettings; codex: { model: string; modelReasoningEffort: string } };
    };
    saveConversation: jest.Mock;
    saveSettings: jest.Mock;
    openCodeService: { getAvailableModels: jest.Mock };
    agentServiceRegistry: { get: jest.Mock };
  };
  tabManager: { getActiveTab: jest.Mock; getActiveTabModelOverride: jest.Mock; setActiveTabModelOverride: jest.Mock };
  chatSelectionControlsCoordinator: ChatSelectionControlsCoordinator;
  createChatSelectionControlsCoordinatorHost(): ChatSelectionControlsCoordinatorHost;
  getBackendScopedActiveTabModelOverride(): ModelSelectorSelection | null;
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ResolvedModelSelection;
  getSendMessageOptions(): SendOptions;
};

const foreignSelection = { provider: 'opencode-go', model: 'gpt-6-astra' };
const claudeDefault = { provider: 'claude-code', model: 'default' };
const coordinators: ChatSelectionControlsCoordinator[] = [];
const blockedNativeCalls: jest.Mock[] = [];

function conversation(id: string, backend: 'claude-code' | 'opencode' = 'claude-code'): Conversation {
  return { id, backend, title: id, createdAt: 1, updatedAt: 1, messages: [] };
}

function blockedCall(name: string): jest.Mock {
  const call = jest.fn(() => { throw new Error(`Unexpected native/SDK call: ${name}`); });
  blockedNativeCalls.push(call);
  return call;
}

function harness({
  active = conversation('claude-new'),
  globalModel = '',
  override = null,
  supportedModels = [],
  defaultModel = foreignSelection.model,
  globalBackend,
}: {
  active?: Conversation;
  globalModel?: string;
  override?: ModelSelectorSelection | null;
  supportedModels?: ClaudeCodeModelCatalogEntry[];
  defaultModel?: string;
  globalBackend?: string;
} = {}) {
  const tabs = new Map<string, ModelSelectorSelection | null>([[active.id, override]]);
  const providers: ModelSelectorProvider[] = [{
    id: foreignSelection.provider,
    name: 'OpenCode Go',
    models: [{ id: foreignSelection.model, name: 'Astra', variants: ['low', 'high', 'max'] }],
  }];
  const claudeCatalog = { supportedModels: jest.fn(async () => supportedModels) };
  const view = Object.assign(Object.create(OpenCodianView.prototype), {
    app: { vault: { getMarkdownFiles: () => [] } },
    currentConversation: active,
    currentVariant: undefined,
    variantStore: {},
    escapeHandlers: [],
    activeTabContextUsageCoordinator: { syncIdentity: jest.fn() },
    composerInputShellCoordinator: { focusInput: jest.fn() },
    plugin: {
      settings: {
        activeBackend: globalBackend ?? active.backend,
        defaultProvider: foreignSelection.provider,
        defaultModel,
        modelSourceMode: 'merge',
        providerIconLibrary: 'none',
        backendSettings: {
          claudeCode: { ...getDefaultClaudeCodeBackendSettings(), model: globalModel, effort: 'medium' },
          codex: { model: 'other-leaf-codex-model', modelReasoningEffort: 'low' },
        },
      },
      saveConversation: jest.fn(async () => {}),
      saveSettings: jest.fn(async () => {}),
      openCodeService: { getAvailableModels: jest.fn(async () => ({ providers })) },
      agentServiceRegistry: { get: jest.fn((backend: string) => backend === 'claude-code' ? claudeCatalog : undefined) },
    },
    tabManager: {
      getActiveTab: jest.fn(() => ({ id: view.currentConversation.id })),
      getActiveTabModelOverride: jest.fn(() => tabs.get(view.currentConversation.id) ?? null),
      setActiveTabModelOverride: jest.fn((selection) => tabs.set(view.currentConversation.id, selection)),
    },
  }) as ViewHarness;
  const globals = globalThis as typeof globalThis & { app?: unknown };
  const focusedView = globalBackend ? { getViewType: () => 'opencodian-view', currentConversation: { backend: globalBackend } } : view;
  globals.app = { plugins: { plugins: { opencodian: view.plugin } }, workspace: { activeLeaf: { view: focusedView } } };
  const host = view.createChatSelectionControlsCoordinatorHost();
  view.chatSelectionControlsCoordinator = new ChatSelectionControlsCoordinator(host);
  coordinators.push(view.chatSelectionControlsCoordinator);
  const runtime = (view.chatSelectionControlsCoordinator as unknown as { modelSelectionRuntime: ModelSelectionRuntime }).modelSelectionRuntime;
  const wrappedHost = (runtime as unknown as { host: ModelSelectionRuntimeHost }).host;
  return { view, host, runtime, wrappedHost, tabs, claudeCatalog };
}

async function staleForeignCatalog(override: ModelSelectorSelection | null) {
  const state = harness({ active: conversation('previous-opencode', 'opencode') });
  // Load the foreign snapshot through the real host, then change the active
  // conversation before the Claude catalog reload. No runtime fields are forged.
  await state.runtime.reloadModelCatalog();
  state.view.currentConversation = conversation('claude-new');
  state.view.plugin.settings.activeBackend = 'claude-code';
  state.tabs.set('claude-new', override);
  state.view.currentVariant = 'high';
  expect(state.runtime.hasLoadedModelCatalog()).toBe(true);
  expect(state.runtime.getAvailableProviders().map((provider) => provider.id)).toEqual([foreignSelection.provider]);
  expect(state.claudeCatalog.supportedModels).not.toHaveBeenCalled();
  return state;
}

function sdkOptions(view: ViewHarness, sendOptions: SendOptions): ClaudeCodeSdkOptionsShape {
  // Execute the production adapter override resolver AND options builder, without
  // its constructor, CLI resolution, SDK loader, query, start, or native process.
  const adapter = Object.assign(Object.create(ClaudeCodeAdapter.prototype), {
    options: {
      vaultPath: '/fixture-vault',
      settings: view.plugin.settings.backendSettings.claudeCode,
      processEnv: {},
      sdk: { query: blockedCall('query') },
    },
    resolveExternalProcess: false,
    cachedMcpServers: {},
  }) as { buildSdkOptions(abort?: AbortController, session?: undefined, options?: SendOptions): ClaudeCodeSdkOptionsShape };
  Object.defineProperty(adapter, 'spawnClaudeCodeProcess', { configurable: true, value: blockedCall('spawn') });
  return adapter.buildSdkOptions(undefined, undefined, sendOptions);
}

function modelBoundary(options: ClaudeCodeSdkOptionsShape) {
  return { ownModel: Object.prototype.hasOwnProperty.call(options, 'model'), model: options.model ?? null, effort: options.effort };
}

function assertNoNativeCalls(): void {
  for (const call of blockedNativeCalls.splice(0)) expect(call).not.toHaveBeenCalled();
}

function wrapperFixture(ownerBackend: string | undefined, globalBackend: string) {
  const host: jest.Mocked<ChatSelectionControlsCoordinatorHost> = {
    getOwnConversation: () => ownerBackend ? { backend: ownerBackend } : null,
    preserveRequestedModel: () => ownerBackend === 'claude-code',
    getApp: () => ({} as App),
    registerEscapeHandler: jest.fn(),
    loadModelCatalogData: jest.fn(async () => ({ catalogBundle: null, providers: [{ id: 'anthropic', name: 'Anthropic', models: [{ id: 'owned-model', name: 'Owned model' }] }] })),
    getDefaultModelSelection: jest.fn(() => ({ provider: 'anthropic', model: 'owned-model' })),
    getActiveTabModelOverride: jest.fn(() => ({ provider: 'anthropic', model: 'owned-model' })),
    setActiveTabModelOverride: jest.fn(() => true),
    syncActiveTabContextUsageIdentity: jest.fn(),
    getModelSourceMode: jest.fn(() => 'merge'),
    isModelAvailableOnServer: jest.fn(async () => false),
    resolveProviderIconUrl: jest.fn(async () => null),
    updateEffortSelectorDisplay: jest.fn(),
    restoreComposerInputFocus: jest.fn(),
    getPermissionMode: jest.fn(() => 'normal'),
    switchPermissionMode: jest.fn(async () => true),
  };
  const codex = {
    getModelList: jest.fn(async () => [{ slug: 'owned-codex-model', display_name: 'Owned Codex model', supported_reasoning_efforts: [] }]),
    getAccountInfo: jest.fn(async () => ({ account: { type: 'chatgpt' } })),
  };
  const opencode2 = {
    getModelSelectorProviders: jest.fn(async () => [{ id: 'opencode2', name: 'OpenCode 2', models: [{ id: 'other-leaf-model', name: 'Other leaf model' }] }]),
    getDefaultModelSelection: jest.fn(() => ({ provider: 'opencode2', model: 'other-leaf-model' })),
  };
  (globalThis as typeof globalThis & { app?: unknown }).app = {
    plugins: { plugins: { opencodian: {
      settings: { activeBackend: globalBackend, backendSettings: { codex: { model: 'owned-codex-model' } } },
      agentServiceRegistry: { get: (backend: string) => backend === 'codex' ? codex : backend === 'opencode2' ? opencode2 : undefined },
    } } },
  };
  const coordinator = new ChatSelectionControlsCoordinator(host);
  coordinators.push(coordinator);
  const runtime = (coordinator as unknown as { modelSelectionRuntime: ModelSelectionRuntime }).modelSelectionRuntime;
  const wrappedHost = (runtime as unknown as { host: ModelSelectionRuntimeHost }).host;
  return { host, runtime, wrappedHost, codex, opencode2 };
}

afterEach(() => {
  for (const coordinator of coordinators.splice(0)) coordinator.destroy();
  delete (globalThis as typeof globalThis & { app?: unknown }).app;
  document.body.replaceChildren();
  assertNoNativeCalls();
  jest.restoreAllMocks();
});

describe('Actual selector wrapper routes every existing backend branch through the owned conversation', () => {
  it.each(['codex', 'opencode2'])('keeps all local Claude host seams while global backend is %s', async (globalBackend) => {
    const { host, runtime, wrappedHost, codex, opencode2 } = wrapperFixture('claude-code', globalBackend);
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue('foreign-custom-model');
    const defaults = wrappedHost.getDefaultModelSelection();
    const override = wrappedHost.getActiveTabModelOverride();
    const available = await wrappedHost.isModelAvailableOnServer('anthropic', 'owned-model');
    const selection = { provider: 'anthropic', model: '__codex_custom__' };
    const accepted = wrappedHost.setActiveTabModelOverride(selection);
    await runtime.reloadModelCatalog();
    expect({ preserve: wrappedHost.preserveRequestedModel?.(), defaults, override, available, accepted,
      providers: runtime.getAvailableProviders().map((provider) => provider.id) }).toEqual({
      preserve: true, defaults: { provider: 'anthropic', model: 'owned-model' },
      override: { provider: 'anthropic', model: 'owned-model' }, available: false, accepted: true, providers: ['anthropic'],
    });
    expect(host.loadModelCatalogData).toHaveBeenCalledTimes(1);
    expect(host.isModelAvailableOnServer).toHaveBeenCalledWith('anthropic', 'owned-model');
    expect(host.setActiveTabModelOverride).toHaveBeenCalledWith(selection);
    expect(codex.getModelList).not.toHaveBeenCalled();
    expect(opencode2.getModelSelectorProviders).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('keeps local Codex preserve/catalog/default/availability/filter/custom behavior with global OpenCode 2', async () => {
    const { host, runtime, wrappedHost, codex, opencode2 } = wrapperFixture('codex', 'opencode2');
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue('owned-custom-codex');
    const override = wrappedHost.getActiveTabModelOverride();
    const accepted = wrappedHost.setActiveTabModelOverride({ provider: 'codex', model: '__codex_custom__' });
    await runtime.reloadModelCatalog();
    expect({ preserve: wrappedHost.preserveRequestedModel?.(), defaults: wrappedHost.getDefaultModelSelection(),
      override, accepted, available: await wrappedHost.isModelAvailableOnServer('codex', 'owned-codex-model'),
      providers: runtime.getAvailableProviders().map((provider) => provider.id) }).toEqual({
      preserve: true, defaults: { provider: 'codex', model: 'owned-codex-model' }, override: null,
      accepted: true, available: true, providers: ['codex'],
    });
    expect(host.setActiveTabModelOverride).toHaveBeenCalledWith({ provider: 'codex', model: 'owned-custom-codex' });
    expect(codex.getModelList).toHaveBeenCalledTimes(1);
    expect(opencode2.getModelSelectorProviders).not.toHaveBeenCalled();
    expect(host.loadModelCatalogData).not.toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('preserves legacy global Codex routing when the host has no owned conversation', async () => {
    const { runtime, wrappedHost, codex } = wrapperFixture(undefined, 'codex');
    await runtime.reloadModelCatalog();
    expect(wrappedHost.preserveRequestedModel?.()).toBe(true);
    expect(wrappedHost.getDefaultModelSelection()).toEqual({ provider: 'codex', model: 'owned-codex-model' });
    expect(wrappedHost.getActiveTabModelOverride()).toBeNull();
    expect(await wrappedHost.isModelAvailableOnServer('codex', 'owned-codex-model')).toBe(true);
    expect(runtime.getAvailableProviders().map((provider) => provider.id)).toEqual(['codex']);
    expect(codex.getModelList).toHaveBeenCalledTimes(1);
  });
});

describe('Claude requested selection and send isolation through the production view', () => {
  const staleCases: Array<[string, ModelSelectorSelection | null]> = [
    ['no tab override', null],
    ['filtered Codex tab override', { provider: 'codex', model: foreignSelection.model }],
  ];

  it.each(staleCases)('keeps the Claude request unavailable instead of a foreign fallback with %s', async (_name, override) => {
    const { view, host, runtime, wrappedHost } = await staleForeignCatalog(override);
    expect(view.getBackendScopedActiveTabModelOverride()).toBeNull();
    expect(host.getDefaultModelSelection()).toEqual(claudeDefault);
    expect(wrappedHost.getDefaultModelSelection()).toEqual(claudeDefault);
    expect(await runtime.ensureSelectedModelAvailable(claudeDefault.provider, claudeDefault.model)).toBe(false);
    expect({ current: view.getCurrentSessionModel(), resolution: view.getCurrentSessionModelResolution() }).toMatchObject({
      current: claudeDefault,
      resolution: { status: 'unavailable', ...claudeDefault },
    });
  });

  it.each(staleCases)('sends inherited Claude model and effort without foreign SDK model with %s', async (_name, override) => {
    const { view } = await staleForeignCatalog(override);
    const send = view.getSendMessageOptions();
    const sdk = sdkOptions(view, send);
    expect({ send, sdk: modelBoundary(sdk) }).toEqual({
      send: { provider: 'claude-code', variant: 'high' },
      sdk: { ownModel: false, model: null, effort: 'high' },
    });
  });

  it('keeps the fresh synthetic Default UI label while omitting native model and preserving effort', async () => {
    const { view, runtime } = harness();
    const toolbar = document.createElement('div');
    document.body.appendChild(toolbar);
    view.chatSelectionControlsCoordinator.build(toolbar, { showPermissions: false });
    await view.chatSelectionControlsCoordinator.reloadModelCatalog();
    expect(runtime.findKnownModelInfo(claudeDefault)?.modelName).toBe('Default');
    expect(toolbar.querySelector('.opencodian-model-trigger-text')?.textContent).toContain('Default');
    expect(view.getCurrentSessionModel()).toEqual(claudeDefault);
    expect(view.getCurrentSessionModelResolution().status).toBe('available');
    view.currentVariant = 'max';
    const send = view.getSendMessageOptions();
    expect({ send, sdk: modelBoundary(sdkOptions(view, send)) }).toEqual({
      send: { provider: 'claude-code', variant: 'max' },
      sdk: { ownModel: false, model: null, effort: 'max' },
    });
    expect(view.plugin.settings.backendSettings.claudeCode.model).toBe('');
    expect(view.plugin.settings.backendSettings.claudeCode.effort).toBe('medium');
  });

  it.each([
    ['claude-code', 'owned-custom-model'],
    ['anthropic', 'gpt-6-astra'],
    ['claude', 'owned-claude-model'],
    ['anthropic', 'default'],
    ['claude', 'default'],
  ])('forwards the explicit %s/%s exactly without changing global or either tab', async (provider, model) => {
    const selection = { provider, model };
    const { view, host, runtime, tabs } = harness({ override: selection, supportedModels: [{ id: model, name: model, provider }] });
    const active = view.currentConversation;
    const other = conversation('other-claude');
    tabs.set(other.id, { provider: 'anthropic', model: 'other-tab-model' });
    const before = JSON.stringify({ settings: view.plugin.settings, active: view.currentConversation, other, tabs: [...tabs] });
    await runtime.reloadModelCatalog();
    view.currentVariant = 'low';
    expect(host.getActiveTabModelOverride()).toEqual(selection);
    expect(view.getCurrentSessionModel()).toEqual(selection);
    const captured = view.getSendMessageOptions();
    view.currentConversation = other;
    expect(captured).toEqual({ ...selection, variant: 'low' });
    expect(modelBoundary(sdkOptions(view, captured))).toEqual({ ownModel: true, model, effort: 'low' });
    view.currentConversation = active;
    expect(JSON.stringify({ settings: view.plugin.settings, active: view.currentConversation, other, tabs: [...tabs] })).toBe(before);
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
    expect(view.plugin.saveConversation).not.toHaveBeenCalled();
    expect(view.tabManager.setActiveTabModelOverride).not.toHaveBeenCalled();
  });

  it('preserves an explicit global model named default in the real builder settings fallback', async () => {
    const { view, runtime } = harness({ globalModel: 'default' });
    await runtime.reloadModelCatalog();
    expect(view.getCurrentSessionModel()).toEqual(claudeDefault);
    expect(modelBoundary(sdkOptions(view, {}))).toEqual({ ownModel: true, model: 'default', effort: 'medium' });
    expect(modelBoundary(sdkOptions(view, view.getSendMessageOptions()))).toEqual({ ownModel: true, model: 'default', effort: 'medium' });
    expect(view.plugin.settings.backendSettings.claudeCode.model).toBe('default');
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
  });

  it('omits synthetic Default for whitespace configuration while keeping provider and variant', async () => {
    const { view, runtime } = harness({ globalModel: '  \t ' });
    await runtime.reloadModelCatalog();
    view.currentVariant = 'xhigh';
    const send = view.getSendMessageOptions();
    expect({ current: view.getCurrentSessionModel(), send, sdk: modelBoundary(sdkOptions(view, send)) }).toEqual({
      current: claudeDefault,
      send: { provider: 'claude-code', variant: 'xhigh' },
      sdk: { ownModel: false, model: null, effort: 'xhigh' },
    });
    expect(view.plugin.settings.backendSettings.claudeCode.model).toBe('  \t ');
  });

  it.each(['', 'owned-global-model'])('keeps an accepted claude-code/default tab explicit over global %s', async (globalModel) => {
    const { view, runtime } = harness({ globalModel, override: claudeDefault });
    await runtime.reloadModelCatalog();
    view.currentVariant = 'low';
    const send = view.getSendMessageOptions();
    expect(send).toEqual({ ...claudeDefault, variant: 'low' });
    expect(modelBoundary(sdkOptions(view, send))).toEqual({ ownModel: true, model: 'default', effort: 'low' });
    expect(view.plugin.settings.backendSettings.claudeCode.model).toBe(globalModel);
  });

  it('routes an owned Claude view through its host despite a focused Codex leaf and global backend', async () => {
    const { view, host, runtime, wrappedHost, claudeCatalog } = harness({ globalBackend: 'codex' });
    await runtime.reloadModelCatalog();
    view.currentVariant = 'high';
    const send = view.getSendMessageOptions();
    const sdk = sdkOptions(view, send);
    expect({
      hostDefault: host.getDefaultModelSelection(),
      wrappedDefault: wrappedHost.getDefaultModelSelection(),
      providers: runtime.getAvailableProviders().map((provider) => provider.id),
      current: view.getCurrentSessionModel(),
      send,
      sdk: modelBoundary(sdk),
    }).toEqual({
      hostDefault: claudeDefault,
      wrappedDefault: claudeDefault,
      providers: ['claude-code'],
      current: claudeDefault,
      send: { provider: 'claude-code', variant: 'high' },
      sdk: { ownModel: false, model: null, effort: 'high' },
    });
    expect(claudeCatalog.supportedModels).toHaveBeenCalledTimes(1);
    expect(view.plugin.openCodeService.getAvailableModels).not.toHaveBeenCalled();
  });

  it('keeps a genuine OpenCode fallback baseline rather than assuming every backend is strict', async () => {
    const { view, host, runtime } = harness({ active: conversation('opencode-baseline', 'opencode'), defaultModel: 'missing-requested-model' });
    await runtime.reloadModelCatalog();
    expect(host.getDefaultModelSelection()).toEqual({ provider: foreignSelection.provider, model: 'missing-requested-model' });
    expect(view.getCurrentSessionModel()).toEqual(foreignSelection);
    expect(view.getCurrentSessionModelResolution().status).toBe('available');
    expect(view.getSendMessageOptions()).toEqual({ ...foreignSelection, variant: undefined });
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
    expect(view.tabManager.setActiveTabModelOverride).not.toHaveBeenCalled();
  });
});
