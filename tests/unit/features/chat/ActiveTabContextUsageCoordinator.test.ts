import type { ResolvedModelSelection } from '../../../../src/core/config/modelConfig';
import {
  createEmptyTabContextState,
  type TabContextState,
} from '../../../../src/core/types';
import {
  ActiveTabContextUsageCoordinator,
  type ActiveTabContextUsageCoordinatorHost,
} from '../../../../src/features/chat/services/ActiveTabContextUsageCoordinator';
import type {
  ModelSelectorKnownModelInfo,
  ModelSelectorSelection,
} from '../../../../src/features/chat/ui/modelSelector/types';
import {
  clearRecentLogs,
  resetLogEmissionThrottleState,
  setDebugLoggingEnabled,
  setDebugModuleEnabled,
  setDebugRefreshIntervalMs,
} from '../../../../src/shared';
import { DEFAULT_DEBUG_REFRESH_INTERVAL_MS } from '../../../../src/shared/debugModules';

type MockedHost = {
  [Key in keyof ActiveTabContextUsageCoordinatorHost]:
    ActiveTabContextUsageCoordinatorHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ActiveTabContextUsageCoordinatorHost[Key];
};

function createHost(
  overrides: Partial<MockedHost> = {},
): MockedHost {
  const activeState = createEmptyTabContextState();
  const currentConversation = {
    id: 'conversation-1',
    openCodeSessionId: 'session-1',
    title: 'Chat 1',
    createdAt: 100,
    updatedAt: 200,
  };
  const currentModel: ModelSelectorSelection = {
    provider: 'openai',
    model: 'gpt-5.4',
  };
  const resolution: ResolvedModelSelection = {
    status: 'available',
    provider: currentModel.provider,
    model: currentModel.model,
    ref: `${currentModel.provider}/${currentModel.model}`,
    providerName: 'OpenAI',
    modelName: 'GPT-5.4',
    contextWindow: 128000,
  };
  const knownModelInfo: ModelSelectorKnownModelInfo = {
    providerName: 'OpenAI',
    modelName: 'GPT-5.4',
    contextWindow: 128000,
  };

  return {
    hasActiveTab: jest.fn().mockReturnValue(true),
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getCurrentSessionModel: jest.fn().mockReturnValue(currentModel),
    getCurrentSessionModelResolution: jest.fn().mockReturnValue(resolution),
    findKnownModelInfo: jest.fn().mockReturnValue(knownModelInfo),
    getActiveTabContextUsage: jest.fn().mockReturnValue(activeState),
    setActiveTabContextUsage: jest.fn(),
    renderContextUsageIndicator: jest.fn(),
    getSessionContextUsageSnapshot: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function getCommittedState(host: MockedHost): TabContextState {
  expect(host.setActiveTabContextUsage).toHaveBeenCalledTimes(1);
  return host.setActiveTabContextUsage.mock.calls[0][0];
}

describe('ActiveTabContextUsageCoordinator', () => {
  beforeEach(() => {
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('contextUsage', true);
    setDebugRefreshIntervalMs(DEFAULT_DEBUG_REFRESH_INTERVAL_MS);
    resetLogEmissionThrottleState();
    clearRecentLogs();
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('contextUsage', true);
    setDebugRefreshIntervalMs(DEFAULT_DEBUG_REFRESH_INTERVAL_MS);
    resetLogEmissionThrottleState();
    clearRecentLogs();
    jest.restoreAllMocks();
  });

  it('clears the indicator when no active tab is available', () => {
    const host = createHost({
      hasActiveTab: jest.fn().mockReturnValue(false),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    coordinator.syncIdentity();

    expect(host.setActiveTabContextUsage).not.toHaveBeenCalled();
    expect(host.renderContextUsageIndicator).toHaveBeenCalledWith(null);
  });

  it('syncs active-tab identity from the current model and conversation', () => {
    const host = createHost();
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    coordinator.syncIdentity();

    const nextState = getCommittedState(host);
    expect(nextState.provider).toBe('openai');
    expect(nextState.providerName).toBe('OpenAI');
    expect(nextState.model).toBe('gpt-5.4');
    expect(nextState.modelName).toBe('GPT-5.4');
    expect(nextState.contextWindow).toBe(128000);
    expect(nextState.sessionId).toBe('session-1');
    expect(nextState.sessionTitle).toBe('Chat 1');
    expect(nextState.createdAt).toBe(100);
    expect(nextState.updatedAt).toBe(200);
    expect(host.renderContextUsageIndicator).toHaveBeenCalledWith(nextState);
  });

  it('refreshes precise usage from the server snapshot for the same active conversation', async () => {
    const host = createHost({
      getSessionContextUsageSnapshot: jest.fn().mockResolvedValue({
        sessionId: 'session-1',
        sessionTitle: 'Chat 1',
        createdAt: 100,
        updatedAt: 250,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5.4',
        modelName: 'GPT-5.4',
        contextWindow: 128000,
        inputTokens: 123,
        outputTokens: 45,
        reasoningTokens: 6,
        cacheReadTokens: 7,
        cacheWriteTokens: 8,
        totalCost: 0.12,
      }),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    await coordinator.refreshFromServer();

    const nextState = getCommittedState(host);
    expect(nextState.sessionId).toBe('session-1');
    expect(nextState.model).toBe('gpt-5.4');
    expect(nextState.contextWindow).toBe(128000);
    expect(nextState.preciseTokens).toEqual({
      total: 189,
      input: 123,
      output: 45,
      reasoning: 6,
      cacheRead: 7,
      cacheWrite: 8,
    });
    expect(nextState.totalCost).toBe(0.12);
    expect(host.renderContextUsageIndicator).toHaveBeenCalledWith(nextState);
  });

  it('ignores stale snapshots after the active conversation changes', async () => {
    const staleConversation = {
      id: 'conversation-2',
      openCodeSessionId: 'session-2',
      title: 'Chat 2',
      createdAt: 300,
      updatedAt: 400,
    };
    const host = createHost({
      getCurrentConversation: jest
        .fn()
        .mockReturnValueOnce({
          id: 'conversation-1',
          openCodeSessionId: 'session-1',
          title: 'Chat 1',
          createdAt: 100,
          updatedAt: 200,
        })
        .mockReturnValue(staleConversation),
      getSessionContextUsageSnapshot: jest.fn().mockResolvedValue({
        sessionId: 'session-1',
        sessionTitle: 'Chat 1',
        createdAt: 100,
        updatedAt: 250,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5.4',
        modelName: 'GPT-5.4',
        contextWindow: 128000,
        inputTokens: 123,
        outputTokens: 45,
        reasoningTokens: 6,
        cacheReadTokens: 7,
        cacheWriteTokens: 8,
        totalCost: 0.12,
      }),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    await coordinator.refreshFromServer();

    expect(host.setActiveTabContextUsage).not.toHaveBeenCalled();
    expect(host.renderContextUsageIndicator).not.toHaveBeenCalled();
  });

  it('does not spam identical context usage refresh logs while polling an idle tab', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('contextUsage', true);
    setDebugRefreshIntervalMs(5000);
    const host = createHost({
      getSessionContextUsageSnapshot: jest.fn().mockResolvedValue({
        sessionId: 'session-1',
        sessionTitle: 'Chat 1',
        createdAt: 100,
        updatedAt: 250,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5.4',
        modelName: 'GPT-5.4',
        contextWindow: 128000,
        inputTokens: 123,
        outputTokens: 45,
        reasoningTokens: 6,
        cacheReadTokens: 7,
        cacheWriteTokens: 8,
        totalCost: 0.12,
      }),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    await coordinator.refreshFromServer();
    await coordinator.refreshFromServer();

    const contextUsageLogs = consoleSpy.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((message) => message.includes('[ActiveTabContextUsageCoordinator] [context-usage] refreshFromServer committed'));

    expect(contextUsageLogs).toHaveLength(1);
  });
});
