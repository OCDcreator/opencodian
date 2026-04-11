import {
  getStreamedTextContent,
  hasVisibleStreamingContent,
  mapStreamingContentBlocksToMessageContentBlocks,
} from '../../../../src/features/chat/runtime/sendPipelineContent';

describe('sendPipelineContent', () => {
  it('maps streaming content blocks into persisted message blocks', () => {
    const result = mapStreamingContentBlocksToMessageContentBlocks([
      { type: 'text', content: 'Hello' },
      { type: 'thinking', content: 'Analyzing', partId: 'p1', durationSeconds: 3 },
      {
        type: 'tool_call',
        toolCall: {
          id: 'tool-1',
          name: 'grep',
          kind: 'builtin',
          input: { pattern: 'TODO' },
          status: 'completed',
          result: 'done',
        },
      },
    ]);

    expect(result).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'thinking', thinking: 'Analyzing', durationSeconds: 3 },
      {
        type: 'tool_use',
        toolId: 'tool-1',
        toolName: 'grep',
        toolKind: 'builtin',
        toolInput: { pattern: 'TODO' },
        toolStatus: 'completed',
        toolResult: 'done',
      },
    ]);
  });

  it('joins only streamed text blocks into assistant content', () => {
    expect(getStreamedTextContent([
      { type: 'thinking', content: 'Planning', partId: 'p1' },
      { type: 'text', content: 'Hello' },
      {
        type: 'tool_call',
        toolCall: {
          id: 'tool-1',
          name: 'grep',
          input: {},
          status: 'completed',
        },
      },
      { type: 'text', content: ' world' },
    ])).toBe('Hello world');
  });

  it('treats text, thinking, and tool chunks as visible content only when appropriate', () => {
    expect(hasVisibleStreamingContent({ type: 'text', content: '  ' })).toBe(false);
    expect(hasVisibleStreamingContent({ type: 'text', content: 'Hello' })).toBe(true);
    expect(hasVisibleStreamingContent({ type: 'thinking', content: '\n' })).toBe(false);
    expect(hasVisibleStreamingContent({ type: 'thinking', content: 'Reasoning' })).toBe(true);
    expect(hasVisibleStreamingContent({
      type: 'tool_use',
      id: 'tool-1',
      name: 'grep',
      input: {},
    })).toBe(true);
  });
});
