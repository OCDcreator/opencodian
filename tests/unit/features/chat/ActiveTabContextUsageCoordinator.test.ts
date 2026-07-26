/* eslint-disable max-lines-per-function -- Coordinator tests exercise one host contract across identity, snapshot persistence, and pricing enrichment. */

import type { ResolvedModelSelection } from '../../../../src/core/config/modelConfig';
import {
  type ContextUsageSnapshot,
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
    hasTab: jest.fn().mockReturnValue(true),
    getTabContextUsage: jest.fn().mockReturnValue(activeState),
    setTabContextUsage: jest.fn(),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    openContextUsageDetailsModal: jest.fn(),
    persistContextUsageSnapshot: jest.fn().mockResolvedValue(undefined),
    getForegroundCompactionAvailability: jest.fn().mockReturnValue({ status: 'unavailable' }),
    compactForegroundThread: jest.fn().mockResolvedValue({
      status: 'unavailable',
      acknowledged: false,
      runtimeVerified: false,
      started: false,
      completed: false,
      tokenUsageObserved: false,
    }),
    ...overrides,
  };
}

function getCommittedState(host: MockedHost): TabContextState {
  expect(host.setActiveTabContextUsage).toHaveBeenCalledTimes(1);
  return host.setActiveTabContextUsage.mock.calls[0][0];
}

function setupDebugLogging(): void {
  setDebugLoggingEnabled(false);
  setDebugModuleEnabled('contextUsage', true);
  setDebugRefreshIntervalMs(DEFAULT_DEBUG_REFRESH_INTERVAL_MS);
  resetLogEmissionThrottleState();
  clearRecentLogs();
}

function teardownDebugLogging(): void {
  setDebugLoggingEnabled(false);
  setDebugModuleEnabled('contextUsage', true);
  setDebugRefreshIntervalMs(DEFAULT_DEBUG_REFRESH_INTERVAL_MS);
  resetLogEmissionThrottleState();
  clearRecentLogs();
  jest.restoreAllMocks();
}

