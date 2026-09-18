import type { App, TFile, TFolder } from 'obsidian';
import { Notice, TFile as TFileClass, TFolder as TFolderClass } from 'obsidian';

import type { ContextGroup, PromptContextItem } from '../../../core/types';
import { t } from '../../../i18n';
import { isTextLikeMime, planContextGroupAttach, resolveContextMimeFromPath } from '../../../shared';
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

/**
 * Persisted context groups (R-B2), read from plugin settings. Injected so
 * the service stays testable and the settings shape stays a core concern.
 */
export interface ComposerContextGroupsPort {
  listGroups(): readonly ContextGroup[];
}

export interface ComposerContextPickerActionServiceOptions {
  /** Optional read-only server-side context capability port (v2 fs/reference). */
  serverContext?: ComposerContextPickerServerContextPort;
  /** Persisted context groups for the picker's "attach topic" rows (R-B2). */
  contextGroups?: ComposerContextGroupsPort;
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
    this.contextGroups = options?.contextGroups;
  }

  private readonly serverContext?: ComposerContextPickerServerContextPort;
  private readonly contextGroups?: ComposerContextGroupsPort;

  /**
   * Multi-select vault picker (R-A7): every picked file or folder becomes one
   * context item, so picking three notes in a row yields three chips. Entries
   * that fail to build (stale paths, ineligible kinds) are skipped; a picker
   * cancel resolves nothing. Context groups (R-B2) render as one-click rows
   * above the file list and attach through `attachContextGroup`.
   */
  async addChosenFileContextToActiveTab(): Promise<boolean> {
    this.host.beginContextPickerInteraction();

    try {
      const picked = await chooseContextFiles(
        this.app,
        async () => this.contextFileCatalogService.getCatalog(),
        {
          serverContextAvailable: this.serverContext?.hasAnyServerContextCapability() ?? false,
          groups: (this.contextGroups?.listGroups() ?? []).map((group) => ({
            id: group.id,
            name: group.name,
            entryCount: group.entries.length,
          })),
          onAttachGroup: (groupId) => { void this.attachContextGroup(groupId); },
        },
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
   * Attach one persisted context group to the active tab (R-B2), in group
   * order, with the same effect as attaching every entry by hand. The chat
   * composer has no per-turn item cap, so every resolvable entry attaches;
   * entries whose path no longer resolves (moved/deleted note, or a
   * non-text file) are skipped and reported — never an error.
   */
  async attachContextGroup(groupId: string): Promise<boolean> {
    const group = (this.contextGroups?.listGroups() ?? []).find((entry) => entry.id === groupId);
    if (!group) return false;

    const plan = planContextGroupAttach<TFile | TFolder>({
      entries: group.entries,
      resolve: (path) => this.resolveGroupEntry(path),
      cap: Number.POSITIVE_INFINITY,
    });

    let added = false;
    for (const resolved of plan.toAttach) {
      const contextItem = await this.contextAttachmentBuilder.buildEntryContextItem(resolved.entry);
      if (!contextItem) continue;
      this.host.addDraftContextItem(contextItem);
      added = true;
    }

    if (plan.toAttach.length > 0) {
      new Notice(t('chat.context.notice.groupAttached', {
        name: group.name,
        count: plan.toAttach.length,
      }));
    }
    if (plan.missingPaths.length > 0) {
      const shown = plan.missingPaths.slice(0, 3).join('、');
      new Notice(plan.missingPaths.length > 3
        ? t('chat.context.notice.groupMissingMore', {
          count: plan.missingPaths.length,
          paths: shown,
          more: plan.missingPaths.length - 3,
        })
        : t('chat.context.notice.groupMissing', {
          count: plan.missingPaths.length,
          paths: shown,
        }));
    }
    return added;
  }

  /**
   * Resolve one group entry path against the vault (R-B2). Same hard gate as
   * the drop surface: `getAbstractFileByPath()` plus `instanceof` checks, so
   * a stale path (or anything outside the vault) returns `null` and is
   * reported as missing instead of becoming a chip.
   */
  private resolveGroupEntry(path: string): TFile | TFolder | null {
    const abstract = this.app.vault.getAbstractFileByPath(path);
    if (abstract instanceof TFolderClass) return abstract;
    if (abstract instanceof TFileClass) {
      return isTextLikeMime(resolveContextMimeFromPath(abstract.path)) ? abstract : null;
    }
    return null;
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
    if (abstract instanceof TFolderClass) {
      void this.attachResolvedEntry(abstract);
      return true;
    }
    if (abstract instanceof TFileClass) {
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
