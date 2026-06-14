import type { AppServerThreadGoal } from '../../../../src/core/agents/backend/CodexAppServerClient';
import type { Conversation } from '../../../../src/core/types';
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

const SAMPLE_GOAL: AppServerThreadGoal = {
  threadId: 'codex-session-1',
  objective: 'Build feature X',
  status: 'active',
  tokenBudget: null,
  tokensUsed: 0,
  timeUsedSeconds: 0,
  createdAt: 1781277321,
  updatedAt: 1781277321,
};

function createCodexConversation(): Conversation {
  return {
    id: 'codex-conv-1',
    title: 'Codex Session',
    createdAt: 1,
    updatedAt: 1,
    backend: 'codex',
    backendSessionId: 'codex-session-1',
    messages: [],
  };
}

describe('ConversationSessionSettingsCoordinator Codex thread goal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes onSetThreadGoal callback that forwards objective to adapter', async () => {
    const conv = createCodexConversation();
    const setThreadGoal = jest.fn().mockResolvedValue(SAMPLE_GOAL);
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
      getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      showNotice: jest.fn(),
      applyCodexRuntimeOverrides: jest.fn(),
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
      agentServiceRegistry: {
        get: jest.fn((backend: string) =>
          backend === 'codex' ? { getThreadGoal: jest.fn().mockResolvedValue(null), setThreadGoal } : null,
        ),
      },
    } as unknown as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();

    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    await modalOptions.onSetThreadGoal('Build feature X');

    expect(setThreadGoal).toHaveBeenCalledWith('codex-session-1', 'Build feature X', undefined);
  });

  it('forwards tokenBudget through onSetThreadGoal callback to adapter', async () => {
    const conv = createCodexConversation();
    const budgetGoal = { ...SAMPLE_GOAL, tokenBudget: 200000 };
    const setThreadGoal = jest.fn().mockResolvedValue(budgetGoal);
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
      getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      showNotice: jest.fn(),
      applyCodexRuntimeOverrides: jest.fn(),
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
      agentServiceRegistry: {
        get: jest.fn((backend: string) =>
          backend === 'codex' ? { getThreadGoal: jest.fn().mockResolvedValue(null), setThreadGoal } : null,
        ),
      },
    } as unknown as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();

    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    const result = await modalOptions.onSetThreadGoal('Budgeted task', { tokenBudget: 200000 });

    expect(setThreadGoal).toHaveBeenCalledWith('codex-session-1', 'Budgeted task', { tokenBudget: 200000 });
    expect(result).toEqual(budgetGoal);
  });

  it('loads thread goal into modal defaults for Codex conversations', async () => {
    const conv = createCodexConversation();
    const goal: AppServerThreadGoal = { ...SAMPLE_GOAL, tokenBudget: 50000, tokensUsed: 12000 };
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
      getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      showNotice: jest.fn(),
      applyCodexRuntimeOverrides: jest.fn(),
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
      agentServiceRegistry: {
        get: jest.fn((backend: string) =>
          backend === 'codex'
            ? { getThreadGoal: jest.fn().mockResolvedValue(goal) }
            : null,
        ),
      },
    } as unknown as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();

    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.defaults.codexThreadGoal).toEqual(goal);
  });

  it('closes previous modal when opening a new one', async () => {
    const conv = createCodexConversation();
    const firstModal = { open: jest.fn(), close: jest.fn() };
    const secondModal = { open: jest.fn(), close: jest.fn() };
    const { ConversationSessionSettingsModal: ModalMock } = jest.requireMock(
      '../../../../src/features/chat/ui/ConversationSessionSettingsModal',
    );
    ModalMock.mockImplementationOnce(() => firstModal);
    ModalMock.mockImplementationOnce(() => secondModal);
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
      getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      showNotice: jest.fn(),
      applyCodexRuntimeOverrides: jest.fn(),
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
      agentServiceRegistry: {
        get: jest.fn((backend: string) =>
          backend === 'codex' ? { getThreadGoal: jest.fn().mockResolvedValue(null) } : null,
        ),
      },
    } as unknown as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();
    expect(firstModal.open).toHaveBeenCalledTimes(1);

    await coordinator.openCurrentConversationSettings();
    expect(firstModal.close).toHaveBeenCalledTimes(1);
    expect(secondModal.open).toHaveBeenCalledTimes(1);
  });
});
