import type { App, MarkdownView } from 'obsidian';

import {
  createFocusContextPreview,
} from '../../../../src/features/chat/composerContext';
import { ComposerContextRuntimeStore } from '../../../../src/features/chat/services/ComposerContextRuntimeStore';
import {
  createFocusContextServices,
  type FocusContextPreviewWritebackHost,
  type FocusContextRuntimeViewHost,
} from '../../../../src/features/chat/services/FocusContextHostAdapter';
import type { ComposerContextRuntimeState } from '../../../../src/features/chat/services/ComposerContextViewHostAdapter';
import type { TabId } from '../../../../src/features/chat/tabs';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

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
  const activeView = {
    file: { path: 'notes/current.md' },
    editor: {
      getSelection: jest.fn(() => ''),
    },
  } as unknown as MarkdownView;
  const focusRuntimeViewHost: Mocked<FocusContextRuntimeViewHost> = {
    getCurrentConversationNotePath: jest.fn(() => null),
    isComposerInteractionFocused: jest.fn(() => false),
  };
  const focusPreviewWritebackHost: Mocked<FocusContextPreviewWritebackHost> = {
    setCurrentConversationNotePath: jest.fn(),
  };
  const app = {
    workspace: {
      getActiveViewOfType: jest.fn(() => activeView),
      getLeavesOfType: jest.fn(() => []),
    },
  } as unknown as App;

  const services = createFocusContextServices({
    app,
    runtimeStore,
    focusRuntimeViewHost,
    focusPreviewWritebackHost,
  });

  return {
    services,
    runtimeStore,
    activeView,
    focusRuntimeViewHost,
    focusPreviewWritebackHost,
    setActiveTabId: (tabId: TabId | null) => {
      activeTabId = tabId;
    },
  };
}

describe('FocusContextHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wires the focus runtime bundle to the shared runtime store and current-note writeback host', () => {
    jest.useFakeTimers();

    try {
      const {
        services,
        runtimeStore,
        activeView,
        focusPreviewWritebackHost,
        setActiveTabId,
      } = createHarness();

      services.focusContextRuntimeService.refreshActiveFocusContextPreview(activeView);

      expect(runtimeStore.getFocusContextPreview()).toEqual(
        createFocusContextPreview('notes/current.md'),
      );

      services.focusContextPreviewCoordinator.handleFileOpen('notes/open.md');

      expect(focusPreviewWritebackHost.setCurrentConversationNotePath).toHaveBeenCalledWith(
        'notes/open.md',
      );
      expect(jest.getTimerCount()).toBe(1);

      setActiveTabId('tab-2' as TabId);
      expect(runtimeStore.getFocusContextPreview()).toBeNull();

      services.focusContextRuntimeService.dispose();

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('wires the picker interaction bridge through the shared focus services', () => {
    const { services } = createHarness();
    const pointerDownSpy = jest.spyOn(
      services.focusContextRuntimeService,
      'handleComposerPointerDown',
    ).mockImplementation(() => {});
    const refreshSpy = jest.spyOn(
      services.focusContextPreviewCoordinator,
      'scheduleFocusContextPreviewRefresh',
    ).mockImplementation(() => {});

    services.contextPickerInteractionBridge.beginContextPickerInteraction();
    services.contextPickerInteractionBridge.completeContextPickerInteraction();

    expect(pointerDownSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});
