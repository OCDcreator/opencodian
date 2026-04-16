import { type Conversation,createEmptyTabContextState } from '../../../../src/core/types';
import {
  ConversationSessionTabResolver,
  type ConversationSessionTabResolverHost,
} from '../../../../src/features/chat/services/ConversationSessionTabResolver';
import type { TabData } from '../../../../src/features/chat/tabs';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(
  id: string,
  overrides?: Partial<Conversation>,
): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    messages: [],
    openCodeSessionId: `session-${id}`,
    ...overrides,
  };
}

function createTab(overrides?: Partial<TabData>): TabData {
  return {
    id: 'tab-active',
    conversationId: 'conversation-active',
    title: 'Active tab',
    isActive: true,
    isStreaming: false,
    hasBackgroundTask: false,
    needsAttention: false,
    modelOverride: null,
    contextUsage: createEmptyTabContextState(),
    ...overrides,
  };
}

function createHost(options?: {
  activeTabId?: string | null;
  currentConversation?: Conversation | null;
  tabs?: TabData[];
  conversations?: Conversation[];
}): Mocked<ConversationSessionTabResolverHost> {
  const currentConversation = options?.currentConversation ?? createConversation('conversation-active');
  const tabs = options?.tabs ?? [
    createTab(),
    createTab({
      id: 'tab-hidden',
      conversationId: 'conversation-hidden',
      title: 'Hidden tab',
      isActive: false,
    }),
  ];
  const conversations = options?.conversations ?? [
    currentConversation,
    createConversation('conversation-hidden'),
  ];

  return {
    getAllTabs: jest.fn().mockReturnValue(tabs),
    getConversations: jest.fn().mockReturnValue(conversations),
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getActiveTabId: jest.fn().mockReturnValue(
      options && 'activeTabId' in options ? options.activeTabId ?? null : 'tab-active',
    ),
  };
}

describe('ConversationSessionTabResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns every tab whose conversation shares the session', () => {
    const host = createHost({
      conversations: [
        createConversation('conversation-active', { openCodeSessionId: 'session-shared' }),
        createConversation('conversation-hidden', { openCodeSessionId: 'session-shared' }),
        createConversation('conversation-other', { openCodeSessionId: 'session-other' }),
      ],
      tabs: [
        createTab({ id: 'tab-active', conversationId: 'conversation-active' }),
        createTab({
          id: 'tab-hidden',
          conversationId: 'conversation-hidden',
          title: 'Hidden tab',
          isActive: false,
        }),
        createTab({
          id: 'tab-other',
          conversationId: 'conversation-other',
          title: 'Other tab',
          isActive: false,
        }),
      ],
    });
    const resolver = new ConversationSessionTabResolver(host);

    expect(resolver.resolveMatchedTabIds('session-shared')).toEqual(['tab-active', 'tab-hidden']);
  });

  it('falls back to the active tab when the current conversation matches', () => {
    const host = createHost({
      activeTabId: 'tab-active',
      currentConversation: createConversation('conversation-active', {
        openCodeSessionId: 'session-active-only',
      }),
      conversations: [createConversation('conversation-other', { openCodeSessionId: 'session-other' })],
      tabs: [
        createTab({
          id: 'tab-other',
          conversationId: 'conversation-other',
          title: 'Other tab',
          isActive: false,
        }),
      ],
    });
    const resolver = new ConversationSessionTabResolver(host);

    expect(resolver.resolveMatchedTabIds('session-active-only')).toEqual(['tab-active']);
  });

  it('returns no tabs when neither direct matches nor fallback apply', () => {
    const host = createHost({
      activeTabId: null,
      currentConversation: createConversation('conversation-active', {
        openCodeSessionId: 'session-current',
      }),
      conversations: [createConversation('conversation-other', { openCodeSessionId: 'session-other' })],
      tabs: [
        createTab({
          id: 'tab-other',
          conversationId: 'conversation-other',
          title: 'Other tab',
          isActive: false,
        }),
      ],
    });
    const resolver = new ConversationSessionTabResolver(host);

    expect(resolver.resolveMatchedTabIds('session-missing')).toEqual([]);
    expect(resolver.resolveMatchedTabIds('session-current')).toEqual([]);
  });
});
