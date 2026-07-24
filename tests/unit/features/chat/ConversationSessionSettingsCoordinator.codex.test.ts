/* eslint-disable max-lines, max-lines-per-function -- Covers Codex override resolution/apply, model/thread-goal/review delegation, share routing, and approval-policy inheritance across many scenarios in cohesive describe blocks. */
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

const CODEX_GLOBAL_DEFAULTS = {
  sandboxMode: 'workspace-write' as const,
  modelReasoningEffort: 'medium' as const,
  model: 'codex-mini-latest',
  additionalDirectories: [] as string[],
  networkAccessEnabled: false,
  webSearchMode: 'disabled' as const,
  approvalPolicy: 'inherit' as const,
};

function createCoordinator(options?: {
  currentConversation?: Conversation | null;
}) {
  const chatContainerEl = document.createElement('div');
  const applyCodexRuntimeOverrides = jest.fn();
  const updateApprovalPolicy = jest.fn();
  const invalidateLiveThread = jest.fn();
  const saveConversation = jest.fn().mockResolvedValue(undefined);
  const host = {
    app: {} as never,
    getCurrentConversation: jest.fn().mockReturnValue(options?.currentConversation ?? null),
    getSessionSettingsDefaults: jest.fn().mockReturnValue({
      chatFontSizePx: 13,
    }),
    getCodexGlobalDefaults: jest.fn().mockReturnValue(CODEX_GLOBAL_DEFAULTS),
    getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
    saveConversation,
    showNotice: jest.fn(),
    applyCodexRuntimeOverrides,
    agentServiceRegistry: {
      get: jest.fn((backend: string) =>
        backend === 'codex' ? { invalidateLiveThread, updateApprovalPolicy } : null,
      ),
    } as unknown as jest.Mocked<ConversationSessionSettingsCoordinatorHost['agentServiceRegistry']>,
    supportsSessionSharing: jest.fn().mockReturnValue(false),
    supportsCompaction: jest.fn().mockReturnValue(false),
  } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;

  return {
    coordinator: new ConversationSessionSettingsCoordinator(host),
    host,
    chatContainerEl,
    saveConversation,
    applyCodexRuntimeOverrides,
    updateApprovalPolicy,
    invalidateLiveThread,
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
      webSearchMode: 'disabled',
    });
  });

  it('applies approval policy through the coordinator-owned Codex adapter path', async () => {
    const conv = createCodexConversation({
      codexSandboxMode: 'read-only',
      codexModelReasoningEffort: 'high',
      codexApprovalPolicy: 'on-request',
    });
    const { coordinator, updateApprovalPolicy } = createCoordinator({ currentConversation: conv });

    await coordinator.applyConversationRuntimeState(conv);

    expect(updateApprovalPolicy).toHaveBeenCalledWith('on-request');
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
      webSearchMode: 'disabled',
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
      webSearchMode: 'disabled',
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

  it('passes available models to modal when adapter returns a model list', async () => {
    const conv = createCodexConversation();
    const { coordinator, host } = createCoordinator({ currentConversation: conv });
    host.agentServiceRegistry = {
      get: jest.fn((backend: string) =>
        backend === 'codex'
          ? {
              getModelList: jest.fn().mockResolvedValue([
                { slug: 'gpt-5.5', display_name: 'GPT-5.5' },
                { slug: 'gpt-5.4', display_name: 'gpt-5.4' },
              ]),
            }
          : null,
      ),
    } as unknown as jest.Mocked<typeof host.agentServiceRegistry>;

    await coordinator.openCurrentConversationSettings();

    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.defaults.codexAvailableModels).toEqual([
      { slug: 'gpt-5.5', display_name: 'GPT-5.5' },
      { slug: 'gpt-5.4', display_name: 'gpt-5.4' },
    ]);
  });

  it('passes undefined available models to modal when adapter has no getModelList', async () => {
    const conv = createCodexConversation();
    const { coordinator, host } = createCoordinator({ currentConversation: conv });
    host.agentServiceRegistry = {
      get: jest.fn((backend: string) => (backend === 'codex' ? {} : null)),
    } as unknown as jest.Mocked<typeof host.agentServiceRegistry>;

    await coordinator.openCurrentConversationSettings();

    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.defaults.codexAvailableModels).toBeUndefined();
  });

  describe('invalidateCodexLiveThread (live current-thread re-resume)', () => {
    it('calls adapter.invalidateLiveThread with backendSessionId after runtime apply', async () => {
      const conv = createCodexConversation();
      const { coordinator, invalidateLiveThread } = createCoordinator({ currentConversation: conv });

      await coordinator.applyConversationRuntimeState(conv);

      expect(invalidateLiveThread).toHaveBeenCalledWith('codex-session-1');
    });

    it('does not call invalidateLiveThread for non-Codex conversations', async () => {
      const conv = createOpenCodeConversation();
      const { coordinator, invalidateLiveThread } = createCoordinator({ currentConversation: conv });

      await coordinator.applyConversationRuntimeState(conv);

      expect(invalidateLiveThread).not.toHaveBeenCalled();
    });

    it('does not call invalidateLiveThread when backendSessionId is absent', async () => {
      const conv = createCodexConversation();
      delete conv.backendSessionId;
      const { coordinator, invalidateLiveThread } = createCoordinator({ currentConversation: conv });

      await coordinator.applyConversationRuntimeState(conv);

      expect(invalidateLiveThread).not.toHaveBeenCalled();
    });

    it('calls invalidateLiveThread after saveConversationOverrides', async () => {
      const conv = createCodexConversation();
      const { coordinator, invalidateLiveThread } = createCoordinator({ currentConversation: conv });

      await coordinator.saveConversationOverrides(conv, { codexSandboxMode: 'read-only' });

      expect(invalidateLiveThread).toHaveBeenCalledWith('codex-session-1');
    });

    it('does not call invalidateLiveThread when the registry has no codex adapter', async () => {
      const conv = createCodexConversation();
      const chatContainerEl = document.createElement('div');
      const host = {
        app: {} as never,
        getCurrentConversation: jest.fn().mockReturnValue(conv),
        getSessionSettingsDefaults: jest.fn().mockReturnValue({ chatFontSizePx: 13 }),
        getCodexGlobalDefaults: jest.fn().mockReturnValue({
          sandboxMode: 'workspace-write' as const,
          modelReasoningEffort: 'medium' as const,
          model: 'codex-mini-latest',
          additionalDirectories: [] as string[],
          networkAccessEnabled: false,
        }),
        getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
        saveConversation: jest.fn().mockResolvedValue(undefined),
        showNotice: jest.fn(),
        applyCodexRuntimeOverrides: jest.fn(),
        agentServiceRegistry: {
          get: jest.fn(() => null),
        } as unknown as jest.Mocked<ConversationSessionSettingsCoordinatorHost['agentServiceRegistry']>,
        supportsSessionSharing: jest.fn().mockReturnValue(false),
        supportsCompaction: jest.fn().mockReturnValue(false),
      } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;

      const coordinator = new ConversationSessionSettingsCoordinator(host);
      await coordinator.applyConversationRuntimeState(conv);
      // No throw — the missing adapter is safely skipped.
      expect(host.applyCodexRuntimeOverrides).toHaveBeenCalled();
    });
  });
});

