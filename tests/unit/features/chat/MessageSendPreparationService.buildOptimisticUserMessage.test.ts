import type {
  PromptRequestPart,
} from '../../../../src/core/opencode/OpenCodePromptRequestBuilder';
import {
  buildOptimisticUserMessage,
} from '../../../../src/features/chat/services/MessageSendPreparationService';
import {
  createPromptContextItem,
} from './MessageSendPreparationService.testSupport';

describe('buildOptimisticUserMessage', () => {
  it('builds a user message with context attachments', () => {
    const contextItem = createPromptContextItem();
    const optimisticUserParts: PromptRequestPart[] = [
      { id: 'part-1', type: 'text', text: 'Hello' },
    ];

    const message = buildOptimisticUserMessage({
      content: 'Hello',
      contextItems: [contextItem],
      now: 123,
      structuredSend: { optimisticUserParts },
    });

    expect(message).toEqual({
      id: 'user-123',
      role: 'user',
      content: 'Hello',
      timestamp: 123,
      parts: optimisticUserParts,
      contextAttachments: [{
        kind: 'selection',
        path: 'notes/example.md',
        label: 'example.md:1-3',
        mime: 'text/markdown',
        lineRange: {
          startLine: 1,
          endLine: 3,
        },
        textSnapshot: 'Selected text',
      }],
    });
  });

  it('builds a user message with images', () => {
    const images = [
      { data: 'iVBORw0KGgo=', mediaType: 'image/png' as const, filename: 'test.png' },
    ];

    const message = buildOptimisticUserMessage({
      content: 'Hello',
      contextItems: [],
      now: 123,
      images,
    });

    expect(message.images).toEqual(images);
  });
});
