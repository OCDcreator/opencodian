import type {
  Conversation,
  ConversationSessionSettings,
} from '../../../../src/core/types';
import {
  ConversationSessionSettingsCoordinator,
  type ConversationSessionSettingsCoordinatorHost,
} from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';

jest.mock('../../../../src/features/chat/ui/ConversationSessionSettingsModal', () => ({
  ConversationSessionSettingsModal: jest.fn().mockImplementation((_app, options) => ({
    open: jest.fn(),
    options,
  })),
}));

function createCodexConversation(
  overrides?: ConversationSessionSettings,
): Conversation {
  return {
    id: 'codex-conv-1',
    title: 'Codex Session',
    createdAt: 1,
    updatedAt: 1,
    backend: 'codex',
    backendSessionId: 'codex-session-1',
    messages: [],
    sessionSettings: overrides,
  };
}

function createOpenCodeConversation(
  overrides?: ConversationSessionSettings,
): Conversation {
  return {
    id: 'opencode-conv-1',
    title: 'OpenCode Session',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'opencode-session-1',
    messages: [],
    sessionSettings: overrides,
  };
}

function createCoordinator(options?: {
  currentConversation?: Conversation | null;
}) {
  const chatContainerEl = document.createElement('div');
  const applyCodexRuntimeOverrides = jest.fn();
  const saveConversation = jest.fn().mockResolvedValue(undefined);
  const host = {
    app: {} as never,
    getCurrentConversation: jest.fn().mockReturnValue(options?.currentConversation ?? null),
    getSessionSettingsDefaults: jest.fn().mockReturnValue({
      chatFontSizePx: 13,
    }),
    getCodexGlobalDefaults: jest.fn().mockReturnValue({
      sandboxMode: 'workspace-write' as const,
      modelReasoningEffort: 'medium' as const,
      model: 'codex-mini-latest',
      additionalDirectories: [] as string[],
      networkAccessEnabled: false,
    }),
    getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
    saveConversation,
    showNotice: jest.fn(),
    applyCodexRuntimeOverrides,
    supportsSessionSharing: jest.fn().mockReturnValue(false),
    supportsCompaction: jest.fn().mockReturnValue(false),
  } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;

  return {
    coordinator: new ConversationSessionSettingsCoordinator(host),
    host,
    chatContainerEl,
    saveConversation,
    applyCodexRuntimeOverrides,
  };
}

