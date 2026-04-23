import type { ChatMessage } from '../../../../src/core/types';
import {
  buildMessageRenderGroups,
  injectLiveCompactionDivider,
  mergeAssistantMessagesForRender,
  tagCompactionSummaries,
} from '../../../../src/features/chat/renderGroups';

function createMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: overrides.id ?? 'message',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? '',
    timestamp: overrides.timestamp ?? 0,
    ...overrides,
  };
}

describe('renderGroups', () => {
  it('merges consecutive default assistant messages into one render group', () => {
    const groups = buildMessageRenderGroups([
      createMessage({ id: 'user-1', role: 'user', content: 'hello' }),
      createMessage({ id: 'assistant-1', content: 'first' }),
      createMessage({ id: 'assistant-2', content: 'second' }),
      createMessage({ id: 'user-2', role: 'user', content: 'follow-up' }),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({
      mergedAssistant: false,
      messages: [expect.objectContaining({ id: 'user-1' })],
    });
    expect(groups[1].mergedAssistant).toBe(true);
    expect(groups[1].messages.map((message) => message.id)).toEqual([
      'assistant-1',
      'assistant-2',
    ]);
    expect(groups[2]).toMatchObject({
      mergedAssistant: false,
      messages: [expect.objectContaining({ id: 'user-2' })],
    });
  });

  it('does not merge notice messages with assistant responses', () => {
    const groups = buildMessageRenderGroups([
      createMessage({ id: 'assistant-1', content: 'first' }),
      createMessage({
        id: 'notice-1',
        content: 'notice',
        displayStyle: 'notice',
      }),
      createMessage({ id: 'assistant-2', content: 'second' }),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.messages[0].id)).toEqual([
      'assistant-1',
      'notice-1',
      'assistant-2',
    ]);
  });

  it('does not merge assistant compaction summaries with adjacent assistant turns', () => {
    const groups = buildMessageRenderGroups([
      createMessage({ id: 'assistant-1', content: 'first' }),
      createMessage({
        id: 'assistant-summary',
        content: 'Compaction report',
        summary: true,
      }),
      createMessage({ id: 'assistant-2', content: 'second' }),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.messages[0].id)).toEqual([
      'assistant-1',
      'assistant-summary',
      'assistant-2',
    ]);
  });

  it('merges assistant content blocks in order and keeps the latest metadata', () => {
    const merged = mergeAssistantMessagesForRender([
      createMessage({
        id: 'assistant-1',
        content: 'planning',
        timestamp: 10,
        contentBlocks: [
          { type: 'thinking', thinking: 'thinking-1', durationSeconds: 1 },
          { type: 'text', text: 'planning' },
        ],
      }),
      createMessage({
        id: 'assistant-2',
        content: 'answer',
        timestamp: 20,
        modelId: 'provider/model',
        contentBlocks: [
          { type: 'thinking', thinking: 'thinking-2', durationSeconds: 2 },
          { type: 'tool_use', toolId: 'tool-1', toolName: 'search' },
          { type: 'text', text: 'answer' },
        ],
      }),
    ]);

    expect(merged.id).toBe('assistant-1__assistant-2');
    expect(merged.timestamp).toBe(20);
    expect(merged.modelId).toBe('provider/model');
    expect(merged.content).toBe('planning\n\nanswer');
    expect(merged.contentBlocks).toEqual([
      { type: 'thinking', thinking: 'thinking-1', durationSeconds: 1 },
      { type: 'text', text: 'planning' },
      { type: 'thinking', thinking: 'thinking-2', durationSeconds: 2 },
      { type: 'tool_use', toolId: 'tool-1', toolName: 'search' },
      { type: 'text', text: 'answer' },
    ]);
    expect(merged.sourceMessageId).toBeUndefined();
  });

  it('dedupes repeated adjacent assistant text when flattened blocks already contain the same answer', () => {
    const merged = mergeAssistantMessagesForRender([
      createMessage({
        id: 'assistant-1',
        content: 'answer',
        timestamp: 10,
        contentBlocks: [
          { type: 'tool_use', toolId: 'tool-1', toolName: 'structured_output' },
          { type: 'text', text: 'answer' },
        ],
      }),
      createMessage({
        id: 'assistant-2',
        content: 'answer',
        timestamp: 20,
        contentBlocks: [
          { type: 'text', text: 'answer' },
        ],
      }),
    ]);

    expect(merged.content).toBe('answer');
    expect(merged.contentBlocks).toEqual([
      { type: 'tool_use', toolId: 'tool-1', toolName: 'structured_output' },
      { type: 'text', text: 'answer' },
    ]);
  });

  it('places compaction divider user messages in their own non-merged render group separate from adjacent user and assistant messages', () => {
    const groups = buildMessageRenderGroups([
      createMessage({ id: 'user-1', role: 'user', content: 'Question' }),
      createMessage({
        id: 'compaction-divider',
        role: 'user',
        content: '',
        compactionDivider: { auto: true, overflow: false, tailStartId: 'user-1' },
      } as ChatMessage & { compactionDivider: unknown }),
      createMessage({
        id: 'summary-1',
        role: 'assistant',
        content: 'Compressed 5 turns',
        summary: true,
      }),
      createMessage({ id: 'assistant-post', role: 'assistant', content: 'New answer' }),
    ]);

    const dividerGroup = groups.find(
      (g) => g.messages.some((m) => 'compactionDivider' in m),
    );
    expect(dividerGroup).toBeDefined();
    expect(dividerGroup!.messages).toHaveLength(1);
    expect(dividerGroup!.mergedAssistant).toBe(false);

    const summaryGroup = groups.find(
      (g) => g.messages.some((m) => m.summary),
    );
    expect(summaryGroup).toBeDefined();
    expect(summaryGroup!.mergedAssistant).toBe(false);
    expect(summaryGroup!.messages).toHaveLength(1);
    expect(summaryGroup!.messages[0].id).toBe('summary-1');

    const postGroup = groups.find(
      (g) => g.messages.some((m) => m.id === 'assistant-post'),
    );
    expect(postGroup!.mergedAssistant).toBe(true);
  });

  it('does not model compaction divider user messages as notice-style render groups', () => {
    const groups = buildMessageRenderGroups([
      createMessage({
        id: 'compaction-divider-1',
        role: 'user',
        content: '',
        compactionDivider: { auto: true, overflow: true, tailStartId: 'msg-1' },
      } as ChatMessage & { compactionDivider: unknown }),
    ]);

    expect(groups).toHaveLength(1);
    const dividerMsg = groups[0].messages[0];
    expect('compactionDivider' in dividerMsg).toBe(true);
    expect(dividerMsg.displayStyle).not.toBe('notice');
  });

  it('places a live compaction divider injected by injectLiveCompactionDivider into its own render group', () => {
    const base = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi', timestamp: 100 }),
      createMessage({ id: 'asst-1', role: 'assistant', content: 'Answer', timestamp: 200 }),
    ];
    const injected = injectLiveCompactionDivider({ messages: base, compactingAt: 250, tabId: 'tab-1' });
    const groups = buildMessageRenderGroups(injected);

    const liveDividerGroup = groups.find(
      (g) => g.messages.some((m) => m.compactionDivider?.live),
    );
    expect(liveDividerGroup).toBeDefined();
    expect(liveDividerGroup!.messages).toHaveLength(1);
    expect(liveDividerGroup!.mergedAssistant).toBe(false);
  });
});

describe('tagCompactionSummaries', () => {
  it('tags summaries after a compaction divider as compaction summaries', () => {
    const messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi', timestamp: 100 }),
      createMessage({
        id: 'divider-1',
        role: 'user',
        content: '',
        timestamp: 200,
        compactionDivider: { auto: true, overflow: false, tailStartId: '' },
      } as ChatMessage & { compactionDivider: unknown }),
      createMessage({ id: 'summary-1', role: 'assistant', content: 'Compressed', timestamp: 300, summary: true }),
    ];

    const result = tagCompactionSummaries(messages);

    expect(result[2].summaryKind).toBe('compaction');
  });

  it('does not tag summaries that appear before any compaction divider', () => {
    const messages = [
      createMessage({ id: 'summary-early', role: 'assistant', content: 'Early summary', timestamp: 50, summary: true }),
      createMessage({ id: 'user-1', role: 'user', content: 'Hi', timestamp: 100 }),
    ];

    const result = tagCompactionSummaries(messages);

    expect(result[0].summaryKind).toBeUndefined();
  });

  it('resets the compaction context after a non-divider user message', () => {
    const messages = [
      createMessage({
        id: 'divider-1',
        role: 'user',
        content: '',
        timestamp: 100,
        compactionDivider: { auto: true, overflow: false, tailStartId: '' },
      } as ChatMessage & { compactionDivider: unknown }),
      createMessage({ id: 'user-interrupt', role: 'user', content: 'New question', timestamp: 200 }),
      createMessage({ id: 'summary-orphan', role: 'assistant', content: 'Summary', timestamp: 300, summary: true }),
    ];

    const result = tagCompactionSummaries(messages);

    expect(result[2].summaryKind).toBeUndefined();
  });

  it('does not overwrite an already-set summaryKind', () => {
    const messages = [
      createMessage({
        id: 'divider-1',
        role: 'user',
        content: '',
        timestamp: 100,
        compactionDivider: { auto: true, overflow: false, tailStartId: '' },
      } as ChatMessage & { compactionDivider: unknown }),
      createMessage({
        id: 'summary-preset',
        role: 'assistant',
        content: 'Summary',
        timestamp: 200,
        summary: true,
        summaryKind: 'compaction',
      }),
    ];

    const result = tagCompactionSummaries(messages);

    expect(result[1].summaryKind).toBe('compaction');
  });

  it('tags summaries after a live synthetic divider', () => {
    const base = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi', timestamp: 100 }),
      createMessage({ id: 'asst-1', role: 'assistant', content: 'Answer', timestamp: 200 }),
    ];
    const injected = injectLiveCompactionDivider({ messages: base, compactingAt: 250, tabId: 'tab-1' });
    const result = tagCompactionSummaries(injected);

    expect(result.some((m) => m.compactionDivider?.live)).toBe(true);
  });

  it('does not tag non-summary assistant messages after a divider', () => {
    const messages = [
      createMessage({
        id: 'divider-1',
        role: 'user',
        content: '',
        timestamp: 100,
        compactionDivider: { auto: true, overflow: false, tailStartId: '' },
      } as ChatMessage & { compactionDivider: unknown }),
      createMessage({ id: 'asst-normal', role: 'assistant', content: 'Normal answer', timestamp: 200 }),
    ];

    const result = tagCompactionSummaries(messages);

    expect(result[1].summaryKind).toBeUndefined();
  });

  it('tags multiple consecutive summaries after a divider as compaction', () => {
    const messages = [
      createMessage({
        id: 'divider-1',
        role: 'user',
        content: '',
        timestamp: 100,
        compactionDivider: { auto: true, overflow: false, tailStartId: '' },
      } as ChatMessage & { compactionDivider: unknown }),
      createMessage({ id: 'summary-1', role: 'assistant', content: 'First', timestamp: 200, summary: true }),
      createMessage({ id: 'summary-2', role: 'assistant', content: 'Second', timestamp: 300, summary: true }),
    ];

    const result = tagCompactionSummaries(messages);

    expect(result[1].summaryKind).toBe('compaction');
    expect(result[2].summaryKind).toBe('compaction');
  });
});
