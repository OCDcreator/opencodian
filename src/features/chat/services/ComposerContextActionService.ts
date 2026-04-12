import type { Editor, MarkdownView } from 'obsidian';

import type { PromptContextItem } from '../../../core/types';
import type { ContextAttachmentBuilder } from './ContextAttachmentBuilder';

type ComposerContextActionAttachmentBuilderPort = Pick<
  ContextAttachmentBuilder,
  'buildCurrentNoteContextItem' | 'buildSelectionContextItem'
>;

export interface ComposerContextActionServiceHost {
  getActiveMarkdownView(): MarkdownView | null;
  addDraftContextItem(item: PromptContextItem): void;
}

export class ComposerContextActionService {
  constructor(
    private readonly contextAttachmentBuilder: ComposerContextActionAttachmentBuilderPort,
    private readonly host: ComposerContextActionServiceHost,
  ) {}

  async addCurrentNoteContextFromActiveEditor(view?: MarkdownView | null): Promise<boolean> {
    const contextItem = await this.contextAttachmentBuilder.buildCurrentNoteContextItem(
      view ?? this.host.getActiveMarkdownView(),
    );
    return this.addBuiltContextItem(contextItem);
  }

  async addSelectionContextFromActiveEditor(
    editor?: Editor | null,
    view?: MarkdownView | null,
  ): Promise<boolean> {
    const activeView = view ?? this.host.getActiveMarkdownView();
    const contextItem = await this.contextAttachmentBuilder.buildSelectionContextItem(
      editor ?? activeView?.editor ?? null,
      activeView,
    );
    return this.addBuiltContextItem(contextItem);
  }

  private addBuiltContextItem(contextItem: PromptContextItem | null): boolean {
    if (!contextItem) {
      return false;
    }

    this.host.addDraftContextItem(contextItem);
    return true;
  }
}
