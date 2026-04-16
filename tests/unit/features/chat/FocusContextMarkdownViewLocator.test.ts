import type { App } from 'obsidian';
import { MarkdownView, TFile } from 'obsidian';

import {
  FocusContextMarkdownViewLocator,
  type FocusContextMarkdownViewLocatorHost,
} from '../../../../src/features/chat/services/FocusContextMarkdownViewLocator';

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

function createMarkdownView(path: string): MarkdownView & { file: TFile } {
  const view = new MarkdownView() as MarkdownView & { file: TFile };
  view.file = createFile(path);
  return view;
}

function createLocatorHarness(options: {
  activeView?: MarkdownView | null;
  markdownViews?: MarkdownView[];
  currentConversationNotePath?: string | null;
} = {}): FocusContextMarkdownViewLocator {
  const app = {
    workspace: {
      getActiveViewOfType: jest.fn(() => options.activeView ?? null),
      getLeavesOfType: jest.fn(() => (options.markdownViews ?? []).map((view) => ({ view }))),
    },
  } as unknown as App;
  const host: FocusContextMarkdownViewLocatorHost = {
    getCurrentConversationNotePath: () => options.currentConversationNotePath ?? null,
  };

  return new FocusContextMarkdownViewLocator(app, host);
}

describe('FocusContextMarkdownViewLocator', () => {
  it('prefers the active markdown view and supports remembering a path', () => {
    const activeView = createMarkdownView('notes/active.md');
    const locator = createLocatorHarness({
      activeView,
      markdownViews: [createMarkdownView('notes/other.md')],
      currentConversationNotePath: 'notes/preferred.md',
    });

    expect(locator.getActiveMarkdownView()).toBe(activeView);

    const fallbackLocator = createLocatorHarness({
      activeView: null,
      markdownViews: [createMarkdownView('notes/other.md'), activeView],
      currentConversationNotePath: 'notes/preferred.md',
    });
    fallbackLocator.rememberMarkdownFilePath('notes/active.md');

    expect(fallbackLocator.getActiveMarkdownView()).toBe(activeView);
  });

  it('prefers the remembered path before the conversation note fallback', () => {
    const rememberedView = createMarkdownView('notes/remembered.md');
    const noteView = createMarkdownView('notes/preferred.md');
    const locator = createLocatorHarness({
      activeView: null,
      markdownViews: [noteView, rememberedView],
      currentConversationNotePath: 'notes/preferred.md',
    });
    locator.rememberMarkdownFilePath('notes/remembered.md');

    expect(locator.getActiveMarkdownView()).toBe(rememberedView);
  });

  it('falls back to the conversation note, then to the first markdown leaf', () => {
    const noteView = createMarkdownView('notes/preferred.md');
    const otherView = createMarkdownView('notes/other.md');
    const locator = createLocatorHarness({
      activeView: null,
      markdownViews: [otherView, noteView],
      currentConversationNotePath: 'notes/preferred.md',
    });

    expect(locator.getActiveMarkdownView()).toBe(noteView);

    const firstLeafLocator = createLocatorHarness({
      activeView: null,
      markdownViews: [otherView],
      currentConversationNotePath: 'notes/missing.md',
    });

    expect(firstLeafLocator.getActiveMarkdownView()).toBe(otherView);
  });
});
