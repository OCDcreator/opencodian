import type { PromptContextItem } from '../../../../src/core/types';
import type { FocusContextPreview } from '../../../../src/features/chat/composerContext';
import {
  type ComposerContextRuntimeState,
  ComposerContextRuntimeStore,
} from '../../../../src/features/chat/services/ComposerContextRuntimeStore';
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
  const runtimeStore = new ComposerContextRuntimeStore({
    getActiveTabId: () => activeTabId,
    getTabRuntimeState: (tabId) => (tabId ? runtimes.get(tabId) ?? null : null),
    renderComposerContext,
  });

  return {
    runtimeStore,
    runtimes,
    renderComposerContext,
    setActiveTabId: (tabId: TabId | null) => {
      activeTabId = tabId;
    },
  };
}

describe('ComposerContextRuntimeStore', () => {
  it('stores active-tab draft context items and keeps returned arrays immutable', () => {
    const { runtimeStore, runtimes, renderComposerContext } = createHarness();
    const activeItem = createContextItem('item-1', 'notes/alpha.md');
    const backgroundItem = createContextItem('item-2', 'notes/beta.md');

    runtimeStore.addDraftContextItem(activeItem);

    expect(runtimes.get('tab-1' as TabId)?.draftContextItems).toEqual([activeItem]);
    const draftItems = runtimeStore.getDraftContextItems('tab-1' as TabId);
    expect(draftItems).toEqual([activeItem]);
    expect(draftItems).not.toBe(runtimes.get('tab-1' as TabId)?.draftContextItems);
    expect(renderComposerContext).toHaveBeenCalledTimes(1);

    runtimes.get('tab-2' as TabId)?.draftContextItems.push(backgroundItem);
    runtimeStore.clearDraftContextItems('tab-2' as TabId);

    expect(runtimes.get('tab-2' as TabId)?.draftContextItems).toEqual([]);
    expect(renderComposerContext).toHaveBeenCalledTimes(1);
  });

  it('updates preview state only when the value actually changes', () => {
    const { runtimeStore, runtimes, renderComposerContext } = createHarness();
    const initialPreview = createPreview('notes/current.md', { startLine: 3, endLine: 5 });
    const nextPreview = createPreview('notes/next.md');

    runtimeStore.setFocusContextPreview(initialPreview);
    expect(runtimes.get('tab-1' as TabId)?.focusContextPreview).toEqual(initialPreview);
    expect(renderComposerContext).toHaveBeenCalledTimes(1);

    renderComposerContext.mockClear();
    runtimeStore.setFocusContextPreview({ ...initialPreview });
    expect(renderComposerContext).not.toHaveBeenCalled();

    runtimeStore.setFocusContextPreview(nextPreview);
    expect(runtimes.get('tab-1' as TabId)?.focusContextPreview).toEqual(nextPreview);
    expect(renderComposerContext).toHaveBeenCalledTimes(1);
  });

  it('derives active-tab chip states from the shared draft and preview runtime', () => {
    const { runtimeStore, setActiveTabId } = createHarness();
    const currentNotePreview = createPreview('notes/current.md');
    const selectionItem = createContextItem('item-1', 'notes/alpha.md', {
      startLine: 1,
      endLine: 4,
    });
    const fileItem = createContextItem('item-2', 'notes/beta.md');

    runtimeStore.setFocusContextPreview(currentNotePreview);
    runtimeStore.addDraftContextItem(selectionItem);
    runtimeStore.addDraftContextItem(fileItem);

    expect(runtimeStore.getContextChipStates()).toEqual([
      {
        key: 'notes/current.md:',
        kind: 'current_note',
        path: 'notes/current.md',
        label: 'notes/current.md',
        attached: false,
        preview: true,
      },
      {
        key: 'notes/alpha.md:1-4',
        kind: 'selection',
        path: 'notes/alpha.md',
        label: 'notes/alpha.md',
        lineRange: { startLine: 1, endLine: 4 },
        attached: true,
        preview: false,
      },
      {
        key: 'notes/beta.md:',
        kind: 'file',
        path: 'notes/beta.md',
        label: 'notes/beta.md',
        attached: true,
        preview: false,
      },
    ]);

    setActiveTabId('tab-2' as TabId);
    expect(runtimeStore.getContextChipStates()).toEqual([]);
  });

  it('keeps tab-local draft and preview state isolated when the active tab changes', () => {
    const { runtimeStore, runtimes, setActiveTabId } = createHarness();
    const selectionItem = createContextItem('item-1', 'notes/alpha.md', { startLine: 1, endLine: 4 });
    const preview = createPreview('notes/alpha.md');

    runtimeStore.addDraftContextItem(selectionItem);
    runtimeStore.setFocusContextPreview(preview);

    expect(runtimeStore.getDraftContextItems()).toEqual([selectionItem]);
    expect(runtimeStore.getFocusContextPreview()).toEqual(preview);

    setActiveTabId('tab-2' as TabId);
    expect(runtimeStore.getDraftContextItems()).toEqual([]);
    expect(runtimeStore.getFocusContextPreview()).toBeNull();

    runtimeStore.addDraftContextItem(createContextItem('item-2', 'notes/beta.md'));
    expect(runtimes.get('tab-1' as TabId)?.draftContextItems).toEqual([selectionItem]);
  });
});
