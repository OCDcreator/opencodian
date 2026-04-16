import type { ChatMessage } from '../../../../src/core/types';
import {
  PersistedAssistantFooterFinalizer,
  type PersistedAssistantFooterFinalizerHost,
} from '../../../../src/features/chat/runtime/PersistedAssistantFooterFinalizer';

describe('PersistedAssistantFooterFinalizer', () => {
  it('finalizes persisted assistant footers with the assembled payload', () => {
    const host: PersistedAssistantFooterFinalizerHost = {
      addTimestampWithCopyButton: jest.fn(),
    };
    const finalizer = new PersistedAssistantFooterFinalizer(host);
    const messageEl = document.createElement('div');
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

    finalizer.finalizeFooter(messageEl, message);

    expect(host.addTimestampWithCopyButton).toHaveBeenCalledWith({
      messageEl,
      timestamp: 12345,
      content: 'Visible answer',
      modelId: 'anthropic/claude-sonnet-4',
      statusLabel: 'Interrupted',
    });
  });
});
