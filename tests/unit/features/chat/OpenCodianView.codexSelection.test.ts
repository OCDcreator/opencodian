import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import type { Conversation } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import type { ComposerInputShellCoordinatorHost } from '../../../../src/features/chat/services/ComposerInputShellCoordinator';
import { ConversationSessionSettingsCoordinator } from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';
import type { EffortSelector, EffortSelectorCallbacks } from '../../../../src/features/chat/ui/EffortSelector';

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
