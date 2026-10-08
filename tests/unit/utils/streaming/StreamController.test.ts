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

describe('StreamController interrupted tool history', () => {
  it('persists unfinished calls without claiming native success and preserves received results', async () => {
    const containerEl = document.body.createDiv();
    const contentEl = containerEl.createDiv();
    const onToolCallEnd = jest.fn();
    const onStreamComplete = jest.fn();
    const controller = new StreamController({
      containerEl, markdownService: { render: jest.fn().mockResolvedValue(undefined) } as never,
      onStreamComplete,
    });
    controller.setCallbacks({ onToolCallEnd });
    controller.startStream(contentEl);
    await controller.handleChunk({ type: 'tool_use', id: 'done-read', name: 'read', input: { filePath: 'owned.md' } });
    await controller.handleChunk({ type: 'tool_result', id: 'done-read', content: 'confirmed bytes' });
    await controller.handleChunk({ type: 'tool_use', id: 'active-bash', name: 'Bash', input: { command: 'sleep 90' } });

    controller.cancelStream();
    controller.cancelStream();

    expect(controller.getContentBlocks()).toEqual([
      expect.objectContaining({ toolCall: expect.objectContaining({ id: 'done-read', status: 'completed', result: 'confirmed bytes' }) }),
      expect.objectContaining({ toolCall: expect.objectContaining({ id: 'active-bash', status: 'interrupted', input: { command: 'sleep 90' } }) }),
    ]);
    expect(controller.isStreaming()).toBe(false);
    expect(onToolCallEnd).toHaveBeenCalledTimes(1);
    expect(onStreamComplete).not.toHaveBeenCalled();
  });
});

