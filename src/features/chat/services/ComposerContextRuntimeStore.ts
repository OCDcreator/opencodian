import type { PromptContextItem } from '../../../core/types';
import {
  type FocusContextPreview,
  getContextTargetKey,
  removeDraftContextItemsByTarget,
  upsertDraftContextItem,
} from '../composerContext';
import type { TabId } from '../tabs';

export interface ComposerContextRuntimeState {
  focusContextPreview: FocusContextPreview | null;
  draftContextItems: PromptContextItem[];
}

export interface ComposerContextRuntimeStoreHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): ComposerContextRuntimeState | null;
  renderComposerContext(): void;
}

export class ComposerContextRuntimeStore {
  constructor(private readonly host: ComposerContextRuntimeStoreHost) {}

  getDraftContextItems(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): PromptContextItem[] {
    const runtime = this.host.getTabRuntimeState(tabId);
    return runtime ? [...runtime.draftContextItems] : [];
  }

  clearDraftContextItems(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    this.setDraftContextItems([], tabId);
  }

  addDraftContextItem(
    item: PromptContextItem,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const existingItems = this.getDraftContextItems(tabId);
    const nextItems = upsertDraftContextItem(existingItems, item);
    this.setDraftContextItems(nextItems, tabId);
  }

  removeDraftContextItemsForTarget(
    target: Pick<PromptContextItem, 'path' | 'lineRange'>,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const nextItems = removeDraftContextItemsByTarget(
      this.getDraftContextItems(tabId),
      target,
    );
    this.setDraftContextItems(nextItems, tabId);
  }

  getFocusContextPreview(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): FocusContextPreview | null {
    return this.host.getTabRuntimeState(tabId)?.focusContextPreview ?? null;
  }

  setFocusContextPreview(
    preview: FocusContextPreview | null,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const previous = runtime.focusContextPreview;
    if (this.areFocusContextPreviewsEqual(previous, preview)) {
      return;
    }

    runtime.focusContextPreview = preview;
    if (tabId === this.host.getActiveTabId()) {
      this.host.renderComposerContext();
    }
  }

  private setDraftContextItems(
    items: PromptContextItem[],
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.draftContextItems = [...items];
    if (tabId === this.host.getActiveTabId()) {
      this.host.renderComposerContext();
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
