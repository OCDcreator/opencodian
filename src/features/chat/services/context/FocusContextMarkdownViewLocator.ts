import { type App,MarkdownView } from 'obsidian';

export interface FocusContextMarkdownViewLocatorHost {
  getCurrentConversationNotePath(): string | null;
}

export class FocusContextMarkdownViewLocator {
  private lastKnownMarkdownFilePath: string | null = null;

  constructor(
    private readonly app: App,
    private readonly host: FocusContextMarkdownViewLocatorHost,
  ) {}

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

  private getMarkdownViews(): MarkdownView[] {
    return this.app.workspace.getLeavesOfType('markdown')
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && Boolean(view.file));
  }
}
