import type { App } from 'obsidian';
import { TFile, TFolder } from 'obsidian';

import type { PromptContextItem } from '../../../core/types';
import { isTextLikeMime, resolveContextMimeFromPath } from '../../../shared';
import { chooseContextFiles } from '../ui/ContextFilePickerModal';
import type { ContextAttachmentBuilder } from './ContextAttachmentBuilder';
import type { ContextFileCatalogService } from './ContextFileCatalogService';

type ComposerContextPickerAttachmentBuilderPort = Pick<
  ContextAttachmentBuilder,
  'buildEntryContextItem'
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

  /**
   * Multi-select vault picker (R-A7): every picked file or folder becomes one
   * context item, so picking three notes in a row yields three chips. Entries
   * that fail to build (stale paths, ineligible kinds) are skipped; a picker
   * cancel resolves nothing.
   */
  async addChosenFileContextToActiveTab(): Promise<boolean> {
    this.host.beginContextPickerInteraction();

    try {
      const picked = await chooseContextFiles(
        this.app,
        async () => this.contextFileCatalogService.getCatalog(),
        { serverContextAvailable: this.serverContext?.hasAnyServerContextCapability() ?? false },
      );
      if (picked.length === 0) {
        return false;
      }

      let added = false;
      for (const entry of picked) {
        const contextItem = await this.contextAttachmentBuilder.buildEntryContextItem(entry);
        if (!contextItem) {
          continue;
        }
        this.host.addDraftContextItem(contextItem);
        added = true;
      }
      return added;
    } finally {
      this.host.completeContextPickerInteraction();
    }
  }

  /**
   * Resolve one raw `text/plain` drop payload against the vault (R-A7).
   *
   * The `instanceof TFile | TFolder` check is the hard gate — a path string
   * that does not resolve to a vault entry (including anything outside the
   * vault) returns `false` and never becomes a chip. Text files and folders
   * attach asynchronously; the sync return only reports whether the drop was
   * claimed, so the caller can leave unrelated text drops to their default
   * handling.
   */
  addVaultPathContextFromDrop(rawPath: string): boolean {
    const trimmed = rawPath.trim();
    if (!trimmed) return false;
    const abstract = this.app.vault.getAbstractFileByPath(trimmed);
    if (abstract instanceof TFolder) {
      void this.attachResolvedEntry(abstract);
      return true;
    }
    if (abstract instanceof TFile) {
      if (!isTextLikeMime(resolveContextMimeFromPath(abstract.path))) return false;
      void this.attachResolvedEntry(abstract);
      return true;
    }
    return false;
  }

  private async attachResolvedEntry(entry: TFile | TFolder): Promise<void> {
    const contextItem = await this.contextAttachmentBuilder.buildEntryContextItem(entry);
    if (contextItem) {
      this.host.addDraftContextItem(contextItem);
    }
  }
}
