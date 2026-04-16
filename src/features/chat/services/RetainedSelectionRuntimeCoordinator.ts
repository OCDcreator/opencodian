import type { Editor, MarkdownView } from 'obsidian';

import type { FocusContextPreview } from '../composerContext';
import { RetainedSelectionHighlightService } from './RetainedSelectionHighlightService';

const RETAINED_SELECTION_POLL_INTERVAL_MS = 250;

export interface RetainedSelectionRuntimeCoordinatorHost {
  getFocusContextPreview(): FocusContextPreview | null;
  isComposerInteractionFocused(): boolean;
  getActiveMarkdownView(): MarkdownView | null;
  refreshActiveFocusContextPreview(
    view?: MarkdownView | null,
    editor?: Editor | null,
  ): void;
}

export class RetainedSelectionRuntimeCoordinator {
  private retainedSelectionPollIntervalId: number | null = null;
  private readonly retainedSelectionHighlightService: RetainedSelectionHighlightService;

  constructor(private readonly host: RetainedSelectionRuntimeCoordinatorHost) {
    this.retainedSelectionHighlightService = new RetainedSelectionHighlightService(host);
  }

  shouldRetainPreviewDuringTransition(): boolean {
    return this.retainedSelectionHighlightService.shouldRetainPreviewDuringTransition();
  }

  syncFromPreview(
    actualPreview: FocusContextPreview | null,
    view?: MarkdownView | null,
    editor?: Editor | null,
  ): void {
    this.retainedSelectionHighlightService.syncFromPreview(actualPreview, view, editor);
  }

  startPolling(): void {
    if (this.retainedSelectionPollIntervalId !== null) {
      return;
    }

    this.pollRetainedSelectionState();
    this.retainedSelectionPollIntervalId = window.setInterval(() => {
      this.pollRetainedSelectionState();
    }, RETAINED_SELECTION_POLL_INTERVAL_MS);
  }

  handleComposerPointerDown(): void {
    this.retainedSelectionHighlightService.markInputHandoff();
    this.primeRetainedSelectionHighlightFromActiveEditor();
  }

  handleComposerFocusIn(): void {
    this.retainedSelectionHighlightService.clearInputHandoff();
    this.host.refreshActiveFocusContextPreview();
    this.retainedSelectionHighlightService.refreshHighlight();
  }

  handleComposerFocusOut(): void {
    window.setTimeout(() => {
      this.host.refreshActiveFocusContextPreview();
      this.retainedSelectionHighlightService.refreshHighlight();
    }, 0);
  }

  dispose(): void {
    this.stopPolling();
    this.retainedSelectionHighlightService.dispose();
  }

  private stopPolling(): void {
    if (this.retainedSelectionPollIntervalId === null) {
      return;
    }

    window.clearInterval(this.retainedSelectionPollIntervalId);
    this.retainedSelectionPollIntervalId = null;
  }

  private pollRetainedSelectionState(): void {
    const view = this.host.getActiveMarkdownView();
    this.host.refreshActiveFocusContextPreview(view, view?.editor ?? null);
    this.retainedSelectionHighlightService.refreshHighlight();
  }

  private primeRetainedSelectionHighlightFromActiveEditor(): void {
    const view = this.host.getActiveMarkdownView();
    this.host.refreshActiveFocusContextPreview(view, view?.editor ?? null);
  }
}
