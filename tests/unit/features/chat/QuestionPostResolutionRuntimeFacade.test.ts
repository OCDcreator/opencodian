import {
  QuestionPostResolutionRuntimeFacade,
  type QuestionPostResolutionRuntimeFacadeHost,
  type QuestionPostResolutionRuntimeState,
} from '../../../../src/features/chat/services/QuestionPostResolutionRuntimeFacade';
import type { TabId } from '../../../../src/features/chat/tabs';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createHost(options?: {
  activeTabId?: TabId | null;
  sessionIdsByTab?: Record<string, string | null>;
  runtimeStateByTab?: Record<string, Partial<QuestionPostResolutionRuntimeState>>;
}) {
  const activeTabId = options?.activeTabId ?? 'tab-active';
  const sessionIdsByTab = new Map<TabId, string | null>([
    ['tab-active', options?.sessionIdsByTab?.['tab-active'] ?? 'session-1'],
  ]);
  const runtimeByTab = new Map<TabId, QuestionPostResolutionRuntimeState>([
    ['tab-active', { isStreaming: false }],
  ]);

  for (const [tabId, sessionId] of Object.entries(options?.sessionIdsByTab ?? {})) {
    sessionIdsByTab.set(tabId, sessionId);
  }

  for (const [tabId, runtimeState] of Object.entries(options?.runtimeStateByTab ?? {})) {
    runtimeByTab.set(tabId, {
      isStreaming: false,
      ...runtimeState,
    });
  }

  const host: Mocked<QuestionPostResolutionRuntimeFacadeHost> = {
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
    getSessionIdForTab: jest.fn((tabId) => (tabId ? sessionIdsByTab.get(tabId) ?? null : null)),
    refreshTabSessionStatus: jest.fn().mockResolvedValue(null),
    startConversationSyncLoop: jest.fn(),
    syncVisibleConversationInBackground: jest.fn().mockResolvedValue(undefined),
  };

  return {
    host,
    facade: new QuestionPostResolutionRuntimeFacade(host),
  };
}

describe('QuestionPostResolutionRuntimeFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes status and syncs the visible conversation for a settled active tab', async () => {
    const { host, facade } = createHost();

    await facade.followUpAfterResolution('tab-active');

    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(host.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);
  });

  it('skips the visible conversation sync while the tab is still streaming', async () => {
    const { host, facade } = createHost({
      runtimeStateByTab: {
        'tab-active': { isStreaming: true },
      },
    });

    await facade.followUpAfterResolution('tab-active');

    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(host.syncVisibleConversationInBackground).not.toHaveBeenCalled();
  });

  it('returns early when the tab has no session', async () => {
    const { host, facade } = createHost({
      sessionIdsByTab: {
        'tab-active': null,
      },
    });

    await facade.followUpAfterResolution('tab-active');

    expect(host.refreshTabSessionStatus).not.toHaveBeenCalled();
    expect(host.startConversationSyncLoop).not.toHaveBeenCalled();
    expect(host.syncVisibleConversationInBackground).not.toHaveBeenCalled();
  });
});
