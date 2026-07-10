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

/**
 * Optional port that reports whether the connected OpenCode server advertises
 * the v2 fs/reference capability family, so the context picker can surface a
 * read-only server-side hint. When omitted the picker behaves exactly as
 * before (non-breaking).
 */
export interface ComposerContextPickerServerContextPort {
  hasAnyServerContextCapability(): boolean;
}

export interface ComposerContextPickerActionServiceOptions {
  /** Optional read-only server-side context capability port (v2 fs/reference). */
  serverContext?: ComposerContextPickerServerContextPort;
}

export class ComposerContextPickerActionService {
  // eslint-disable-next-line max-params -- core deps + optional options bag; splitting further harms readability.
  constructor(
    private readonly app: App,
    private readonly contextAttachmentBuilder: ComposerContextPickerAttachmentBuilderPort,
    private readonly contextFileCatalogService: ComposerContextPickerCatalogPort,
    private readonly host: ComposerContextPickerActionServiceHost,
    options?: ComposerContextPickerActionServiceOptions,
  ) {
    this.serverContext = options?.serverContext;
  }

  private readonly serverContext?: ComposerContextPickerServerContextPort;

  async addChosenFileContextToActiveTab(): Promise<boolean> {
    this.host.beginContextPickerInteraction();

    try {
      const file = await chooseContextFile(
        this.app,
        async () => this.contextFileCatalogService.getCatalog(),
        { serverContextAvailable: this.serverContext?.hasAnyServerContextCapability() ?? false },
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
