import type { PromptContextItem } from '../../../../src/core/types';
import {
  createFocusContextPreview,
  type FocusContextPreview,
} from '../../../../src/features/chat/composerContext';
import {
  ComposerContextCoordinator,
  type ComposerContextCoordinatorHost,
} from '../../../../src/features/chat/services/ComposerContextCoordinator';

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
  draftContextItems?: PromptContextItem[];
  focusPreview?: FocusContextPreview | null;
  selectionContextItem?: PromptContextItem | null;
  fileContextItem?: PromptContextItem | null;
  hasFileAtPath?: boolean;
} = {}) {
  let draftContextItems = [...(options.draftContextItems ?? [])];
  let focusPreview = options.focusPreview ?? null;
  const addDraftContextItem = jest.fn((item: PromptContextItem) => {
    draftContextItems = [...draftContextItems, item];
  });
  const removeDraftContextItemsForTarget = jest.fn();
  const refreshActiveFocusContextPreview = jest.fn();

  const host: ComposerContextCoordinatorHost = {
    getDraftContextItems: () => draftContextItems,
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

  const coordinator = new ComposerContextCoordinator(contextAttachmentBuilder, host);
  const rowEl = document.createElement('div');
  coordinator.setContextRowElement(rowEl);

  return {
    coordinator,
    rowEl,
    addDraftContextItem,
    removeDraftContextItemsForTarget,
    refreshActiveFocusContextPreview,
    contextAttachmentBuilder,
    setFocusPreview: (preview: FocusContextPreview | null) => {
      focusPreview = preview;
    },
  };
}

describe('ComposerContextCoordinator', () => {
  it('renders preview chips and attaches a selection preview on click', () => {
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
      rowEl,
      addDraftContextItem,
      contextAttachmentBuilder,
    } = createHarness({
      focusPreview: selectionPreview,
      selectionContextItem: contextItem,
    });

    const chipEl = rowEl.querySelector('button');
    expect(chipEl).not.toBeNull();
    expect(chipEl?.textContent).toBe('A.md:12-18');
    expect(chipEl?.classList.contains('is-preview')).toBe(true);

    chipEl?.click();

    expect(contextAttachmentBuilder.buildSelectionContextItemFromPreview).toHaveBeenCalledWith(selectionPreview);
    expect(addDraftContextItem).toHaveBeenCalledWith(contextItem);
  });

  it('detaches an attached chip on click', () => {
    const attachedItem = createContextItem({
      id: 'context-file',
      kind: 'file',
    });
    const { rowEl, removeDraftContextItemsForTarget } = createHarness({
      draftContextItems: [attachedItem],
    });

    const chipEl = rowEl.querySelector('button');
    expect(chipEl?.classList.contains('is-attached')).toBe(true);

    chipEl?.click();

    expect(removeDraftContextItemsForTarget).toHaveBeenCalledWith(expect.objectContaining({
      path: 'notes/A.md',
    }));
  });

  it('refreshes focus preview instead of attaching a stale preview chip', () => {
    const stalePreview = createFocusContextPreview('notes/A.md');
    const {
      rowEl,
      refreshActiveFocusContextPreview,
      contextAttachmentBuilder,
      setFocusPreview,
    } = createHarness({
      focusPreview: stalePreview,
      selectionContextItem: createContextItem(),
    });

    setFocusPreview(createFocusContextPreview('notes/B.md'));

    rowEl.querySelector('button')?.click();

    expect(refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);
    expect(contextAttachmentBuilder.buildSelectionContextItemFromPreview).not.toHaveBeenCalled();
    expect(contextAttachmentBuilder.buildFileContextItemFromPath).not.toHaveBeenCalled();
  });

  it('refreshes focus preview when file preview attachment can no longer resolve its file', async () => {
    const filePreview = createFocusContextPreview('notes/missing.md');
    const {
      rowEl,
      refreshActiveFocusContextPreview,
      contextAttachmentBuilder,
    } = createHarness({
      focusPreview: filePreview,
      hasFileAtPath: false,
    });

    rowEl.querySelector('button')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(contextAttachmentBuilder.buildFileContextItemFromPath).toHaveBeenCalledWith(
      'notes/missing.md',
      'current_note',
    );
    expect(refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);
  });
});
