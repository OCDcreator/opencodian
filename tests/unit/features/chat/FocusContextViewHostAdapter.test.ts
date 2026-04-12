import type { FocusContextPreview } from '../../../../src/features/chat/composerContext';
import { ComposerContextRuntimeStore } from '../../../../src/features/chat/services/ComposerContextRuntimeStore';
import {
  type ComposerContextRuntimeState,
} from '../../../../src/features/chat/services/ComposerContextViewHostAdapter';
import { FocusContextViewHostAdapter } from '../../../../src/features/chat/services/FocusContextViewHostAdapter';
import type { TabId } from '../../../../src/features/chat/tabs';

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
  const runtimeStore = new ComposerContextRuntimeStore({
    getActiveTabId: () => activeTabId,
    getTabRuntimeState: (tabId) => (tabId ? runtimes.get(tabId) ?? null : null),
    renderComposerContext: jest.fn(),
  });
  const adapter = new FocusContextViewHostAdapter(runtimeStore);

  return {
    adapter,
    runtimeStore,
    setActiveTabId: (tabId: TabId | null) => {
      activeTabId = tabId;
    },
  };
}

describe('FocusContextViewHostAdapter', () => {
  it('builds focus-runtime and preview-coordinator hosts on top of the shared runtime store', () => {
    const { adapter, runtimeStore, setActiveTabId } = createHarness();
    const setCurrentConversationNotePath = jest.fn();
    const runtimeHost = adapter.createFocusContextRuntimeServiceHost({
      getCurrentConversationNotePath: () => 'notes/current.md',
      isComposerInteractionFocused: () => true,
    });
    const previewCoordinatorHost = adapter.createFocusContextPreviewCoordinatorHost({
      setCurrentConversationNotePath,
    });

    runtimeStore.setFocusContextPreview(createPreview('notes/alpha.md'));

    expect(runtimeHost.getFocusContextPreview()).toEqual(createPreview('notes/alpha.md'));
    expect(runtimeHost.getCurrentConversationNotePath()).toBe('notes/current.md');
    expect(runtimeHost.isComposerInteractionFocused()).toBe(true);

    runtimeHost.setFocusContextPreview(createPreview('notes/beta.md'));
    previewCoordinatorHost.setCurrentConversationNotePath('notes/beta.md');

    expect(runtimeStore.getFocusContextPreview()).toEqual(createPreview('notes/beta.md'));
    expect(setCurrentConversationNotePath).toHaveBeenCalledWith('notes/beta.md');

    setActiveTabId('tab-2' as TabId);
    expect(runtimeHost.getFocusContextPreview()).toBeNull();
  });
});
