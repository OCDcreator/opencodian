import type { PromptContextItem } from '../../../../src/core/types';
import type { FocusContextPreview } from '../../../../src/features/chat/composerContext';
import { buildComposerContextChipStates } from '../../../../src/features/chat/composerContext';
import { ComposerContextRuntimeStore } from '../../../../src/features/chat/services/ComposerContextRuntimeStore';
import {
  type ComposerContextRuntimeState,
  ComposerContextViewHostAdapter,
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
  const runtimeStore = new ComposerContextRuntimeStore({
    getActiveTabId: () => activeTabId,
    getTabRuntimeState: (tabId) => (tabId ? runtimes.get(tabId) ?? null : null),
    renderComposerContext,
  });
  const adapter = new ComposerContextViewHostAdapter(runtimeStore);

  return {
    adapter,
    runtimeStore,
    runtimes,
    renderComposerContext,
    setActiveTabId: (tabId: TabId | null) => {
      activeTabId = tabId;
    },
  };
}

describe('ComposerContextViewHostAdapter', () => {
  it('builds coordinator, chip-action, action, and picker-action hosts on top of the shared runtime store', () => {
    const { adapter, runtimeStore, runtimes, setActiveTabId } = createHarness();
    const refreshActiveFocusContextPreview = jest.fn();
    const beginContextPickerInteraction = jest.fn();
    const completeContextPickerInteraction = jest.fn();
    const coordinatorHost = adapter.createCoordinatorHost();
    const chipActionHost = adapter.createChipActionServiceHost({
      refreshActiveFocusContextPreview,
    });
    const actionHost = adapter.createActionServiceHost({
      getActiveMarkdownView: () => null,
    });
    const pickerActionHost = adapter.createPickerActionServiceHost({
      beginContextPickerInteraction,
      completeContextPickerInteraction,
    });
    const selectionItem = createContextItem('item-1', 'notes/alpha.md', { startLine: 1, endLine: 4 });
    const fileItem = createContextItem('item-2', 'notes/beta.md');
    const pickerItem = createContextItem('item-4', 'notes/delta.md');

    runtimes.get('tab-1' as TabId)?.draftContextItems.push(selectionItem, fileItem);
    runtimes.get('tab-1' as TabId)!.focusContextPreview = createPreview('notes/alpha.md');

    expect(coordinatorHost.getContextChipStates()).toEqual(
      buildComposerContextChipStates(
        [selectionItem, fileItem],
        createPreview('notes/alpha.md'),
      ),
    );
    expect(chipActionHost.getFocusContextPreview()).toEqual(createPreview('notes/alpha.md'));

    chipActionHost.removeDraftContextItemsForTarget({
      path: 'notes/alpha.md',
      lineRange: { startLine: 1, endLine: 4 },
    });
    actionHost.addDraftContextItem(createContextItem('item-3', 'notes/gamma.md'));
    pickerActionHost.addDraftContextItem(pickerItem);
    pickerActionHost.beginContextPickerInteraction();
    pickerActionHost.completeContextPickerInteraction();
    chipActionHost.refreshActiveFocusContextPreview();

    expect(runtimeStore.getDraftContextItems()).toEqual([
      fileItem,
      createContextItem('item-3', 'notes/gamma.md'),
      pickerItem,
    ]);
    expect(coordinatorHost.getContextChipStates()).toEqual(
      buildComposerContextChipStates(
        [
          fileItem,
          createContextItem('item-3', 'notes/gamma.md'),
          pickerItem,
        ],
        createPreview('notes/alpha.md'),
      ),
    );
    expect(refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);
    expect(beginContextPickerInteraction).toHaveBeenCalledTimes(1);
    expect(completeContextPickerInteraction).toHaveBeenCalledTimes(1);

    setActiveTabId('tab-2' as TabId);
    expect(coordinatorHost.getContextChipStates()).toEqual([]);
    expect(chipActionHost.getFocusContextPreview()).toBeNull();
  });
});
