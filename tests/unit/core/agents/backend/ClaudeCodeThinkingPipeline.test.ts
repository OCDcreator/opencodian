import { ClaudeCodeStreamNormalizer } from '../../../../../src/core/agents/backend/ClaudeCodeStreamNormalizer';
import { mapStreamingContentBlocksToMessageContentBlocks } from '../../../../../src/features/chat/runtime/sendPipelineContent';
import { StreamController } from '../../../../../src/utils/streaming';

describe('Thinking end-to-end pipeline', () => {
  it('flows from SDK message through normalizer to streaming content blocks', () => {
    const normalizer = new ClaudeCodeStreamNormalizer();

    // Simulate SDK thinking_delta message
    const deltaChunks = normalizer.transformSDKMessage({
      type: 'content_block_delta',
      content_block_id: 'think-1',
      delta: { type: 'thinking_delta', thinking: 'Analyzing the problem' },
    });

    expect(deltaChunks).toEqual([
      { type: 'thinking', content: 'Analyzing the problem', partId: 'think-1' },
    ]);

    // Simulate SDK assistant message with thinking block
    const blockChunks = normalizer.transformSDKMessage({
      type: 'assistant',
      id: 'msg-1',
      content: [
        { id: 'block-1', type: 'thinking', thinking: 'Step 1: identify variables' },
        { id: 'block-2', type: 'text', text: 'The answer is 42.' },
      ],
    });

    expect(blockChunks).toEqual([
      { type: 'thinking', content: 'Step 1: identify variables', partId: 'block-1' },
      { type: 'text', content: 'The answer is 42.' },
    ]);
  });

  it('persists thinking blocks through content-block mapping', () => {
    const streamingBlocks = [
      { type: 'thinking' as const, content: 'Deep reasoning...', durationSeconds: 2.5, partId: 'think-1' },
      { type: 'text' as const, content: 'Final answer.' },
    ];

    const contentBlocks = mapStreamingContentBlocksToMessageContentBlocks(streamingBlocks);

    expect(contentBlocks).toEqual([
      { type: 'thinking', thinking: 'Deep reasoning...', durationSeconds: 2.5 },
      { type: 'text', text: 'Final answer.' },
    ]);
  });

  it('renders thinking blocks in streaming UI and finalizes with duration', async () => {
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

    // Simulate streaming thinking chunk
    await controller.handleChunk({
      type: 'thinking',
      partId: 'reasoning-1',
      content: 'Let me think about this...',
    });

    // Simulate text chunk
    await controller.handleChunk({ type: 'text', content: 'Done!' });

    // Simulate final thinking chunk with duration
    await controller.handleChunk({
      type: 'thinking',
      partId: 'reasoning-1',
      content: '',
      durationSeconds: 3.2,
    });

    // Verify content blocks include thinking with duration
    const blocks = controller.getContentBlocks();
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: 'thinking',
      content: 'Let me think about this...',
      partId: 'reasoning-1',
      durationSeconds: 3.2,
    });

    // Verify DOM has thinking block with label
    const thinkingLabel = contentEl.querySelector('.streaming-thinking-label');
    expect(thinkingLabel).not.toBeNull();
    expect(thinkingLabel?.textContent).toBe('Thought for 3.2s');

    // Verify thinking content is in DOM
    const thinkingContent = contentEl.querySelector('.streaming-thinking-content');
    expect(thinkingContent).not.toBeNull();
    expect(thinkingContent?.textContent).toBe('Let me think about this...');
  });

  it('handles redacted_thinking blocks from SDK', () => {
    const normalizer = new ClaudeCodeStreamNormalizer();

    const chunks = normalizer.transformSDKMessage({
      type: 'assistant',
      id: 'msg-redacted',
      content: [
        { id: 'block-r', type: 'redacted_thinking', thinking: '[Redacted thinking content]' },
      ],
    });

    expect(chunks).toEqual([
      { type: 'thinking', content: '[Redacted thinking content]', partId: 'block-r' },
    ]);
  });

  it('renders redacted thinking blocks in the streaming chat DOM', async () => {
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

    await controller.handleChunk({
      type: 'thinking',
      partId: 'redacted-1',
      content: '[Redacted thinking content]',
    });

    await controller.handleChunk({ type: 'text', content: 'Public response.' });

    // Flush buffered text block so both blocks are persisted for inspection.
    controller.cancelStream();

    const blocks = controller.getContentBlocks();
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'thinking',
      content: '[Redacted thinking content]',
      partId: 'redacted-1',
    });

    const thinkingContent = contentEl.querySelector('.streaming-thinking-content');
    expect(thinkingContent).not.toBeNull();
    expect(thinkingContent?.textContent).toBe('[Redacted thinking content]');

    const thinkingBlock = contentEl.querySelector('.streaming-thinking-block');
    expect(thinkingBlock).not.toBeNull();
  });

  it('deduplicates thinking blocks with suffix tracking within a single message', () => {
    const normalizer = new ClaudeCodeStreamNormalizer();

    // Message with two thinking blocks sharing same id (simulating partial update)
    const chunks = normalizer.transformSDKMessage({
      type: 'assistant',
      id: 'msg-1',
      content: [
        { id: 'block-1', type: 'thinking', thinking: 'Initial thought' },
        { id: 'block-1', type: 'thinking', thinking: 'Initial thought and more' },
      ],
    });

    // First block emits full content, second block emits only the suffix
    expect(chunks).toEqual([
      { type: 'thinking', content: 'Initial thought', partId: 'block-1' },
      { type: 'thinking', content: ' and more', partId: 'block-1' },
    ]);
  });
});
