import { Notice } from 'obsidian';

import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import { CODEX_CUSTOM_MODEL_SENTINEL } from '../../../../src/core/agents/backend/BackendModelCatalog';
import type { Conversation } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ChatSelectionControlsCoordinator, type ChatSelectionControlsCoordinatorHost } from '../../../../src/features/chat/services/ChatSelectionControlsCoordinator';
import type { ComposerInputShellCoordinatorHost } from '../../../../src/features/chat/services/ComposerInputShellCoordinator';
import { ConversationSessionSettingsCoordinator } from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';
import type { ModelSelectionRuntime, ModelSelectionRuntimeHost } from '../../../../src/features/chat/services/ModelSelectionRuntime';
import type { EffortSelector, EffortSelectorCallbacks } from '../../../../src/features/chat/ui/EffortSelector';

const { capturedNotices, clearCapturedNotices } = jest.requireActual('obsidian') as { capturedNotices: string[]; clearCapturedNotices(): void };

function conversation(id: string, effort: 'low' | 'high' | null): Conversation {
  return { id, backend: 'codex', backendSessionId: id, title: id, createdAt: 1, updatedAt: 1, messages: [], sessionSettings: { codexModelReasoningEffort: effort } };
}

type Harness = {
  currentConversation: Conversation;
  currentVariant?: string;
  app: never;
  plugin: {
    settings: { chatFontSizePx: number; activeBackend: string; backendSettings: { codex: { model: string; modelReasoningEffort: string; sandboxMode: string; additionalDirectories: string; networkAccessEnabled: boolean; webSearchMode: string } } };
    saveConversation: jest.Mock;
    saveSettings: jest.Mock;
    agentServiceRegistry: { get: jest.Mock };
  };
  effortSelector: EffortSelector & { callbacks: EffortSelectorCallbacks };
  conversationSessionSettingsCoordinator: ConversationSessionSettingsCoordinator;
  createConversationSessionSettingsCoordinatorHost(): ConstructorParameters<typeof ConversationSessionSettingsCoordinator>[0];
  createComposerInputShellCoordinatorHost(): ComposerInputShellCoordinatorHost;
  getCurrentSessionModel(): { provider: string; model: string } | null;
  getCurrentEffortVariant(): string | undefined;
  getSendMessageOptions(): { provider?: string; model?: string; variant?: string };
};

function harness(active: Conversation): Harness {
  const adapter = { updateSandboxMode: jest.fn(), updateModelReasoningEffort: jest.fn(), updateModel: jest.fn(), updateAdditionalDirectories: jest.fn(), updateNetworkAccessEnabled: jest.fn(), updateWebSearchMode: jest.fn(), updateApprovalPolicy: jest.fn(), invalidateLiveThread: jest.fn() };
  const view = Object.assign(Object.create(OpenCodianView.prototype), {
    app: { vault: { getMarkdownFiles: () => [] } },
    currentConversation: active,
    currentVariant: 'high',
    variantStore: {},
    plugin: {
      settings: { chatFontSizePx: 13, activeBackend: 'codex', backendSettings: { codex: { model: 'default-model', modelReasoningEffort: 'high', sandboxMode: 'read-only', additionalDirectories: '', networkAccessEnabled: false, webSearchMode: 'disabled' } } },
      saveConversation: jest.fn(async () => {}),
      saveSettings: jest.fn(async () => {}),
      agentServiceRegistry: { get: jest.fn(() => adapter) },
    },
    refreshModifiedFilesSidebar: jest.fn(),
  }) as Harness;
  Object.defineProperty(view, 'caps', { value: new Set([AgentCapability.Thinking]) });
  view.getCurrentSessionModel = () => ({ provider: 'codex', model: 'selected-model' });
  view.conversationSessionSettingsCoordinator = new ConversationSessionSettingsCoordinator(view.createConversationSessionSettingsCoordinatorHost());
  return view;
}

function callbacks(view: Harness): EffortSelectorCallbacks {
  view.createComposerInputShellCoordinatorHost().mountEffortSelector(document.createElement('div'));
  return view.effortSelector.callbacks;
}

