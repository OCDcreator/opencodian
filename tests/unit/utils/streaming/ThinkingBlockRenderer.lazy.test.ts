import type { MarkdownRenderService } from '../../../../src/utils/markdown';
import { ThinkingBlockRenderer } from '../../../../src/utils/streaming/ThinkingBlockRenderer';

function createMarkdownService() {
  return {
    render: jest.fn().mockImplementation(async (el: HTMLElement, markdown: string) => {
      el.textContent = markdown;
      return { success: true };
    }),
  } as unknown as MarkdownRenderService;
}

describe('ThinkingBlockRenderer lazy renderStored', () => {
  it('does not render markdown when lazy + collapsed (default)', () => {
    const markdownService = createMarkdownService();
    const renderer = new ThinkingBlockRenderer(markdownService, {
      collapsedByDefault: true,
      lazy: true,
    });
    const parent = document.createElement('div');

    renderer.renderStored(parent, 'long thinking content', 5, 'thinking-0');

    // Lazy + collapsed: markdown render is deferred until first expansion.
    expect(markdownService.render).not.toHaveBeenCalled();
    const content = parent.querySelector('.streaming-thinking-content') as HTMLElement;
    expect(content.style.display).toBe('none');
    expect(content.textContent).toBe('');
  });

  it('renders markdown eagerly when not lazy', () => {
    const markdownService = createMarkdownService();
    const renderer = new ThinkingBlockRenderer(markdownService, {
      collapsedByDefault: true,
    });
    const parent = document.createElement('div');

    renderer.renderStored(parent, 'long thinking content', 5);

    expect(markdownService.render).toHaveBeenCalledTimes(1);
  });

  it('renders on first expand, then reuses on collapse/expand', async () => {
    const markdownService = createMarkdownService();
    const renderer = new ThinkingBlockRenderer(markdownService, {
      collapsedByDefault: true,
      lazy: true,
    });
    const parent = document.createElement('div');

    renderer.renderStored(parent, 'long thinking content', 5, 'thinking-0');
    expect(markdownService.render).not.toHaveBeenCalled();

    const header = parent.querySelector('.streaming-thinking-header') as HTMLElement;
    const content = parent.querySelector('.streaming-thinking-content') as HTMLElement;

    // First expand triggers render.
    header.click();
    expect(markdownService.render).toHaveBeenCalledTimes(1);
    expect(content.style.display).toBe('block');
    expect(content.textContent).toBe('long thinking content');

    // Collapse does not re-render.
    header.click();
    expect(markdownService.render).toHaveBeenCalledTimes(1);
    expect(content.style.display).toBe('none');

    // Second expand reuses the already-rendered content (no new render).
    header.click();
    expect(markdownService.render).toHaveBeenCalledTimes(1);
    expect(content.style.display).toBe('block');
  });

  it('restores expanded state and renders eagerly when previously expanded', () => {
    const markdownService = createMarkdownService();
    const getInitialExpanded = jest.fn().mockReturnValue(true);
    const renderer = new ThinkingBlockRenderer(markdownService, {
      collapsedByDefault: true,
      lazy: true,
      getInitialExpanded,
    });
    const parent = document.createElement('div');

    renderer.renderStored(parent, 'thinking', 3, 'thinking-0');

    // Previously expanded → content rendered eagerly + visible.
    expect(getInitialExpanded).toHaveBeenCalledWith('thinking-0');
    expect(markdownService.render).toHaveBeenCalledTimes(1);
    const content = parent.querySelector('.streaming-thinking-content') as HTMLElement;
    expect(content.style.display).toBe('block');
  });

  it('persists expansion changes via onExpandedChange', () => {
    const markdownService = createMarkdownService();
    const onExpandedChange = jest.fn();
    const renderer = new ThinkingBlockRenderer(markdownService, {
      collapsedByDefault: true,
      lazy: true,
      onExpandedChange,
    });
    const parent = document.createElement('div');

    renderer.renderStored(parent, 'thinking', 3, 'thinking-0');
    const header = parent.querySelector('.streaming-thinking-header') as HTMLElement;

    header.click();
    expect(onExpandedChange).toHaveBeenCalledWith('thinking-0', true);

    header.click();
    expect(onExpandedChange).toHaveBeenCalledWith('thinking-0', false);
  });
});