describe('ActiveTabContextUsageCoordinator identity and refresh', () => {
  beforeEach(setupDebugLogging);
  afterEach(teardownDebugLogging);

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
        totalTokens: 189,
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

  it('enriches authoritative snapshots before rendering and persisting a local cost estimate', () => {
    const host = createHost({
      enrichContextUsageSnapshot: jest.fn((snapshot) => ({
        ...snapshot,
        totalCost: 0.125,
        costDetails: {
          source: 'models-dev',
          completeness: 'complete',
          providerId: 'openai',
          endpoint: null,
          modelId: 'gpt-5.4',
          rates: {
            inputPerMillion: 1,
            outputPerMillion: 2,
            cacheReadPerMillion: 0.5,
            cacheWritePerMillion: null,
          },
          catalogFetchedAt: 300,
          usesBaseTier: false,
          unavailableTokenKinds: [],
        },
      })),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    coordinator.applyContextUsageSnapshotToTab('tab-1', {
      sessionId: 'session-1',
      sessionTitle: 'Chat 1',
      createdAt: 100,
      updatedAt: 250,
      compactingAt: null,
      providerId: 'openai',
      providerName: 'OpenAI',
      modelId: 'gpt-5.4',
      modelName: 'GPT-5.4',
      contextWindow: 128000,
      totalTokens: 20,
      inputTokens: 10,
      outputTokens: 10,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: null,
      totalCost: null,
    });

    expect(host.enrichContextUsageSnapshot).toHaveBeenCalledTimes(1);
    expect(host.setTabContextUsage).toHaveBeenCalledWith('tab-1', expect.objectContaining({
      totalCost: 0.125,
      costDetails: expect.objectContaining({ source: 'models-dev' }),
    }));
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
        totalTokens: 189,
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

  it('restores the latest app-server-authoritative snapshot for Codex conversations', async () => {
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue({
        id: 'conversation-codex',
        backend: 'codex',
        backendSessionId: 'codex-session-1',
        title: 'Codex chat',
        createdAt: 100,
        updatedAt: 200,
      }),
      getSessionContextUsageSnapshot: jest.fn().mockResolvedValue({
        sessionId: 'codex-session-1',
        sessionTitle: 'Codex chat',
        createdAt: 100,
        updatedAt: 250,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5.4',
        modelName: 'GPT-5.4',
        contextWindow: 128000,
        totalTokens: 480,
        inputTokens: 300,
        outputTokens: 120,
        reasoningTokens: 40,
        cacheReadTokens: 20,
        cacheWriteTokens: null,
        totalCost: null,
      }),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    await coordinator.refreshFromServer();

    expect(host.getSessionContextUsageSnapshot).toHaveBeenCalledWith('codex-session-1');
    const nextState = getCommittedState(host);
    expect(nextState.preciseTokens?.total).toBe(480);
    expect(nextState.percentage).toBe(0);
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
        totalTokens: 189,
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

describe('ActiveTabContextUsageCoordinator stream lifecycle', () => {
  beforeEach(setupDebugLogging);
  afterEach(teardownDebugLogging);

  describe('beginTabContextUsageStream', () => {
    it('begins stream for a valid tab', () => {
      const host = createHost();
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.beginTabContextUsageStream('tab-1');

      expect(host.setTabContextUsage).toHaveBeenCalledWith('tab-1', expect.any(Object));
      const state = host.setTabContextUsage.mock.calls[0][1] as TabContextState;
      expect(state.streamInputTokens).toBe(0);
      expect(state.streamOutputTokens).toBe(0);
    });

    it('skips when tab does not exist', () => {
      const host = createHost({ hasTab: jest.fn().mockReturnValue(false) });
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.beginTabContextUsageStream('nonexistent');

      expect(host.setTabContextUsage).not.toHaveBeenCalled();
    });

    it('refreshes indicator when stream begins on the active tab', () => {
      const host = createHost({ getActiveTabId: jest.fn().mockReturnValue('tab-1') });
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.beginTabContextUsageStream('tab-1');

      expect(host.renderContextUsageIndicator).toHaveBeenCalled();
    });

    it('does not refresh indicator when stream begins on a background tab', () => {
      const host = createHost({ getActiveTabId: jest.fn().mockReturnValue('tab-2') });
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.beginTabContextUsageStream('tab-1');

      expect(host.renderContextUsageIndicator).not.toHaveBeenCalled();
    });
  });

  describe('completeTabContextUsageStream', () => {
    it('completes stream for a valid tab', () => {
      const host = createHost();
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.completeTabContextUsageStream('tab-1');

      expect(host.setTabContextUsage).toHaveBeenCalledWith('tab-1', expect.any(Object));
      const state = host.setTabContextUsage.mock.calls[0][1] as TabContextState;
      expect(state.streamInputTokens).toBe(0);
      expect(state.streamOutputTokens).toBe(0);
    });

    it('skips when tab does not exist', () => {
      const host = createHost({ hasTab: jest.fn().mockReturnValue(false) });
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.completeTabContextUsageStream('nonexistent');

      expect(host.setTabContextUsage).not.toHaveBeenCalled();
    });
  });

  describe('applyUsageChunkToTab', () => {
    it('applies usage chunk for a valid tab', () => {
      const host = createHost();
      const coordinator = new ActiveTabContextUsageCoordinator(host);
      const chunk = { type: 'usage' as const, inputTokens: 100, outputTokens: 50 };

      coordinator.applyUsageChunkToTab('tab-1', chunk);

      expect(host.setTabContextUsage).toHaveBeenCalledWith('tab-1', expect.any(Object));
    });

    it('skips when tab does not exist', () => {
      const host = createHost({ hasTab: jest.fn().mockReturnValue(false) });
      const coordinator = new ActiveTabContextUsageCoordinator(host);
      const chunk = { type: 'usage' as const, inputTokens: 100, outputTokens: 50 };

      coordinator.applyUsageChunkToTab('nonexistent', chunk);

      expect(host.setTabContextUsage).not.toHaveBeenCalled();
    });
  });

  describe('openContextUsageDetails', () => {
    it('delegates to the host modal method with current context state', () => {
      const host = createHost();
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.openContextUsageDetails();

      expect(host.openContextUsageDetailsModal).toHaveBeenCalledWith(
        host.getActiveTabContextUsage(),
      );
    });

    it('passes null when no context state is available', () => {
      const host = createHost({
        getActiveTabContextUsage: jest.fn().mockReturnValue(null),
      });
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.openContextUsageDetails();

      expect(host.openContextUsageDetailsModal).toHaveBeenCalledWith(null);
    });
  });

  describe('refreshContextUsageIndicator', () => {
    it('renders the active tab context usage via the host', () => {
      const state = createEmptyTabContextState();
      const host = createHost({
        getActiveTabContextUsage: jest.fn().mockReturnValue(state),
      });
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.refreshContextUsageIndicator();

      expect(host.renderContextUsageIndicator).toHaveBeenCalledWith(state);
    });

    it('renders null when no context usage is available', () => {
      const host = createHost({
        getActiveTabContextUsage: jest.fn().mockReturnValue(null),
      });
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      coordinator.refreshContextUsageIndicator();

      expect(host.renderContextUsageIndicator).toHaveBeenCalledWith(null);
    });
  });
});

describe('ActiveTabContextUsageCoordinator exact snapshot persistence', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const snapshot: ContextUsageSnapshot = {
    sessionId: 'session-1',
    sessionTitle: 'Chat 1',
    createdAt: 100,
    updatedAt: 300,
    providerId: 'openai',
    providerName: 'OpenAI',
    modelId: 'gpt-5.4',
    modelName: 'GPT-5.4',
    contextWindow: 128000,
    totalTokens: 700,
    inputTokens: 400,
    outputTokens: 200,
    reasoningTokens: 70,
    cacheReadTokens: 30,
    cacheWriteTokens: null,
    totalCost: null,
  };

  it('persists the latest exact snapshot for the tab after throttling', () => {
    jest.useFakeTimers();
    const host = createHost();
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    coordinator.applyContextUsageSnapshotToTab('tab-1', snapshot);
    coordinator.applyContextUsageSnapshotToTab('tab-1', {
      ...snapshot,
      totalTokens: 760,
      updatedAt: 350,
    });
    jest.runOnlyPendingTimers();

    expect(host.persistContextUsageSnapshot).toHaveBeenCalledWith('tab-1', expect.objectContaining({
      sessionId: 'session-1',
      totalTokens: 760,
    }));
  });

  it('uses a persisted snapshot during identity sync before the next app-server notification', () => {
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue({
        id: 'conversation-1',
        openCodeSessionId: 'session-1',
        title: 'Chat 1',
        createdAt: 100,
        updatedAt: 200,
        lastContextUsage: snapshot,
      }),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    coordinator.syncIdentity();

    const nextState = getCommittedState(host);
    expect(nextState.preciseTokens?.total).toBe(700);
    expect(nextState.totalCost).toBeNull();
  });
});
