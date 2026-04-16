import type { PromptContextItem } from '../../../../src/core/types';
import {
  buildComposerContextChipStates,
  type ComposerContextChipState,
  createFocusContextPreview,
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
  chipStates?: ComposerContextChipState[];
} = {}) {
  let chipStates = [...(options.chipStates ?? [])];
  const chipActionService = {
    handleChipClick: jest.fn(async () => undefined),
  };

  const host: ComposerContextCoordinatorHost = {
    getContextChipStates: () => chipStates,
  };

  const coordinator = new ComposerContextCoordinator(host, chipActionService);
  const rowEl = document.createElement('div');
  coordinator.setContextRowElement(rowEl);

  return {
    coordinator,
    rowEl,
    chipActionService,
    setChipStates: (nextChipStates: ComposerContextChipState[]) => {
      chipStates = [...nextChipStates];
    },
  };
}

describe('ComposerContextCoordinator', () => {
  it('renders preview chips and delegates click handling to the chip action service', () => {
    const selectionPreview = createFocusContextPreview('notes/A.md', {
      startLine: 12,
      endLine: 18,
    }, 'Selected paragraph');
    const {
      rowEl,
      chipActionService,
    } = createHarness({
      chipStates: buildComposerContextChipStates([], selectionPreview),
    });

    const chipEl = rowEl.querySelector('button');
    expect(chipEl).not.toBeNull();
    expect(chipEl?.textContent).toBe('A.md:12-18');
    expect(chipEl?.classList.contains('is-preview')).toBe(true);

    chipEl?.click();

    expect(chipActionService.handleChipClick).toHaveBeenCalledWith(expect.objectContaining({
      key: 'notes/A.md:12-18',
      path: 'notes/A.md',
      preview: true,
    }));
  });

  it('renders attached chips from draft context items', () => {
    const attachedItem = createContextItem({
      id: 'context-file',
      kind: 'file',
    });
    const { rowEl } = createHarness({
      chipStates: buildComposerContextChipStates([attachedItem], null),
    });

    const chipEl = rowEl.querySelector('button');
    expect(chipEl?.classList.contains('is-attached')).toBe(true);
    expect(chipEl?.classList.contains('is-preview')).toBe(false);
    expect(chipEl?.getAttribute('aria-pressed')).toBe('true');
  });

  it('rerenders when draft items or the focus preview change', () => {
    const attachedItem = createContextItem({
      id: 'context-selection',
      kind: 'selection',
      label: 'A.md:1-2',
      lineRange: { startLine: 1, endLine: 2 },
      textSnapshot: 'Selected text',
    });
    const {
      coordinator,
      rowEl,
      setChipStates,
    } = createHarness();

    expect(rowEl.classList.contains('is-empty')).toBe(true);

    setChipStates(
      buildComposerContextChipStates(
        [attachedItem],
        createFocusContextPreview('notes/B.md'),
      ),
    );
    coordinator.render();

    const chipLabels = Array.from(rowEl.querySelectorAll('button')).map((chip) => chip.textContent);
    expect(chipLabels).toEqual(['B.md', 'A.md:1-2']);
    expect(rowEl.classList.contains('is-empty')).toBe(false);
  });
});
