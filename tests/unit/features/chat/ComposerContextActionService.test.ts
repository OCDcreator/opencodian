import type { Editor, MarkdownView } from 'obsidian';

import type { PromptContextItem } from '../../../../src/core/types';
import {
  ComposerContextActionService,
  type ComposerContextActionServiceHost,
} from '../../../../src/features/chat/services/ComposerContextActionService';

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

  const service = new ComposerContextActionService(
    contextAttachmentBuilder,
    host,
  );

  return {
    service,
    addDraftContextItem,
    contextAttachmentBuilder,
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
});
