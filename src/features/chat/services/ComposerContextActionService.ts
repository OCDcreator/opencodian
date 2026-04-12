import type { App, Editor, MarkdownView } from 'obsidian';

import type { PromptContextItem } from '../../../core/types';
import { chooseContextFile } from '../ui/ContextFilePickerModal';
import type { ContextAttachmentBuilder } from './ContextAttachmentBuilder';
import type { ContextFileCatalogService } from './ContextFileCatalogService';

type ComposerContextActionAttachmentBuilderPort = Pick<
  ContextAttachmentBuilder,
  'buildCurrentNoteContextItem' | 'buildSelectionContextItem' | 'buildFileContextItem'
>;

type ComposerContextActionCatalogPort = Pick<
  ContextFileCatalogService,
  'getCatalog'
>;

export interface ComposerContextActionServiceHost {
  getActiveMarkdownView(): MarkdownView | null;
  addDraftContextItem(item: PromptContextItem): void;
}

export class ComposerContextActionService {
  constructor(
    private readonly app: App,
    private readonly contextAttachmentBuilder: ComposerContextActionAttachmentBuilderPort,
    private readonly contextFileCatalogService: ComposerContextActionCatalogPort,
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

  async addChosenFileContextToActiveTab(): Promise<boolean> {
    const file = await chooseContextFile(this.app, async () => this.contextFileCatalogService.getCatalog());
    if (!file) {
      return false;
    }

    const contextItem = await this.contextAttachmentBuilder.buildFileContextItem(file, 'file');
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
