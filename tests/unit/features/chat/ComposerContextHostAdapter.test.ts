import type { App, MarkdownView } from 'obsidian';

import type { PromptContextItem } from '../../../../src/core/types';
import {
  createComposerContextServices,
  type ComposerContextViewHost,
} from '../../../../src/features/chat/services/ComposerContextHostAdapter';
import type { ComposerContextRuntimeState } from '../../../../src/features/chat/services/ComposerContextRuntimeStore';
import type { TabId } from '../../../../src/features/chat/tabs';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createContextItem(overrides: Partial<PromptContextItem> = {}): PromptContextItem {
  return {
    id: overrides.id ?? 'context-1',
    kind: overrides.kind ?? 'file',
    path: overrides.path ?? 'notes/current.md',
    label: overrides.label ?? 'Current note',
    mime: overrides.mime ?? 'text/markdown',
    lineRange: overrides.lineRange,
    textSnapshot: overrides.textSnapshot,
  };
}

function createRuntimeState(
  overrides: Partial<ComposerContextRuntimeState> = {},
): ComposerContextRuntimeState {
  return {
    draftContextItems: [],
    focusContextPreview: null,
    ...overrides,
  };
}

function createHarness(options: {
  activeView?: MarkdownView | null;
  currentNoteItem?: PromptContextItem | null;
} = {}) {
  const runtimes = new Map<TabId, ComposerContextRuntimeState>([
    ['tab-1' as TabId, createRuntimeState()],
  ]);
  let currentConversationNotePath: string | null = null;
  const activeView = options.activeView ?? null;

  const viewHost: Mocked<ComposerContextViewHost> = {
    getActiveTabId: jest.fn().mockReturnValue('tab-1' as TabId),
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimes.get(tabId) ?? null : null)),
    getCurrentConversationNotePath: jest.fn(() => currentConversationNotePath),
    setCurrentConversationNotePath: jest.fn((path) => {
      currentConversationNotePath = path;
    }),
    getActiveMarkdownView: jest.fn(() => activeView),
    isComposerInteractionFocused: jest.fn().mockReturnValue(false),
    getInputContainer: jest.fn().mockReturnValue(null),
    registerEvent: jest.fn(),
    registerDomEvent: jest.fn(),
  };
  const app = {
    workspace: {
      getActiveViewOfType: jest.fn().mockReturnValue(null),
      getLeavesOfType: jest.fn().mockReturnValue([]),
    },
  } as unknown as App;
  const contextAttachmentBuilder = {
    buildCurrentNoteContextItem: jest.fn(async () => options.currentNoteItem ?? null),
    buildSelectionContextItem: jest.fn(async () => null),
    buildFileContextItem: jest.fn(async () => null),
    buildFileContextItemFromPath: jest.fn(async () => null),
    buildSelectionContextItemFromPreview: jest.fn(() => null),
    hasFileAtPath: jest.fn().mockReturnValue(true),
  };
  const contextFileCatalogService = {
    getCatalog: jest.fn(async () => ({
      entries: [],
      extensions: [],
    })),
    handleCreate: jest.fn(),
    handleDelete: jest.fn(),
    handleRename: jest.fn(),
  };

  const services = createComposerContextServices({
    app,
    contextAttachmentBuilder,
    contextFileCatalogService,
    viewHost,
  });

  return {
    services,
    viewHost,
    contextAttachmentBuilder,
    getCurrentConversationNotePath: () => currentConversationNotePath,
  };
}

describe('ComposerContextHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wires current-note context actions through the shared runtime store and coordinator render bridge', async () => {
    const activeView = { file: { path: 'notes/current.md' } } as unknown as MarkdownView;
    const currentNoteItem = createContextItem({
      kind: 'current_note',
      path: 'notes/current.md',
      label: 'notes/current.md',
    });
    const { services, viewHost, contextAttachmentBuilder } = createHarness({
      activeView,
      currentNoteItem,
    });
    const renderSpy = jest.spyOn(services.coordinator, 'render').mockImplementation(() => {});

    const result = await services.actionService.addCurrentNoteContextFromActiveEditor();

    expect(result).toBe(true);
    expect(viewHost.getActiveMarkdownView).toHaveBeenCalledTimes(1);
    expect(contextAttachmentBuilder.buildCurrentNoteContextItem).toHaveBeenCalledWith(activeView);
    expect(services.runtimeStore.getDraftContextItems()).toEqual([currentNoteItem]);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('wires file-open preview updates through the current-conversation note host', () => {
    jest.useFakeTimers();

    try {
      const {
        services,
        viewHost,
        getCurrentConversationNotePath,
      } = createHarness();

      services.focusContextPreviewCoordinator.handleFileOpen('notes/active.md');

      expect(viewHost.setCurrentConversationNotePath).toHaveBeenCalledWith('notes/active.md');
      expect(getCurrentConversationNotePath()).toBe('notes/active.md');
      expect(jest.getTimerCount()).toBe(1);

      services.focusContextRuntimeService.dispose();

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
