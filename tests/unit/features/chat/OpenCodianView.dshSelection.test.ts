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

function harness(active: Conversation): DshHarness {
  const view = Object.assign(Object.create(OpenCodianView.prototype), {
    currentConversation: active, currentVariant: undefined, variantStore: {},
    plugin: {
      settings: { activeBackend: 'dsh', backendSettings: { dsh: {} } },
      saveConversation: jest.fn(async () => {}),
      agentServiceRegistry: { get: jest.fn(() => ({ getDefaultReasoningEffort: () => 'medium' })) },
    },
    tabManager: {
      getActiveTab: jest.fn(() => ({ id: 'active-tab' })),
      getActiveTabModelOverride: jest.fn(() => ({ provider: 'unrelated', model: 'must-not-leak' })),
      setActiveTabModelOverride: jest.fn(),
    },
    findKnownModelInfo: jest.fn(() => ({ variants: ['low', 'medium', 'high'] })),
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
