import type { MarkdownRenderService } from '../markdown';
import type { ThinkingBlockState, ThinkingRendererOptions } from './types';

const DEFAULT_OPTIONS: ThinkingRendererOptions = {
  collapsedByDefault: true,
  showTimer: true,
  collapsedLabel: 'Thinking...',
  expandedLabel: 'Thought',
};

function normalizeDurationSeconds(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }

  if (durationSeconds < 10) {
    return Math.round(durationSeconds * 10) / 10;
  }

  return Math.round(durationSeconds);
}

function formatDurationSeconds(durationSeconds: number): string {
  const normalizedDuration = normalizeDurationSeconds(durationSeconds);
  if (normalizedDuration <= 0) {
    return 'Thought (<1s)';
  }

  const text = normalizedDuration % 1 === 0
    ? String(normalizedDuration)
    : normalizedDuration.toFixed(1);
  return `Thought for ${text}s`;
}

export class ThinkingBlockRenderer {
  private options: ThinkingRendererOptions;
  private markdownService: MarkdownRenderService;

  constructor(markdownService: MarkdownRenderService, options?: Partial<ThinkingRendererOptions>) {
    this.markdownService = markdownService;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  create(parentEl: HTMLElement): ThinkingBlockState {
    const wrapperEl = parentEl.createDiv({ cls: 'streaming-thinking-block' });

    const header = wrapperEl.createDiv({ cls: 'streaming-thinking-header' });
    header.setAttribute('tabindex', '0');
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-label', 'Extended thinking - click to expand');

    const labelEl = header.createSpan({ cls: 'streaming-thinking-label' });
    const startTime = Date.now();
    labelEl.setText(this.options.collapsedLabel || 'Thinking...');

    let timerInterval: ReturnType<typeof setInterval> | null = null;

    if (this.options.showTimer) {
      timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        labelEl.setText(`Thinking ${elapsed}s...`);
      }, 1000);
    }

    const contentEl = wrapperEl.createDiv({ cls: 'streaming-thinking-content' });

    if (this.options.collapsedByDefault) {
      contentEl.style.display = 'none';
    }

    const state: ThinkingBlockState = {
      wrapperEl,
      contentEl,
      labelEl,
      content: '',
      partId: null,
      resolvedDurationSeconds: null,
      startTime,
      timerInterval,
      isExpanded: !this.options.collapsedByDefault,
    };

    this.setupCollapsible(state, header, contentEl);

    return state;
  }

  private setupCollapsible(
    state: ThinkingBlockState,
    header: HTMLElement,
    contentEl: HTMLElement
  ): void {
    const toggle = () => {
      state.isExpanded = !state.isExpanded;
      contentEl.style.display = state.isExpanded ? 'block' : 'none';
      header.setAttribute('aria-expanded', String(state.isExpanded));
      state.wrapperEl.toggleClass('is-expanded', state.isExpanded);
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  async appendContent(state: ThinkingBlockState, content: string): Promise<void> {
    state.content += content;
    await this.markdownService.render(state.contentEl, state.content);
  }

  updateDuration(state: ThinkingBlockState, durationSeconds: number): void {
    state.resolvedDurationSeconds = normalizeDurationSeconds(durationSeconds);
    if (!state.timerInterval) {
      state.labelEl.setText(formatDurationSeconds(state.resolvedDurationSeconds));
    }
  }

  updateStoredDuration(wrapperEl: HTMLElement, durationSeconds: number): void {
    const labelEl = wrapperEl.querySelector('.streaming-thinking-label');
    if (!(labelEl instanceof HTMLElement)) {
      return;
    }

    labelEl.setText(formatDurationSeconds(durationSeconds));
  }

  finalize(state: ThinkingBlockState): number {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    const durationSeconds = state.resolvedDurationSeconds
      ?? normalizeDurationSeconds((Date.now() - state.startTime) / 1000);
    state.labelEl.setText(formatDurationSeconds(durationSeconds));

    if (this.options.collapsedByDefault && state.isExpanded) {
      const header = state.wrapperEl.querySelector('.streaming-thinking-header') as HTMLElement;
      const contentEl = state.wrapperEl.querySelector('.streaming-thinking-content') as HTMLElement;
      if (header && contentEl) {
        state.isExpanded = false;
        contentEl.style.display = 'none';
        header.setAttribute('aria-expanded', 'false');
        state.wrapperEl.removeClass('is-expanded');
      }
    }

    return durationSeconds;
  }

  cleanup(state: ThinkingBlockState | null): void {
    if (state?.timerInterval) {
      clearInterval(state.timerInterval);
    }
  }

  renderStored(
    parentEl: HTMLElement,
    content: string,
    durationSeconds?: number
  ): HTMLElement {
    const wrapperEl = parentEl.createDiv({ cls: 'streaming-thinking-block' });

    const header = wrapperEl.createDiv({ cls: 'streaming-thinking-header' });
    header.setAttribute('tabindex', '0');
    header.setAttribute('role', 'button');
    header.setAttribute('aria-label', 'Extended thinking - click to expand');

    const labelEl = header.createSpan({ cls: 'streaming-thinking-label' });
    labelEl.setText(
      durationSeconds !== undefined
        ? formatDurationSeconds(durationSeconds)
        : 'Thought (<1s)'
    );

    const contentEl = wrapperEl.createDiv({ cls: 'streaming-thinking-content' });
    this.markdownService.render(contentEl, content);

    if (this.options.collapsedByDefault) {
      contentEl.style.display = 'none';
    }

    // Create minimal state for collapsible functionality (only used for wrapperEl reference)
    const toggleState: Pick<ThinkingBlockState, 'isExpanded' | 'wrapperEl'> = {
      isExpanded: !this.options.collapsedByDefault,
      wrapperEl,
    };
    this.setupCollapsible(toggleState as ThinkingBlockState, header, contentEl);

    return wrapperEl;
  }
}
