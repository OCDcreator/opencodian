import type { MarkdownView } from 'obsidian';

import type { PromptContextItem } from '../../../core/types';
import type { TabId } from '../tabs';
import {
  getContextTargetKey,
  removeDraftContextItemsByTarget,
  upsertDraftContextItem,
  type FocusContextPreview,
} from '../composerContext';
import type { ComposerContextActionServiceHost } from './ComposerContextActionService';
import type { ComposerContextCoordinatorHost } from './ComposerContextCoordinator';
import type { FocusContextRuntimeServiceHost } from './FocusContextRuntimeService';

export interface ComposerContextRuntimeState {
  focusContextPreview: FocusContextPreview | null;
  draftContextItems: PromptContextItem[];
}

export interface ComposerContextViewHostAdapterViewHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): ComposerContextRuntimeState | null;
  renderComposerContext(): void;
}

export interface ComposerContextCoordinatorHostOptions {
  refreshActiveFocusContextPreview(): void;
}

export interface ComposerContextActionHostOptions {
  getActiveMarkdownView(): MarkdownView | null;
}

export interface ComposerContextFocusRuntimeHostOptions {
  getCurrentConversationNotePath(): string | null;
  isComposerInteractionFocused(): boolean;
}

export class ComposerContextViewHostAdapter {
  constructor(
    private readonly viewHost: ComposerContextViewHostAdapterViewHost,
  ) {}

  getDraftContextItems(tabId: TabId | null = this.viewHost.getActiveTabId()): PromptContextItem[] {
    const runtime = this.viewHost.getTabRuntimeState(tabId);
    return runtime ? [...runtime.draftContextItems] : [];
  }

  clearDraftContextItems(tabId: TabId | null = this.viewHost.getActiveTabId()): void {
    this.setDraftContextItems([], tabId);
  }

  createCoordinatorHost(
    options: ComposerContextCoordinatorHostOptions,
  ): ComposerContextCoordinatorHost {
    return {
      getDraftContextItems: () => this.getDraftContextItems(),
      getFocusContextPreview: () => this.getFocusContextPreview(),
      addDraftContextItem: (item) => {
        this.addDraftContextItem(item);
      },
      removeDraftContextItemsForTarget: (target) => {
        this.removeDraftContextItemsForTarget(target);
      },
      refreshActiveFocusContextPreview: () => {
        options.refreshActiveFocusContextPreview();
      },
    };
  }

  createActionServiceHost(
    options: ComposerContextActionHostOptions,
  ): ComposerContextActionServiceHost {
    return {
      getActiveMarkdownView: () => options.getActiveMarkdownView(),
      addDraftContextItem: (item) => {
        this.addDraftContextItem(item);
      },
    };
  }

  createFocusContextRuntimeServiceHost(
    options: ComposerContextFocusRuntimeHostOptions,
  ): FocusContextRuntimeServiceHost {
    return {
      getCurrentConversationNotePath: () => options.getCurrentConversationNotePath(),
      getFocusContextPreview: () => this.getFocusContextPreview(),
      setFocusContextPreview: (preview) => {
        this.setFocusContextPreview(preview);
      },
      isComposerInteractionFocused: () => options.isComposerInteractionFocused(),
    };
  }

  private getFocusContextPreview(
    tabId: TabId | null = this.viewHost.getActiveTabId(),
  ): FocusContextPreview | null {
    return this.viewHost.getTabRuntimeState(tabId)?.focusContextPreview ?? null;
  }

  private addDraftContextItem(
    item: PromptContextItem,
    tabId: TabId | null = this.viewHost.getActiveTabId(),
  ): void {
    const existingItems = this.getDraftContextItems(tabId);
    const nextItems = upsertDraftContextItem(existingItems, item);
    this.setDraftContextItems(nextItems, tabId);
  }

  private removeDraftContextItemsForTarget(
    target: Pick<PromptContextItem, 'path' | 'lineRange'>,
    tabId: TabId | null = this.viewHost.getActiveTabId(),
  ): void {
    const nextItems = removeDraftContextItemsByTarget(this.getDraftContextItems(tabId), target);
    this.setDraftContextItems(nextItems, tabId);
  }

  private setDraftContextItems(
    items: PromptContextItem[],
    tabId: TabId | null = this.viewHost.getActiveTabId(),
  ): void {
    const runtime = this.viewHost.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.draftContextItems = [...items];
    if (tabId === this.viewHost.getActiveTabId()) {
      this.viewHost.renderComposerContext();
    }
  }

  private setFocusContextPreview(
    preview: FocusContextPreview | null,
    tabId: TabId | null = this.viewHost.getActiveTabId(),
  ): void {
    const runtime = this.viewHost.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const previous = runtime.focusContextPreview;
    if (this.areFocusContextPreviewsEqual(previous, preview)) {
      return;
    }

    runtime.focusContextPreview = preview;
    if (tabId === this.viewHost.getActiveTabId()) {
      this.viewHost.renderComposerContext();
    }
  }

  private areFocusContextPreviewsEqual(
    left: FocusContextPreview | null,
    right: FocusContextPreview | null,
  ): boolean {
    if (!left || !right) {
      return left === right;
    }

    return left.kind === right.kind
      && left.textSnapshot === right.textSnapshot
      && getContextTargetKey(left.path, left.lineRange) === getContextTargetKey(right.path, right.lineRange);
  }
}
