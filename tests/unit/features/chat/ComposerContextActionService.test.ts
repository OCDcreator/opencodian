import type { App, Editor, MarkdownView, TFile } from 'obsidian';

import type { PromptContextItem } from '../../../../src/core/types';
import {
  ComposerContextActionService,
  type ComposerContextActionServiceHost,
} from '../../../../src/features/chat/services/ComposerContextActionService';
import { chooseContextFile } from '../../../../src/features/chat/ui/ContextFilePickerModal';

jest.mock('../../../../src/features/chat/ui/ContextFilePickerModal', () => ({
  chooseContextFile: jest.fn(),
}));

function createContextItem(overrides: Partial<PromptContextItem> = {}): PromptContextItem {
  return {
    id: overrides.id ?? 'context-1',
    kind: overrides.kind ?? 'file',
    path: overrides.path ?? 'notes/A.md',
    label: overrides.label ?? 'A.md',
    mime: overrides.mime ?? 'text/markdown',
    lineRange: overrides.lineRange,
    textSnapshot: overrides.textSnapshot,
  };
}

function createHarness(options: {
  activeView?: MarkdownView | null;
  currentNoteItem?: PromptContextItem | null;
  selectionItem?: PromptContextItem | null;
  fileItem?: PromptContextItem | null;
} = {}) {
  const app = {} as App;
  const activeView = options.activeView ?? null;
  const addDraftContextItem = jest.fn();

  const host: ComposerContextActionServiceHost = {
    getActiveMarkdownView: () => activeView,
    addDraftContextItem,
  };

  const contextAttachmentBuilder = {
    buildCurrentNoteContextItem: jest.fn(async () => options.currentNoteItem ?? null),
    buildSelectionContextItem: jest.fn(async () => options.selectionItem ?? null),
    buildFileContextItem: jest.fn(async () => options.fileItem ?? null),
  };

  const contextFileCatalogService = {
    getCatalog: jest.fn(async () => ({
      entries: [],
      extensions: [],
    })),
  };

  const service = new ComposerContextActionService(
    app,
    contextAttachmentBuilder,
    contextFileCatalogService,
    host,
  );

  return {
    service,
    app,
    addDraftContextItem,
    contextAttachmentBuilder,
    contextFileCatalogService,
  };
}

describe('ComposerContextActionService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('adds the current note context from the active markdown view when no view is provided', async () => {
    const activeView = { file: { path: 'notes/current.md' } } as unknown as MarkdownView;
    const currentNoteItem = createContextItem({ kind: 'current_note', path: 'notes/current.md' });
    const {
      service,
      addDraftContextItem,
      contextAttachmentBuilder,
    } = createHarness({
      activeView,
      currentNoteItem,
    });

    const result = await service.addCurrentNoteContextFromActiveEditor();

    expect(result).toBe(true);
    expect(contextAttachmentBuilder.buildCurrentNoteContextItem).toHaveBeenCalledWith(activeView);
    expect(addDraftContextItem).toHaveBeenCalledWith(currentNoteItem);
  });

  it('falls back to the active view editor for selection context actions', async () => {
    const activeEditor = { getSelection: jest.fn() } as unknown as Editor;
    const activeView = { editor: activeEditor } as unknown as MarkdownView;
    const selectionItem = createContextItem({
      kind: 'selection',
      lineRange: { startLine: 3, endLine: 5 },
    });
    const {
      service,
      addDraftContextItem,
      contextAttachmentBuilder,
    } = createHarness({
      activeView,
      selectionItem,
    });

    const result = await service.addSelectionContextFromActiveEditor();

    expect(result).toBe(true);
    expect(contextAttachmentBuilder.buildSelectionContextItem).toHaveBeenCalledWith(activeEditor, activeView);
    expect(addDraftContextItem).toHaveBeenCalledWith(selectionItem);
  });

  it('opens the file picker, loads the catalog, and attaches the chosen file context', async () => {
    const file = { path: 'docs/spec.md' } as TFile;
    const fileItem = createContextItem({ path: 'docs/spec.md' });
    const chooseContextFileMock = chooseContextFile as jest.MockedFunction<typeof chooseContextFile>;
    const {
      service,
      app,
      addDraftContextItem,
      contextAttachmentBuilder,
      contextFileCatalogService,
    } = createHarness({
      fileItem,
    });

    chooseContextFileMock.mockImplementation(async (actualApp, loadCatalog) => {
      expect(actualApp).toBe(app);
      await loadCatalog();
      return file;
    });

    const result = await service.addChosenFileContextToActiveTab();

    expect(result).toBe(true);
    expect(contextFileCatalogService.getCatalog).toHaveBeenCalledTimes(1);
    expect(contextAttachmentBuilder.buildFileContextItem).toHaveBeenCalledWith(file, 'file');
    expect(addDraftContextItem).toHaveBeenCalledWith(fileItem);
  });

  it('returns false without mutating draft context when the picker is cancelled', async () => {
    const chooseContextFileMock = chooseContextFile as jest.MockedFunction<typeof chooseContextFile>;
    const { service, addDraftContextItem, contextAttachmentBuilder } = createHarness();
    chooseContextFileMock.mockResolvedValue(null);

    const result = await service.addChosenFileContextToActiveTab();

    expect(result).toBe(false);
    expect(contextAttachmentBuilder.buildFileContextItem).not.toHaveBeenCalled();
    expect(addDraftContextItem).not.toHaveBeenCalled();
  });
});