describe('Codex composer session effort', () => {
  it('uses the saved session effort for both footer and send despite a stale other-tab variant', () => {
    const view = harness(conversation('a', 'low'));
    expect(callbacks(view).getVariant()).toBe('low');
    expect(view.getSendMessageOptions().variant).toBe('low');
  });

  it('uses the current global default when the session inherits, rather than a stale view cache', () => {
    const view = harness(conversation('a', null));
    view.plugin.settings.backendSettings.codex.modelReasoningEffort = 'medium';
    expect(view.getCurrentEffortVariant()).toBe('medium');
  });

  it('persists footer choices only to the target conversation and restores them with a fresh view', async () => {
    const a = conversation('a', 'low');
    const b = conversation('b', 'high');
    const view = harness(a);
    const effort = callbacks(view);
    await effort.onVariantChange('medium');
    expect(a.sessionSettings?.codexModelReasoningEffort).toBe('medium');
    expect(b.sessionSettings?.codexModelReasoningEffort).toBe('high');
    expect(view.plugin.settings.backendSettings.codex.modelReasoningEffort).toBe('high');
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
    expect(view.plugin.saveConversation).toHaveBeenCalledWith(a);
    view.currentConversation = b;
    expect(view.getSendMessageOptions().variant).toBe('high');
    await effort.onVariantChange('low');
    expect(a.sessionSettings?.codexModelReasoningEffort).toBe('medium');
    expect(b.sessionSettings?.codexModelReasoningEffort).toBe('low');
    expect(harness(a).getSendMessageOptions().variant).toBe('medium');
  });

  it('refreshes the actual footer when a session-modal save applies its overrides', async () => {
    const a = conversation('a', 'high');
    const view = harness(a);
    callbacks(view);
    const update = jest.spyOn(view.effortSelector, 'updateDisplay');
    await view.conversationSessionSettingsCoordinator.saveConversationOverrides(a, { codexModelReasoningEffort: 'low' });
    expect(update).toHaveBeenCalled();
    expect(view.effortSelector.callbacks.getVariant()).toBe('low');
  });
});


describe('Codex send safety snapshot', () => {
  it('captures all effective session settings before another tab becomes active', () => {
    const a = conversation('a', 'low');
    a.sessionSettings = { ...a.sessionSettings, codexSandboxMode: 'workspace-write', codexApprovalPolicy: 'on-request', codexAdditionalDirectories: ['/private/a'], codexNetworkAccessEnabled: true, codexWebSearchMode: 'live' };
    const view = harness(a);
    const options = view.getSendMessageOptions() as ReturnType<Harness['getSendMessageOptions']> & { codexOptions?: Record<string, unknown> };
    view.currentConversation = conversation('b', 'high');
    a.sessionSettings.codexAdditionalDirectories?.push('/later');
    expect(options.codexOptions).toEqual(expect.objectContaining({ sandboxMode: 'workspace-write', approvalPolicy: 'on-request', modelReasoningEffort: 'low', additionalDirectories: ['/private/a'], networkAccessEnabled: true, webSearchMode: 'live' }));
  });
});


describe('Codex send snapshot while the model picker has no row', () => {
  it('still captures the effective conversation model instead of the mutable adapter model', () => {
    const a = conversation('a', 'low');
    a.sessionSettings = { ...a.sessionSettings, codexModelOverride: 'owned-session-model' };
    const view = harness(a);
    view.getCurrentSessionModel = () => null;
    const options = view.getSendMessageOptions() as { codexOptions?: Record<string, unknown> };
    expect(options.codexOptions?.model).toBe('owned-session-model');
  });
});

type ModelHarness = Harness & {
  tabManager: { getActiveTab: jest.Mock; getActiveTabModelOverride: jest.Mock; setActiveTabModelOverride: jest.Mock };
  chatSelectionControlsCoordinator: ChatSelectionControlsCoordinator;
  createChatSelectionControlsCoordinatorHost(): ChatSelectionControlsCoordinatorHost;
  getBackendScopedActiveTabModelOverride(): { provider: string; model: string } | null;
  updateModelSelectorDisplay(): void;
};