describe('ConversationSessionSettingsCoordinator Codex approval policy override', () => {
  function createApprovalCoordinator(globalApproval: 'inherit' | 'untrusted' | 'on-request' | 'never') {
    const applyCodexRuntimeOverrides = jest.fn();
    const updateApprovalPolicy = jest.fn();
    const invalidateLiveThread = jest.fn();
    const chatContainerEl = document.createElement('div');
    const host = {
      app: {} as never,
      getCurrentConversation: jest.fn(),
      getSessionSettingsDefaults: jest.fn().mockReturnValue({ chatFontSizePx: 13 }),
      getCodexGlobalDefaults: jest.fn().mockReturnValue({
        sandboxMode: 'workspace-write' as const,
        modelReasoningEffort: 'medium' as const,
        model: 'codex-mini-latest',
        additionalDirectories: [] as string[],
        networkAccessEnabled: false,
        webSearchMode: 'disabled' as const,
        approvalPolicy: globalApproval,
      }),
      getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      showNotice: jest.fn(),
      applyCodexRuntimeOverrides,
      agentServiceRegistry: {
        get: jest.fn((backend: string) =>
          backend === 'codex' ? { invalidateLiveThread, updateApprovalPolicy } : null,
        ),
      } as unknown as jest.Mocked<ConversationSessionSettingsCoordinatorHost['agentServiceRegistry']>,
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
    } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;
    return { coordinator: new ConversationSessionSettingsCoordinator(host), host, applyCodexRuntimeOverrides, updateApprovalPolicy };
  }

  it('routes the resolved approval policy through the coordinator-owned adapter path', async () => {
    const conv = createCodexConversation({
      codexSandboxMode: 'read-only',
      codexModelReasoningEffort: 'high',
      codexApprovalPolicy: 'on-request',
    });
    const { coordinator, applyCodexRuntimeOverrides, updateApprovalPolicy } = createApprovalCoordinator('never');
    await coordinator.applyConversationRuntimeState(conv);
    expect(updateApprovalPolicy).toHaveBeenCalledWith('on-request');
    expect(applyCodexRuntimeOverrides).not.toHaveBeenCalledWith(
      expect.objectContaining({ approvalPolicy: expect.anything() }),
    );
  });

  it('null/undefined session override inherits the REAL global policy (each policy), no bleed/reset', async () => {
    // Two conversations against TWO different global values, alternating so an
    // accidental stale/singleton state cannot masquerade as correct.
    const globals: Array<'untrusted' | 'never' | 'on-request'> = ['untrusted', 'never', 'on-request'];
    for (const g of globals) {
      const convNull = createCodexConversation({
        codexSandboxMode: 'read-only',
        codexModelReasoningEffort: 'high',
        codexApprovalPolicy: null,
      });
      const convUndefined = createCodexConversation({
        codexSandboxMode: 'read-only',
        codexModelReasoningEffort: 'high',
      });
      const { coordinator } = createApprovalCoordinator(g);
      const effectiveNull = coordinator.resolveEffectiveSettings(convNull);
      const effectiveUndefined = coordinator.resolveEffectiveSettings(convUndefined);
      expect(effectiveNull.codexApprovalPolicy).toBe(g);
      expect(effectiveUndefined.codexApprovalPolicy).toBe(g);
    }
  });

  it('explicit per-session policy overrides the global without resetting it', async () => {
    const convExplicit = createCodexConversation({
      codexSandboxMode: 'read-only',
      codexModelReasoningEffort: 'high',
      codexApprovalPolicy: 'inherit',
    });
    const convInherit = createCodexConversation({
      codexSandboxMode: 'read-only',
      codexModelReasoningEffort: 'high',
      codexApprovalPolicy: null,
    });
    const { coordinator } = createApprovalCoordinator('never');
    // Explicit "inherit" forces backend default; it does NOT fall back to global "never".
    expect(coordinator.resolveEffectiveSettings(convExplicit).codexApprovalPolicy).toBe('inherit');
    // Null still inherits the real global.
    expect(coordinator.resolveEffectiveSettings(convInherit).codexApprovalPolicy).toBe('never');
  });

  it('resolves codexApprovalPolicy to inherit when the global default is absent', () => {
    const conv = createCodexConversation({ codexApprovalPolicy: null });
    const chatContainerEl = document.createElement('div');
    const host = {
      app: {} as never,
      getCurrentConversation: jest.fn().mockReturnValue(conv),
      getSessionSettingsDefaults: jest.fn().mockReturnValue({ chatFontSizePx: 13 }),
      getCodexGlobalDefaults: jest.fn().mockReturnValue({
        sandboxMode: 'workspace-write' as const,
        modelReasoningEffort: 'medium' as const,
        model: 'codex-mini-latest',
        additionalDirectories: [] as string[],
        networkAccessEnabled: false,
      }),
      getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      showNotice: jest.fn(),
      applyCodexRuntimeOverrides: jest.fn(),
      agentServiceRegistry: { get: jest.fn(() => null) } as never,
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
    } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;
    const coordinator = new ConversationSessionSettingsCoordinator(host);
    expect(coordinator.resolveEffectiveSettings(conv).codexApprovalPolicy).toBe('inherit');
  });

  it('reads the real global approval policy from plugin settings without growing OpenCodianView', () => {
    const conv = createCodexConversation({ codexApprovalPolicy: null });
    const host = {
      app: {
        plugins: {
          plugins: {
            opencodian: {
              settings: { backendSettings: { codex: { approvalPolicy: 'never' } } },
            },
          },
        },
      } as never,
      getCurrentConversation: jest.fn().mockReturnValue(conv),
      getSessionSettingsDefaults: jest.fn().mockReturnValue({ chatFontSizePx: 13 }),
      getCodexGlobalDefaults: jest.fn().mockReturnValue({
        sandboxMode: 'workspace-write' as const,
        modelReasoningEffort: 'medium' as const,
        model: 'codex-mini-latest',
        additionalDirectories: [] as string[],
        networkAccessEnabled: false,
        webSearchMode: 'disabled' as const,
      }),
      getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      showNotice: jest.fn(),
      applyCodexRuntimeOverrides: jest.fn(),
      agentServiceRegistry: { get: jest.fn(() => null) } as never,
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
    } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;

    const coordinator = new ConversationSessionSettingsCoordinator(host);

    expect(coordinator.resolveEffectiveSettings(conv).codexApprovalPolicy).toBe('never');
  });
});
