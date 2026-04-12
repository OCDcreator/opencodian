import type { ChatMessage } from '../../../../src/core/types';
import {
  AssistantFooterRenderer,
  type AssistantFooterRendererHost,
} from '../../../../src/features/chat/runtime/AssistantFooterRenderer';

describe('AssistantFooterRenderer', () => {
  function createRenderer() {
    const host: AssistantFooterRendererHost = {
      addTimestampWithCopyButton: jest.fn(),
    };

    return {
      host,
      renderer: new AssistantFooterRenderer(host),
    };
  }

  it('routes notice footers through the shared timestamp renderer without copy content', () => {
    const { host, renderer } = createRenderer();
    const messageEl = document.createElement('div');

    renderer.finalizeNoticeFooter(messageEl, {
      timestamp: 12345,
      modelId: 'openai/gpt-5.4',
    });

    expect(host.addTimestampWithCopyButton).toHaveBeenCalledWith({
      messageEl,
      timestamp: 12345,
      modelId: 'openai/gpt-5.4',
    });
  });

  it('routes pseudo-stream and error footers with copyable content', () => {
    const { host, renderer } = createRenderer();
    const pseudoStreamMessageEl = document.createElement('div');
    const errorMessageEl = document.createElement('div');

    renderer.finalizePseudoStreamFooter(pseudoStreamMessageEl, {
      content: 'Reveal me',
      timestamp: 23456,
      modelId: 'anthropic/claude-sonnet-4',
    });
    renderer.finalizeErrorFooter({
      messageEl: errorMessageEl,
      timestamp: 34567,
      content: 'Server unavailable',
      modelId: 'anthropic/claude-sonnet-4',
    });

    expect(host.addTimestampWithCopyButton).toHaveBeenNthCalledWith(1, {
      messageEl: pseudoStreamMessageEl,
      timestamp: 23456,
      content: 'Reveal me',
      modelId: 'anthropic/claude-sonnet-4',
    });
    expect(host.addTimestampWithCopyButton).toHaveBeenNthCalledWith(2, {
      messageEl: errorMessageEl,
      timestamp: 34567,
      content: 'Server unavailable',
      modelId: 'anthropic/claude-sonnet-4',
    });
  });

  it('reuses persisted footer finalization for stored assistant messages', () => {
    const { host, renderer } = createRenderer();
    const messageEl = document.createElement('div');
    const message: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Fallback content',
      timestamp: 45678,
      modelId: 'anthropic/claude-sonnet-4',
      streamState: 'interrupted',
      contentBlocks: [
        { type: 'thinking', thinking: 'Hidden reasoning' },
        { type: 'text', text: ' Visible answer ' },
      ],
    };

    renderer.finalizePersistedFooter(messageEl, message);

    expect(host.addTimestampWithCopyButton).toHaveBeenCalledWith({
      messageEl,
      timestamp: 45678,
      content: 'Visible answer',
      modelId: 'anthropic/claude-sonnet-4',
      statusLabel: 'Interrupted',
    });
  });
});