async function modelHarness(active: Conversation, models = ['gpt-5.6-luna', 'gpt-5.6-terra']) {
  Object.defineProperty(Notice.prototype, 'noticeEl', { configurable: true, get: () => document.createElement('div') });
  const view = harness(active) as ModelHarness;
  const tabs = new Map<string, { provider: string; model: string } | null>([
    [active.id, { provider: 'codex', model: 'gpt-5.6-luna' }],
  ]);
  const persisted = new Map<string, Conversation>();
  view.plugin.settings.backendSettings.codex.model = 'gpt-5.6-luna';
  view.plugin.saveConversation.mockImplementation(async (target: Conversation) => {
    persisted.set(target.id, JSON.parse(JSON.stringify(target)) as Conversation);
  });
  view.tabManager = {
    getActiveTab: jest.fn(() => ({ id: view.currentConversation.id })),
    getActiveTabModelOverride: jest.fn(() => tabs.get(view.currentConversation.id) ?? null),
    setActiveTabModelOverride: jest.fn((selection) => tabs.set(view.currentConversation.id, selection)),
  };
  Object.assign(view, {
    activeTabContextUsageCoordinator: { syncIdentity: jest.fn() },
    composerInputShellCoordinator: { focusInput: jest.fn() },
    escapeHandlers: [],
  });
  const adapter = view.plugin.agentServiceRegistry.get();
  Object.assign(adapter, {
    getModelList: jest.fn(async () => models.map((id) => ({ slug: id, display_name: id, supported_reasoning_efforts: [] }))),
    getAccountInfo: jest.fn(async () => ({ account: { type: 'apiKey' } })),
  });
  Object.assign(view.plugin.settings, { modelSourceMode: 'merge', providerIconLibrary: 'none' });
  const globals = globalThis as typeof globalThis & { app?: unknown };
  globals.app = { plugins: { plugins: { opencodian: view.plugin } }, workspace: { activeLeaf: { view } } };
  delete (view as Partial<ModelHarness>).getCurrentSessionModel;
  view.chatSelectionControlsCoordinator = new ChatSelectionControlsCoordinator(view.createChatSelectionControlsCoordinatorHost());
  const toolbar = document.createElement('div');
  document.body.appendChild(toolbar);
  view.chatSelectionControlsCoordinator.build(toolbar, { showPermissions: false });
  await view.chatSelectionControlsCoordinator.reloadModelCatalog();
  const runtime = (view.chatSelectionControlsCoordinator as unknown as { modelSelectionRuntime: ModelSelectionRuntime }).modelSelectionRuntime;
  const wrappedHost = (runtime as unknown as { host: ModelSelectionRuntimeHost }).host;
  return { view, tabs, persisted, toolbar, runtime, wrappedHost };
}

