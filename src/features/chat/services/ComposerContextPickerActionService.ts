import type { App } from 'obsidian';

import type { PromptContextItem } from '../../../core/types';
import { chooseContextFile } from '../ui/ContextFilePickerModal';
import type { ContextAttachmentBuilder } from './ContextAttachmentBuilder';
import type { ContextFileCatalogService } from './ContextFileCatalogService';

type ComposerContextPickerAttachmentBuilderPort = Pick<
  ContextAttachmentBuilder,
  'buildFileContextItem'
>;

type ComposerContextPickerCatalogPort = Pick<
  ContextFileCatalogService,
  'getCatalog'
>;

export interface ComposerContextPickerActionServiceHost {
  addDraftContextItem(item: PromptContextItem): void;
  beginContextPickerInteraction(): void;
  completeContextPickerInteraction(): void;
}

export class ComposerContextPickerActionService {
  constructor(
    private readonly app: App,
    private readonly contextAttachmentBuilder: ComposerContextPickerAttachmentBuilderPort,
    private readonly contextFileCatalogService: ComposerContextPickerCatalogPort,
    private readonly host: ComposerContextPickerActionServiceHost,
  ) {}

  async addChosenFileContextToActiveTab(): Promise<boolean> {
    this.host.beginContextPickerInteraction();

    try {
      const file = await chooseContextFile(
        this.app,
        async () => this.contextFileCatalogService.getCatalog(),
      );
      if (!file) {
        return false;
      }

      const contextItem = await this.contextAttachmentBuilder.buildFileContextItem(file, 'file');
      if (!contextItem) {
        return false;
      }

      this.host.addDraftContextItem(contextItem);
      return true;
    } finally {
      this.host.completeContextPickerInteraction();
    }
  }
}
