import type { ChatMessage } from '../../../../src/core/types';
import { buildPersistedAssistantFooterPayload } from '../../../../src/features/chat/runtime/AssistantFooterPayload';

describe('AssistantFooterPayload', () => {
  it('assembles timestamp copy content model and status for persisted assistant messages', () => {
    const message: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Fallback content',
      timestamp: 12345,
      modelId: 'anthropic/claude-sonnet-4',
      streamState: 'interrupted',
      contentBlocks: [
        { type: 'thinking', thinking: 'Hidden reasoning' },
        { type: 'text', text: ' Visible answer ' },
      ],
    };

    expect(buildPersistedAssistantFooterPayload({
      message,
      statusLabel: 'Interrupted',
    })).toEqual({
      timestamp: 12345,
      content: 'Visible answer',
      modelId: 'anthropic/claude-sonnet-4',
      statusLabel: 'Interrupted',
    });
  });

  it('keeps optional footer payload fields undefined when the message does not provide them', () => {
    const message: ChatMessage = {
      id: 'assistant-2',
      role: 'assistant',
      content: '',
      timestamp: 67890,
    };

    expect(buildPersistedAssistantFooterPayload({ message })).toEqual({
      timestamp: 67890,
      content: undefined,
      modelId: undefined,
      statusLabel: undefined,
    });
  });
});