async function settleModelSave(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function clickModel(toolbar: HTMLElement, model: string): void {
  toolbar.querySelector<HTMLElement>('.opencodian-model-trigger')?.click();
  const row = toolbar.querySelector<HTMLElement>('.opencodian-model-option[data-value="codex::' + model + '"]');
  expect(row).not.toBeNull();
  row!.click();
}

describe('Codex authoritative model snapshot through the production view and menu', () => {
  beforeEach(() => clearCapturedNotices());
  afterEach(() => {
    delete (globalThis as typeof globalThis & { app?: unknown }).app;
    document.body.replaceChildren();
    delete (Notice.prototype as unknown as { noticeEl?: HTMLElement }).noticeEl;
    jest.restoreAllMocks();
  });

  it('uses saved Terra for the actual send shape despite a visible stale Luna picker', async () => {
    const a = conversation('model-a', 'low');
    a.sessionSettings!.codexModelOverride = 'gpt-5.6-terra';
    const { view } = await modelHarness(a);
    const options = view.getSendMessageOptions() as { model?: string; codexOptions?: { model?: string } };
    expect(options).toEqual(expect.objectContaining({ provider: 'codex', model: 'gpt-5.6-terra', codexOptions: expect.objectContaining({ model: 'gpt-5.6-terra' }) }));
    expect(view.getCurrentSessionModel()?.model).toBe('gpt-5.6-terra');
    view.chatSelectionControlsCoordinator.destroy();
  });

  it('keeps modal selection, actual wrapped menu, persisted readback and subsequent send aligned without duplicate saves', async () => {
    const a = conversation('menu-a', 'low');
    const { view, toolbar, persisted } = await modelHarness(a);
    await view.conversationSessionSettingsCoordinator.saveConversationOverrides(a, { ...a.sessionSettings, codexModelOverride: 'gpt-5.6-terra' });
    expect(view.getCurrentSessionModel()?.model).toBe('gpt-5.6-terra');
    view.chatSelectionControlsCoordinator.updateModelSelectorDisplay();
    expect(toolbar.querySelector('.opencodian-model-trigger-text')?.textContent).toContain('gpt-5.6-terra');
    view.plugin.saveConversation.mockClear();
    clickModel(toolbar, 'gpt-5.6-luna');
    expect(a.sessionSettings?.codexModelOverride).toBeNull();
    expect(view.getSendMessageOptions().model).toBe('gpt-5.6-luna');
    await settleModelSave();
    expect(toolbar.querySelector('.opencodian-model-trigger-text')?.textContent).toContain('gpt-5.6-luna');
    expect(view.plugin.saveConversation).toHaveBeenCalledTimes(1);
    expect(persisted.get(a.id)?.sessionSettings?.codexModelOverride).toBeNull();
    view.plugin.settings.backendSettings.codex.model = 'gpt-5.6-terra';
    expect(view.getCurrentSessionModel()?.model).toBe('gpt-5.6-terra');
    expect(view.getSendMessageOptions().model).toBe('gpt-5.6-terra');
    view.chatSelectionControlsCoordinator.destroy();
  });

  it('retains an absent requested model instead of silently using the first catalog row', async () => {
    const a = conversation('missing-a', 'low');
    a.sessionSettings!.codexModelOverride = 'requested-missing-model';
    const { view } = await modelHarness(a, ['gpt-5.6-luna']);
    expect(view.getCurrentSessionModel()?.model).toBe('requested-missing-model');
    expect(await view.chatSelectionControlsCoordinator.ensureSelectedModelAvailable('codex', 'requested-missing-model')).toBe(false);
    view.chatSelectionControlsCoordinator.destroy();
  });


  it('rolls back a failed A menu save after switching to B without writing B tab state or defaults', async () => {
    const a = conversation('rollback-a', 'low');
    a.sessionSettings!.codexModelOverride = 'gpt-5.6-terra';
    const b = conversation('rollback-b', 'high');
    b.sessionSettings!.codexModelOverride = 'gpt-5.6-luna';
    const { view, toolbar, tabs } = await modelHarness(a);
    tabs.set(b.id, { provider: 'codex', model: 'other-tab-unchanged' });
    const beforeB = JSON.stringify(b);
    let rejectSave!: (reason: Error) => void;
    view.plugin.saveConversation.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    clickModel(toolbar, 'gpt-5.6-luna');
    expect(a.sessionSettings?.codexModelOverride).toBeNull();
    view.currentConversation = b;
    rejectSave(new Error('owned-save-failed'));
    await settleModelSave();
    expect(a.sessionSettings?.codexModelOverride).toBe('gpt-5.6-terra');
    expect(JSON.stringify(b)).toBe(beforeB);
    expect(tabs.get(b.id)).toEqual({ provider: 'codex', model: 'other-tab-unchanged' });
    expect(view.getSendMessageOptions().model).toBe('gpt-5.6-luna');
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
    expect(capturedNotices).not.toContain('');
    view.chatSelectionControlsCoordinator.destroy();
  });

  it('captures A before B/default updates and preserves omission for an unconfigured inherited model', async () => {
    const a = conversation('snapshot-a', 'low');
    a.sessionSettings!.codexModelOverride = 'gpt-5.6-terra';
    const { view } = await modelHarness(a);
    const captured = view.getSendMessageOptions() as { model?: string; codexOptions?: { model?: string } };
    const b = conversation('snapshot-b', 'high');
    b.sessionSettings!.codexModelOverride = null;
    view.currentConversation = b;
    view.plugin.settings.backendSettings.codex.model = '';
    expect(view.getSendMessageOptions().model).toBeUndefined();
    expect(view.getCurrentSessionModel()).toBeNull();
    expect(captured.model).toBe('gpt-5.6-terra');
    expect(captured.codexOptions?.model).toBe('gpt-5.6-terra');
    expect(a.sessionSettings.codexModelOverride).toBe('gpt-5.6-terra');
    view.chatSelectionControlsCoordinator.destroy();
  });


});

describe('Codex direct wrapped selection and custom captured-conversation boundaries', () => {
  beforeEach(() => clearCapturedNotices());
  afterEach(() => {
    delete (globalThis as typeof globalThis & { app?: unknown }).app;
    document.body.replaceChildren();
    delete (Notice.prototype as unknown as { noticeEl?: HTMLElement }).noticeEl;
    jest.restoreAllMocks();
  });

  it('direct actual wrapped runtime selection saves the authoritative A once without the menu persistence path', async () => {
    const a = conversation('direct-a', 'low');
    const { view, tabs, persisted, toolbar, runtime } = await modelHarness(a);
    expect(runtime.switchModel('codex', 'gpt-5.6-terra', { notify: false })).toBe(true);
    expect(a.sessionSettings?.codexModelOverride).toBe('gpt-5.6-terra');
    expect(view.getCurrentSessionModel()?.model).toBe('gpt-5.6-terra');
    expect(view.getSendMessageOptions().model).toBe('gpt-5.6-terra');
    await settleModelSave();
    expect(persisted.get(a.id)?.sessionSettings?.codexModelOverride).toBe('gpt-5.6-terra');
    expect(toolbar.querySelector('.opencodian-model-trigger-text')?.textContent).toContain('gpt-5.6-terra');
    expect(view.plugin.saveConversation).toHaveBeenCalledTimes(1);
    expect(tabs.get(a.id)?.model).toBe('gpt-5.6-luna');
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
    view.chatSelectionControlsCoordinator.destroy();
  });

  it.each(['clear', 'global'])('direct wrapped setter %s stores inheritance and tracks later global defaults', async (mode) => {
    const a = conversation('direct-inherit-' + mode, 'low');
    a.sessionSettings!.codexModelOverride = 'gpt-5.6-terra';
    const { view, persisted, wrappedHost } = await modelHarness(a);
    const selection = mode === 'clear' ? null : { provider: 'codex', model: 'gpt-5.6-luna' };
    expect(wrappedHost.setActiveTabModelOverride(selection)).toBe(true);
    expect(a.sessionSettings?.codexModelOverride).toBeNull();
    await settleModelSave();
    expect(persisted.get(a.id)?.sessionSettings?.codexModelOverride).toBeNull();
    expect(view.plugin.saveConversation).toHaveBeenCalledTimes(1);
    view.plugin.settings.backendSettings.codex.model = 'gpt-5.6-terra';
    expect(view.getCurrentSessionModel()?.model).toBe('gpt-5.6-terra');
    expect(view.getSendMessageOptions().model).toBe('gpt-5.6-terra');
    view.chatSelectionControlsCoordinator.destroy();
  });

  it('direct wrapped setter failure restores captured A only after switching to B', async () => {
    const a = conversation('direct-fail-a', 'low');
    a.sessionSettings!.codexModelOverride = 'gpt-5.6-luna';
    const previousA = JSON.stringify(a);
    const b = conversation('direct-fail-b', 'high');
    b.sessionSettings!.codexModelOverride = 'gpt-5.6-luna';
    const beforeB = JSON.stringify(b);
    const { view, tabs, runtime } = await modelHarness(a);
    tabs.set(b.id, { provider: 'codex', model: 'other-tab-unchanged' });
    let rejectSave!: (reason: Error) => void;
    view.plugin.saveConversation.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    expect(runtime.switchModel('codex', 'gpt-5.6-terra', { notify: false })).toBe(true);
    expect(view.plugin.saveConversation).toHaveBeenCalledTimes(1);
    view.currentConversation = b;
    rejectSave(new Error('direct-save-failed'));
    await settleModelSave();
    expect(JSON.stringify(a)).toBe(previousA);
    expect(JSON.stringify(b)).toBe(beforeB);
    expect(tabs.get(b.id)).toEqual({ provider: 'codex', model: 'other-tab-unchanged' });
    expect(view.plugin.settings.backendSettings.codex.model).toBe('gpt-5.6-luna');
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
    view.chatSelectionControlsCoordinator.destroy();
  });

  it('rejects direct foreign/blank selections and cancelled custom choices without a save', async () => {
    const a = conversation('direct-negative', 'low');
    const before = JSON.stringify(a);
    const { view, wrappedHost } = await modelHarness(a);
    expect(wrappedHost.setActiveTabModelOverride({ provider: 'foreign', model: 'model' })).toBe(false);
    expect(wrappedHost.setActiveTabModelOverride({ provider: 'codex', model: '  ' })).toBe(false);
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue(null);
    expect(wrappedHost.setActiveTabModelOverride({ provider: 'codex', model: CODEX_CUSTOM_MODEL_SENTINEL })).toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(view.plugin.saveConversation).not.toHaveBeenCalled();
    expect(JSON.stringify(a)).toBe(before);
    view.chatSelectionControlsCoordinator.destroy();
  });

  it('persists the resolved custom menu choice rather than the sentinel', async () => {
    const a = conversation('custom-a', 'low');
    const { view, toolbar, persisted } = await modelHarness(a);
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue('owned-custom-model');
    clickModel(toolbar, CODEX_CUSTOM_MODEL_SENTINEL);
    await settleModelSave();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(a.sessionSettings?.codexModelOverride).toBe('owned-custom-model');
    expect(persisted.get(a.id)?.sessionSettings?.codexModelOverride).toBe('owned-custom-model');
    expect(view.getSendMessageOptions().model).toBe('owned-custom-model');
    expect(view.plugin.saveConversation).toHaveBeenCalledTimes(1);
    view.chatSelectionControlsCoordinator.destroy();
  });

  it.each([null, '', '   '])('custom menu prompt result %s performs zero mutation and zero saves', async (choice) => {
    const a = conversation('cancel-menu', 'low');
    const beforeA = JSON.stringify(a);
    const { view, tabs, toolbar } = await modelHarness(a);
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue(choice);
    clickModel(toolbar, CODEX_CUSTOM_MODEL_SENTINEL);
    await settleModelSave();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(a)).toBe(beforeA);
    expect(view.plugin.saveConversation).not.toHaveBeenCalled();
    expect(tabs.get(a.id)?.model).toBe('gpt-5.6-luna');
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
    expect(capturedNotices).not.toContain('');
    view.chatSelectionControlsCoordinator.destroy();
  });


  it.each([CODEX_CUSTOM_MODEL_SENTINEL, '  ' + CODEX_CUSTOM_MODEL_SENTINEL + '  '])('rejects the reserved custom menu prompt value %s without writing any conversation', async (choice) => {
    const a = conversation('reserved-a', 'low');
    a.sessionSettings!.codexModelOverride = 'gpt-5.6-terra';
    const b = conversation('reserved-b', 'high');
    b.sessionSettings!.codexModelOverride = 'gpt-5.6-luna';
    const { view, tabs, persisted, toolbar } = await modelHarness(a);
    tabs.set(b.id, { provider: 'codex', model: 'other-tab-unchanged' });
    const beforeA = JSON.stringify(a);
    const beforeB = JSON.stringify(b);
    const beforeSettings = JSON.stringify(view.plugin.settings);
    const beforeTabs = JSON.stringify([...tabs]);
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue(choice);
    const display = jest.spyOn(view.chatSelectionControlsCoordinator, 'updateModelSelectorDisplay');
    clickModel(toolbar, CODEX_CUSTOM_MODEL_SENTINEL);
    await settleModelSave();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(view.plugin.saveConversation).not.toHaveBeenCalled();
    expect(view.plugin.saveSettings).not.toHaveBeenCalled();
    expect(persisted.size).toBe(0);
    expect(JSON.stringify(a)).toBe(beforeA);
    expect(JSON.stringify(b)).toBe(beforeB);
    expect(JSON.stringify(view.plugin.settings)).toBe(beforeSettings);
    expect(JSON.stringify([...tabs])).toBe(beforeTabs);
    expect(display).not.toHaveBeenCalled();
    expect(view.getSendMessageOptions().model).toBe('gpt-5.6-terra');
    view.chatSelectionControlsCoordinator.destroy();
  });

  it('captures A before the custom prompt changes the active conversation to B', async () => {
    const a = conversation('prompt-a', 'low');
    const b = conversation('prompt-b', 'high');
    b.sessionSettings!.codexModelOverride = 'gpt-5.6-terra';
    const beforeB = JSON.stringify(b);
    const { view, tabs, persisted, toolbar } = await modelHarness(a);
    tabs.set(b.id, { provider: 'codex', model: 'other-tab-unchanged' });
    const prompt = jest.spyOn(window, 'prompt').mockImplementation(() => {
      view.currentConversation = b;
      return 'owned-custom-a';
    });
    clickModel(toolbar, CODEX_CUSTOM_MODEL_SENTINEL);
    await settleModelSave();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(a.sessionSettings?.codexModelOverride).toBe('owned-custom-a');
    expect(persisted.get(a.id)?.sessionSettings?.codexModelOverride).toBe('owned-custom-a');
    expect(view.plugin.saveConversation).toHaveBeenCalledTimes(1);
    expect(view.plugin.saveConversation).toHaveBeenCalledWith(a);
    expect(JSON.stringify(b)).toBe(beforeB);
    expect(tabs.get(b.id)?.model).toBe('other-tab-unchanged');
    expect(view.plugin.settings.backendSettings.codex.model).toBe('gpt-5.6-luna');
    expect(capturedNotices).not.toContain('');
    view.chatSelectionControlsCoordinator.destroy();
  });

});