describe('StreamController tool chunks across cancellation boundaries', () => {
  function createHeldToolStream() {
    const containerEl = document.body.createDiv();
    const contentEl = containerEl.createDiv();
    let releaseRender!: () => void;
    let markRenderStarted!: () => void;
    const pendingRender = new Promise<void>((resolve) => { releaseRender = resolve; });
    const renderStarted = new Promise<void>((resolve) => { markRenderStarted = resolve; });
    const markdownService = {
      render: jest.fn((el: HTMLElement, content: string) => {
        markRenderStarted();
        return pendingRender.then(() => { el.textContent = content; });
      }),
    };
    const callbacks = { onToolCallStart: jest.fn(), onToolCallEnd: jest.fn(), onDone: jest.fn() };
    const onStreamComplete = jest.fn();
    const scrollToBottom = jest.fn();
    const controller = new StreamController({
      containerEl, markdownService: markdownService as never, onStreamComplete, scrollToBottom,
    });
    const toolUse = {
      type: 'tool_use' as const, id: 'held-tool', name: 'Bash', kind: 'builtin' as const,
      input: { command: 'sleep 90', timeout: 120000, description: 'Owned cancellation control' },
      toolMetadata: { assistantMessageId: 'native-held', dependencies: ['previous-tool'] },
      resultVisibility: 'visible' as const,
    };
    controller.setCallbacks(callbacks);
    controller.startStream(contentEl);
    const beginTool = async () => {
      await controller.handleChunk({ type: 'text', content: 'Before held tool' });
      const pendingTool = controller.handleChunk(toolUse);
      await renderStarted;
      expect(markdownService.render).toHaveBeenCalledTimes(1);
      return { pendingTool };
    };
    return {
      containerEl, contentEl, controller, toolUse, callbacks, onStreamComplete,
      scrollToBottom, markdownService, releaseRender, beginTool,
    };
  }

  it('saves a tool received during markdown flush before cancel returns and never revives it', async () => {
    const fixture = createHeldToolStream();
    const { controller, toolUse, contentEl, callbacks, onStreamComplete } = fixture;
    const { pendingTool } = await fixture.beginTool();
    const startCountAtCancel = fixture.callbacks.onToolCallStart.mock.calls.length;
    controller.cancelStream();
    const atCancel = JSON.parse(JSON.stringify(controller.getContentBlocks()));
    fixture.releaseRender();
    await pendingTool;
    await controller.handleChunk({ type: 'tool_result', id: toolUse.id, content: 'late unowned result' });
    await controller.handleChunk({ type: 'done' });

    expect(atCancel).toEqual([
      { type: 'text', content: 'Before held tool' },
      { type: 'tool_call', toolCall: {
        id: toolUse.id, name: toolUse.name, kind: toolUse.kind, input: toolUse.input,
        toolMetadata: toolUse.toolMetadata, resultVisibility: toolUse.resultVisibility, status: 'interrupted',
      } },
    ]);
    expect(controller.getContentBlocks()).toEqual(atCancel);
    expect(contentEl.querySelector('.status-interrupted')).not.toBeNull();
    expect(contentEl.querySelector('.status-running')).toBeNull();
    expect(contentEl.textContent).toContain('Native tool outcome is unknown');
    expect(controller.isStreaming()).toBe(false);
    expect(callbacks.onToolCallStart).toHaveBeenCalledTimes(startCountAtCancel);
    expect(callbacks.onToolCallEnd).not.toHaveBeenCalled();
    expect(callbacks.onDone).not.toHaveBeenCalled();
    expect(onStreamComplete).not.toHaveBeenCalled();
  });

  it.each([false, true])('preserves an actual tool_result received during markdown wait (isError=%s)', async (isError) => {
    const fixture = createHeldToolStream();
    const { controller, toolUse, callbacks, contentEl } = fixture;
    const { pendingTool } = await fixture.beginTool();
    const result = isError ? 'native cancelled' : 'confirmed native result';
    await controller.handleChunk({ type: 'tool_result', id: toolUse.id, content: result, isError });
    controller.cancelStream();
    fixture.releaseRender();
    await pendingTool;

    const status = isError ? 'error' : 'completed';
    expect(controller.getContentBlocks()).toEqual([
      expect.objectContaining({ type: 'text', content: 'Before held tool' }),
      { type: 'tool_call', toolCall: expect.objectContaining({
        id: toolUse.id, input: toolUse.input, toolMetadata: toolUse.toolMetadata, status, result,
      }) },
    ]);
    expect(contentEl.querySelector(`.status-${status}`)).not.toBeNull();
    expect(contentEl.querySelector('.status-running')).toBeNull();
    expect(callbacks.onToolCallStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onToolCallEnd).toHaveBeenCalledTimes(1);
    expect(callbacks.onToolCallStart.mock.invocationCallOrder[0]).toBeLessThan(callbacks.onToolCallEnd.mock.invocationCallOrder[0]);
    expect(callbacks.onToolCallEnd).toHaveBeenCalledWith(expect.objectContaining({ status, result }));
    expect(fixture.onStreamComplete).not.toHaveBeenCalled();
  });


  it.each([false, true])('keeps text before an early tool_result when streaming continues (isError=%s)', async (isError) => {
    const fixture = createHeldToolStream();
    const { controller, toolUse, callbacks, contentEl } = fixture;
    const { pendingTool } = await fixture.beginTool();
    const result = isError ? 'confirmed error' : 'confirmed output';
    await controller.handleChunk({ type: 'tool_result', id: toolUse.id, content: result, isError });
    fixture.releaseRender();
    await pendingTool;

    const status = isError ? 'error' : 'completed';
    expect(controller.isStreaming()).toBe(true);
    expect(controller.getContentBlocks()).toEqual([
      { type: 'text', content: 'Before held tool' },
      { type: 'tool_call', toolCall: expect.objectContaining({ id: toolUse.id, status, result }) },
    ]);
    expect(contentEl.querySelectorAll('.streaming-tool-call')).toHaveLength(1);
    expect(contentEl.querySelector(`.status-${status}`)).not.toBeNull();
    expect(callbacks.onToolCallStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onToolCallEnd).toHaveBeenCalledTimes(1);
    await controller.handleChunk({ type: 'done' });
    expect(controller.getContentBlocks()).toHaveLength(2);
    expect(callbacks.onToolCallEnd).toHaveBeenCalledTimes(1);
  });

  it('checks cancellation again after the second, already-resolved text boundary', async () => {
    const fixture = createHeldToolStream();
    const { controller, toolUse, contentEl } = fixture;
    const pendingTool = controller.handleChunk(toolUse);
    // flushPendingTextRender resolves first; the handler now awaits finalization.
    await Promise.resolve();
    const startCountAtCancel = fixture.callbacks.onToolCallStart.mock.calls.length;
    controller.cancelStream();
    fixture.releaseRender();
    await pendingTool;

    expect(controller.getContentBlocks()).toEqual([
      { type: 'tool_call', toolCall: expect.objectContaining({
        id: toolUse.id, input: toolUse.input, status: 'interrupted',
      }) },
    ]);
    expect(contentEl.querySelector('.status-running')).toBeNull();
    expect(fixture.callbacks.onToolCallStart).toHaveBeenCalledTimes(startCountAtCancel);
  });

  it('does not flush or register an old tool into a restarted controller stream', async () => {
    const fixture = createHeldToolStream();
    const { controller, callbacks, markdownService } = fixture;
    const { pendingTool } = await fixture.beginTool();
    const startCountAtCancel = fixture.callbacks.onToolCallStart.mock.calls.length;
    controller.cancelStream();
    const nextContentEl = fixture.containerEl.createDiv();
    controller.startStream(nextContentEl);
    await controller.handleChunk({ type: 'text', content: 'replacement reply' });
    markdownService.render.mockClear();
    fixture.releaseRender();
    await pendingTool;

    expect(markdownService.render).not.toHaveBeenCalled();
    expect(controller.isStreaming()).toBe(true);
    expect(nextContentEl.querySelector('.streaming-tool-call')).toBeNull();
    expect(callbacks.onToolCallStart).toHaveBeenCalledTimes(startCountAtCancel);
    await controller.handleChunk({ type: 'done' });
    expect(controller.getContentBlocks()).toEqual([{ type: 'text', content: 'replacement reply' }]);
    expect(fixture.onStreamComplete).toHaveBeenCalledTimes(1);
  });

  it('does not deliver stale tool or scroll callbacks while a replacement controller runs', async () => {
    const fixture = createHeldToolStream();
    const { pendingTool } = await fixture.beginTool();
    const startCountAtCancel = fixture.callbacks.onToolCallStart.mock.calls.length;
    fixture.controller.cancelStream();
    fixture.scrollToBottom.mockClear();
    const nextContentEl = fixture.containerEl.createDiv();
    const nextController = new StreamController({
      containerEl: fixture.containerEl,
      markdownService: { render: jest.fn().mockResolvedValue(undefined) } as never,
    });
    nextController.startStream(nextContentEl);
    await nextController.handleChunk({ type: 'tool_use', id: 'replacement', name: 'read', input: { path: 'owned.md' } });
    fixture.releaseRender();
    await pendingTool;

    expect(fixture.scrollToBottom).not.toHaveBeenCalled();
    expect(fixture.callbacks.onToolCallStart).toHaveBeenCalledTimes(startCountAtCancel);
    expect(fixture.callbacks.onToolCallEnd).not.toHaveBeenCalled();
    expect(nextController.isStreaming()).toBe(true);
    expect(nextContentEl.querySelectorAll('.streaming-tool-call')).toHaveLength(1);
    expect(nextContentEl.querySelector('.streaming-tool-call')?.getAttribute('data-tool-id')).toBe('replacement');
    await nextController.handleChunk({ type: 'done' });
  });

  it('saves merged input and metadata from repeated tool events received before cancellation', async () => {
    const fixture = createHeldToolStream();
    const { controller, toolUse } = fixture;
    const { pendingTool } = await fixture.beginTool();
    const pendingUpdate = controller.handleChunk({
      ...toolUse, input: { extra: 'latest input' },
      toolMetadata: { sessionId: 'child-owned' },
    });
    controller.cancelStream();
    fixture.releaseRender();
    await Promise.all([pendingTool, pendingUpdate]);

    expect(controller.getContentBlocks()).toEqual([
      { type: 'text', content: 'Before held tool' },
      { type: 'tool_call', toolCall: expect.objectContaining({
        id: toolUse.id, status: 'interrupted',
        input: { ...toolUse.input, extra: 'latest input' },
        toolMetadata: { ...toolUse.toolMetadata, sessionId: 'child-owned' },
      }) },
    ]);
    expect(fixture.contentEl.querySelectorAll('.streaming-tool-call')).toHaveLength(1);
    expect(fixture.contentEl.querySelector('.status-running')).toBeNull();
    expect(fixture.callbacks.onToolCallEnd).not.toHaveBeenCalled();
  });
});
