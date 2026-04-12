import type { PromptContextItem } from '../../../../src/core/types';
import type { FocusContextPreview } from '../../../../src/features/chat/composerContext';
import {
  ComposerContextViewHostAdapter,
  type ComposerContextRuntimeState,
} from '../../../../src/features/chat/services/ComposerContextViewHostAdapter';
import type { TabId } from '../../../../src/features/chat/tabs';

function createContextItem(
  id: string,
  path: string,
  lineRange?: { startLine: number; endLine: number },
): PromptContextItem {
  return {
    id,
    kind: lineRange ? 'selection' : 'file',
    path,
    label: path,
    mime: 'text/markdown',
    lineRange,
    textSnapshot: lineRange ? `selection:${path}` : undefined,
  };
}

function createPreview(
  path: string,
  lineRange?: { startLine: number; endLine: number },
): FocusContextPreview {
  return {
    kind: lineRange ? 'selection' : 'current_note',
    path,
    label: path,
    lineRange,
    textSnapshot: lineRange ? `preview:${path}` : undefined,
  };
}

function createHarness() {
  let activeTabId: TabId | null = 'tab-1' as TabId;
  const runtimes = new Map<TabId, ComposerContextRuntimeState>([
    ['tab-1' as TabId, { draftContextItems: [], focusContextPreview: null }],
    ['tab-2' as TabId, { draftContextItems: [], focusContextPreview: null }],
  ]);
  const renderComposerContext = jest.fn();
  const adapter = new ComposerContextViewHostAdapter({
    getActiveTabId: () => activeTabId,
    getTabRuntimeState: (tabId) => (tabId ? runtimes.get(tabId) ?? null : null),
    renderComposerContext,
  });

  return {
    adapter,
    runtimes,
    renderComposerContext,
    setActiveTabId: (tabId: TabId | null) => {
      activeTabId = tabId;
    },
  };
}

describe('ComposerContextViewHostAdapter', () => {
  it('stores active-tab draft context items and keeps returned arrays immutable', () => {
    const { adapter, runtimes, renderComposerContext } = createHarness();
    const actionHost = adapter.createActionServiceHost({
      getActiveMarkdownView: () => null,
    });
    const activeItem = createContextItem('item-1', 'notes/alpha.md');
    const backgroundItem = createContextItem('item-2', 'notes/beta.md');

    actionHost.addDraftContextItem(activeItem);

    expect(runtimes.get('tab-1' as TabId)?.draftContextItems).toEqual([activeItem]);
    const draftItems = adapter.getDraftContextItems('tab-1' as TabId);
    expect(draftItems).toEqual([activeItem]);
    expect(draftItems).not.toBe(runtimes.get('tab-1' as TabId)?.draftContextItems);
    expect(renderComposerContext).toHaveBeenCalledTimes(1);

    runtimes.get('tab-2' as TabId)?.draftContextItems.push(backgroundItem);
    adapter.clearDraftContextItems('tab-2' as TabId);

    expect(runtimes.get('tab-2' as TabId)?.draftContextItems).toEqual([]);
    expect(renderComposerContext).toHaveBeenCalledTimes(1);
  });

  it('only rerenders when the focus preview value actually changes', () => {
    const { adapter, runtimes, renderComposerContext } = createHarness();
    const focusHost = adapter.createFocusContextRuntimeServiceHost({
      getCurrentConversationNotePath: () => 'notes/current.md',
      isComposerInteractionFocused: () => true,
    });
    const initialPreview = createPreview('notes/current.md', { startLine: 3, endLine: 5 });
    const nextPreview = createPreview('notes/next.md');

    focusHost.setFocusContextPreview(initialPreview);
    expect(runtimes.get('tab-1' as TabId)?.focusContextPreview).toEqual(initialPreview);
    expect(renderComposerContext).toHaveBeenCalledTimes(1);

    renderComposerContext.mockClear();
    focusHost.setFocusContextPreview({ ...initialPreview });
    expect(renderComposerContext).not.toHaveBeenCalled();

    focusHost.setFocusContextPreview(nextPreview);
    expect(runtimes.get('tab-1' as TabId)?.focusContextPreview).toEqual(nextPreview);
    expect(renderComposerContext).toHaveBeenCalledTimes(1);
  });

  it('builds coordinator and focus-runtime hosts on top of the shared tab-state adapter', () => {
    const { adapter, runtimes, setActiveTabId } = createHarness();
    const refreshActiveFocusContextPreview = jest.fn();
    const coordinatorHost = adapter.createCoordinatorHost({
      refreshActiveFocusContextPreview,
    });
    const focusHost = adapter.createFocusContextRuntimeServiceHost({
      getCurrentConversationNotePath: () => 'notes/current.md',
      isComposerInteractionFocused: () => false,
    });
    const selectionItem = createContextItem('item-1', 'notes/alpha.md', { startLine: 1, endLine: 4 });
    const fileItem = createContextItem('item-2', 'notes/beta.md');

    runtimes.get('tab-1' as TabId)?.draftContextItems.push(selectionItem, fileItem);
    runtimes.get('tab-1' as TabId)!.focusContextPreview = createPreview('notes/alpha.md');

    expect(coordinatorHost.getDraftContextItems()).toEqual([selectionItem, fileItem]);
    expect(focusHost.getFocusContextPreview()).toEqual(createPreview('notes/alpha.md'));
    expect(focusHost.getCurrentConversationNotePath()).toBe('notes/current.md');
    expect(focusHost.isComposerInteractionFocused()).toBe(false);

    coordinatorHost.removeDraftContextItemsForTarget({
      path: 'notes/alpha.md',
      lineRange: { startLine: 1, endLine: 4 },
    });
    coordinatorHost.refreshActiveFocusContextPreview();

    expect(coordinatorHost.getDraftContextItems()).toEqual([fileItem]);
    expect(refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);

    setActiveTabId('tab-2' as TabId);
    expect(coordinatorHost.getDraftContextItems()).toEqual([]);
    expect(focusHost.getFocusContextPreview()).toBeNull();
  });
});
