import { MarkdownView, type App, type Editor } from 'obsidian';

import {
  createFocusContextPreview,
  type FocusContextPreview,
  resolveFocusContextPreview,
} from '../composerContext';
import { RetainedSelectionHighlightService } from './RetainedSelectionHighlightService';

const RETAINED_SELECTION_POLL_INTERVAL_MS = 250;

export interface FocusContextRuntimeServiceHost {
  getCurrentConversationNotePath(): string | null;
  getFocusContextPreview(): FocusContextPreview | null;
  setFocusContextPreview(preview: FocusContextPreview | null): void;
  isComposerInteractionFocused(): boolean;
}

export class FocusContextRuntimeService {
  private lastKnownMarkdownFilePath: string | null = null;
  private focusContextRefreshTimeoutId: number | null = null;
  private retainedSelectionPollIntervalId: number | null = null;
  private readonly retainedSelectionHighlightService: RetainedSelectionHighlightService;

  constructor(
    private readonly app: App,
    private readonly host: FocusContextRuntimeServiceHost,
  ) {
    this.retainedSelectionHighlightService = new RetainedSelectionHighlightService(host);
  }

  rememberMarkdownFilePath(path: string | null): void {
    this.lastKnownMarkdownFilePath = path;
  }

  getActiveMarkdownView(): MarkdownView | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file) {
      this.lastKnownMarkdownFilePath = activeView.file.path;
      return activeView;
    }

    const preferredPaths = [
      this.lastKnownMarkdownFilePath,
      this.host.getCurrentConversationNotePath(),
    ].filter((value): value is string => Boolean(value));
    const markdownViews = this.getMarkdownViews();

    for (const preferredPath of preferredPaths) {
      const matchedView = markdownViews.find((view) => view.file?.path === preferredPath);
      if (matchedView?.file) {
        this.lastKnownMarkdownFilePath = matchedView.file.path;
        return matchedView;
      }
    }

    const fallbackView = markdownViews[0] ?? null;
    if (fallbackView?.file) {
      this.lastKnownMarkdownFilePath = fallbackView.file.path;
    }

    return fallbackView;
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

  private getMarkdownViews(): MarkdownView[] {
    return this.app.workspace.getLeavesOfType('markdown')
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && Boolean(view.file));
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
