import type { MarkdownRenderService } from '../markdown';
import { MarkdownRenderScheduler } from './MarkdownRenderScheduler';
import {
  disposeStreamingCollapsible,
  registerStreamingCollapsible,
} from './streamingCollapsible';
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
  private readonly renderSchedulers = new WeakMap<ThinkingBlockState, MarkdownRenderScheduler>();
  private readonly attachedRenderTargets = new WeakSet<ThinkingBlockState>();
  private readonly renderGenerations = new WeakMap<ThinkingBlockState, number>();
  private readonly disposedStates = new WeakSet<ThinkingBlockState>();

  constructor(markdownService: MarkdownRenderService, options?: Partial<ThinkingRendererOptions>) {
    this.markdownService = markdownService;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private getRenderScheduler(state: ThinkingBlockState): MarkdownRenderScheduler {
    let scheduler = this.renderSchedulers.get(state);
    if (!scheduler) {
      scheduler = new MarkdownRenderScheduler(async () => {
        const generation = this.renderGenerations.get(state) ?? 0;
        if (this.disposedStates.has(state)) {
          return;
        }

        // Once a streaming block has been attached and then replaced by a
        // hydration/rerender, do not write into its detached content node.
        if (state.contentEl.isConnected) {
          this.attachedRenderTargets.add(state);
        } else if (this.attachedRenderTargets.has(state)) {
          return;
        }

        // Render into a staging node. MarkdownRenderService may await Obsidian
        // before mutating its target; a teardown during that await must never
        // leave a stale completion writing into the old content node.
        const stagingEl = document.createElement('div');
        await this.markdownService.render(stagingEl, state.content);
        if (this.disposedStates.has(state)
          || (this.renderGenerations.get(state) ?? 0) !== generation) {
          return;
        }
        if (!state.contentEl.isConnected && this.attachedRenderTargets.has(state)) {
          return;
        }
        state.contentEl.replaceChildren(...Array.from(stagingEl.childNodes));
      });
      this.renderSchedulers.set(state, scheduler);
    }
    return scheduler;
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

    this.renderGenerations.set(state, 0);

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
      this.options.onCollapsibleToggle?.();
    };

    header.addEventListener('click', toggle);
    const onKeydown = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };
    header.addEventListener('keydown', onKeydown);
    registerStreamingCollapsible(state.wrapperEl, () => {
      header.removeEventListener('click', toggle);
      header.removeEventListener('keydown', onKeydown);
    });
  }

  async appendContent(state: ThinkingBlockState, content: string): Promise<void> {
    state.content += content;
    // Coalesced into the shared streaming markdown frame budget: per-chunk
    // full-markdown re-renders are what made long thinking streams expensive.
    this.getRenderScheduler(state).schedule();
  }

  /** Render the latest thinking content now, draining any coalesced schedule. */
  async flushContent(state: ThinkingBlockState): Promise<void> {
    await this.getRenderScheduler(state).flush();
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

    // Best-effort final paint: stream end can land between budget intervals,
    // and finalize stays synchronous for its callers.
    void this.getRenderScheduler(state).flush().catch(() => undefined);

    return durationSeconds;
  }

  cleanup(state: ThinkingBlockState | null): void {
    if (!state) {
      return;
    }
    this.disposedStates.add(state);
    this.renderGenerations.set(state, (this.renderGenerations.get(state) ?? 0) + 1);
    this.renderSchedulers.get(state)?.cancel();
    disposeStreamingCollapsible(state.wrapperEl);
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
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
