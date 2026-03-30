import type { PromptContextItem } from '../../../../src/core/types';
import {
  buildComposerContextChipStates,
  createFocusContextPreview,
  removeDraftContextItemsByTarget,
  upsertDraftContextItem,
} from '../../../../src/features/chat/composerContext';

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

describe('composerContext helpers', () => {
  it('shows a file preview chip when there is no selection', () => {
    const preview = createFocusContextPreview('notes/A.md');
    const chips = buildComposerContextChipStates([], preview);

    expect(chips).toEqual([
      expect.objectContaining({
        label: 'A.md',
        attached: false,
        preview: true,
      }),
    ]);
  });

  it('shows a line-based preview chip when there is a selection', () => {
    const preview = createFocusContextPreview('notes/A.md', {
      startLine: 155,
      endLine: 155,
    });
    const chips = buildComposerContextChipStates([], preview);

    expect(chips).toEqual([
      expect.objectContaining({
        label: 'A.md:155',
        attached: false,
        preview: true,
      }),
    ]);
  });

  it('dedupes same-target file and current-note attachments into one chip', () => {
    const currentNoteItem = createContextItem({
      id: 'context-note',
      kind: 'current_note',
    });
    const fileItem = createContextItem({
      id: 'context-file',
      kind: 'file',
    });

    const attachedItems = upsertDraftContextItem([currentNoteItem], fileItem);
    const chips = buildComposerContextChipStates(
      attachedItems,
      createFocusContextPreview('notes/A.md'),
    );

    expect(attachedItems).toEqual([fileItem]);
    expect(chips).toEqual([
      expect.objectContaining({
        label: 'A.md',
        attached: true,
        preview: false,
        kind: 'file',
      }),
    ]);
  });

  it('keeps an attached selection while showing the new focus preview first', () => {
    const attachedSelection = createContextItem({
      id: 'context-selection-155',
      kind: 'selection',
      label: 'A.md:155',
      lineRange: {
        startLine: 155,
        endLine: 155,
      },
      textSnapshot: 'line 155',
    });

    const chips = buildComposerContextChipStates(
      [attachedSelection],
      createFocusContextPreview('notes/A.md', {
        startLine: 200,
        endLine: 200,
      }),
    );

    expect(chips).toEqual([
      expect.objectContaining({
        label: 'A.md:200',
        attached: false,
        preview: true,
      }),
      expect.objectContaining({
        label: 'A.md:155',
        attached: true,
        preview: false,
      }),
    ]);
  });

  it('falls back to a preview chip after detaching the currently focused attachment', () => {
    const attachedFile = createContextItem({
      id: 'context-file',
      kind: 'file',
    });

    const detachedItems = removeDraftContextItemsByTarget([attachedFile], attachedFile);
    const chips = buildComposerContextChipStates(
      detachedItems,
      createFocusContextPreview('notes/A.md'),
    );

    expect(detachedItems).toEqual([]);
    expect(chips).toEqual([
      expect.objectContaining({
        label: 'A.md',
        attached: false,
        preview: true,
      }),
    ]);
  });
});
