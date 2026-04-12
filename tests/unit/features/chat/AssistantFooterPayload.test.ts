import type { ChatMessage } from '../../../../src/core/types';
import {
  buildErrorAssistantFooterPayload,
  buildNoticeAssistantFooterPayload,
  buildPersistedAssistantFooterPayload,
  buildPseudoStreamAssistantFooterPayload,
  resolvePersistedAssistantFooterStatusLabel,
} from '../../../../src/features/chat/runtime/AssistantFooterPayload';

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

    expect(buildPersistedAssistantFooterPayload({ message })).toEqual({
      timestamp: 12345,
      content: 'Visible answer',
      modelId: 'anthropic/claude-sonnet-4',
      statusLabel: 'Interrupted',
    });
  });

  it('returns an interrupted badge only for interrupted persisted assistant messages', () => {
    expect(resolvePersistedAssistantFooterStatusLabel({
      id: 'assistant-3',
      role: 'assistant',
      content: 'Stopped',
      timestamp: 123,
      streamState: 'interrupted',
    } as ChatMessage)).toBe('Interrupted');

    expect(resolvePersistedAssistantFooterStatusLabel({
      id: 'assistant-4',
      role: 'assistant',
      content: 'Done',
      timestamp: 456,
      streamState: 'done',
    } as ChatMessage)).toBeUndefined();
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

  it('assembles notice footers without copy content or status', () => {
    expect(buildNoticeAssistantFooterPayload({
      message: {
        timestamp: 11111,
        modelId: 'openai/gpt-5.4',
      },
    })).toEqual({
      timestamp: 11111,
      content: undefined,
      modelId: 'openai/gpt-5.4',
      statusLabel: undefined,
    });
  });

  it('assembles pseudo-stream and error footer payloads with copy content', () => {
    expect(buildPseudoStreamAssistantFooterPayload({
      message: {
        content: 'Reveal me',
        timestamp: 22222,
        modelId: 'anthropic/claude-sonnet-4',
      },
    })).toEqual({
      timestamp: 22222,
      content: 'Reveal me',
      modelId: 'anthropic/claude-sonnet-4',
      statusLabel: undefined,
    });

    expect(buildErrorAssistantFooterPayload({
      timestamp: 33333,
      content: 'Server unavailable',
      modelId: 'anthropic/claude-sonnet-4',
    })).toEqual({
      timestamp: 33333,
      content: 'Server unavailable',
      modelId: 'anthropic/claude-sonnet-4',
      statusLabel: undefined,
    });
  });
});
