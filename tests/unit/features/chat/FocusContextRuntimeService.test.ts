import type { App, Editor } from 'obsidian';
import { MarkdownView, TFile } from 'obsidian';

jest.mock('../../../../src/utils/editorSelectionHighlight', () => ({
  hideSelectionHighlight: jest.fn(),
  showSelectionHighlight: jest.fn(),
}));

import type { FocusContextPreview } from '../../../../src/features/chat/composerContext';
import {
  FocusContextRuntimeService,
  type FocusContextRuntimeServiceHost,
} from '../../../../src/features/chat/services/FocusContextRuntimeService';
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
  selection?: string;
  fromLine?: number;
  toLine?: number;
  fromOffset?: number;
  toOffset?: number;
} = {}): Editor & { cm?: unknown } {
  const {
    selection = '',
    fromLine = 0,
    toLine = fromLine,
    fromOffset = 0,
    toOffset = 0,
  } = options;
  const state = {
    selectionText: selection,
    fromLine,
    toLine,
    fromOffset,
    toOffset,
  };
  const editor = {
    getSelection: jest.fn(() => state.selectionText),
    getCursor: jest.fn((which: 'from' | 'to') => (
      which === 'from'
        ? { line: state.fromLine, ch: 0 }
        : { line: state.toLine, ch: 0 }
    )),
    posToOffset: jest.fn((position: { line: number; ch: number }) => (
      position.line === state.fromLine ? state.fromOffset : state.toOffset
    )),
    cm: {
      state: {
        selection: {
          main: {
            empty: false,
            from: state.fromOffset,
            to: state.toOffset,
          },
        },
      },
    },
  } as unknown as Editor & { cm?: unknown };

  Object.defineProperty(editor, '__state', {
    value: state,
    enumerable: false,
  });

  return editor;
}

function createServiceHarness(options: {
  activeView?: MarkdownView | null;
  markdownViews?: MarkdownView[];
  currentConversationNotePath?: string | null;
  composerFocused?: boolean;
  focusPreview?: FocusContextPreview | null;
} = {}): {
  service: FocusContextRuntimeService;
  getFocusPreview: () => FocusContextPreview | null;
  setComposerFocused: (value: boolean) => void;
} {
  let focusContextPreview = options.focusPreview ?? null;
  let composerFocused = options.composerFocused ?? false;
  const app = {
    workspace: {
      getActiveViewOfType: jest.fn(() => options.activeView ?? null),
      getLeavesOfType: jest.fn(() => (options.markdownViews ?? []).map((view) => ({ view }))),
    },
  } as unknown as App;
  const host: FocusContextRuntimeServiceHost = {
    getCurrentConversationNotePath: () => options.currentConversationNotePath ?? null,
    getFocusContextPreview: () => focusContextPreview,
    setFocusContextPreview: (preview) => {
      focusContextPreview = preview;
    },
    isComposerInteractionFocused: () => composerFocused,
  };

  return {
    service: new FocusContextRuntimeService(app, host),
    getFocusPreview: () => focusContextPreview,
    setComposerFocused: (value) => {
      composerFocused = value;
    },
  };
}

describe('FocusContextRuntimeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers the conversation note when resolving an active markdown view fallback', () => {
    const preferredView = createMarkdownView('notes/preferred.md');
    const otherView = createMarkdownView('notes/other.md');
    const { service } = createServiceHarness({
      activeView: null,
      markdownViews: [otherView, preferredView],
      currentConversationNotePath: 'notes/preferred.md',
    });

    expect(service.getActiveMarkdownView()).toBe(preferredView);
  });

  it('retains the previous selection preview during composer pointer handoff', () => {
    const editor = createEditor({
      selection: 'Selected paragraph',
      fromLine: 11,
      toLine: 17,
      fromOffset: 120,
      toOffset: 240,
    });
    const view = createMarkdownView('notes/alpha.md', editor);
    const { service, getFocusPreview } = createServiceHarness({
      activeView: view,
      markdownViews: [view],
    });

    service.refreshActiveFocusContextPreview(view, editor);
    const initialPreview = getFocusPreview();
    expect(initialPreview).toEqual(expect.objectContaining({
      kind: 'selection',
      path: 'notes/alpha.md',
      lineRange: { startLine: 12, endLine: 18 },
      textSnapshot: 'Selected paragraph',
    }));

    service.handleComposerPointerDown();
    (editor.getSelection as jest.Mock).mockReturnValue('');

    service.refreshActiveFocusContextPreview(view, editor);

    expect(getFocusPreview()).toEqual(initialPreview);
  });

  it('shows the retained CodeMirror highlight while the composer stays focused', () => {
    const editor = createEditor({
      selection: 'Focused selection',
      fromLine: 2,
      toLine: 4,
      fromOffset: 15,
      toOffset: 42,
    });
    const editorView = editor.cm;
    const view = createMarkdownView('notes/focused.md', editor);
    const { service } = createServiceHarness({
      activeView: view,
      markdownViews: [view],
      composerFocused: true,
    });

    service.refreshActiveFocusContextPreview(view, editor);

    expect(showSelectionHighlight).toHaveBeenCalledWith(editorView, 15, 42);
    expect(hideSelectionHighlight).not.toHaveBeenCalled();
  });
});
