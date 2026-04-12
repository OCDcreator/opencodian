import { MarkdownView } from 'obsidian';

import {
  FocusContextPreviewCoordinator,
  type FocusContextPreviewCoordinatorHost,
} from '../../../../src/features/chat/services/FocusContextPreviewCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createHarness() {
  const host: Mocked<FocusContextPreviewCoordinatorHost> = {
    setCurrentConversationNotePath: jest.fn(),
  };
  const focusContextRuntimeService = {
    rememberMarkdownFilePath: jest.fn(),
    refreshActiveFocusContextPreview: jest.fn(),
    scheduleFocusContextPreviewRefresh: jest.fn(),
  };
  const coordinator = new FocusContextPreviewCoordinator(host, focusContextRuntimeService);

  return {
    coordinator,
    host,
    focusContextRuntimeService,
  };
}

describe('FocusContextPreviewCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes current-note path and schedules a preview refresh on file open', () => {
    const { coordinator, host, focusContextRuntimeService } = createHarness();

    coordinator.handleFileOpen('notes/open.md');

    expect(focusContextRuntimeService.rememberMarkdownFilePath).toHaveBeenCalledWith('notes/open.md');
    expect(host.setCurrentConversationNotePath).toHaveBeenCalledWith('notes/open.md');
    expect(focusContextRuntimeService.scheduleFocusContextPreviewRefresh).toHaveBeenCalledTimes(1);
  });

  it('proxies explicit preview refresh requests to the runtime service', () => {
    const { coordinator, focusContextRuntimeService } = createHarness();
    const editor = { id: 'editor' };
    const markdownView = new MarkdownView() as MarkdownView;

    coordinator.refreshActiveFocusContextPreview(markdownView, editor as never);
    coordinator.scheduleFocusContextPreviewRefresh();

    expect(focusContextRuntimeService.refreshActiveFocusContextPreview).toHaveBeenCalledWith(
      markdownView,
      editor,
    );
    expect(focusContextRuntimeService.scheduleFocusContextPreviewRefresh).toHaveBeenCalledTimes(1);
  });
});
