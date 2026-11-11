import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import { type Conversation, normalizeConversationSessionSettings } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import type { ComposerInputShellCoordinatorHost } from '../../../../src/features/chat/services/composer/ComposerInputShellCoordinator';
import type { ChatSelectionControlsCoordinatorHost } from '../../../../src/features/chat/services/selection/ChatSelectionControlsCoordinator';
import type { EffortSelector, EffortSelectorCallbacks } from '../../../../src/features/chat/ui/EffortSelector';
import { t } from '../../../../src/i18n';

type DshHarness = {
  currentConversation: Conversation;
  plugin: { saveConversation: jest.Mock; agentServiceRegistry: { get: jest.Mock } };
  effortSelector: EffortSelector & { callbacks: EffortSelectorCallbacks };
  createComposerInputShellCoordinatorHost(): ComposerInputShellCoordinatorHost;
  createChatSelectionControlsCoordinatorHost(): ChatSelectionControlsCoordinatorHost;
  getBackendScopedActiveTabModelOverride(): { provider: string; model: string } | null;
  getCurrentSessionModel(): { provider: string; model: string } | null;
  getSendMessageOptions(): { provider?: string; model?: string; variant?: string };
};

function conversation(id: string): Conversation {
  return { id, backend: 'dsh', title: id, createdAt: 1, updatedAt: 1, messages: [] };
}

type NativeDshEffort = { defaultEffort: string | undefined; variants: string[] };

function harness(
  active: Conversation,
  native: NativeDshEffort = { defaultEffort: 'medium', variants: ['low', 'medium', 'high'] },
): DshHarness {
  const view = Object.assign(Object.create(OpenCodianView.prototype), {
    currentConversation: active, currentVariant: undefined, variantStore: {},
    plugin: {
      settings: { activeBackend: 'dsh', backendSettings: { dsh: {} } },
      saveConversation: jest.fn(async () => {}),
      agentServiceRegistry: { get: jest.fn(() => ({ getDefaultReasoningEffort: () => native.defaultEffort })) },
    },
    tabManager: {
      getActiveTab: jest.fn(() => ({ id: 'active-tab' })),
      getActiveTabModelOverride: jest.fn(() => ({ provider: 'unrelated', model: 'must-not-leak' })),
      setActiveTabModelOverride: jest.fn(),
    },
    findKnownModelInfo: jest.fn(() => ({ variants: native.variants })),
  }) as DshHarness;
  Object.defineProperty(view, 'caps', { value: new Set([AgentCapability.Thinking]) });
  view.getCurrentSessionModel = () => view.getBackendScopedActiveTabModelOverride() ?? { provider: 'dsh', model: 'native-default' };
  return view;
}

function effortCallbacks(view: DshHarness): EffortSelectorCallbacks {
  view.createComposerInputShellCoordinatorHost().mountEffortSelector(document.createElement('div'));
  return view.effortSelector.callbacks;
}

describe('DSH composer persistence', () => {
  it('distinguishes a model-default choice from explicit effort without changing send resolution', async () => {
    const view = harness(conversation('default-ui'));
    const callbacks = effortCallbacks(view);
    expect(callbacks.getVariant()).toBeUndefined();
    expect(callbacks.getDefaultOptionLabel?.()).toBe(t('chat.dsh.reasoning.modelDefault', { effort: 'Medium' }));
    expect(callbacks.getBoundaryHint?.()).toBe(t('chat.dsh.reasoning.boundaryHint'));
    expect(view.getSendMessageOptions().variant).toBe('medium');
    await callbacks.onVariantChange('off');
    expect(callbacks.getVariant()).toBe('off');
    expect(view.getSendMessageOptions().variant).toBe('off');
    await callbacks.onVariantChange(undefined);
    expect(callbacks.getVariant()).toBeUndefined();
    expect(view.getSendMessageOptions().variant).toBe('medium');
  });

  it('persists two conversations independently and restores opaque model and effort choices after reload', async () => {
    const a = conversation('a');
    const b = conversation('b');
    const view = harness(a);
    const host = view.createChatSelectionControlsCoordinatorHost();
    const effort = effortCallbacks(view);
    await host.persistDshModelSelection?.({ provider: 'route-a', model: '["route-a","model/alpha"]' });
    await effort.onVariantChange('low');
    view.currentConversation = b;
    await host.persistDshModelSelection?.({ provider: 'route-b', model: 'opaque:beta' });
    await effort.onVariantChange('high');
    for (const [value, provider, model, variant] of [
      [a, 'route-a', '["route-a","model/alpha"]', 'low'],
      [b, 'route-b', 'opaque:beta', 'high'],
    ] as const) {
      const restored = harness({ ...value, sessionSettings: normalizeConversationSessionSettings(JSON.parse(JSON.stringify(value.sessionSettings))) });
      expect(restored.getSendMessageOptions()).toEqual({ provider, model, variant });
    }
  });

  it('restores inheritance without borrowing another backend tab model and keeps failed saves scoped', async () => {
    const a = conversation('a');
    const b = conversation('b');
    const view = harness(a);
    expect(view.getBackendScopedActiveTabModelOverride()).toBeNull();
    const host = view.createChatSelectionControlsCoordinatorHost();
    view.plugin.saveConversation.mockRejectedValueOnce(new Error('owned save failed'));
    await expect(host.persistDshModelSelection?.({ provider: 'route', model: 'new' })).rejects.toThrow('owned save failed');
    expect(a.sessionSettings).toBeUndefined();
    expect(b.sessionSettings).toBeUndefined();
    expect(a.updatedAt).toBe(1);
    const effort = effortCallbacks(view);
    await effort.onVariantChange('high');
    await effort.onVariantChange(undefined);
    expect(view.getSendMessageOptions().variant).toBe('medium');
  });
});

