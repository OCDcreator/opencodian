import type { MarkdownRenderService } from '../markdown';
import { ThinkingBlockRenderer } from './ThinkingBlockRenderer';
import { ToolCallRenderer } from './ToolCallRenderer';
import type {
  ContentBlock,
  StreamChunk,
  StreamControllerOptions,
  StreamEventCallbacks,
  StreamState,
  ThinkingRendererOptions,
  ToolCallInfo,
  ToolRendererOptions,
} from './types';
import { createStreamState } from './types';

export class StreamController {
  private containerEl: HTMLElement;
  private markdownService: MarkdownRenderService;
  private state: StreamState;
  private thinkingRenderer: ThinkingBlockRenderer;
  private toolRenderer: ToolCallRenderer;
  private callbacks: StreamEventCallbacks;
  private onStreamComplete?: (contentBlocks: ContentBlock[]) => void;
  private scrollToBottom?: () => void;

  constructor(
    options: StreamControllerOptions,
    toolRendererOptions?: Partial<ToolRendererOptions>,
    thinkingRendererOptions?: Partial<ThinkingRendererOptions>
  ) {
    this.containerEl = options.containerEl;
    this.markdownService = options.markdownService;
    this.onStreamComplete = options.onStreamComplete;
    this.scrollToBottom = options.scrollToBottom;
    this.state = createStreamState();
    this.callbacks = {};

    this.thinkingRenderer = new ThinkingBlockRenderer(
      this.markdownService,
      thinkingRendererOptions
    );
    this.toolRenderer = new ToolCallRenderer(toolRendererOptions);
  }

  setCallbacks(callbacks: StreamEventCallbacks): void {
    this.callbacks = callbacks;
  }

  startStream(contentEl: HTMLElement): void {

    this.state = createStreamState();
    this.state.isStreaming = true;
    this.state.currentContentEl = contentEl;
    this.state.contentBlocks = [];
  }

  async handleChunk(chunk: StreamChunk): Promise<void> {

    
    if (!this.state.isStreaming || !this.state.currentContentEl) {

      return;
    }

    switch (chunk.type) {
      case 'thinking':
        await this.handleThinkingChunk(chunk.content);
        break;

      case 'text':
        await this.handleTextChunk(chunk.content);
        break;

      case 'tool_use':
        this.handleToolUseChunk(chunk);
        break;

      case 'tool_result':
        this.handleToolResultChunk(chunk);
        break;

      case 'error':
        await this.handleErrorChunk(chunk.content);
        break;

      case 'done':
        this.handleDoneChunk();
        break;
    }

    this.scrollToBottom?.();
  }

  private async handleThinkingChunk(content: string): Promise<void> {
    this.finalizeTextBlock();
    this.callbacks.onThinkingStart?.();

    if (!this.state.currentThinkingState) {
      this.state.currentThinkingState = this.thinkingRenderer.create(
        this.state.currentContentEl!
      );
    }

    await this.thinkingRenderer.appendContent(this.state.currentThinkingState, content);
  }

  private async handleTextChunk(content: string): Promise<void> {
    this.finalizeThinkingBlock();
    this.callbacks.onTextAppend?.(content);

    if (!this.state.currentTextEl) {
      this.state.currentTextEl = this.state.currentContentEl!.createDiv({
        cls: 'streaming-text-block',
      });
      this.state.currentTextContent = '';
    }

    this.state.currentTextContent += content;
    await this.markdownService.render(this.state.currentTextEl, this.state.currentTextContent);
  }

  private handleToolUseChunk(chunk: { id: string; name: string; input: Record<string, unknown> }): void {
    this.finalizeThinkingBlock();
    this.finalizeTextBlock();

    const existingToolCall = this.state.toolCalls.get(chunk.id);
    if (existingToolCall) {
      const newInput = chunk.input || {};
      if (Object.keys(newInput).length > 0) {
        existingToolCall.input = { ...existingToolCall.input, ...newInput };

        const toolEl = this.state.toolCallElements.get(chunk.id);
        if (toolEl) {
          this.toolRenderer.updateHeader(toolEl, existingToolCall);
        }
      }
      return;
    }

    const toolCall: ToolCallInfo = {
      id: chunk.id,
      name: chunk.name,
      input: chunk.input || {},
      status: 'running',
    };

    this.state.toolCalls.set(chunk.id, toolCall);
    this.callbacks.onToolCallStart?.(toolCall);

    if (!this.state.currentContentEl) {
      console.error('[StreamController] currentContentEl is null, cannot render tool');
      return;
    }

    const toolEl = this.toolRenderer.render(this.state.currentContentEl, toolCall);
    this.state.toolCallElements.set(chunk.id, toolEl);
  }

