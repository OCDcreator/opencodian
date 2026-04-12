import {
  AssistantErrorRenderer,
  type AssistantErrorRendererHost,
} from '../../../../src/features/chat/runtime/AssistantErrorRenderer';

describe('AssistantErrorRenderer', () => {
  it('renders the local stream error block before delegating footer finalization', () => {
    const host: AssistantErrorRendererHost = {
      finalizeErrorFooter: jest.fn(),
    };
    const renderer = new AssistantErrorRenderer(host);
    const contentEl = document.createElement('div');
    const staleChild = document.createElement('span');
    staleChild.textContent = 'stale';
    contentEl.appendChild(staleChild);
    const messageEl = document.createElement('div');

    renderer.renderStreamError({
      messageEl,
      contentEl,
      content: 'Server unavailable',
      timestamp: 12345,
      modelId: 'openai/gpt-5.4',
    });

    expect(contentEl.children).toHaveLength(1);
    expect(contentEl.querySelector('.streaming-error-icon')?.textContent).toBe('❌');
    expect(contentEl.querySelector('.streaming-error-text')?.textContent).toBe('Server unavailable');
    expect(host.finalizeErrorFooter).toHaveBeenCalledWith({
      messageEl,
      content: 'Server unavailable',
      timestamp: 12345,
      modelId: 'openai/gpt-5.4',
    });
  });
});
