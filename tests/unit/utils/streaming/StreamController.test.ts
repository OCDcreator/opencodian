import { StreamController } from '../../../../src/utils/streaming';

describe('StreamController', () => {
  it('updates finalized thinking duration from SDK metadata', async () => {
    const containerEl = document.createElement('div');
    const contentEl = document.createElement('div');
    containerEl.appendChild(contentEl);

    const markdownService = {
      render: jest.fn().mockResolvedValue(undefined),
    };

    const controller = new StreamController({
      containerEl,
      markdownService: markdownService as never,
    });

    controller.startStream(contentEl);

    await controller.handleChunk({
      type: 'thinking',
      partId: 'reasoning-1',
      content: 'Need a moment',
    });
    await controller.handleChunk({ type: 'text', content: 'Done' });
    await controller.handleChunk({
      type: 'thinking',
      partId: 'reasoning-1',
      content: '',
      durationSeconds: 1.6,
    });

    expect(controller.getContentBlocks()).toEqual([
      {
        type: 'thinking',
        content: 'Need a moment',
        partId: 'reasoning-1',
        durationSeconds: 1.6,
      },
      {
        type: 'text',
        content: 'Done',
      },
    ]);
    expect(contentEl.querySelector('.streaming-thinking-label')?.textContent).toBe('Thought for 1.6s');
  });

  it('preserves partial text content when streaming is cancelled', async () => {
    const containerEl = document.createElement('div');
    const contentEl = document.createElement('div');
    containerEl.appendChild(contentEl);

    const markdownService = {
      render: jest.fn().mockImplementation(async (el: HTMLElement, content: string) => {
        el.textContent = content;
      }),
    };

    const controller = new StreamController({
      containerEl,
      markdownService: markdownService as never,
    });

    controller.startStream(contentEl);

    await controller.handleChunk({ type: 'text', content: 'Interrupted ' });
    await controller.handleChunk({ type: 'text', content: 'reply' });

    controller.cancelStream();

    expect(controller.isStreaming()).toBe(false);
    expect(controller.getContentBlocks()).toEqual([
      {
        type: 'text',
        content: 'Interrupted reply',
      },
    ]);
  });
});
