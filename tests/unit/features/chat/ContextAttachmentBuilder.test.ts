import type { App, Editor } from 'obsidian';
import * as obsidian from 'obsidian';
import { MarkdownView, TFile } from 'obsidian';
import { TextEncoder } from 'util';

import type { ServerMode } from '../../../../src/core/types/settings';
import type { FocusContextPreview } from '../../../../src/features/chat/composerContext';
import {
  ContextAttachmentBuilder,
  REMOTE_CONTEXT_TEXT_LIMIT_BYTES,
} from '../../../../src/features/chat/services/ContextAttachmentBuilder';
import { t } from '../../../../src/i18n';

global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;

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

function createBuilder(options: {
  mode?: ServerMode;
  files?: TFile[];
  fileTextByPath?: Record<string, string>;
} = {}): {
  builder: ContextAttachmentBuilder;
  read: jest.Mock<Promise<string>, [TFile]>;
  getAbstractFileByPath: jest.Mock<TFile | null, [string]>;
} {
  const {
    mode = 'local',
    files = [],
    fileTextByPath = {},
  } = options;
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const read = jest.fn(async (file: TFile) => fileTextByPath[file.path] ?? '');
  const getAbstractFileByPath = jest.fn((path: string) => filesByPath.get(path) ?? null);
  const app = {
    vault: {
      read,
      getAbstractFileByPath,
    },
  } as unknown as App;

  return {
    builder: new ContextAttachmentBuilder(app, {
      getServerMode: () => mode,
    }),
    read,
    getAbstractFileByPath,
  };
}

describe('ContextAttachmentBuilder', () => {
  beforeEach(() => {
    jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds a local current-note context item without reading file text', async () => {
    const file = createFile('notes/alpha.md');
    const { builder, read } = createBuilder({ files: [file] });
    const view = Object.assign(new MarkdownView(), { file });

    const item = await builder.buildCurrentNoteContextItem(view);

    expect(read).not.toHaveBeenCalled();
    expect(item).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^context-/),
      kind: 'current_note',
      path: 'notes/alpha.md',
      label: 'alpha.md',
      mime: 'text/markdown',
      textSnapshot: undefined,
    }));
  });

  it('builds a selection context item from the active editor selection', async () => {
    const file = createFile('notes/alpha.md');
    const editor = {
      getSelection: jest.fn(() => 'selected text'),
      getCursor: jest.fn((which: 'from' | 'to') => (
        which === 'from'
          ? { line: 2, ch: 0 }
          : { line: 4, ch: 3 }
      )),
    } as unknown as Editor;
    const view = Object.assign(new MarkdownView(), { file, editor });
    const { builder } = createBuilder({ files: [file] });

    const item = await builder.buildSelectionContextItem(editor, view);

    expect(item).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^context-/),
      kind: 'selection',
      path: 'notes/alpha.md',
      label: 'alpha.md:3-5',
      mime: 'text/markdown',
      lineRange: { startLine: 3, endLine: 5 },
      textSnapshot: 'selected text',
    }));
  });

  it('builds a selection context item from a retained focus preview', () => {
    const file = createFile('notes/alpha.md');
    const { builder, getAbstractFileByPath } = createBuilder({ files: [file] });
    const preview: FocusContextPreview = {
      kind: 'selection',
      path: file.path,
      label: 'alpha.md:7-8',
      lineRange: { startLine: 7, endLine: 8 },
      textSnapshot: 'preview text',
    };

    const item = builder.buildSelectionContextItemFromPreview(preview);

    expect(getAbstractFileByPath).toHaveBeenCalledWith('notes/alpha.md');
    expect(item).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^context-/),
      kind: 'selection',
      path: 'notes/alpha.md',
      label: 'alpha.md:7-8',
      mime: 'text/markdown',
      lineRange: { startLine: 7, endLine: 8 },
      textSnapshot: 'preview text',
    }));
  });

  it('reads remote text files and stores the validated snapshot', async () => {
    const file = createFile('notes/alpha.md');
    const { builder, read, getAbstractFileByPath } = createBuilder({
      mode: 'remote',
      files: [file],
      fileTextByPath: {
        'notes/alpha.md': '# remote note',
      },
    });

    const item = await builder.buildFileContextItemFromPath('notes/alpha.md', 'file');

    expect(getAbstractFileByPath).toHaveBeenCalledWith('notes/alpha.md');
    expect(read).toHaveBeenCalledWith(file);
    expect(item).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^context-/),
      kind: 'file',
      path: 'notes/alpha.md',
      label: 'alpha.md',
      mime: 'text/markdown',
      textSnapshot: '# remote note',
    }));
  });

  it('rejects remote binary files before reading them', async () => {
    const file = createFile('assets/image.png');
    const noticeSpy = obsidian.Notice as unknown as jest.Mock;
    const { builder, read } = createBuilder({
      mode: 'remote',
      files: [file],
    });

    const item = await builder.buildFileContextItem(file, 'file');

    expect(item).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('chat.context.notice.binaryUnsupportedRemote'));
  });

  it('rejects remote selections whose text snapshot exceeds the byte limit', () => {
    const file = createFile('notes/alpha.md');
    const noticeSpy = obsidian.Notice as unknown as jest.Mock;
    const { builder } = createBuilder({ mode: 'remote', files: [file] });
    const preview: FocusContextPreview = {
      kind: 'selection',
      path: file.path,
      label: 'alpha.md:1',
      lineRange: { startLine: 1, endLine: 1 },
      textSnapshot: 'a'.repeat(REMOTE_CONTEXT_TEXT_LIMIT_BYTES + 1),
    };

    const item = builder.buildSelectionContextItemFromPreview(preview);

    expect(item).toBeNull();
    expect(noticeSpy).toHaveBeenCalledWith(
      t('chat.context.notice.tooLarge', { label: 'notes/alpha.md' }),
    );
  });
});
