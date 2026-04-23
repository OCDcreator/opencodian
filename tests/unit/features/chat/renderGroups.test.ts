import type { ChatMessage } from '../../../../src/core/types';
import {
  buildMessageRenderGroups,
  mergeAssistantMessagesForRender,
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
});
