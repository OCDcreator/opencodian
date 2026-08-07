import { disposeCollapsiblesWithin } from '../../../../src/features/chat/rendering/collapsible';
import type { MarkdownRenderService } from '../../../../src/utils/markdown';
import { STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS } from '../../../../src/utils/streaming/MarkdownRenderScheduler';
import { ThinkingBlockRenderer } from '../../../../src/utils/streaming/ThinkingBlockRenderer';

function createMarkdownService() {
  return {
    render: jest.fn().mockImplementation(async (el: HTMLElement, markdown: string) => {
      el.textContent = markdown;
      return { success: true };
    }),
  } as unknown as MarkdownRenderService;
}

describe('ThinkingBlockRenderer streaming render budget', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('coalesces per-chunk thinking markdown renders into a frame budget', async () => {
    const markdownService = createMarkdownService();
    const renderer = new ThinkingBlockRenderer(markdownService);
    const parentEl = document.createElement('div');
    const state = renderer.create(parentEl);

    for (let index = 0; index < 10; index += 1) {
      await renderer.appendContent(state, `chunk-${index} `);
    }

    // Leading-edge render only; the whole burst is coalesced into it.
    await jest.advanceTimersByTimeAsync(0);
    expect(markdownService.render).toHaveBeenCalledTimes(1);
    expect(state.contentEl.textContent).toBe(
      'chunk-0 chunk-1 chunk-2 chunk-3 chunk-4 chunk-5 chunk-6 chunk-7 chunk-8 chunk-9 ',
    );

    // No new content arrived: no redundant trailing render.
    await jest.advanceTimersByTimeAsync(200);
    expect(markdownService.render).toHaveBeenCalledTimes(1);

    // A chunk arriving after the burst triggers the next budgeted render.
    await renderer.appendContent(state, 'chunk-10 ');
    await jest.advanceTimersByTimeAsync(STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS);
    expect(markdownService.render).toHaveBeenCalledTimes(2);
    expect(state.contentEl.textContent).toBe(
      'chunk-0 chunk-1 chunk-2 chunk-3 chunk-4 chunk-5 chunk-6 chunk-7 chunk-8 chunk-9 chunk-10 ',
    );
  });

  it('spaces renders during a long thinking stream instead of rendering every chunk', async () => {
    const markdownService = createMarkdownService();
    const renderer = new ThinkingBlockRenderer(markdownService);
    const parentEl = document.createElement('div');
    const state = renderer.create(parentEl);

    // Simulate a 30-chunk thinking stream arriving every 20ms.
    for (let index = 0; index < 30; index += 1) {
      await renderer.appendContent(state, `part-${index} `);
      await jest.advanceTimersByTimeAsync(20);
    }

    const calls = (markdownService.render as jest.Mock).mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(calls).toBeLessThanOrEqual(8);

    // The final chunk can land between intervals; the stream-end flush
    // (mirroring finalize in production) guarantees it reaches the DOM.
    await renderer.flushContent(state);
    expect(state.contentEl.textContent).toContain('part-29');
  });

  it('renders the final content when the stream ends between intervals', async () => {
    const markdownService = createMarkdownService();
    const renderer = new ThinkingBlockRenderer(markdownService);
    const parentEl = document.createElement('div');
    const state = renderer.create(parentEl);

    await renderer.appendContent(state, 'partial ');
    await jest.advanceTimersByTimeAsync(0);
    await renderer.appendContent(state, 'complete');

    await renderer.flushContent(state);
    expect(state.contentEl.textContent).toBe('partial complete');

    renderer.finalize(state);
    await jest.advanceTimersByTimeAsync(500);
    expect(state.contentEl.textContent).toBe('partial complete');
  });

  it('cleanup cancels a pending scheduled render', async () => {
    const markdownService = createMarkdownService();
    const renderer = new ThinkingBlockRenderer(markdownService);
    const parentEl = document.createElement('div');
    const state = renderer.create(parentEl);

    await renderer.appendContent(state, 'lost content');
    renderer.cleanup(state);
    await jest.advanceTimersByTimeAsync(500);

    expect(markdownService.render).not.toHaveBeenCalled();
  });

  it('does not let a deferred finalize flush write into a block cleared during rendering', async () => {
    let resolveRender: (() => void) | undefined;
    const markdownService = {
      render: jest.fn().mockImplementation((el: HTMLElement, markdown: string) => new Promise((resolve) => {
        resolveRender = () => {
          el.textContent = markdown;
          resolve({ success: true });
        };
      })),
    } as unknown as MarkdownRenderService;
    const renderer = new ThinkingBlockRenderer(markdownService);
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    const state = renderer.create(parentEl);

    await renderer.appendContent(state, 'final thought');
    renderer.finalize(state);
    await Promise.resolve();
    expect(markdownService.render).toHaveBeenCalledTimes(1);

    parentEl.remove();
    renderer.cleanup(state);
    resolveRender?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(state.contentEl.textContent).toBe('');
    expect((markdownService.render as jest.Mock).mock.calls[0][0]).not.toBe(state.contentEl);
  });

  it('releases thinking header listeners before a cleared block is rebuilt', () => {
    const markdownService = createMarkdownService();
    const onCollapsibleToggle = jest.fn();
    const renderer = new ThinkingBlockRenderer(markdownService, { onCollapsibleToggle });
    const parentEl = document.createElement('div');
    const firstState = renderer.create(parentEl);
    const firstHeader = firstState.wrapperEl.querySelector<HTMLElement>('.streaming-thinking-header');

    disposeCollapsiblesWithin(parentEl);
    firstHeader?.click();
    expect(onCollapsibleToggle).not.toHaveBeenCalled();

    parentEl.replaceChildren();
    const secondState = renderer.create(parentEl);
    secondState.wrapperEl.querySelector<HTMLElement>('.streaming-thinking-header')?.click();
    expect(onCollapsibleToggle).toHaveBeenCalledTimes(1);

    disposeCollapsiblesWithin(parentEl);
    secondState.wrapperEl.querySelector<HTMLElement>('.streaming-thinking-header')?.click();
    expect(onCollapsibleToggle).toHaveBeenCalledTimes(1);
  });
});
