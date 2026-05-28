import type { ChatMessage, Conversation } from '../../../../src/core/types';
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

describe('ConversationIdentityRuntime.getConversationSyncFingerprint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to canonical fingerprint when host provides one', () => {
    const host = createHost({
      getCanonicalConversationFingerprint: jest.fn().mockReturnValue('canonical-fingerprint'),
    });
    const runtime = new ConversationIdentityRuntime(host);
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 },
    ];

    const result = runtime.getConversationSyncFingerprint(messages);

    expect(result).toBe('canonical-fingerprint');
    expect(host.getCanonicalConversationFingerprint).toHaveBeenCalledWith(messages);
  });

  it('falls back to inline JSON when canonical returns undefined', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 },
    ];

    const result = runtime.getConversationSyncFingerprint(messages);

    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('msg-1');
    expect(parsed[0].role).toBe('user');
    expect(parsed[0].content).toBe('hello');
    expect(parsed[0].timestamp).toBe(100);
  });

  it('includes all expected message fields in inline JSON', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello!',
        timestamp: 100,
        modelId: 'gpt-4',
        sourceMessageId: 'src-1',
        streamState: 'interrupted',
        displayStyle: 'default',
        noticeTitle: 'Notice',
        noticeTone: 'info',
        noticeActions: [{ type: 'open_model_settings' }],
        noticeMeta: { kind: 'background-task-completion' },
        images: [{ data: 'base64...', mediaType: 'image/png' }],
        toolCalls: [{ id: 'tc-1', name: 'test', input: {} }],
        contentBlocks: [{ type: 'text', text: 'Hello!' }],
        contextAttachments: [
          { kind: 'selection', path: '/file', label: 'File', mime: 'text/plain' },
        ],
        questionResolution: {
          request: { id: 'qr-1', sessionId: 'sess-1', questions: [] },
          status: 'answered',
          answers: [['yes']],
        },
        omo: {
          kind: 'system-reminder',
          reminderType: 'generic',
          reminderText: '',
          rawText: '',
          headline: '',
          isInternalInitiator: false,
        },
        structured: {},
        parts: ['part1'],
      },
    ];

    const result = runtime.getConversationSyncFingerprint(messages);
    const parsed = JSON.parse(result);
    const message = parsed[0];

    expect(message.id).toBe('msg-1');
    expect(message.role).toBe('assistant');
    expect(message.modelId).toBe('gpt-4');
    expect(message.sourceMessageId).toBe('src-1');
    expect(message.streamState).toBe('interrupted');
    expect(message.displayStyle).toBe('default');
    expect(message.noticeTitle).toBe('Notice');
    expect(message.noticeTone).toBe('info');
    expect(message.noticeActions).toEqual([{ type: 'open_model_settings' }]);
    expect(message.noticeMeta).toEqual({ kind: 'background-task-completion' });
    expect(message.content).toBe('Hello!');
    expect(message.timestamp).toBe(100);
    expect(message.images).toEqual([{ data: 'base64...', mediaType: 'image/png' }]);
    expect(message.toolCalls).toEqual([{ id: 'tc-1', name: 'test', input: {} }]);
    expect(message.contentBlocks).toEqual([{ type: 'text', text: 'Hello!' }]);
    expect(message.contextAttachments).toEqual([
      { kind: 'selection', path: '/file', label: 'File', mime: 'text/plain' },
    ]);
    expect(message.questionResolution).toEqual({
      request: { id: 'qr-1', sessionId: 'sess-1', questions: [] },
      status: 'answered',
      answers: [['yes']],
    });
    expect(message.omo).toEqual({
      kind: 'system-reminder',
      reminderType: 'generic',
      reminderText: '',
      rawText: '',
      headline: '',
      isInternalInitiator: false,
    });
    expect(message.structured).toEqual({});
    expect(message.parts).toEqual(['part1']);
  });

  it('handles empty messages array', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);

    const result = runtime.getConversationSyncFingerprint([]);

    expect(JSON.parse(result)).toEqual([]);
  });

  it('serializes missing optional fields as null', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'test', timestamp: 100 },
    ];

    const result = runtime.getConversationSyncFingerprint(messages);
    const parsed = JSON.parse(result);

    expect(parsed[0].modelId).toBeNull();
    expect(parsed[0].sourceMessageId).toBeNull();
    expect(parsed[0].streamState).toBeNull();
    expect(parsed[0].displayStyle).toBeNull();
    expect(parsed[0].noticeTitle).toBeNull();
    expect(parsed[0].noticeTone).toBeNull();
    expect(parsed[0].noticeActions).toBeNull();
    expect(parsed[0].noticeMeta).toBeNull();
    expect(parsed[0].images).toBeNull();
    expect(parsed[0].toolCalls).toBeNull();
    expect(parsed[0].contentBlocks).toBeNull();
    expect(parsed[0].contextAttachments).toBeNull();
    expect(parsed[0].questionResolution).toBeNull();
    expect(parsed[0].omo).toBeNull();
    expect(parsed[0].structured).toBeNull();
    expect(parsed[0].parts).toBeNull();
  });
});

