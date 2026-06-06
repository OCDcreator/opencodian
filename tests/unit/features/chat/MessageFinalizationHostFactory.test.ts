import {
  clearAllPromptSuggestionSessionCallbacks,
  createPromptSuggestionChannel,
  deletePromptSuggestionChannel,
  emitPromptSuggestionSessionChange,
  onPromptSuggestionSessionChange,
} from '../../../../src/core/agents/backend/promptSuggestionSink';
import type { Conversation } from '../../../../src/core/types/chat';
import {
  createMessageFinalizationHost,
  type MessageFinalizationHostDependencies,
} from '../../../../src/features/chat/services/MessageFinalizationService';

function createTestConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: 'conv-test',
    title: 'Test conversation',
    createdAt: 0,
    updatedAt: 0,
    messages: [],
    ...overrides,
  };
}

describe('createMessageFinalizationHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates getCurrentConversation to deps', () => {
    const deps = { getCurrentConversation: jest.fn().mockReturnValue('conv') };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    expect(host.getCurrentConversation()).toBe('conv');
    expect(deps.getCurrentConversation).toHaveBeenCalled();
  });

  it('maps setConversationSyncInFlight to conversationTabRuntimeCoordinator.updateConversationSyncRuntime', () => {
    const updateConversationSyncRuntime = jest.fn();
    const deps = {
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime,
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle: jest.fn(),
        emitPromptSuggestionSessionResync: jest.fn(),
      },
    };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    host.setConversationSyncInFlight('tab-1', true);
    expect(updateConversationSyncRuntime).toHaveBeenCalledWith('tab-1', { inFlight: true });
  });

  it('maps setLastConversationSyncFingerprint to conversationTabRuntimeCoordinator.updateConversationSyncRuntime', () => {
    const updateConversationSyncRuntime = jest.fn();
    const deps = {
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime,
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle: jest.fn(),
        emitPromptSuggestionSessionResync: jest.fn(),
      },
    };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    host.setLastConversationSyncFingerprint('tab-1', 'fp-123');
    expect(updateConversationSyncRuntime).toHaveBeenCalledWith('tab-1', { fingerprint: 'fp-123' });
  });

  it('maps transitionTabSessionLifecycle to conversationTabRuntimeCoordinator', () => {
    const transitionTabSessionLifecycle = jest.fn().mockReturnValue(true);
    const deps = {
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime: jest.fn(),
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle,
        emitPromptSuggestionSessionResync: jest.fn(),
      },
    };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    expect(host.transitionTabSessionLifecycle('tab-1', 'idle', 'done')).toBe(true);
    expect(transitionTabSessionLifecycle).toHaveBeenCalledWith('tab-1', 'idle', 'done');
  });

  it('delegates scrollToBottom to deps', () => {
    const scrollToBottom = jest.fn();
    const host = createMessageFinalizationHost({ scrollToBottom } as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    host.scrollToBottom({ enableAutoScroll: true });
    expect(scrollToBottom).toHaveBeenCalledWith({ enableAutoScroll: true });
  });

  it('delegates syncIdentity to activeTabContextUsageCoordinator', () => {
    const syncIdentity = jest.fn();
    const deps = {
      activeTabContextUsageCoordinator: { syncIdentity, refreshFromServer: jest.fn().mockResolvedValue(undefined) },
    };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    host.syncActiveTabContextUsageIdentity();
    expect(syncIdentity).toHaveBeenCalled();
  });

  it('wraps summarizeChatMessageForDebug from imported module', () => {
    const host = createMessageFinalizationHost({} as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    const result = host.summarizeChatMessageForDebug({ id: 'm1', role: 'assistant', content: 'hi', timestamp: 1 });
    expect(result).toBeTruthy();
  });
});

// ─── Scoped prompt-suggestion session resync ──────────────────────
//
// After backendSessionId is written (provisional → final SDK id),
// setActiveTabConversation must resync the prompt-suggestion session
// through the SCOPED channel bus, not global emission.
//
// The host calls the tab runtime coordinator, which finds the channel for
// that specific tab and emits only on it.

