import {
  extractStructuredOutputDuplicateText,
  filterDuplicateStructuredOutputContentBlocks,
  filterDuplicateStructuredOutputTextBlocks,
  getStreamedTextContent,
  hasVisibleStreamingContent,
  isDuplicateStructuredOutputText,
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

describe('extractStructuredOutputDuplicateText', () => {
  it('extracts the parsed JSON from the response field', () => {
    const structured = { response: '{"greeting": "hello"}' };
    expect(extractStructuredOutputDuplicateText(structured)).toBe('{"greeting":"hello"}');
  });

  it('returns the raw response string when it is not valid JSON', () => {
    const structured = { response: 'Plain text answer' };
    expect(extractStructuredOutputDuplicateText(structured)).toBe('Plain text answer');
  });

  it('returns null when structured output is undefined', () => {
    expect(extractStructuredOutputDuplicateText(undefined)).toBeNull();
  });

  it('returns null when structured output has no response field', () => {
    expect(extractStructuredOutputDuplicateText({ tags: ['a'] })).toBeNull();
  });

  it('returns null when response is not a string', () => {
    expect(extractStructuredOutputDuplicateText({ response: 42 })).toBeNull();
  });
});

describe('isDuplicateStructuredOutputText', () => {
  it('matches exact duplicate text', () => {
    const structured = { response: '{"greeting": "hello"}' };
    expect(isDuplicateStructuredOutputText('{"greeting":"hello"}', structured)).toBe(true);
  });

  it('matches duplicate text with formatting differences', () => {
    const structured = { response: '{"greeting": "hello"}' };
    expect(isDuplicateStructuredOutputText('{"greeting": "hello"}', structured)).toBe(true);
  });

  it('matches plain string response', () => {
    const structured = { response: 'Hello world' };
    expect(isDuplicateStructuredOutputText('Hello world', structured)).toBe(true);
  });

  it('does not match different content', () => {
    const structured = { response: '{"greeting": "hello"}' };
    expect(isDuplicateStructuredOutputText('{"greeting": "goodbye"}', structured)).toBe(false);
  });

  it('does not match when structured output is undefined', () => {
    expect(isDuplicateStructuredOutputText('{"greeting": "hello"}', undefined)).toBe(false);
  });
});

describe('filterDuplicateStructuredOutputTextBlocks', () => {
  it('removes the last text block when it duplicates structured output', () => {
    const blocks = [
      { type: 'text' as const, content: 'Hello' },
      { type: 'text' as const, content: '{"greeting": "hello"}' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputTextBlocks(blocks, structured);
    expect(result).toEqual([
      { type: 'text', content: 'Hello' },
    ]);
  });

  it('does not remove the last text block when it does not duplicate', () => {
    const blocks = [
      { type: 'text' as const, content: 'Hello' },
      { type: 'text' as const, content: 'world' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputTextBlocks(blocks, structured);
    expect(result).toEqual(blocks);
  });

  it('removes any matching text block regardless of position', () => {
    const blocks = [
      { type: 'text' as const, content: '{"greeting": "hello"}' },
      { type: 'thinking' as const, content: 'Planning', partId: 'p1' },
      { type: 'text' as const, content: 'After' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputTextBlocks(blocks, structured);
    expect(result).toEqual([
      { type: 'thinking', content: 'Planning', partId: 'p1' },
      { type: 'text', content: 'After' },
    ]);
  });

  it('removes multiple matching text blocks', () => {
    const blocks = [
      { type: 'text' as const, content: '{"greeting": "hello"}' },
      { type: 'thinking' as const, content: 'Planning', partId: 'p1' },
      { type: 'text' as const, content: '{"greeting": "hello"}' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputTextBlocks(blocks, structured);
    expect(result).toEqual([
      { type: 'thinking', content: 'Planning', partId: 'p1' },
    ]);
  });

  it('leaves non-text blocks untouched', () => {
    const blocks = [
      { type: 'thinking' as const, content: 'Planning', partId: 'p1' },
      { type: 'text' as const, content: '{"greeting": "hello"}' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputTextBlocks(blocks, structured);
    expect(result).toEqual([
      { type: 'thinking', content: 'Planning', partId: 'p1' },
    ]);
  });

  it('returns undefined when blocks is undefined', () => {
    const structured = { response: '{"greeting": "hello"}' };
    expect(filterDuplicateStructuredOutputTextBlocks(undefined, structured)).toBeUndefined();
  });

  it('returns original blocks when structured output is undefined', () => {
    const blocks = [
      { type: 'text' as const, content: 'Hello' },
    ];
    expect(filterDuplicateStructuredOutputTextBlocks(blocks, undefined)).toEqual(blocks);
  });
});

describe('filterDuplicateStructuredOutputContentBlocks', () => {
  it('removes the last text block when it duplicates structured output', () => {
    const blocks = [
      { type: 'text' as const, text: 'Hello' },
      { type: 'text' as const, text: '{"greeting": "hello"}' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputContentBlocks(blocks, structured);
    expect(result).toEqual([
      { type: 'text', text: 'Hello' },
    ]);
  });

  it('does not remove the last text block when it does not duplicate', () => {
    const blocks = [
      { type: 'text' as const, text: 'Hello' },
      { type: 'text' as const, text: 'world' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputContentBlocks(blocks, structured);
    expect(result).toEqual(blocks);
  });

  it('removes any matching text block regardless of position', () => {
    const blocks = [
      { type: 'text' as const, text: '{"greeting": "hello"}' },
      { type: 'thinking' as const, thinking: 'Planning', durationSeconds: 3 },
      { type: 'text' as const, text: 'After' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputContentBlocks(blocks, structured);
    expect(result).toEqual([
      { type: 'thinking', thinking: 'Planning', durationSeconds: 3 },
      { type: 'text', text: 'After' },
    ]);
  });

  it('removes multiple matching text blocks', () => {
    const blocks = [
      { type: 'text' as const, text: '{"greeting": "hello"}' },
      { type: 'thinking' as const, thinking: 'Planning', durationSeconds: 3 },
      { type: 'text' as const, text: '{"greeting": "hello"}' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputContentBlocks(blocks, structured);
    expect(result).toEqual([
      { type: 'thinking', thinking: 'Planning', durationSeconds: 3 },
    ]);
  });

  it('leaves non-text blocks untouched', () => {
    const blocks = [
      { type: 'thinking' as const, thinking: 'Planning', durationSeconds: 3 },
      { type: 'text' as const, text: '{"greeting": "hello"}' },
    ];
    const structured = { response: '{"greeting": "hello"}' };
    const result = filterDuplicateStructuredOutputContentBlocks(blocks, structured);
    expect(result).toEqual([
      { type: 'thinking', thinking: 'Planning', durationSeconds: 3 },
    ]);
  });

  it('returns undefined when blocks is undefined', () => {
    const structured = { response: '{"greeting": "hello"}' };
    expect(filterDuplicateStructuredOutputContentBlocks(undefined, structured)).toBeUndefined();
  });

  it('returns original blocks when structured output is undefined', () => {
    const blocks = [
      { type: 'text' as const, text: 'Hello' },
    ];
    expect(filterDuplicateStructuredOutputContentBlocks(blocks, undefined)).toEqual(blocks);
  });

  it('handles markdown-wrapped JSON duplicates', () => {
    const blocks = [
      { type: 'text' as const, text: '```json\n{"greeting": "hello"}\n```' },
    ];
    const structured = { response: '```json\n{"greeting": "hello"}\n```' };
    const result = filterDuplicateStructuredOutputContentBlocks(blocks, structured);
    expect(result).toEqual([]);
  });
});