describe('ConversationSessionSettingsCoordinator Codex overrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves Codex sandbox mode from conversation override', () => {
    const conv = createCodexConversation({ codexSandboxMode: 'read-only' });
    const { coordinator } = createCoordinator({ currentConversation: conv });

    const effective = coordinator.resolveEffectiveSettings(conv);

    expect(effective.codexSandboxMode).toBe('read-only');
  });

  it('resolves Codex reasoning effort from conversation override', () => {
    const conv = createCodexConversation({ codexModelReasoningEffort: 'high' });
    const { coordinator } = createCoordinator({ currentConversation: conv });

    const effective = coordinator.resolveEffectiveSettings(conv);

    expect(effective.codexModelReasoningEffort).toBe('high');
  });

  it('falls back to Codex global defaults when sandbox mode override is null', () => {
    const conv = createCodexConversation({ codexSandboxMode: null });
    const { coordinator } = createCoordinator({ currentConversation: conv });

    const effective = coordinator.resolveEffectiveSettings(conv);

    expect(effective.codexSandboxMode).toBe('workspace-write');
  });

  it('falls back to Codex global defaults when reasoning effort override is null', () => {
    const conv = createCodexConversation({ codexModelReasoningEffort: null });
    const { coordinator } = createCoordinator({ currentConversation: conv });

    const effective = coordinator.resolveEffectiveSettings(conv);

    expect(effective.codexModelReasoningEffort).toBe('medium');
  });

  it('falls back to Codex global defaults when no overrides exist', () => {
    const conv = createCodexConversation();
    const { coordinator } = createCoordinator({ currentConversation: conv });

    const effective = coordinator.resolveEffectiveSettings(conv);

    expect(effective.codexSandboxMode).toBe('workspace-write');
    expect(effective.codexModelReasoningEffort).toBe('medium');
  });

  it('applies Codex runtime overrides to the adapter on runtime apply', async () => {
    const conv = createCodexConversation({
      codexSandboxMode: 'danger-full-access',
      codexModelReasoningEffort: 'xhigh',
    });
    const { coordinator, applyCodexRuntimeOverrides } = createCoordinator({
      currentConversation: conv,
    });

    await coordinator.applyConversationRuntimeState(conv);

    expect(applyCodexRuntimeOverrides).toHaveBeenCalledWith({
      sandboxMode: 'danger-full-access',
      modelReasoningEffort: 'xhigh',
      model: 'codex-mini-latest',
      additionalDirectories: [],
      networkAccessEnabled: false,
    });
  });

  it('applies inherited Codex defaults when overrides are null', async () => {
    const conv = createCodexConversation({
      codexSandboxMode: null,
      codexModelReasoningEffort: null,
    });
    const { coordinator, applyCodexRuntimeOverrides } = createCoordinator({
      currentConversation: conv,
    });

    await coordinator.applyConversationRuntimeState(conv);

    expect(applyCodexRuntimeOverrides).toHaveBeenCalledWith({
      sandboxMode: 'workspace-write',
      modelReasoningEffort: 'medium',
      model: 'codex-mini-latest',
      additionalDirectories: [],
      networkAccessEnabled: false,
    });
  });

  it('persists Codex overrides and reapplies runtime state', async () => {
    const conv = createCodexConversation();
    const { coordinator, saveConversation, applyCodexRuntimeOverrides } = createCoordinator({
      currentConversation: conv,
    });

    await coordinator.saveConversationOverrides(conv, {
      codexSandboxMode: 'read-only',
      codexModelReasoningEffort: 'low',
    });

    expect(conv.sessionSettings?.codexSandboxMode).toBe('read-only');
    expect(conv.sessionSettings?.codexModelReasoningEffort).toBe('low');
    expect(saveConversation).toHaveBeenCalledWith(conv);
    expect(applyCodexRuntimeOverrides).toHaveBeenCalledWith({
      sandboxMode: 'read-only',
      modelReasoningEffort: 'low',
      model: 'codex-mini-latest',
      additionalDirectories: [],
      networkAccessEnabled: false,
    });
  });

  it('passes showCodexControls=true to modal for Codex conversations', async () => {
    const conv = createCodexConversation();
    const { coordinator } = createCoordinator({ currentConversation: conv });

    await coordinator.openCurrentConversationSettings();

    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.showCodexControls).toBe(true);
    expect(modalOptions.defaults.codexSandboxMode).toBe('workspace-write');
    expect(modalOptions.defaults.codexModelReasoningEffort).toBe('medium');
  });

  it('passes showCodexControls=false to modal for non-Codex conversations', async () => {
    const conv = createOpenCodeConversation();
    const { coordinator } = createCoordinator({ currentConversation: conv });

    await coordinator.openCurrentConversationSettings();

    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.showCodexControls).toBeFalsy();
  });

  it('does not call applyCodexRuntimeOverrides for non-Codex conversations', async () => {
    const conv = createOpenCodeConversation();
    const { coordinator, applyCodexRuntimeOverrides } = createCoordinator({
      currentConversation: conv,
    });

    await coordinator.applyConversationRuntimeState(conv);

    expect(applyCodexRuntimeOverrides).not.toHaveBeenCalled();
  });

  it('resolves global additionalDirectories when conversation has no override', () => {
    const conv = createCodexConversation();
    const chatContainerEl = document.createElement('div');
    const applyCodexRuntimeOverrides = jest.fn();
    const saveConversation = jest.fn().mockResolvedValue(undefined);
    const host = {
      app: {} as never,
      getCurrentConversation: jest.fn().mockReturnValue(conv),
      getSessionSettingsDefaults: jest.fn().mockReturnValue({
        chatFontSizePx: 13,
      }),
      getCodexGlobalDefaults: jest.fn().mockReturnValue({
        sandboxMode: 'workspace-write' as const,
        modelReasoningEffort: 'medium' as const,
        model: 'codex-mini-latest',
        additionalDirectories: ['/global/extra'],
      }),
      getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
      saveConversation,
      showNotice: jest.fn(),
      applyCodexRuntimeOverrides,
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
    } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    const effective = coordinator.resolveEffectiveSettings(conv);

    expect(effective.codexAdditionalDirectories).toEqual(['/global/extra']);
  });

  it('passes additionalDirectories to applyCodexRuntimeOverrides', async () => {
    const conv = createCodexConversation({ codexAdditionalDirectories: ['/tmp/probe'] });
    const { coordinator, applyCodexRuntimeOverrides } = createCoordinator({
      currentConversation: conv,
    });

    await coordinator.applyConversationRuntimeState(conv);

    expect(applyCodexRuntimeOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ additionalDirectories: ['/tmp/probe'] }),
    );
  });

  it('applies global additionalDirectories to adapter when conversation has no override', async () => {
    const conv = createCodexConversation();
    const chatContainerEl = document.createElement('div');
    const applyCodexRuntimeOverrides = jest.fn();
    const saveConversation = jest.fn().mockResolvedValue(undefined);
    const host = {
      app: {} as never,
      getCurrentConversation: jest.fn().mockReturnValue(conv),
      getSessionSettingsDefaults: jest.fn().mockReturnValue({
        chatFontSizePx: 13,
      }),
      getCodexGlobalDefaults: jest.fn().mockReturnValue({
        sandboxMode: 'workspace-write' as const,
        modelReasoningEffort: 'medium' as const,
        model: 'codex-mini-latest',
        additionalDirectories: ['/global/extra'],
      }),
      getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
      saveConversation,
      showNotice: jest.fn(),
      applyCodexRuntimeOverrides,
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
    } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.applyConversationRuntimeState(conv);

    expect(applyCodexRuntimeOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ additionalDirectories: ['/global/extra'] }),
    );
  });

  it('persists additionalDirectories override and reapplies runtime state', async () => {
    const conv = createCodexConversation();
    const { coordinator, saveConversation, applyCodexRuntimeOverrides } = createCoordinator({
      currentConversation: conv,
    });

    await coordinator.saveConversationOverrides(conv, {
      codexAdditionalDirectories: ['/tmp/probe'],
    });

    expect(conv.sessionSettings?.codexAdditionalDirectories).toEqual(['/tmp/probe']);
    expect(saveConversation).toHaveBeenCalledWith(conv);
    expect(applyCodexRuntimeOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ additionalDirectories: ['/tmp/probe'] }),
    );
  });

});

