import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';

describe('ToolCallRenderer image generation cards', () => {
  function renderImageCard(result: string | undefined, input: Record<string, unknown> = {}) {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();
    renderer.render(parentEl, {
      id: 'tool-img-1',
      name: 'image_generation',
      kind: 'image',
      input,
      status: result === undefined ? 'running' : 'completed',
      result,
    });
    return parentEl;
  }

  it('summarizes the revised prompt when present', () => {
    const parentEl = renderImageCard('data:image/png;base64,AAAA', { revisedPrompt: 'a lighthouse at dusk' });
    expect(parentEl.querySelector('.streaming-tool-summary')?.textContent).toBe('a lighthouse at dusk');
  });

  it('shows a generating status label while running without a revised prompt', () => {
    const parentEl = renderImageCard(undefined, { status: 'in_progress' });
    expect(parentEl.querySelector('.streaming-tool-summary')?.textContent).toBe('Generating image…');
  });

  it('renders a data-URL result as an image with the revised prompt below', () => {
    const parentEl = renderImageCard('data:image/png;base64,AAAA', { revisedPrompt: 'prompt v2' });
    const img = parentEl.querySelector<HTMLImageElement>('.streaming-tool-image');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    const promptEl = parentEl.querySelector('.streaming-tool-image-revised-prompt');
    expect(promptEl?.textContent).toContain('Revised prompt');
    expect(promptEl?.textContent).toContain('prompt v2');
  });

  it('renders a file-path result as text', () => {
    const parentEl = renderImageCard('/tmp/out/image.png');
    expect(parentEl.querySelector('.streaming-tool-image')).toBeNull();
    expect(parentEl.querySelector('.streaming-tool-image-path')?.textContent).toBe('/tmp/out/image.png');
  });

  it('renders an errored card through the default text path', () => {
    const parentEl = document.createElement('div');
    const renderer = new ToolCallRenderer();
    renderer.render(parentEl, {
      id: 'tool-img-2',
      name: 'image_generation',
      kind: 'image',
      input: {},
      status: 'error',
      result: 'Image generation failed: usage limit exceeded.',
    });
    expect(parentEl.querySelector('.streaming-tool-image')).toBeNull();
    expect(parentEl.querySelector('.streaming-tool-lines')?.textContent)
      .toContain('usage limit exceeded');
  });
});
