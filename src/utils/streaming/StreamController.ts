import type { SdkErrorClass } from '../../core/opencode/sdkErrorClassification';
import { createLogger, getToolIdentity, isInternalStructuredOutputTool } from '../../shared';
import type { MarkdownRenderService } from '../markdown';
import { ThinkingBlockRenderer } from './ThinkingBlockRenderer';
import { ToolCallRenderer } from './ToolCallRenderer';
import type {
  ContentBlock,
  ErrorChunk,
  StreamChunk,
  StreamControllerOptions,
  StreamEventCallbacks,
  StreamState,
  ThinkingChunk,
  ThinkingContentBlock,
  ThinkingRendererOptions,
  ToolCallInfo,
  ToolRendererOptions,
} from './types';
import { createStreamState } from './types';

const logger = createLogger('StreamController');
const STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS = 96;

const ERROR_CLASS_ICONS: Record<SdkErrorClass, string> = {
  not_found: '🔍',
  forbidden: '🔒',
  bad_request: '⚠️',
  provider_auth: '🔑',
  rate_limit: '⏳',
  server_error: '💥',
  unknown: '❌',
};

export class StreamController {
  private containerEl: HTMLElement;
  private markdownService: MarkdownRenderService;
  private state: StreamState;
  private thinkingRenderer: ThinkingBlockRenderer;
  private toolRenderer: ToolCallRenderer;
  private callbacks: StreamEventCallbacks;
  private onStreamComplete?: (contentBlocks: ContentBlock[]) => void;
  private scrollToBottom?: () => void;
  private textRenderTimerId: number | null = null;
  private textRenderInFlight: Promise<void> | null = null;
  private textRenderRequested = false;
  private lastTextRenderAt = 0;
  private lastRenderedTextContent = '';

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
    const onCollapsibleToggle = options.onCollapsibleToggle ?? options.scrollToBottom;