describe('DSH effort labels: inherited default versus explicit off', () => {
  const KEY = 'dsh/native-default';
  const OFF_LABEL = t('chat.effort.disabled');
  const inheritLabel = (effort: string) => t('chat.dsh.reasoning.modelDefault', { effort });
  const settle = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

  function tickLabels(view: DshHarness): Array<string | null> {
    return Array.from(view.effortSelector.getElement().querySelectorAll('.opencodian-effort-tick'))
      .map((tick) => tick.textContent);
  }

  it('shows two different labels and saves undefined and "off" as different values through the slider', async () => {
    const active = conversation('inherit-vs-off');
    const native: NativeDshEffort = { defaultEffort: 'off', variants: ['off', 'low', 'high', 'max'] };
    const view = harness(active, native);
    const callbacks = effortCallbacks(view);
    const inheritOff = inheritLabel(t('chat.effort.disabledShort'));

    // Inherit is the raw "no override" state, never the resolved default value.
    expect(callbacks.getVariant()).toBeUndefined();
    expect(inheritOff).not.toBe(OFF_LABEL);
    expect(tickLabels(view)).toEqual([inheritOff, OFF_LABEL, 'Low', 'High', 'Max']);
    expect(view.effortSelector.getDisplayLabel()).toBe(inheritOff);

    const slider = view.effortSelector.getElement().querySelector<HTMLInputElement>('.opencodian-effort-slider');
    if (!slider) throw new Error('inline effort slider was not mounted');
    slider.value = '1';
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(active.sessionSettings?.dshEffortOverrides?.[KEY]).toBe('off');
    expect(callbacks.getVariant()).toBe('off');
    expect(view.effortSelector.getDisplayLabel()).toBe(OFF_LABEL);
    expect(view.getSendMessageOptions().variant).toBe('off');

    slider.value = '0';
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(active.sessionSettings?.dshEffortOverrides?.[KEY]).toBeNull();
    expect(callbacks.getVariant()).toBeUndefined();
    expect(view.effortSelector.getDisplayLabel()).toBe(inheritOff);

    // The choices only coincide while the DSH default is off: inherit follows
    // a changed default, the explicit off override does not.
    native.defaultEffort = 'high';
    expect(callbacks.getDefaultOptionLabel?.()).toBe(inheritLabel('High'));
    expect(view.getSendMessageOptions().variant).toBe('high');
    await callbacks.onVariantChange('off');
    expect(view.getSendMessageOptions().variant).toBe('off');
    expect(view.effortSelector.getDisplayLabel()).toBe(OFF_LABEL);
  });

  it('restores explicit off, inheritance and the current max override as separate saved states', async () => {
    const native: NativeDshEffort = { defaultEffort: 'off', variants: ['off', 'low', 'high', 'max'] };
    for (const [chosen, restoredVariant, restoredLabel] of [
      ['off', 'off', OFF_LABEL],
      [undefined, undefined, inheritLabel(t('chat.effort.disabledShort'))],
      ['max', 'max', 'Max'],
    ] as const) {
      const active = conversation(`restore-${String(chosen)}`);
      const callbacks = effortCallbacks(harness(active, native));
      await callbacks.onVariantChange('low');
      await callbacks.onVariantChange(chosen);

      const restored = harness({
        ...active,
        sessionSettings: normalizeConversationSessionSettings(JSON.parse(JSON.stringify(active.sessionSettings))),
      }, native);
      expect(effortCallbacks(restored).getVariant()).toBe(restoredVariant);
      expect(restored.effortSelector.getDisplayLabel()).toBe(restoredLabel);
      expect(restored.getSendMessageOptions().variant).toBe(chosen ?? 'off');
    }
  });

  it('keeps the unknown-default wording when DSH reports no default', () => {
    const view = harness(conversation('unknown-default'), { defaultEffort: undefined, variants: ['off', 'low'] });
    const callbacks = effortCallbacks(view);

    expect(callbacks.getDefaultOptionLabel?.()).toBe(t('chat.dsh.reasoning.inherit'));
    expect(tickLabels(view)).toEqual([t('chat.dsh.reasoning.inherit'), OFF_LABEL, 'Low']);
    expect(view.effortSelector.getDisplayLabel()).toBe(t('chat.dsh.reasoning.inherit'));
    expect(view.getSendMessageOptions().variant).toBeUndefined();
  });

  it('maps only the DSH off level and leaves every other level and backend on the built-in label', () => {
    const view = harness(conversation('mapping-scope'), { defaultEffort: 'off', variants: ['off', 'low', 'max'] });
    const callbacks = effortCallbacks(view);

    expect(callbacks.getVariantLabel?.('off')).toBe(OFF_LABEL);
    for (const variant of ['low', 'high', 'xhigh', 'max', 'custom-tier']) {
      expect(callbacks.getVariantLabel?.(variant)).toBeUndefined();
    }
    for (const backend of ['pi', 'zcode', 'opencode2'] as const) {
      view.currentConversation = { ...conversation(backend), backend };
      expect(callbacks.getVariantLabel?.('off')).toBeUndefined();
    }
  });
});

