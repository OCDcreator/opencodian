import type { PromptContextItem } from '../../../../src/core/types';
import {
  createFocusContextPreview,
  type FocusContextPreview,
} from '../../../../src/features/chat/composerContext';
import {
  ComposerContextChipActionService,
  type ComposerContextChipActionServiceHost,
} from '../../../../src/features/chat/services/ComposerContextChipActionService';

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
  focusPreview?: FocusContextPreview | null;
  selectionContextItem?: PromptContextItem | null;
  fileContextItem?: PromptContextItem | null;
  hasFileAtPath?: boolean;
} = {}) {
  let focusPreview = options.focusPreview ?? null;
  const addDraftContextItem = jest.fn();
  const removeDraftContextItemsForTarget = jest.fn();
  const refreshActiveFocusContextPreview = jest.fn();

  const host: ComposerContextChipActionServiceHost = {
    getFocusContextPreview: () => focusPreview,
    addDraftContextItem,
    removeDraftContextItemsForTarget,
    refreshActiveFocusContextPreview,
  };

  const contextAttachmentBuilder = {
    buildSelectionContextItemFromPreview: jest.fn(() => options.selectionContextItem ?? null),
    buildFileContextItemFromPath: jest.fn(async () => options.fileContextItem ?? null),
    hasFileAtPath: jest.fn(() => options.hasFileAtPath ?? true),
  };

  const chipActionService = new ComposerContextChipActionService(contextAttachmentBuilder, host);

  return {
    chipActionService,
    addDraftContextItem,
    removeDraftContextItemsForTarget,
    refreshActiveFocusContextPreview,
    contextAttachmentBuilder,
    setFocusPreview: (preview: FocusContextPreview | null) => {
      focusPreview = preview;
    },
  };
}

describe('ComposerContextChipActionService', () => {
  it('attaches a selection preview on click', async () => {
    const selectionPreview = createFocusContextPreview('notes/A.md', {
      startLine: 12,
      endLine: 18,
    }, 'Selected paragraph');
    const contextItem = createContextItem({
      id: 'selection-context',
      kind: 'selection',
      label: 'A.md:12-18',
      lineRange: selectionPreview.lineRange,
      textSnapshot: selectionPreview.textSnapshot,
    });
    const {
      chipActionService,
      addDraftContextItem,
      contextAttachmentBuilder,
    } = createHarness({
      focusPreview: selectionPreview,
      selectionContextItem: contextItem,
    });

    await chipActionService.handleChipClick({
      key: 'notes/A.md:12-18',
      kind: 'selection',
      path: 'notes/A.md',
      label: 'A.md:12-18',
      lineRange: selectionPreview.lineRange,
      attached: false,
      preview: true,
    });

    expect(contextAttachmentBuilder.buildSelectionContextItemFromPreview).toHaveBeenCalledWith(selectionPreview);
    expect(addDraftContextItem).toHaveBeenCalledWith(contextItem);
  });

  it('detaches an attached chip on click', async () => {
    const {
      chipActionService,
      removeDraftContextItemsForTarget,
    } = createHarness();

    await chipActionService.handleChipClick({
      key: 'notes/A.md:',
      kind: 'file',
      path: 'notes/A.md',
      label: 'A.md',
      attached: true,
      preview: false,
    });

    expect(removeDraftContextItemsForTarget).toHaveBeenCalledWith(expect.objectContaining({
      path: 'notes/A.md',
    }));
  });

  it('refreshes focus preview instead of attaching a stale preview chip', async () => {
    const stalePreview = createFocusContextPreview('notes/A.md');
    const {
      chipActionService,
      refreshActiveFocusContextPreview,
      contextAttachmentBuilder,
      setFocusPreview,
    } = createHarness({
      focusPreview: stalePreview,
      selectionContextItem: createContextItem(),
    });

    setFocusPreview(createFocusContextPreview('notes/B.md'));

    await chipActionService.handleChipClick({
      key: 'notes/A.md:',
      kind: 'current_note',
      path: 'notes/A.md',
      label: 'A.md',
      attached: false,
      preview: true,
    });

    expect(refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);
    expect(contextAttachmentBuilder.buildSelectionContextItemFromPreview).not.toHaveBeenCalled();
    expect(contextAttachmentBuilder.buildFileContextItemFromPath).not.toHaveBeenCalled();
  });

  it('refreshes focus preview when file preview attachment can no longer resolve its file', async () => {
    const filePreview = createFocusContextPreview('notes/missing.md');
    const {
      chipActionService,
      refreshActiveFocusContextPreview,
      contextAttachmentBuilder,
    } = createHarness({
      focusPreview: filePreview,
      hasFileAtPath: false,
    });

    await chipActionService.handleChipClick({
      key: 'notes/missing.md:',
      kind: 'current_note',
      path: 'notes/missing.md',
      label: 'missing.md',
      attached: false,
      preview: true,
    });

    expect(contextAttachmentBuilder.buildFileContextItemFromPath).toHaveBeenCalledWith(
      'notes/missing.md',
      'current_note',
    );
    expect(refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);
  });
});