    this.thinkingRenderer = new ThinkingBlockRenderer(
      this.markdownService,
      {
        ...thinkingRendererOptions,
        onCollapsibleToggle: thinkingRendererOptions?.onCollapsibleToggle ?? onCollapsibleToggle,
      }
    );
    this.toolRenderer = new ToolCallRenderer({
      ...toolRendererOptions,
      onCollapsibleToggle: toolRendererOptions?.onCollapsibleToggle ?? onCollapsibleToggle,
    });
  }

  setCallbacks(callbacks: StreamEventCallbacks): void {
    this.callbacks = callbacks;
  }

  private previewText(text: string, maxLength = 120): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
  }

  private stringifyDebugPayload(payload: unknown): string {
    try {
      return JSON.stringify(payload);
    } catch {
      return '[unserializable]';
    }
  }

  private logDebugStage(label: string, payload: unknown): void {
    logger.debug(`Stream controller [${label}]: ${this.stringifyDebugPayload(payload)}`);
  }

  startStream(contentEl: HTMLElement): void {

    this.clearPendingTextRender();
    this.state = createStreamState();
    this.state.isStreaming = true;
    this.state.currentContentEl = contentEl;
    this.state.contentBlocks = [];
    this.lastTextRenderAt = 0;
    this.lastRenderedTextContent = '';
    this.logDebugStage('start-stream', {
      hasContentElement: Boolean(contentEl),
    });
  }

  async handleChunk(chunk: StreamChunk): Promise<void> {

    
    if (!this.state.isStreaming || !this.state.currentContentEl) {

      return;
    }

    switch (chunk.type) {
      case 'thinking':
        await this.handleThinkingChunk(chunk);
        break;

      case 'text':
        this.handleTextChunk(chunk.content);
        break;

      case 'tool_use':
        await this.handleToolUseChunk(chunk);
        break;

      case 'tool_result':
        this.handleToolResultChunk(chunk);
        break;

      case 'error':
        await this.handleErrorChunk(chunk);
        break;

      case 'done':
        await this.handleDoneChunk();
        break;
    }

    if (chunk.type !== 'done' && chunk.type !== 'text') {
      this.scrollToBottom?.();
    }
  }

  private async handleThinkingChunk(chunk: ThinkingChunk): Promise<void> {
    await this.flushPendingTextRender();
    await this.finalizeCurrentTextRender();
    this.finalizeTextBlock();

    if (chunk.partId
      && this.state.currentThinkingState?.partId
      && this.state.currentThinkingState.partId !== chunk.partId) {
      this.finalizeThinkingBlock();
    }

    if (!this.state.currentThinkingState && chunk.partId && chunk.durationSeconds !== undefined) {
      if (this.updateStoredThinkingDuration(chunk.partId, chunk.durationSeconds)) {
        return;
      }
    }

    if (!this.state.currentThinkingState) {
      if (!chunk.content) {
        return;
      }

      this.state.currentThinkingState = this.thinkingRenderer.create(
        this.state.currentContentEl!
      );
      this.callbacks.onThinkingStart?.();
    }

    if (chunk.partId && !this.state.currentThinkingState.partId) {
      this.state.currentThinkingState.partId = chunk.partId;
    }

    if (chunk.durationSeconds !== undefined) {
      this.thinkingRenderer.updateDuration(this.state.currentThinkingState, chunk.durationSeconds);
    }

    if (!chunk.content) {
      return;
    }

    await this.thinkingRenderer.appendContent(this.state.currentThinkingState, chunk.content);
  }

  private handleTextChunk(content: string): void {
    this.finalizeThinkingBlock();
    this.callbacks.onTextAppend?.(content);

    if (!this.state.currentTextEl) {
      this.state.currentTextEl = this.state.currentContentEl!.createDiv({
        cls: 'streaming-text-block',
      });
      this.state.currentTextContent = '';
    }

    this.state.currentTextContent += content;
    this.logDebugStage('text-buffer-appended', {
      deltaLength: content.length,
      deltaPreview: this.previewText(content),
      bufferedTextLength: this.state.currentTextContent.length,
      persistedBlockCount: this.state.contentBlocks.length,
    });
    this.scheduleTextRender();
  }

  private upsertToolCallContentBlock(toolCall: ToolCallInfo): void {
    const persistedToolCall: ToolCallInfo = {
      id: toolCall.id,
      name: toolCall.name,
      kind: toolCall.kind,
      input: { ...toolCall.input },
      ...(toolCall.toolMetadata ? { toolMetadata: { ...toolCall.toolMetadata } } : {}),
      status: toolCall.status,
      result: toolCall.result,
      resultVisibility: toolCall.resultVisibility,
    };

    const existingBlock = this.state.contentBlocks.find((block) =>
      block.type === 'tool_call' && block.toolCall.id === toolCall.id,
    );

    if (existingBlock?.type === 'tool_call') {
      existingBlock.toolCall = persistedToolCall;
    } else {
      this.state.contentBlocks.push({
        type: 'tool_call',
        toolCall: persistedToolCall,
      });
    }

    this.state.persistedToolCallIds.add(toolCall.id);
    this.logDebugStage('tool-call-persisted', {
      toolId: toolCall.id,
      status: toolCall.status,
      hasResult: typeof toolCall.result === 'string',
      persistedBlockCount: this.state.contentBlocks.length,
    });
  }

  private async handleToolUseChunk(
    chunk: {
      id: string;
      name: string;
      kind?: ToolCallInfo['kind'];
      input: Record<string, unknown>;
      toolMetadata?: Record<string, unknown>;
      resultVisibility?: 'visible' | 'hidden';
    },
  ): Promise<void> {
    if (isInternalStructuredOutputTool(chunk.name)) {
      return;
    }

    await this.flushPendingTextRender();
    this.finalizeThinkingBlock();
    await this.finalizeCurrentTextRender();
    this.finalizeTextBlock();

    const existingToolCall = this.state.toolCalls.get(chunk.id);
    if (existingToolCall) {
      if (chunk.kind) {
        existingToolCall.kind = chunk.kind;
      }
      existingToolCall.resultVisibility = chunk.resultVisibility
        ?? this.resolveToolResultVisibility(chunk.name, chunk.kind)
        ?? existingToolCall.resultVisibility;
      const newInput = chunk.input || {};
      if (Object.keys(newInput).length > 0) {
        existingToolCall.input = { ...existingToolCall.input, ...newInput };
      }
      if (chunk.toolMetadata) {
        existingToolCall.toolMetadata = {
          ...(existingToolCall.toolMetadata ?? {}),
          ...chunk.toolMetadata,
        };
      }

      const toolEl = this.state.toolCallElements.get(chunk.id);
      if (toolEl) {
        this.toolRenderer.updateHeader(toolEl, existingToolCall);
      }
      return;
    }

    const toolCall: ToolCallInfo = {
      id: chunk.id,
      name: chunk.name,
      kind: chunk.kind,
      input: chunk.input || {},
      toolMetadata: chunk.toolMetadata,
      resultVisibility: chunk.resultVisibility
        ?? this.resolveToolResultVisibility(chunk.name, chunk.kind),
      status: 'running',
    };

    this.state.toolCalls.set(chunk.id, toolCall);
    this.callbacks.onToolCallStart?.(toolCall);

    if (!this.state.currentContentEl) {
      logger.error('currentContentEl is null, cannot render tool');
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

    this.upsertToolCallContentBlock(toolCall);
    this.logDebugStage('tool-result-finalized', {
      toolId: toolCall.id,
      status: toolCall.status,
      resultLength: chunk.content.length,
      persistedBlockCount: this.state.contentBlocks.length,
    });

    this.callbacks.onToolCallEnd?.(toolCall);
  }

  private resolveToolResultVisibility(
    toolName: string,
    toolKind?: ToolCallInfo['kind'],
  ): ToolCallInfo['resultVisibility'] {
    return toolKind === 'task' || getToolIdentity(toolName).kind === 'task'
      ? 'hidden'
      : undefined;
  }

  private async handleErrorChunk(chunk: ErrorChunk): Promise<void> {
    await this.flushPendingTextRender();
    this.finalizeThinkingBlock();
    await this.finalizeCurrentTextRender();
    this.finalizeTextBlock();
    this.callbacks.onError?.(chunk.content);

    const errorEl = this.state.currentContentEl!.createDiv({
      cls: 'streaming-error-block',
    });

    if (chunk.errorClass) {
      errorEl.dataset.errorClass = chunk.errorClass;
    }

    const icon = ERROR_CLASS_ICONS[chunk.errorClass ?? 'unknown'];

    errorEl.createSpan({ cls: 'streaming-error-icon', text: icon });
    errorEl.createSpan({
      cls: 'streaming-error-text',
      text: chunk.content.trim() || 'Unknown error',
    });
  }

  private async handleDoneChunk(): Promise<void> {
    this.logDebugStage('done-received', {
      bufferedTextLength: this.state.currentTextContent.length,
      persistedBlockCount: this.state.contentBlocks.length,
      openToolCallCount: this.state.toolCalls.size,
      openThinkingBlock: Boolean(this.state.currentThinkingState),
    });
    await this.flushPendingTextRender();
    await this.finalizeCurrentTextRender();
    this.flushOpenContentBlocks();
    this.finalizeToolCalls();
    this.state.isStreaming = false;
    this.callbacks.onDone?.();
    this.logDebugStage('done-flushed', {
      persistedBlockCount: this.state.contentBlocks.length,
      blockTypes: this.state.contentBlocks.map((block) => block.type),
    });

    if (this.onStreamComplete) {
      this.onStreamComplete(this.state.contentBlocks);
    }
  }

  private scheduleTextRender(): void {
    if (!this.state.currentTextEl) {
      return;
    }

    // Keep streaming markdown visible, but cap redraw frequency to reduce jitter.
    this.textRenderRequested = true;
    if (this.textRenderTimerId !== null || this.textRenderInFlight) {
      return;
    }

    const elapsedMs = this.lastTextRenderAt === 0 ? STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS : Date.now() - this.lastTextRenderAt;
    const delayMs = this.lastTextRenderAt === 0
      ? 0
      : Math.max(0, STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS - elapsedMs);

    this.textRenderTimerId = window.setTimeout(() => {
      this.textRenderTimerId = null;
      void this.renderPendingText();
    }, delayMs);
  }

  private async renderPendingText(): Promise<void> {
    if (!this.state.currentTextEl || !this.textRenderRequested) {
      return;
    }

    this.textRenderRequested = false;
    const targetEl = this.state.currentTextEl;
    const content = this.state.currentTextContent;
    this.textRenderInFlight = this.renderMarkdownText(targetEl, content)
      .finally(() => {
        this.textRenderInFlight = null;
      });

    await this.textRenderInFlight;

    if (this.textRenderRequested) {
      this.scheduleTextRender();
    }
  }

  private async flushPendingTextRender(): Promise<void> {
    if (this.textRenderTimerId !== null) {
      window.clearTimeout(this.textRenderTimerId);
      this.textRenderTimerId = null;
    }

    if (this.textRenderInFlight) {
      await this.textRenderInFlight;
    }

    if (this.textRenderRequested) {
      await this.renderPendingText();
      if (this.textRenderInFlight) {
        await this.textRenderInFlight;
      }
      if (this.textRenderRequested) {
        await this.flushPendingTextRender();
      }
    }
  }

  private clearPendingTextRender(): void {
    if (this.textRenderTimerId !== null) {
      window.clearTimeout(this.textRenderTimerId);
      this.textRenderTimerId = null;
    }

    this.textRenderRequested = false;
    this.textRenderInFlight = null;
  }

  private renderMarkdownText(targetEl: HTMLElement, content: string): Promise<void> {
    const previousHeight = targetEl.offsetHeight;
    if (previousHeight > 0) {
      targetEl.style.minHeight = `${previousHeight}px`;
    }

    return this.markdownService.render(targetEl, content)
      .then(() => {
        this.lastTextRenderAt = Date.now();
        this.lastRenderedTextContent = content;
        this.scrollToBottom?.();
      })
      .finally(() => {
        targetEl.style.removeProperty('min-height');
      })
      .then(() => undefined);
  }

  private finalizeCurrentTextRender(): Promise<void> {
    const targetEl = this.state.currentTextEl;
    const content = this.state.currentTextContent;
    if (!targetEl || !content) {
      return Promise.resolve();
    }

    if (this.lastRenderedTextContent === content) {
      return Promise.resolve();
    }

    return this.renderMarkdownText(targetEl, content);
  }

  private finalizeThinkingBlock(): void {
    if (!this.state.currentThinkingState) return;

    const durationSeconds = this.thinkingRenderer.finalize(this.state.currentThinkingState);

    const thinkingBlock: ThinkingContentBlock = {
      type: 'thinking',
      content: this.state.currentThinkingState.content,
      partId: this.state.currentThinkingState.partId ?? undefined,
      durationSeconds,
    };
    this.state.contentBlocks.push(thinkingBlock);

    if (this.state.currentThinkingState.partId) {
      this.state.thinkingBlocksByPartId.set(this.state.currentThinkingState.partId, thinkingBlock);
      this.state.thinkingBlockElements.set(
        this.state.currentThinkingState.partId,
        this.state.currentThinkingState.wrapperEl,
      );
    }

    this.callbacks.onThinkingEnd?.(durationSeconds);
    this.state.currentThinkingState = null;
  }

  private updateStoredThinkingDuration(partId: string, durationSeconds: number): boolean {
    const block = this.state.thinkingBlocksByPartId.get(partId);
    if (!block) {
      return false;
    }

    block.durationSeconds = durationSeconds;

    const wrapperEl = this.state.thinkingBlockElements.get(partId);
    if (wrapperEl) {
      this.thinkingRenderer.updateStoredDuration(wrapperEl, durationSeconds);
    }

    return true;
  }

  private finalizeTextBlock(): void {
    if (!this.state.currentTextContent) return;

    this.state.contentBlocks.push({
      type: 'text',
      content: this.state.currentTextContent,
    });
    this.logDebugStage('text-block-finalized', {
      textLength: this.state.currentTextContent.length,
      textPreview: this.previewText(this.state.currentTextContent),
      persistedBlockCount: this.state.contentBlocks.length,
    });

    this.state.currentTextEl = null;
    this.state.currentTextContent = '';
    this.lastTextRenderAt = 0;
    this.lastRenderedTextContent = '';
  }

  private finalizeToolCalls(): void {
    for (const toolCall of this.state.toolCalls.values()) {
      if (toolCall.status === 'running' || toolCall.status === 'pending') {
        toolCall.status = 'completed';
        this.callbacks.onToolCallEnd?.(toolCall);

        const toolEl = this.state.toolCallElements.get(toolCall.id);
        if (toolEl) {
          this.toolRenderer.updateResult(toolEl, toolCall);
        }
      }

      if (!this.state.persistedToolCallIds.has(toolCall.id)) {
        this.upsertToolCallContentBlock(toolCall);
      }
    }

    this.state.toolCalls.clear();
    this.state.toolCallElements.clear();
  }

  private flushOpenContentBlocks(): void {
    this.finalizeThinkingBlock();
    this.finalizeTextBlock();
  }

  cancelStream(): void {
    this.clearPendingTextRender();
    void this.finalizeCurrentTextRender();
    this.flushOpenContentBlocks();
    this.state.isStreaming = false;
    this.logDebugStage('cancel-stream', {
      persistedBlockCount: this.state.contentBlocks.length,
      bufferedTextLength: this.state.currentTextContent.length,
    });
  }

  /**
   * Handle stream timeout - mark all running tool calls as error
   */
  timeoutStream(): void {
    this.clearPendingTextRender();
    void this.finalizeCurrentTextRender();
    this.flushOpenContentBlocks();

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

        this.upsertToolCallContentBlock(toolCall);
      }
    }

    this.state.toolCalls.clear();
    this.state.toolCallElements.clear();
    this.state.isStreaming = false;
    this.logDebugStage('timeout-stream', {
      persistedBlockCount: this.state.contentBlocks.length,
      openToolCallCount: this.state.toolCalls.size,
    });
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
          if (isInternalStructuredOutputTool(block.toolCall.name)) {
            break;
          }

          this.toolRenderer.render(parentEl, block.toolCall);
          break;
      }
    }
  }
}