  private handleToolResultChunk(chunk: { id: string; content: string; isError?: boolean }): void {

    const toolCall = this.state.toolCalls.get(chunk.id);
    if (!toolCall) {

      return;
    }

    toolCall.result = chunk.content;
    toolCall.status = chunk.isError ? 'error' : 'completed';

    const toolEl = this.state.toolCallElements.get(chunk.id);
    if (toolEl) {
      this.toolRenderer.updateResult(toolEl, toolCall);
    }

    // Add tool call to content blocks immediately to preserve order
    this.state.contentBlocks.push({
      type: 'tool_call',
      toolCall: {
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
        status: toolCall.status,
        result: toolCall.result,
      },
    });

    this.callbacks.onToolCallEnd?.(toolCall);
  }

  private async handleErrorChunk(content: string): Promise<void> {
    this.finalizeThinkingBlock();
    this.finalizeTextBlock();
    this.callbacks.onError?.(content);

    const errorEl = this.state.currentContentEl!.createDiv({
      cls: 'streaming-error-block',
    });
    errorEl.createSpan({ cls: 'streaming-error-icon', text: '❌' });
    errorEl.createSpan({ cls: 'streaming-error-text', text: `Error: ${content}` });
  }

  private handleDoneChunk(): void {
    this.finalizeThinkingBlock();
    this.finalizeTextBlock();
    this.finalizeToolCalls();
    this.state.isStreaming = false;
    this.callbacks.onDone?.();

    if (this.onStreamComplete) {
      this.onStreamComplete(this.state.contentBlocks);
    }
  }

  private finalizeThinkingBlock(): void {
    if (!this.state.currentThinkingState) return;

    const durationSeconds = this.thinkingRenderer.finalize(this.state.currentThinkingState);

    this.state.contentBlocks.push({
      type: 'thinking',
      content: this.state.currentThinkingState.content,
      durationSeconds,
    });

    this.callbacks.onThinkingEnd?.(durationSeconds);
    this.state.currentThinkingState = null;
  }

  private finalizeTextBlock(): void {
    if (!this.state.currentTextContent) return;

    this.state.contentBlocks.push({
      type: 'text',
      content: this.state.currentTextContent,
    });

    this.state.currentTextEl = null;
    this.state.currentTextContent = '';
  }

  private finalizeToolCalls(): void {
    // Clear tool calls after finalizing (they've already been added to contentBlocks)
    this.state.toolCalls.clear();
    this.state.toolCallElements.clear();
  }

  cancelStream(): void {
    if (this.state.currentThinkingState) {
      this.thinkingRenderer.cleanup(this.state.currentThinkingState);
    }
    this.state.isStreaming = false;
  }

  /**
   * Handle stream timeout - mark all running tool calls as error
   */
  timeoutStream(): void {
    // Mark all running/pending tool calls as error
    for (const [toolId, toolCall] of this.state.toolCalls) {
      if (toolCall.status === 'running' || toolCall.status === 'pending') {
        toolCall.status = 'error';
        toolCall.result = 'Request timeout';
        
        // Update UI
        const toolEl = this.state.toolCallElements.get(toolId);
        if (toolEl) {
          this.toolRenderer.updateResult(toolEl, toolCall);
        }
        
        // Add to content blocks
        this.state.contentBlocks.push({
          type: 'tool_call',
          toolCall: {
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
            status: 'error',
            result: 'Request timeout',
          },
        });
      }
    }
    
    this.state.isStreaming = false;
  }

  getContentBlocks(): ContentBlock[] {
    return [...this.state.contentBlocks];
  }

  isStreaming(): boolean {
    return this.state.isStreaming;
  }

  renderStoredContentBlocks(
    parentEl: HTMLElement,
    contentBlocks: ContentBlock[]
  ): void {
    for (const block of contentBlocks) {
      switch (block.type) {
        case 'text': {
          const textEl = parentEl.createDiv({ cls: 'streaming-text-block' });
          this.markdownService.render(textEl, block.content);
          break;
        }

        case 'thinking':
          this.thinkingRenderer.renderStored(
            parentEl,
            block.content,
            block.durationSeconds
          );
          break;

        case 'tool_call':
          this.toolRenderer.render(parentEl, block.toolCall);
          break;
      }
    }
  }
}
