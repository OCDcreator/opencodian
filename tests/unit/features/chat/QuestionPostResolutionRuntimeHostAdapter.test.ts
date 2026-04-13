import {
  createQuestionPostResolutionRuntimeHostAdapter,
  type QuestionPostResolutionRuntimeViewHost,
} from '../../../../src/features/chat/services/QuestionPostResolutionRuntimeHostAdapter';
import type { QuestionPostResolutionRuntimeState } from '../../../../src/features/chat/services/QuestionPostResolutionRuntimeFacade';
import type {
  QuestionRuntimeConversationSyncPort,
  QuestionRuntimeStatusRefreshPort,
} from '../../../../src/features/chat/services/QuestionRuntimeViewHostAdapter';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

describe('QuestionPostResolutionRuntimeHostAdapter', () => {
  it('keeps post-resolution refresh and sync wiring outside the generic question runtime host', async () => {
    let runtimeState: QuestionPostResolutionRuntimeState = { isStreaming: false };
    const viewHost: Mocked<QuestionPostResolutionRuntimeViewHost> = {
      getActiveTabId: jest.fn().mockReturnValue('tab-active'),
      getTabRuntimeState: jest.fn(() => runtimeState),
      getSessionIdForTab: jest.fn().mockReturnValue('session-1'),
    };
    const conversationSync: Mocked<QuestionRuntimeConversationSyncPort> = {
      startConversationSyncLoop: jest.fn(),
      syncVisibleConversationInBackground: jest.fn().mockResolvedValue(undefined),
    };
    const statusRefresh: Mocked<QuestionRuntimeStatusRefreshPort> = {
      refreshTabSessionStatus: jest.fn().mockResolvedValue({ type: 'idle' }),
    };

    const adapter = createQuestionPostResolutionRuntimeHostAdapter({
      viewHost,
      conversationSync,
      statusRefresh,
    });

    expect(adapter.getActiveTabId()).toBe('tab-active');
    expect(adapter.getTabRuntimeState('tab-active')).toBe(runtimeState);
    expect(adapter.getSessionIdForTab('tab-active')).toBe('session-1');

    await adapter.refreshTabSessionStatus('tab-active', 'session-1', { suppressErrors: true });
    adapter.startConversationSyncLoop();
    await adapter.syncVisibleConversationInBackground();

    expect(statusRefresh.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-1',
      { suppressErrors: true },
    );
    expect(conversationSync.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(conversationSync.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);

    runtimeState = { isStreaming: true };
    expect(adapter.getTabRuntimeState('tab-active')).toEqual({ isStreaming: true });
  });
});
