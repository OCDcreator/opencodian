import type { SdkErrorClass } from '../../core/opencode/sdkErrorClassification';
import { createLogger, getToolIdentity, isInternalStructuredOutputTool } from '../../shared';
import type { MarkdownRenderService } from '../markdown';
import { STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS } from './MarkdownRenderScheduler';
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
  private textRenderGeneration = 0;
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

  private ownsStreamState(state: StreamState): boolean {
    return this.state === state && state.isStreaming;
  }

  async handleChunk(chunk: StreamChunk): Promise<void> {

    
    if (!this.state.isStreaming || !this.state.currentContentEl) {

      return;
    }

    const streamState = this.state;
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

    if (!this.ownsStreamState(streamState)) return;
    if (chunk.type !== 'done' && chunk.type !== 'text') {
      this.scrollToBottom?.();
    }
  }

  private async handleThinkingChunk(chunk: ThinkingChunk): Promise<void> {
    const state = this.state;
    await this.flushPendingTextRender();
    if (!this.ownsStreamState(state)) return;
    await this.finalizeCurrentTextRender();
    if (!this.ownsStreamState(state)) return;
    this.finalizeTextBlock(state);

    if (chunk.partId
      && state.currentThinkingState?.partId
      && state.currentThinkingState.partId !== chunk.partId) {
      this.finalizeThinkingBlock(state);
      if (!this.ownsStreamState(state)) return;
    }

    if (!state.currentThinkingState && chunk.partId && chunk.durationSeconds !== undefined) {
      if (this.updateStoredThinkingDuration(chunk.partId, chunk.durationSeconds)) {
        return;
      }
    }

    if (!state.currentThinkingState) {
      if (!chunk.content) {
        return;
      }

      state.currentThinkingState = this.thinkingRenderer.create(
        state.currentContentEl!
      );
      this.callbacks.onThinkingStart?.();
      if (!this.ownsStreamState(state)) return;
    }

    if (chunk.partId && !state.currentThinkingState.partId) {
      state.currentThinkingState.partId = chunk.partId;
    }

    if (chunk.durationSeconds !== undefined) {
      this.thinkingRenderer.updateDuration(state.currentThinkingState, chunk.durationSeconds);
    }

    if (!chunk.content) {
      return;
    }

    await this.thinkingRenderer.appendContent(state.currentThinkingState, chunk.content);
  }

  private handleTextChunk(content: string): void {
    const state = this.state;
    this.finalizeThinkingBlock(state);
    if (!this.ownsStreamState(state)) return;
    if (!state.currentTextEl) {
      state.currentTextEl = state.currentContentEl!.createDiv({ cls: 'streaming-text-block' });
      state.currentTextContent = '';
    }
    state.currentTextContent += content;
    this.callbacks.onTextAppend?.(content);
    if (!this.ownsStreamState(state)) return;
    this.logDebugStage('text-buffer-appended', {
      deltaLength: content.length, deltaPreview: this.previewText(content),
      bufferedTextLength: state.currentTextContent.length,
      persistedBlockCount: state.contentBlocks.length,
    });
    this.scheduleTextRender();
  }

  private upsertToolCallContentBlock(toolCall: ToolCallInfo, state = this.state): void {
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

    const existingBlock = state.contentBlocks.find((block) =>
      block.type === 'tool_call' && block.toolCall.id === toolCall.id,
    );

    if (existingBlock?.type === 'tool_call') {
      existingBlock.toolCall = persistedToolCall;
    } else {
      state.contentBlocks.push({
        type: 'tool_call',
        toolCall: persistedToolCall,
      });
    }

    state.persistedToolCallIds.add(toolCall.id);
    this.logDebugStage('tool-call-persisted', {
      toolId: toolCall.id,
      status: toolCall.status,
      hasResult: typeof toolCall.result === 'string',
      persistedBlockCount: state.contentBlocks.length,
    });
  }

  private mergeToolCallChunk(
    toolCall: ToolCallInfo,
    chunk: {
      kind?: ToolCallInfo['kind'];
      input: Record<string, unknown>;
      name: string;
      toolMetadata?: Record<string, unknown>;
      resultVisibility?: 'visible' | 'hidden';
    },
  ): void {
    if (chunk.kind) {
      toolCall.kind = chunk.kind;
    }
    toolCall.resultVisibility = chunk.resultVisibility
      ?? this.resolveToolResultVisibility(chunk.name, chunk.kind)
      ?? toolCall.resultVisibility;
    const newInput = chunk.input || {};
    if (Object.keys(newInput).length > 0) {
      toolCall.input = { ...toolCall.input, ...newInput };
    }
    if (chunk.toolMetadata) {
      toolCall.toolMetadata = {
        ...(toolCall.toolMetadata ?? {}),
        ...chunk.toolMetadata,
      };
    }
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

    const streamState = this.state;
    const existingToolCall = streamState.toolCalls.get(chunk.id);
    const toolCall: ToolCallInfo = existingToolCall ?? {
      id: chunk.id,
      name: chunk.name,
      kind: chunk.kind,
      input: chunk.input || {},
      toolMetadata: chunk.toolMetadata,
      resultVisibility: chunk.resultVisibility
        ?? this.resolveToolResultVisibility(chunk.name, chunk.kind),
      status: 'running',
    };

    // Capture received identity/input before markdown can yield to cancellation
    // or to a tool_result. Rendering still waits for the preceding text boundary.
    if (existingToolCall) {
      this.mergeToolCallChunk(existingToolCall, chunk);
    } else {
      streamState.toolCalls.set(chunk.id, toolCall);
      this.callbacks.onToolCallStart?.(toolCall);
    }

    if (!this.ownsStreamState(streamState)) return;
    await this.flushPendingTextRender();
    if (!this.ownsStreamState(streamState)) return;
    this.finalizeThinkingBlock(streamState);
    if (!this.ownsStreamState(streamState)) return;
    await this.finalizeCurrentTextRender();
    if (!this.ownsStreamState(streamState)) return;
    this.finalizeTextBlock(streamState);
    if (toolCall.result !== undefined) {
      this.upsertToolCallContentBlock(toolCall, streamState);
    }

    if (existingToolCall) {
      const toolEl = streamState.toolCallElements.get(chunk.id);
      if (toolEl) {
        this.toolRenderer.updateHeader(toolEl, toolCall);
      }
      return;
    }

    if (!streamState.currentContentEl) {
      logger.error('currentContentEl is null, cannot render tool');
      return;
    }

    this.renderToolCall(streamState, toolCall);
  }

  private handleToolResultChunk(chunk: { id: string; content: string; isError?: boolean }): void {
    const state = this.state;
    const toolCall = state.toolCalls.get(chunk.id);
    if (!toolCall) return;
    toolCall.result = chunk.content;
    toolCall.status = chunk.isError ? 'error' : 'completed';
    const toolEl = state.toolCallElements.get(chunk.id);
    // If text is still flushing, tool_use/cancellation owns the ordered upsert.
    if (toolEl) this.upsertToolCallContentBlock(toolCall, state);
    this.callbacks.onToolCallEnd?.(toolCall);
    if (!this.ownsStreamState(state)) return;
    if (toolEl) this.toolRenderer.updateResult(toolEl, toolCall);
    this.logDebugStage('tool-result-finalized', {
      toolId: toolCall.id, status: toolCall.status,
      resultLength: chunk.content.length, persistedBlockCount: state.contentBlocks.length,
    });
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
    const state = this.state;
    await this.flushPendingTextRender();
    if (!this.ownsStreamState(state)) return;
    this.finalizeThinkingBlock(state);
    if (!this.ownsStreamState(state)) return;
    await this.finalizeCurrentTextRender();
    if (!this.ownsStreamState(state)) return;
    this.finalizeTextBlock(state);
    this.callbacks.onError?.(chunk.content);
    if (!this.ownsStreamState(state)) return;

    const errorEl = state.currentContentEl!.createDiv({
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
    const state = this.state;
    this.logDebugStage('done-received', {
      bufferedTextLength: state.currentTextContent.length,
      persistedBlockCount: state.contentBlocks.length,
      openToolCallCount: state.toolCalls.size,
      openThinkingBlock: Boolean(state.currentThinkingState),
    });
    await this.flushPendingTextRender();
    if (!this.ownsStreamState(state)) return;
    await this.finalizeCurrentTextRender();
    if (!this.ownsStreamState(state)) return;
    this.flushOpenContentBlocks(state);
    if (!this.ownsStreamState(state)) return;
    this.finalizeToolCalls(state);
    if (!this.ownsStreamState(state)) return;
    state.isStreaming = false;
    this.callbacks.onDone?.();
    if (this.state !== state) return;
    this.logDebugStage('done-flushed', {
      persistedBlockCount: state.contentBlocks.length,
      blockTypes: state.contentBlocks.map((block) => block.type),
    });

    if (this.onStreamComplete) {
      this.onStreamComplete(state.contentBlocks);
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
    const state = this.state;
    const targetEl = state.currentTextEl;
    if (!targetEl) return;
    const content = this.state.currentTextContent;
    const generation = this.textRenderGeneration;
    const renderPromise = this.renderMarkdownText(
      targetEl,
      content,
      generation,
      () => this.ownsTextRenderTarget(targetEl, generation),
    );
    if (generation !== this.textRenderGeneration || this.state !== state) {
      await renderPromise;
      return;
    }
    const trackedPromise = renderPromise
      .finally(() => {
        if (this.textRenderInFlight === trackedPromise) {
          this.textRenderInFlight = null;
        }
      });
    this.textRenderInFlight = trackedPromise;

    await trackedPromise;

    if (generation === this.textRenderGeneration && this.textRenderRequested) {
      this.scheduleTextRender();
    }
  }

  private async flushPendingTextRender(): Promise<void> {
    const generation = this.textRenderGeneration;
    if (this.textRenderTimerId !== null) {
      window.clearTimeout(this.textRenderTimerId);
      this.textRenderTimerId = null;
    }

    if (this.textRenderInFlight) {
      await this.textRenderInFlight;
    }
    if (generation !== this.textRenderGeneration) return;

    if (this.textRenderRequested) {
      await this.renderPendingText();
      if (generation !== this.textRenderGeneration) return;
      if (this.textRenderInFlight) {
        await this.textRenderInFlight;
      }
      if (generation !== this.textRenderGeneration) return;
      if (this.textRenderRequested) {
        await this.flushPendingTextRender();
      }
    }
  }

  private clearPendingTextRender(): void {
    this.textRenderGeneration += 1;

    if (this.textRenderTimerId !== null) {
      window.clearTimeout(this.textRenderTimerId);
      this.textRenderTimerId = null;
    }

    this.textRenderRequested = false;
    this.textRenderInFlight = null;
  }

  private renderMarkdownText(
    targetEl: HTMLElement,
    content: string,
    generation = this.textRenderGeneration,
    isOwned: () => boolean = () => this.ownsTextRenderTarget(targetEl, generation),
  ): Promise<void> {
    const state = this.state;
    const previousHeight = targetEl.offsetHeight;
    if (previousHeight > 0) {
      targetEl.style.minHeight = `${previousHeight}px`;
    }

    // Render into a detached staging element. If the stream is cancelled or
    // restarted while MarkdownRenderService is still awaiting Obsidian, a
    // stale completion can only mutate this detached tree, never the old DOM.
    const stagingEl = document.createElement('div');

    return this.markdownService.render(stagingEl, content)
      .then(() => {
        if (!isOwned()) {
          return;
        }

        targetEl.replaceChildren(...Array.from(stagingEl.childNodes));
        if (!this.ownsStreamState(state)) return;
        this.lastTextRenderAt = Date.now();
        this.lastRenderedTextContent = content;
        this.scrollToBottom?.();
      })
      .finally(() => {
        if (isOwned()) {
          targetEl.style.removeProperty('min-height');
        }
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

    const generation = this.textRenderGeneration;
    if (!this.ownsTextRenderTarget(targetEl, generation)) {
      return Promise.resolve();
    }

    return this.renderMarkdownText(
      targetEl,
      content,
      generation,
      () => this.ownsTextRenderTarget(targetEl, generation),
    );
  }

  private ownsTextRenderTarget(targetEl: HTMLElement, generation: number): boolean {
    return generation === this.textRenderGeneration
      && this.state.isStreaming
      && this.state.currentTextEl === targetEl
      && targetEl.isConnected;
  }

  private finalizeThinkingBlock(state = this.state, notify = true): void {
    const thinking = state.currentThinkingState;
    if (!thinking) return;
    state.currentThinkingState = null;
    const elapsed = Math.max(0, (Date.now() - thinking.startTime) / 1000);
    const durationSeconds = thinking.resolvedDurationSeconds
      ?? (elapsed < 10 ? Math.round(elapsed * 10) / 10 : Math.round(elapsed));
    thinking.resolvedDurationSeconds = durationSeconds;
    const thinkingBlock: ThinkingContentBlock = {
      type: 'thinking', content: thinking.content,
      partId: thinking.partId ?? undefined, durationSeconds,
    };
    state.contentBlocks.push(thinkingBlock);
    if (thinking.partId) {
      state.thinkingBlocksByPartId.set(thinking.partId, thinkingBlock);
      state.thinkingBlockElements.set(thinking.partId, thinking.wrapperEl);
    }
    // Detach and persist before finalize can call Markdown I/O and reenter.
    this.thinkingRenderer.finalize(thinking);
    if (notify && this.ownsStreamState(state)) this.callbacks.onThinkingEnd?.(durationSeconds);
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

  private finalizeTextBlock(state = this.state): void {
    if (!state.currentTextContent) return;

    state.contentBlocks.push({
      type: 'text',
      content: state.currentTextContent,
    });
    const finalizedContent = state.currentTextContent;
    state.currentTextEl = null;
    state.currentTextContent = '';
    if (this.state === state) {
      this.lastTextRenderAt = 0;
      this.lastRenderedTextContent = '';
    }
    this.logDebugStage('text-block-finalized', {
      textLength: finalizedContent.length,
      textPreview: this.previewText(finalizedContent),
      persistedBlockCount: state.contentBlocks.length,
    });

  }

  private finalizeToolCalls(state = this.state): void {
    for (const toolCall of [...state.toolCalls.values()]) {
      if (!this.ownsStreamState(state)) return;
      const needsEnd = toolCall.status === 'running' || toolCall.status === 'pending';
      if (needsEnd) toolCall.status = 'completed';
      this.upsertToolCallContentBlock(toolCall, state);
      if (needsEnd) this.callbacks.onToolCallEnd?.(toolCall);
      if (!this.ownsStreamState(state)) return;
      const toolEl = state.toolCallElements.get(toolCall.id);
      if (toolEl) this.toolRenderer.updateResult(toolEl, toolCall);
    }
    state.toolCalls.clear();
    state.toolCallElements.clear();
  }

  private flushOpenContentBlocks(state = this.state, notify = true): void {
    this.finalizeThinkingBlock(state, notify);
    this.finalizeTextBlock(state);
  }

  private renderToolCall(state: StreamState, toolCall: ToolCallInfo, stopped = false): void {
    const stagingEl = document.createElement('div');
    const toolEl = this.toolRenderer.render(stagingEl, toolCall);
    if (this.state !== state || state.isStreaming === stopped || !state.currentContentEl) {
      this.toolRenderer.cleanup(toolEl);
      return;
    }
    if (!stopped) state.toolCallElements.set(toolCall.id, toolEl);
    state.currentContentEl.appendChild(toolEl);
  }

  cancelStream(): void {
    this.stopStream('cancel');
  }

  /** Local timeout preserves confirmed outcomes and closes the same ownership boundary. */
  timeoutStream(): void {
    this.stopStream('timeout');
  }

  private stopStream(ending: 'cancel' | 'timeout'): void {
    const state = this.state;
    if (!state.isStreaming) return;
    // Close and detach registries before any renderer/callback can reenter.
    state.isStreaming = false;
    const tools = [...state.toolCalls.values()];
    const elements = new Map(state.toolCallElements);
    state.toolCalls.clear();
    state.toolCallElements.clear();
    this.clearPendingTextRender();
    const textEl = state.currentTextEl;
    const text = state.currentTextContent;
    const generation = this.textRenderGeneration;
    this.flushOpenContentBlocks(state, false);
    for (const tool of tools) {
      if (tool.status === 'pending' || tool.status === 'running') {
        tool.status = ending === 'cancel' ? 'interrupted' : 'error';
        if (ending === 'timeout') tool.result = 'Request timeout';
      }
      this.upsertToolCallContentBlock(tool, state);
    }
    if (this.state !== state) return;
    if (textEl && text) {
      // Final paint uses captured bytes only; it emits no scroll/stream callback.
      void this.renderMarkdownText(textEl, text, generation, () =>
        this.state === state && generation === this.textRenderGeneration && textEl.isConnected,
      ).catch(() => undefined);
    }
    for (const tool of tools) {
      if (this.state !== state) return;
      const toolEl = elements.get(tool.id);
      if (toolEl) this.toolRenderer.updateResult(toolEl, tool);
      else this.renderToolCall(state, tool, true);
    }
    this.logDebugStage(ending === 'cancel' ? 'cancel-stream' : 'timeout-stream', {
      persistedBlockCount: state.contentBlocks.length, openToolCallCount: state.toolCalls.size,
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
