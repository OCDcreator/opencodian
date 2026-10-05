import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import { type Conversation, normalizeConversationSessionSettings } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import type { ChatSelectionControlsCoordinatorHost } from '../../../../src/features/chat/services/ChatSelectionControlsCoordinator';
import type { ComposerInputShellCoordinatorHost } from '../../../../src/features/chat/services/ComposerInputShellCoordinator';
import type { EffortSelector, EffortSelectorCallbacks } from '../../../../src/features/chat/ui/EffortSelector';
import { t } from '../../../../src/i18n';

type PiHarness = {
  currentConversation: Conversation;
  currentVariant?: string;
  plugin: { saveConversation: jest.Mock; settings: { backendSettings: { pi: { thinkingLevel: string } } } };
  tabManager: { getActiveTabModelOverride: jest.Mock; setActiveTabModelOverride: jest.Mock };
  effortSelector: EffortSelector & { callbacks: EffortSelectorCallbacks };
  createComposerInputShellCoordinatorHost(): ComposerInputShellCoordinatorHost;
  createChatSelectionControlsCoordinatorHost(): ChatSelectionControlsCoordinatorHost;
  getBackendScopedActiveTabModelOverride(): { provider: string; model: string } | null;
  getCurrentEffortVariant(): string | undefined;
  getCurrentSessionModel(): { provider: string; model: string } | null;
  getSendMessageOptions(): { provider?: string; model?: string; variant?: string };
};

function conversation(id: string): Conversation {
  return { id, backend: 'pi', title: id, createdAt: 1, updatedAt: 1, messages: [] };
}

function harness(active: Conversation): PiHarness {
  const view = Object.assign(Object.create(OpenCodianView.prototype), {
    currentConversation: active,
    currentVariant: undefined,
    variantStore: {},
    plugin: {
      settings: { activeBackend: 'pi', backendSettings: { pi: { thinkingLevel: 'medium' } } },
      saveConversation: jest.fn(async () => {}),
    },
    tabManager: {
      getActiveTab: jest.fn(() => ({ id: 'active-tab' })),
      getActiveTabModelOverride: jest.fn(() => null),
      setActiveTabModelOverride: jest.fn(),
    },
    findKnownModelInfo: jest.fn(() => ({ variants: ['off', 'low', 'medium', 'high'] })),
  }) as PiHarness;
  Object.defineProperty(view, 'caps', { value: new Set([AgentCapability.Thinking]) });
  view.getCurrentSessionModel = () => view.getBackendScopedActiveTabModelOverride() ?? { provider: 'pi', model: 'default' };
  return view;
}

function effortCallbacks(view: PiHarness): EffortSelectorCallbacks {
  view.createComposerInputShellCoordinatorHost().mountEffortSelector(document.createElement('div'));
  return (view.effortSelector as unknown as { callbacks: EffortSelectorCallbacks }).callbacks;
}

describe('Pi composer session selection', () => {
  it('uses inheritance copy and keeps an explicit off choice distinct in the actual host', async () => {
    const view = harness(conversation('a'));
    const callbacks = effortCallbacks(view);
    expect(callbacks.getDefaultOptionLabel?.()).toBe(t('chat.effort.inherit.pi'));
    expect(callbacks.getBoundaryHint?.()).toBe(t('chat.effort.boundaryHint.pi'));
    expect(callbacks.getVariant()).toBeUndefined();
    await callbacks.onVariantChange('off');
    expect(view.getSendMessageOptions().variant).toBe('off');
    await callbacks.onVariantChange(undefined);
    expect(view.getSendMessageOptions().variant).toBeUndefined();
    expect(view.plugin.settings.backendSettings.pi.thinkingLevel).toBe('medium');
  });

  it('persists independent choices for two conversations and restores after losing the view and tab cache', async () => {
    const a = conversation('a');
    const b = conversation('b');
    const view = harness(a);
    const selection = view.createChatSelectionControlsCoordinatorHost();
    const callbacks = effortCallbacks(view);
    selection.setActiveTabModelOverride({ provider: 'pi', model: 'a-model' });
    await callbacks.onVariantChange('low');
    view.currentConversation = b;
    selection.setActiveTabModelOverride({ provider: 'pi', model: 'b-model' });
    await callbacks.onVariantChange('high');
    const reloadedA = harness({ ...a, sessionSettings: normalizeConversationSessionSettings(JSON.parse(JSON.stringify(a.sessionSettings))) });
    const reloadedB = harness({ ...b, sessionSettings: normalizeConversationSessionSettings(JSON.parse(JSON.stringify(b.sessionSettings))) });
    expect(reloadedA.getSendMessageOptions()).toEqual({ provider: 'pi', model: 'a-model', variant: 'low' });
    expect(reloadedB.getSendMessageOptions()).toEqual({ provider: 'pi', model: 'b-model', variant: 'high' });
    view.currentConversation = a;
    selection.updateEffortSelectorDisplay();
    expect(callbacks.getVariant()).toBe('low');
    expect(view.plugin.settings.backendSettings.pi.thinkingLevel).toBe('medium');
  });
});
