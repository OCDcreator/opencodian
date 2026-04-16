import type { App, MarkdownView, TFile } from 'obsidian';

import type { PromptContextItem } from '../../../../src/core/types';
import type { ComposerContextRuntimeState } from '../../../../src/features/chat/services/ComposerContextRuntimeStore';
import {
  type ComposerContextViewHost,
  createComposerContextServices,
  type FocusContextPreviewWritebackHost,
  type FocusContextRuntimeViewHost,
} from '../../../../src/features/chat/services/ComposerContextViewFacade';
import type { TabId } from '../../../../src/features/chat/tabs';
import { chooseContextFile } from '../../../../src/features/chat/ui/ContextFilePickerModal';

jest.mock('../../../../src/features/chat/ui/ContextFilePickerModal', () => ({
  chooseContextFile: jest.fn(),
}));

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
  fileItem?: PromptContextItem | null;
} = {}) {
  const runtimes = new Map<TabId, ComposerContextRuntimeState>([
    ['tab-1' as TabId, createRuntimeState()],
  ]);
  let currentConversationNotePath: string | null = null;
  const activeView = options.activeView ?? null;

  const viewHost: Mocked<ComposerContextViewHost> = {
    getActiveTabId: jest.fn().mockReturnValue('tab-1' as TabId),
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimes.get(tabId) ?? null : null)),
    getActiveMarkdownView: jest.fn(() => activeView),
    getInputContainer: jest.fn().mockReturnValue(null),
    registerEvent: jest.fn(),
    registerDomEvent: jest.fn(),
  };
  const focusRuntimeViewHost: Mocked<FocusContextRuntimeViewHost> = {
    getCurrentConversationNotePath: jest.fn(() => currentConversationNotePath),
    isComposerInteractionFocused: jest.fn().mockReturnValue(false),
  };
  const focusPreviewWritebackHost: Mocked<FocusContextPreviewWritebackHost> = {
    setCurrentConversationNotePath: jest.fn((path) => {
      currentConversationNotePath = path;
    }),
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
    buildFileContextItem: jest.fn(async () => options.fileItem ?? null),
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
    focusRuntimeViewHost,
    focusPreviewWritebackHost,
  });

  return {
    services,
    viewHost,
    focusRuntimeViewHost,
    focusPreviewWritebackHost,
    contextAttachmentBuilder,
    getCurrentConversationNotePath: () => currentConversationNotePath,
  };
}

describe('ComposerContextViewFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wires current-note context actions through the shared view facade and coordinator render bridge', async () => {
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
    const contextRowEl = document.createElement('div');
    services.viewFacade.setContextRowElement(contextRowEl);

    const result = await services.viewFacade.addCurrentNoteContextFromActiveEditor();

    expect(result).toBe(true);
    expect(viewHost.getActiveMarkdownView).toHaveBeenCalledTimes(1);
    expect(contextAttachmentBuilder.buildCurrentNoteContextItem).toHaveBeenCalledWith(activeView);
    expect(services.viewFacade.sendContext.getDraftContextItems()).toEqual([currentNoteItem]);
    expect(contextRowEl.querySelectorAll('.opencodian-composer-context-chip')).toHaveLength(1);
    expect(contextRowEl.textContent).toContain('notes/current.md');
  });

  it('wires file-open preview updates through the current-conversation note host', () => {
    jest.useFakeTimers();

    try {
      const {
        services,
        focusPreviewWritebackHost,
        getCurrentConversationNotePath,
      } = createHarness();

      services.focusContextPreviewCoordinator.handleFileOpen('notes/active.md');

      expect(focusPreviewWritebackHost.setCurrentConversationNotePath).toHaveBeenCalledWith(
        'notes/active.md',
      );
      expect(getCurrentConversationNotePath()).toBe('notes/active.md');
      expect(jest.getTimerCount()).toBe(1);

      services.focusContextRuntimeService.dispose();

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('wires picker context actions through retained-selection begin/complete lifecycle hooks', async () => {
    const file = { path: 'docs/spec.md' } as TFile;
    const fileItem = createContextItem({
      path: 'docs/spec.md',
      label: 'docs/spec.md',
    });
    const chooseContextFileMock = chooseContextFile as jest.MockedFunction<typeof chooseContextFile>;
    const { services, contextAttachmentBuilder } = createHarness({
      fileItem,
    });
    const pointerDownSpy = jest.spyOn(
      services.focusContextRuntimeService,
      'handleComposerPointerDown',
    ).mockImplementation(() => {});
    const refreshSpy = jest.spyOn(
      services.focusContextPreviewCoordinator,
      'scheduleFocusContextPreviewRefresh',
    ).mockImplementation(() => {});
    chooseContextFileMock.mockResolvedValue(file);

    const result = await services.viewFacade.addChosenFileContextToActiveTab();

    expect(result).toBe(true);
    expect(pointerDownSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(contextAttachmentBuilder.buildFileContextItem).toHaveBeenCalledWith(file, 'file');
    expect(services.viewFacade.sendContext.getDraftContextItems()).toEqual([fileItem]);
  });
});