describe('ConversationSessionSettingsCoordinator Codex model override', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves Codex model override from conversation override', () => {
    const conv = createCodexConversation({ codexModelOverride: 'o4-mini' });
    const { coordinator } = createCoordinator({ currentConversation: conv });

    const effective = coordinator.resolveEffectiveSettings(conv);

    expect(effective.codexModelOverride).toBe('o4-mini');
  });

  it('falls back to Codex global model when model override is null', () => {
    const conv = createCodexConversation({ codexModelOverride: null });
    const { coordinator } = createCoordinator({ currentConversation: conv });

    const effective = coordinator.resolveEffectiveSettings(conv);

    expect(effective.codexModelOverride).toBe('codex-mini-latest');
  });

  it('falls back to Codex global model when no model override exists', () => {
    const conv = createCodexConversation();
    const { coordinator } = createCoordinator({ currentConversation: conv });

    const effective = coordinator.resolveEffectiveSettings(conv);

    expect(effective.codexModelOverride).toBe('codex-mini-latest');
  });

  it('passes model override to applyCodexRuntimeOverrides', async () => {
    const conv = createCodexConversation({ codexModelOverride: 'o4-mini' });
    const { coordinator, applyCodexRuntimeOverrides } = createCoordinator({
      currentConversation: conv,
    });

    await coordinator.applyConversationRuntimeState(conv);

    expect(applyCodexRuntimeOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'o4-mini' }),
    );
  });

  it('passes inherited model to applyCodexRuntimeOverrides when override is null', async () => {
    const conv = createCodexConversation({ codexModelOverride: null });
    const { coordinator, applyCodexRuntimeOverrides } = createCoordinator({
      currentConversation: conv,
    });

    await coordinator.applyConversationRuntimeState(conv);

    expect(applyCodexRuntimeOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'codex-mini-latest' }),
    );
  });

  it('persists model override and reapplies runtime state', async () => {
    const conv = createCodexConversation();
    const { coordinator, saveConversation, applyCodexRuntimeOverrides } = createCoordinator({
      currentConversation: conv,
    });

    await coordinator.saveConversationOverrides(conv, {
      codexModelOverride: 'o4-mini',
    });

    expect(conv.sessionSettings?.codexModelOverride).toBe('o4-mini');
    expect(saveConversation).toHaveBeenCalledWith(conv);
    expect(applyCodexRuntimeOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'o4-mini' }),
    );
  });

  it('passes model default to modal for Codex conversations', async () => {
    const conv = createCodexConversation();
    const { coordinator } = createCoordinator({ currentConversation: conv });

    await coordinator.openCurrentConversationSettings();

    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.defaults.codexModelOverride).toBe('codex-mini-latest');
  });
});
