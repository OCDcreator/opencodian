import type { Editor } from 'obsidian';
import { MarkdownView, TFile } from 'obsidian';

jest.mock('../../../../src/utils/editorSelectionHighlight', () => ({
  hideSelectionHighlight: jest.fn(),
  showSelectionHighlight: jest.fn(),
}));

import type { FocusContextPreview } from '../../../../src/features/chat/composerContext';
import {
  RetainedSelectionHighlightService,
  type RetainedSelectionHighlightServiceHost,
} from '../../../../src/features/chat/services/RetainedSelectionHighlightService';
import {
  hideSelectionHighlight,
  showSelectionHighlight,
} from '../../../../src/utils/editorSelectionHighlight';

function createFile(path: string): TFile {
  const file = new TFile();
  const name = path.split('/').pop() ?? path;
  const dotIndex = name.lastIndexOf('.');
  file.path = path;
  file.name = name;
  file.basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  file.extension = dotIndex > 0 ? name.slice(dotIndex + 1) : '';
  return file;
}

function createMarkdownView(
  path: string,
  editor?: Editor | null,
): MarkdownView & { file: TFile; editor: Editor | null } {
  const view = new MarkdownView() as MarkdownView & { file: TFile; editor: Editor | null };
  view.file = createFile(path);
  view.editor = editor ?? null;
  return view;
}

function createEditor(options: {
  fromOffset?: number;
  toOffset?: number;
} = {}): Editor & { cm?: unknown } {
  const {
    fromOffset = 0,
    toOffset = 0,
  } = options;
  return {
    getCursor: jest.fn((which: 'from' | 'to') => (
      which === 'from'
        ? { line: 0, ch: 0 }
        : { line: 0, ch: 4 }
    )),
    posToOffset: jest.fn((position: { line: number; ch: number }) => (
      position.ch === 0 ? fromOffset : toOffset
    )),
    cm: {
      state: {
        selection: {
          main: {
            empty: false,
            from: fromOffset,
            to: toOffset,
          },
        },
      },
    },
  } as unknown as Editor & { cm?: unknown };
}

function createSelectionPreview(path: string): FocusContextPreview {
  return {
    kind: 'selection',
    path,
    label: path,
    lineRange: { startLine: 2, endLine: 4 },
    textSnapshot: 'Selected text',
  };
}

function createHarness(options: {
  focusPreview?: FocusContextPreview | null;
  composerFocused?: boolean;
} = {}) {
  let focusPreview = options.focusPreview ?? null;
  let composerFocused = options.composerFocused ?? false;
  const host: RetainedSelectionHighlightServiceHost = {
    getFocusContextPreview: () => focusPreview,
    isComposerInteractionFocused: () => composerFocused,
  };

  return {
    service: new RetainedSelectionHighlightService(host),
    setFocusPreview: (preview: FocusContextPreview | null) => {
      focusPreview = preview;
    },
    setComposerFocused: (value: boolean) => {
      composerFocused = value;
    },
  };
}

describe('RetainedSelectionHighlightService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the retained-preview grace window during composer pointer handoff', () => {
    const { service } = createHarness({
      composerFocused: false,
    });

    expect(service.shouldRetainPreviewDuringTransition()).toBe(false);

    service.markInputHandoff();

    expect(service.shouldRetainPreviewDuringTransition()).toBe(true);

    service.clearInputHandoff();

    expect(service.shouldRetainPreviewDuringTransition()).toBe(false);
  });

  it('shows and clears the retained CodeMirror highlight as composer focus changes', () => {
    const editor = createEditor({ fromOffset: 15, toOffset: 42 });
    const view = createMarkdownView('notes/focused.md', editor);
    const preview = createSelectionPreview('notes/focused.md');
    const { service, setComposerFocused, setFocusPreview } = createHarness({
      composerFocused: true,
      focusPreview: preview,
    });

    service.syncFromPreview(preview, view, editor);

    expect(showSelectionHighlight).toHaveBeenCalledWith(editor.cm, 15, 42);
    expect(hideSelectionHighlight).not.toHaveBeenCalled();

    setComposerFocused(false);
    setFocusPreview(preview);
    service.refreshHighlight();

    expect(hideSelectionHighlight).toHaveBeenCalledWith(editor.cm);
  });
});
