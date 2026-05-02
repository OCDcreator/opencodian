import type { ChatMessage } from '../../../../src/core/types';
import {
  ConversationIdentityRuntime,
  type ConversationIdentityRuntimeHost,
} from '../../../../src/features/chat/services/ConversationIdentityRuntime';

type MockedHost = {
  [Key in keyof ConversationIdentityRuntimeHost]: ConversationIdentityRuntimeHost[Key] extends (
    ...args: infer Args
  ) => infer Result
    ? jest.Mock<Result, Args>
    : ConversationIdentityRuntimeHost[Key];
};

function createHost(overrides: Partial<MockedHost> = {}): MockedHost {
  return {
    getCanonicalConversationFingerprint: jest.fn(),
    getActiveTabId: jest.fn(),
    getTabContextUsage: jest.fn(),
    ...overrides,
  };
}

describe('ConversationIdentityRuntime.getMessagesForRender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters out background task completion reminders', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 },
      {
        id: 'msg-2',
        role: 'assistant',
        content: '',
        timestamp: 200,
        omo: {
          kind: 'system-reminder',
          reminderType: 'background-task-completed',
          reminderText: '',
          rawText: '',
          headline: '',
          isInternalInitiator: false,
        },
      },
      { id: 'msg-3', role: 'user', content: 'next', timestamp: 300 },
    ];

    const result = runtime.getMessagesForRender(messages);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('msg-1');
    expect(result[1].id).toBe('msg-3');
  });

  it('groups consecutive assistant messages into one', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 },
      { id: 'msg-2', role: 'assistant', content: 'Hi!', timestamp: 200 },
      { id: 'msg-3', role: 'assistant', content: 'How can I help?', timestamp: 300 },
    ];

    const result = runtime.getMessagesForRender(messages);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('msg-1');
    expect(result[1].content).toContain('Hi!');
    expect(result[1].content).toContain('How can I help?');
  });

  it('injects compaction divider when context usage has compactingAt', () => {
    const host = createHost({
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getTabContextUsage: jest.fn().mockReturnValue({ compactingAt: 150 }),
    });
    const runtime = new ConversationIdentityRuntime(host);
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 },
      { id: 'msg-2', role: 'assistant', content: 'world', timestamp: 200 },
    ];

    const result = runtime.getMessagesForRender(messages);

    expect(result.length).toBeGreaterThan(2);
    const liveDivider = result.find((m) => m.compactionDivider?.live === true);
    expect(liveDivider).toBeDefined();
  });

  it('tags compaction summaries after a compaction divider', () => {
    const host = createHost({
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getTabContextUsage: jest.fn().mockReturnValue({ compactingAt: 150 }),
    });
    const runtime = new ConversationIdentityRuntime(host);
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'summary text',
        timestamp: 200,
        summary: true,
      },
    ];

    const result = runtime.getMessagesForRender(messages);

    const taggedSummary = result.find((m) => m.summary === true);
    expect(taggedSummary).toBeDefined();
    expect(taggedSummary!.summaryKind).toBe('compaction');
  });

  it('returns empty array for empty input', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);

    expect(runtime.getMessagesForRender([])).toEqual([]);
  });
});

describe('ConversationIdentityRuntime.shouldRenderConversationMessage', () => {
  it('returns false for background-task-completed reminders', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: 100,
      omo: {
        kind: 'system-reminder',
        reminderType: 'background-task-completed',
        reminderText: '',
        rawText: '',
        headline: '',
        isInternalInitiator: false,
      },
    };

    expect(runtime.shouldRenderConversationMessage(message)).toBe(false);
  });

  it('returns false for all-background-tasks-complete reminders', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: 100,
      omo: {
        kind: 'system-reminder',
        reminderType: 'all-background-tasks-complete',
        reminderText: '',
        rawText: '',
        headline: '',
        isInternalInitiator: false,
      },
    };

    expect(runtime.shouldRenderConversationMessage(message)).toBe(false);
  });

  it('returns true for notice displayStyle', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = {
      id: 'msg-1', role: 'user', content: '', timestamp: 100, displayStyle: 'notice',
    };

    expect(runtime.shouldRenderConversationMessage(message)).toBe(true);
  });

  it('returns false for empty non-assistant messages', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = { id: 'msg-1', role: 'user', content: '', timestamp: 100 };

    expect(runtime.shouldRenderConversationMessage(message)).toBe(false);
  });

  it('returns true for non-assistant with content', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 };

    expect(runtime.shouldRenderConversationMessage(message)).toBe(true);
  });

  it('returns true for assistant with toolCalls', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = {
      id: 'msg-1', role: 'assistant', content: '', timestamp: 100,
      toolCalls: [{ id: 'tc-1', name: 'test', input: {} }],
    };

    expect(runtime.shouldRenderConversationMessage(message)).toBe(true);
  });

  it('returns false for empty assistant without any qualifying field', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = { id: 'msg-1', role: 'assistant', content: '', timestamp: 100 };

    expect(runtime.shouldRenderConversationMessage(message)).toBe(false);
  });

  it('returns true for assistant with contentBlocks', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = {
      id: 'msg-1', role: 'assistant', content: '', timestamp: 100,
      contentBlocks: [{ type: 'text', text: 'Hello!' }],
    };

    expect(runtime.shouldRenderConversationMessage(message)).toBe(true);
  });
});
