import { MarkdownView, type App, type Editor } from 'obsidian';

import {
  createFocusContextPreview,
  type FocusContextPreview,
  resolveFocusContextPreview,
} from '../composerContext';
import {
  FocusContextMarkdownViewLocator,
  type FocusContextMarkdownViewLocatorHost,
} from './FocusContextMarkdownViewLocator';
import { RetainedSelectionHighlightService } from './RetainedSelectionHighlightService';

const RETAINED_SELECTION_POLL_INTERVAL_MS = 250;

export interface FocusContextRuntimeServiceHost extends FocusContextMarkdownViewLocatorHost {
  getFocusContextPreview(): FocusContextPreview | null;
  setFocusContextPreview(preview: FocusContextPreview | null): void;
  isComposerInteractionFocused(): boolean;
}

export class FocusContextRuntimeService {
  private focusContextRefreshTimeoutId: number | null = null;
  private retainedSelectionPollIntervalId: number | null = null;
  private readonly markdownViewLocator: FocusContextMarkdownViewLocator;
  private readonly retainedSelectionHighlightService: RetainedSelectionHighlightService;

  constructor(
    app: App,
    private readonly host: FocusContextRuntimeServiceHost,
  ) {
    this.markdownViewLocator = new FocusContextMarkdownViewLocator(app, host);
    this.retainedSelectionHighlightService = new RetainedSelectionHighlightService(host);
  }

  rememberMarkdownFilePath(path: string | null): void {
    this.markdownViewLocator.rememberMarkdownFilePath(path);
  }

  getActiveMarkdownView(): MarkdownView | null {
    return this.markdownViewLocator.getActiveMarkdownView();
  }

  refreshActiveFocusContextPreview(
    view?: MarkdownView | null,
    editor?: Editor | null,
  ): void {
    const actualPreview = this.computeFocusContextPreview(view, editor);
    const nextPreview = resolveFocusContextPreview(
      actualPreview,
      this.host.getFocusContextPreview(),
      {
        retainSelectionPreview: this.retainedSelectionHighlightService.shouldRetainPreviewDuringTransition(),
      },
    );
    this.host.setFocusContextPreview(nextPreview);
    this.retainedSelectionHighlightService.syncFromPreview(actualPreview, view, editor);
  }

  scheduleFocusContextPreviewRefresh(): void {
    this.clearScheduledFocusContextPreviewRefresh();
    this.focusContextRefreshTimeoutId = window.setTimeout(() => {
      this.focusContextRefreshTimeoutId = null;
      this.refreshActiveFocusContextPreview();
    }, 40);
  }

  startRetainedSelectionPolling(): void {
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
    this.refreshActiveFocusContextPreview();
    this.retainedSelectionHighlightService.refreshHighlight();
  }

  handleComposerFocusOut(): void {
    window.setTimeout(() => {
      this.refreshActiveFocusContextPreview();
      this.retainedSelectionHighlightService.refreshHighlight();
    }, 0);
  }

  dispose(): void {
    this.stopRetainedSelectionPolling();
    this.clearScheduledFocusContextPreviewRefresh();
    this.retainedSelectionHighlightService.dispose();
  }

  private computeFocusContextPreview(
    view?: MarkdownView | null,
    editor?: Editor | null,
  ): FocusContextPreview | null {
    const activeView = view?.file ? view : this.getActiveMarkdownView();
    const file = activeView?.file ?? null;
    if (!file) {
      return null;
    }

    const activeEditor = editor ?? activeView?.editor ?? null;
    const selectedText = activeEditor?.getSelection?.() ?? '';
    if (activeEditor && selectedText.trim()) {
      const from = activeEditor.getCursor('from');
      const to = activeEditor.getCursor('to');
      return createFocusContextPreview(file.path, {
        startLine: from.line + 1,
        endLine: to.line + 1,
      }, selectedText);
    }

    return createFocusContextPreview(file.path);
  }

  private clearScheduledFocusContextPreviewRefresh(): void {
    if (this.focusContextRefreshTimeoutId !== null) {
      window.clearTimeout(this.focusContextRefreshTimeoutId);
      this.focusContextRefreshTimeoutId = null;
    }
  }

  private stopRetainedSelectionPolling(): void {
    if (this.retainedSelectionPollIntervalId === null) {
      return;
    }

    window.clearInterval(this.retainedSelectionPollIntervalId);
    this.retainedSelectionPollIntervalId = null;
  }

  private pollRetainedSelectionState(): void {
    const view = this.getActiveMarkdownView();
    this.refreshActiveFocusContextPreview(view, view?.editor ?? null);
    this.retainedSelectionHighlightService.refreshHighlight();
  }

  private primeRetainedSelectionHighlightFromActiveEditor(): void {
    const view = this.getActiveMarkdownView();
    this.refreshActiveFocusContextPreview(view, view?.editor ?? null);
  }
}