describe('createMessageFinalizationHost – scoped prompt suggestion session resync', () => {
  beforeEach(() => {
    clearAllPromptSuggestionSessionCallbacks();
  });

  afterEach(() => {
    clearAllPromptSuggestionSessionCallbacks();
  });

  it('setActiveTabConversation calls the scoped resync seam with tabId and backendSessionId', () => {
    const syncActiveTabConversation = jest.fn();
    const resyncSpy = jest.fn();
    const deps = {
      tabConversationStateBridge: { syncActiveTabConversation },
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime: jest.fn(),
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle: jest.fn(),
        emitPromptSuggestionSessionResync: resyncSpy,
      },
    } as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies;
    const host = createMessageFinalizationHost(deps);

    const conversation = createTestConversation({
      id: 'conv-1',
      title: 'Test',
      backendSessionId: '321c351f-c991-4799-9b16-9d18975bef4c',
    });

    host.setActiveTabConversation(conversation, 'tab-A');

    expect(syncActiveTabConversation).toHaveBeenCalledWith(conversation);
    expect(resyncSpy).toHaveBeenCalledWith('tab-A', '321c351f-c991-4799-9b16-9d18975bef4c');
  });

  it('setActiveTabConversation passes null sessionId when conversation has no backendSessionId', () => {
    const resyncSpy = jest.fn();
    const deps = {
      tabConversationStateBridge: { syncActiveTabConversation: jest.fn() },
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime: jest.fn(),
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle: jest.fn(),
        emitPromptSuggestionSessionResync: resyncSpy,
      },
    } as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies;
    const host = createMessageFinalizationHost(deps);

    const conversation = createTestConversation({ id: 'conv-2', title: 'No backend id' });
    host.setActiveTabConversation(conversation, 'tab-B');

    expect(resyncSpy).toHaveBeenCalledWith('tab-B', null);
  });

  it('setActiveTabConversation falls back to null tabId when tabId is omitted', () => {
    const resyncSpy = jest.fn();
    const deps = {
      tabConversationStateBridge: { syncActiveTabConversation: jest.fn() },
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime: jest.fn(),
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle: jest.fn(),
        emitPromptSuggestionSessionResync: resyncSpy,
      },
    } as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies;
    const host = createMessageFinalizationHost(deps);

    const conversation = createTestConversation({
      id: 'conv-3',
      backendSessionId: 'sdk-sess-123',
    });
    host.setActiveTabConversation(conversation);

    expect(resyncSpy).toHaveBeenCalledWith(null, 'sdk-sess-123');
  });

  it('setActiveTabConversation calls coordinator resync when conversation has backendSessionId', () => {
    const resyncSpy = jest.fn();
    const deps = {
      tabConversationStateBridge: { syncActiveTabConversation: jest.fn() },
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime: jest.fn(),
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle: jest.fn(),
        emitPromptSuggestionSessionResync: resyncSpy,
      },
    } as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies;
    const host = createMessageFinalizationHost(deps);

    const conversation = createTestConversation({
      id: 'conv-4',
      backendSessionId: 'sdk-sess-456',
    });
    host.setActiveTabConversation(conversation, 'tab-X');
    expect(resyncSpy).toHaveBeenCalledWith('tab-X', 'sdk-sess-456');
  });
});

// ─── Multi-view isolation test ────────────────────────────────────
//
// Verifies that scoped resync only affects the target tab's channel,
// not other leaves' channels.

describe('scoped prompt suggestion session resync – multi-view isolation', () => {
  let channelA: string;
  let channelB: string;

  beforeEach(() => {
    clearAllPromptSuggestionSessionCallbacks();
    channelA = createPromptSuggestionChannel();
    channelB = createPromptSuggestionChannel();
  });

  afterEach(() => {
    deletePromptSuggestionChannel(channelA);
    deletePromptSuggestionChannel(channelB);
    clearAllPromptSuggestionSessionCallbacks();
  });

  it('resync on tab A channel does not affect tab B channel', () => {
    // Each channel has its own subscriber
    let sessionA: string | null | undefined;
    let sessionB: string | null | undefined;
    onPromptSuggestionSessionChange((s) => { sessionA = s; }, channelA);
    onPromptSuggestionSessionChange((s) => { sessionB = s; }, channelB);

    // Simulate the scoped resync seam for tab A emitting on channel A only
    emitPromptSuggestionSessionChange('sdk-sess-tab-A', channelA);

    // Tab A received the session change
    expect(sessionA).toBe('sdk-sess-tab-A');
    // Tab B did NOT receive it — isolation preserved
    expect(sessionB).toBeUndefined();
  });

  it('resync on tab B channel does not affect tab A channel', () => {
    let sessionA: string | null | undefined;
    let sessionB: string | null | undefined;
    onPromptSuggestionSessionChange((s) => { sessionA = s; }, channelA);
    onPromptSuggestionSessionChange((s) => { sessionB = s; }, channelB);

    emitPromptSuggestionSessionChange('sdk-sess-tab-B', channelB);

    expect(sessionB).toBe('sdk-sess-tab-B');
    expect(sessionA).toBeUndefined();
  });

  it('resync correctly routes to each channel independently', () => {
    let sessionA: string | null | undefined;
    let sessionB: string | null | undefined;
    onPromptSuggestionSessionChange((s) => { sessionA = s; }, channelA);
    onPromptSuggestionSessionChange((s) => { sessionB = s; }, channelB);

    emitPromptSuggestionSessionChange('sdk-sess-tab-A', channelA);
    emitPromptSuggestionSessionChange('sdk-sess-tab-B', channelB);

    expect(sessionA).toBe('sdk-sess-tab-A');
    expect(sessionB).toBe('sdk-sess-tab-B');
  });
});