describe('ConversationIdentityRuntime.getInterruptedSyncPreservationLogFingerprint', () => {
  it('serializes conversation ID, session ID, and filtered message fields', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const conversation: Conversation = {
      id: 'conv-1',
      title: 'Test',
      createdAt: 100,
      updatedAt: 200,
      openCodeSessionId: 'session-1',
      messages: [],
    };
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'hello',
        timestamp: 100,
        sourceMessageId: 'src-1',
        streamState: 'interrupted',
      },
    ];

    const result = runtime.getInterruptedSyncPreservationLogFingerprint(
      conversation,
      messages,
    );
    const parsed = JSON.parse(result);

    expect(parsed.conversationId).toBe('conv-1');
    expect(parsed.sessionId).toBe('session-1');
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].id).toBe('msg-1');
    expect(parsed.messages[0].sourceMessageId).toBe('src-1');
    expect(parsed.messages[0].streamState).toBe('interrupted');
    expect(parsed.messages[0].timestamp).toBe(100);
    expect(parsed.messages[0].content).toBe('hello');
  });

  it('defaults contentBlocks to empty array when undefined', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const conversation: Conversation = {
      id: 'conv-1',
      title: 'Test',
      createdAt: 100,
      updatedAt: 200,
      openCodeSessionId: 'session-1',
      messages: [],
    };
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 },
    ];

    const result = runtime.getInterruptedSyncPreservationLogFingerprint(
      conversation,
      messages,
    );
    const parsed = JSON.parse(result);

    expect(parsed.messages[0].contentBlocks).toEqual([]);
  });

  it('produces different fingerprints for different conversations', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 },
    ];
    const conversation1: Conversation = {
      id: 'conv-1',
      title: 'Test',
      createdAt: 100,
      updatedAt: 200,
      openCodeSessionId: 'session-1',
      messages: [],
    };
    const conversation2: Conversation = {
      id: 'conv-2',
      title: 'Test',
      createdAt: 100,
      updatedAt: 200,
      openCodeSessionId: 'session-2',
      messages: [],
    };

    const fingerprint1 = runtime.getInterruptedSyncPreservationLogFingerprint(
      conversation1,
      messages,
    );
    const fingerprint2 = runtime.getInterruptedSyncPreservationLogFingerprint(
      conversation2,
      messages,
    );

    expect(fingerprint1).not.toBe(fingerprint2);
  });
});

describe('ConversationIdentityRuntime.getMessageVisualSignature', () => {
  it('includes role, content, and timestamp in signature', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'hello',
      timestamp: 100,
    };

    const result = runtime.getMessageVisualSignature(message);
    const parsed = JSON.parse(result);

    expect(parsed.role).toBe('user');
    expect(parsed.content).toBe('hello');
    expect(parsed.timestamp).toBe(100);
  });

  it('maps questionResolution to requestId/status/answers', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'user',
      content: '',
      timestamp: 100,
      questionResolution: {
        request: {
          id: 'qr-1',
          sessionId: 'sess-1',
          questions: [
            {
              question: 'Are you sure?',
              header: 'Confirm',
              options: [{ label: 'Yes', description: '' }],
            },
          ],
        },
        status: 'answered',
        answers: [['yes']],
      },
    };

    const result = runtime.getMessageVisualSignature(message);
    const parsed = JSON.parse(result);

    expect(parsed.questionResolution).toEqual({
      requestId: 'qr-1',
      status: 'answered',
      answers: [['yes']],
    });
  });

  it('maps contentBlocks to a subset of fields', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: 100,
      contentBlocks: [
        {
          type: 'tool_use',
          toolId: 'tool-1',
          toolName: 'read_file',
          toolKind: 'builtin',
          toolInput: { path: '/' },
          toolMetadata: {},
          toolStatus: 'completed',
          toolResult: 'file contents',
          toolResultVisibility: 'visible',
        },
        {
          type: 'text',
          text: 'Hello!',
          thinking: 'hmm',
          durationSeconds: 5,
        },
      ],
    };

    const result = runtime.getMessageVisualSignature(message);
    const parsed = JSON.parse(result);

    expect(parsed.contentBlocks).toHaveLength(2);
    expect(parsed.contentBlocks[0].type).toBe('tool_use');
    expect(parsed.contentBlocks[0].toolId).toBe('tool-1');
    expect(parsed.contentBlocks[0].toolName).toBe('read_file');
    expect(parsed.contentBlocks[1].type).toBe('text');
    expect(parsed.contentBlocks[1].text).toBe('Hello!');
  });

  it('serializes null optional fields correctly', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'test',
      timestamp: 100,
    };

    const result = runtime.getMessageVisualSignature(message);
    const parsed = JSON.parse(result);

    expect(parsed.streamState).toBeNull();
    expect(parsed.displayStyle).toBeNull();
    expect(parsed.modelId).toBeNull();
    expect(parsed.summaryKind).toBeNull();
    expect(parsed.compactionDivider).toBeNull();
    expect(parsed.questionResolution).toBeNull();
  });

  it('produces different signatures for messages with different timestamps', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const msg1: ChatMessage = { id: 'msg-1', role: 'user', content: 'hello', timestamp: 100 };
    const msg2: ChatMessage = { id: 'msg-2', role: 'user', content: 'hello', timestamp: 200 };

    expect(runtime.getMessageVisualSignature(msg1)).not.toBe(runtime.getMessageVisualSignature(msg2));
  });

  it('includes structured field in signature (regression: structured-only change must trigger rerender)', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const msg1: ChatMessage = { id: 'msg-1', role: 'assistant', content: '', timestamp: 100 };
    const msg2: ChatMessage = { id: 'msg-1', role: 'assistant', content: '', timestamp: 100, structured: { response: 'test' } };

    const sig1 = runtime.getMessageVisualSignature(msg1);
    const sig2 = runtime.getMessageVisualSignature(msg2);

    expect(sig1).not.toBe(sig2);
    expect(JSON.parse(sig2).structured).toEqual({ response: 'test' });
  });

  it('serializes null structured correctly', () => {
    const host = createHost();
    const runtime = new ConversationIdentityRuntime(host);
    const message: ChatMessage = { id: 'msg-1', role: 'assistant', content: '', timestamp: 100 };

    const result = runtime.getMessageVisualSignature(message);
    const parsed = JSON.parse(result);

    expect(parsed.structured).toBeNull();
  });
});
