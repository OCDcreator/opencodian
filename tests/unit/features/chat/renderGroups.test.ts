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
});
