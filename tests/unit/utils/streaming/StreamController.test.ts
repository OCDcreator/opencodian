import { StreamController } from '../../../../src/utils/streaming';

describe('StreamController', () => {
  it('updates finalized thinking duration from SDK metadata', async () => {
    const containerEl = document.createElement('div');
    const contentEl = document.createElement('div');
    containerEl.appendChild(contentEl);
    document.body.appendChild(containerEl);

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
    document.body.appendChild(containerEl);

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
    document.body.appendChild(containerEl);

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
    document.body.appendChild(containerEl);

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

  it('calls the collapsible toggle callback for stored thinking blocks', async () => {
    const containerEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const onCollapsibleToggle = jest.fn();
    containerEl.appendChild(contentEl);
    document.body.appendChild(containerEl);

    const markdownService = {
      render: jest.fn().mockImplementation(async (el: HTMLElement, content: string) => {
        el.textContent = content;
      }),
    };

    const controller = new StreamController({
      containerEl,
      markdownService: markdownService as never,
      onCollapsibleToggle,
    });

    controller.renderStoredContentBlocks(contentEl, [
      {
        type: 'thinking',
        content: 'Need a moment',
        durationSeconds: 1.2,
      },
    ]);

    contentEl.querySelector<HTMLElement>('.streaming-thinking-header')?.click();

    expect(onCollapsibleToggle).toHaveBeenCalledTimes(1);
  });
});

describe('StreamController deferred text rendering', () => {
  it('does not finalize onto a detached target after cancellation', async () => {
    const containerEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const scrollToBottom = jest.fn();
    containerEl.appendChild(contentEl);
    document.body.appendChild(containerEl);

    let resolveRender!: () => void;
    const pendingRender = new Promise<void>((resolve) => {
      resolveRender = resolve;
    });
    const markdownService = {
      render: jest.fn((el: HTMLElement, content: string) => {
        pendingRender.then(() => {
          el.textContent = content;
        });
        return pendingRender;
      }),
    };
    const controller = new StreamController({
      containerEl,
      markdownService: markdownService as never,
      scrollToBottom,
    });

    controller.startStream(contentEl);
    await controller.handleChunk({ type: 'text', content: 'cancelled reply' });

    const textEl = contentEl.querySelector<HTMLElement>('.streaming-text-block');
    expect(textEl).not.toBeNull();
    expect(textEl?.isConnected).toBe(true);
    Object.defineProperty(textEl, 'offsetHeight', {
      configurable: true,
      value: 24,
    });

    controller.cancelStream();
    textEl?.remove();
    expect(textEl?.isConnected).toBe(false);
    resolveRender();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(textEl?.textContent).toBe('');
    expect(textEl?.style.minHeight).toBe('24px');
    expect(scrollToBottom).not.toHaveBeenCalled();
    expect((controller as unknown as { lastRenderedTextContent: string }).lastRenderedTextContent).toBe('');
    expect((controller as unknown as { lastTextRenderAt: number }).lastTextRenderAt).toBe(0);
  });

  it('drops deferred renders from a cancelled stream after restart', async () => {
    const containerEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const nextContentEl = document.createElement('div');
    const scrollToBottom = jest.fn();
    containerEl.append(contentEl, nextContentEl);
    document.body.appendChild(containerEl);

    jest.useFakeTimers();

    let resolveRender!: () => void;
    const pendingRender = new Promise<void>((resolve) => {
      resolveRender = resolve;
    });
    const markdownService = {
      render: jest.fn((el: HTMLElement, content: string) => {
        pendingRender.then(() => {
          el.textContent = content;
        });
        return pendingRender;
      }),
    };

    try {
      const controller = new StreamController({
        containerEl,
        markdownService: markdownService as never,
        scrollToBottom,
      });

      controller.startStream(contentEl);
      await controller.handleChunk({ type: 'text', content: 'old reply' });

      const oldTextEl = contentEl.querySelector<HTMLElement>('.streaming-text-block');
      expect(oldTextEl).not.toBeNull();
      Object.defineProperty(oldTextEl, 'offsetHeight', {
        configurable: true,
        value: 24,
      });

      jest.runOnlyPendingTimers();
      await Promise.resolve();
      expect(markdownService.render).toHaveBeenCalledTimes(1);
      expect(oldTextEl?.style.minHeight).toBe('24px');

      controller.cancelStream();
      controller.startStream(nextContentEl);

      resolveRender();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(oldTextEl?.textContent).toBe('');
      expect(oldTextEl?.style.minHeight).toBe('24px');
      expect(scrollToBottom).not.toHaveBeenCalled();
      expect((controller as unknown as { lastRenderedTextContent: string }).lastRenderedTextContent).toBe('');
      expect((controller as unknown as { lastTextRenderAt: number }).lastTextRenderAt).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
