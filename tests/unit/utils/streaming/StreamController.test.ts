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

  it('renders during streaming and throttles rapid markdown updates', async () => {
    const containerEl = document.createElement('div');
    const contentEl = document.createElement('div');
    containerEl.appendChild(contentEl);

    jest.useFakeTimers();

    const markdownService = {
      render: jest.fn().mockImplementation(async (el: HTMLElement, content: string) => {
        el.textContent = content;
      }),
    };

    try {
      const controller = new StreamController({
        containerEl,
        markdownService: markdownService as never,
      });

      controller.startStream(contentEl);

      await controller.handleChunk({ type: 'text', content: 'Hello' });
      await jest.runOnlyPendingTimersAsync();

      expect(markdownService.render).toHaveBeenCalledTimes(1);
      expect(markdownService.render).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        'Hello',
      );

      await controller.handleChunk({ type: 'text', content: ' world' });
      await jest.advanceTimersByTimeAsync(80);

      expect(markdownService.render).toHaveBeenCalledTimes(1);

      await controller.handleChunk({ type: 'done' });

      expect(markdownService.render).toHaveBeenCalledTimes(2);
      expect(markdownService.render).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        'Hello world',
      );
      expect(controller.getContentBlocks()).toEqual([
        {
          type: 'text',
          content: 'Hello world',
        },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('persists tool calls that only emitted tool_use when the stream completes', async () => {
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
      type: 'tool_use',
      id: 'tool-1',
      name: 'read',
      input: {
        file_path: 'docs/spec.md',
      },
    });
    await controller.handleChunk({ type: 'done' });

    expect(controller.getContentBlocks()).toEqual([
      {
        type: 'tool_call',
        toolCall: {
          id: 'tool-1',
          name: 'read',
          input: {
            file_path: 'docs/spec.md',
          },
          status: 'completed',
          result: undefined,
        },
      },
    ]);
  });
});
