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
import { RetainedSelectionRuntimeCoordinator } from './RetainedSelectionRuntimeCoordinator';

export interface FocusContextRuntimeServiceHost extends FocusContextMarkdownViewLocatorHost {
  getFocusContextPreview(): FocusContextPreview | null;
  setFocusContextPreview(preview: FocusContextPreview | null): void;
  isComposerInteractionFocused(): boolean;
}

export class FocusContextRuntimeService {
  private focusContextRefreshTimeoutId: number | null = null;
  private readonly markdownViewLocator: FocusContextMarkdownViewLocator;
  private readonly retainedSelectionRuntimeCoordinator: RetainedSelectionRuntimeCoordinator;

  constructor(
    app: App,
    private readonly host: FocusContextRuntimeServiceHost,
  ) {
    this.markdownViewLocator = new FocusContextMarkdownViewLocator(app, host);
    this.retainedSelectionRuntimeCoordinator = new RetainedSelectionRuntimeCoordinator({
      getFocusContextPreview: () => this.host.getFocusContextPreview(),
      isComposerInteractionFocused: () => this.host.isComposerInteractionFocused(),
      getActiveMarkdownView: () => this.getActiveMarkdownView(),
      refreshActiveFocusContextPreview: (view, editor) => {
        this.refreshActiveFocusContextPreview(view, editor);
      },
    });
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
        retainSelectionPreview: this.retainedSelectionRuntimeCoordinator.shouldRetainPreviewDuringTransition(),
      },
    );
    this.host.setFocusContextPreview(nextPreview);
    this.retainedSelectionRuntimeCoordinator.syncFromPreview(actualPreview, view, editor);
  }

  scheduleFocusContextPreviewRefresh(): void {
    this.clearScheduledFocusContextPreviewRefresh();
    this.focusContextRefreshTimeoutId = window.setTimeout(() => {
      this.focusContextRefreshTimeoutId = null;
      this.refreshActiveFocusContextPreview();
    }, 40);
  }

  startRetainedSelectionPolling(): void {
    this.retainedSelectionRuntimeCoordinator.startPolling();
  }

  handleComposerPointerDown(): void {
    this.retainedSelectionRuntimeCoordinator.handleComposerPointerDown();
  }

  handleComposerFocusIn(): void {
    this.retainedSelectionRuntimeCoordinator.handleComposerFocusIn();
  }

  handleComposerFocusOut(): void {
    this.retainedSelectionRuntimeCoordinator.handleComposerFocusOut();
  }

  dispose(): void {
    this.retainedSelectionRuntimeCoordinator.dispose();
    this.clearScheduledFocusContextPreviewRefresh();
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

}
