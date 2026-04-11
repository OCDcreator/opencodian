import { resolveAssistantCopyContent } from '../../../../src/features/chat/runtime/AssistantCopyContent';

describe('AssistantCopyContent', () => {
  it('joins structured text blocks for assistant copy content', () => {
    expect(resolveAssistantCopyContent({
      content: 'Fallback content',
      contentBlocks: [
        { type: 'thinking', thinking: 'Hidden reasoning' },
        { type: 'text', text: '  First paragraph  ' },
        { type: 'tool_use', toolName: 'search' },
        { type: 'text', text: 'Second paragraph' },
      ],
    })).toBe('First paragraph\n\nSecond paragraph');
  });

  it('keeps structured copy content empty when blocks exist without copyable text', () => {
    expect(resolveAssistantCopyContent({
      content: 'Fallback content',
      contentBlocks: [
        { type: 'thinking', thinking: 'Hidden reasoning' },
        { type: 'tool_use', toolName: 'search' },
        { type: 'text', text: '   ' },
      ],
    })).toBeUndefined();
  });

  it('falls back to message content without structured blocks', () => {
    expect(resolveAssistantCopyContent({
      content: 'Fallback content',
    })).toBe('Fallback content');
  });
});