describe('conversation session catalog refresh', () => {
  function hookHarness(conversation: Conversation) {
    const calls = {
      reloadModelCatalog: jest.fn(async () => {}),
      refreshZCodeSessionState: jest.fn(async () => {}),
      watchNativeTasks: jest.fn(async () => {}),
    };
    const view = Object.create(OpenCodianView.prototype) as Record<string, unknown>;
    view.currentConversation = conversation;
    view.chatSelectionControlsCoordinator = {
      reloadModelCatalog: calls.reloadModelCatalog,
      refreshZCodeSessionState: calls.refreshZCodeSessionState,
    };
    view.backgroundTaskInlinePanelRenderer = { watchNativeTasks: calls.watchNativeTasks };
    view.conversationTabRuntimeCoordinator = { getActiveTabId: jest.fn(() => 'tab-1') };
    const hook = (view as { refreshSessionCatalogForCurrentConversation(): Promise<void> });
    return { hook, calls };
  }

  it('reloads the owned session catalog after a dsh conversation restores, without any picker', async () => {
    const { hook, calls } = hookHarness(
      { id: 'restored', backend: 'dsh', backendSessionId: 'native-1', title: 'r', createdAt: 1, updatedAt: 1, messages: [] });
    await hook.refreshSessionCatalogForCurrentConversation();
    expect(calls.reloadModelCatalog).toHaveBeenCalledTimes(1);
    expect(calls.refreshZCodeSessionState).not.toHaveBeenCalled();
    expect(calls.watchNativeTasks).not.toHaveBeenCalled();
  });

  it('keeps a sessionless dsh conversation catalog-free instead of borrowing another session', async () => {
    const { hook, calls } = hookHarness({ id: 'fresh', backend: 'dsh', title: 'f', createdAt: 1, updatedAt: 1, messages: [] });
    await hook.refreshSessionCatalogForCurrentConversation();
    expect(calls.reloadModelCatalog).not.toHaveBeenCalled();
  });

  it('preserves the zcode conversation path with its own gated collaborators', async () => {
    const { hook, calls } = hookHarness(
      { id: 'z', backend: 'zcode', backendSessionId: 'zc-1', title: 'z', createdAt: 1, updatedAt: 1, messages: [] });
    await hook.refreshSessionCatalogForCurrentConversation();
    expect(calls.reloadModelCatalog).toHaveBeenCalledTimes(1);
    expect(calls.refreshZCodeSessionState).toHaveBeenCalledTimes(1);
    expect(calls.watchNativeTasks).toHaveBeenCalledTimes(1);
  });

  it('does nothing for backends without a session-scoped catalog hook', async () => {
    const { hook, calls } = hookHarness(
      { id: 'oc', backend: 'opencode', backendSessionId: 'oc-1', title: 'o', createdAt: 1, updatedAt: 1, messages: [] });
    await hook.refreshSessionCatalogForCurrentConversation();
    expect(calls.reloadModelCatalog).not.toHaveBeenCalled();
    expect(calls.refreshZCodeSessionState).not.toHaveBeenCalled();
    expect(calls.watchNativeTasks).not.toHaveBeenCalled();
  });
});
