import type { Editor, MarkdownView } from 'obsidian';

import type { FocusContextRuntimeService } from './FocusContextRuntimeService';

type FocusContextPreviewRuntimePort = Pick<
  FocusContextRuntimeService,
  | 'rememberMarkdownFilePath'
  | 'refreshActiveFocusContextPreview'
  | 'scheduleFocusContextPreviewRefresh'
>;

export interface FocusContextPreviewCoordinatorHost {
  setCurrentConversationNotePath(path: string | null): void;
}

export class FocusContextPreviewCoordinator {
  constructor(
    private readonly host: FocusContextPreviewCoordinatorHost,
    private readonly focusContextRuntimeService: FocusContextPreviewRuntimePort,
  ) {}

  handleFileOpen(path: string | null): void {
    this.focusContextRuntimeService.rememberMarkdownFilePath(path);
    this.host.setCurrentConversationNotePath(path);
    this.focusContextRuntimeService.scheduleFocusContextPreviewRefresh();
  }

  refreshActiveFocusContextPreview(
    view?: MarkdownView | null,
    editor?: Editor | null,
  ): void {
    this.focusContextRuntimeService.refreshActiveFocusContextPreview(view, editor);
  }

  scheduleFocusContextPreviewRefresh(): void {
    this.focusContextRuntimeService.scheduleFocusContextPreviewRefresh();
  }
}
