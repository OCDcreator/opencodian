import type { Editor, MarkdownView } from 'obsidian';

import {
  RetainedSelectionRuntimeCoordinator,
  type RetainedSelectionRuntimeCoordinatorHost,
} from '../../../../src/features/chat/services/RetainedSelectionRuntimeCoordinator';

function createHarness() {
  const editor = { id: 'editor' } as unknown as Editor;
  const view = { editor } as MarkdownView;
  const host: jest.Mocked<RetainedSelectionRuntimeCoordinatorHost> = {
    getFocusContextPreview: jest.fn(() => null),
    isComposerInteractionFocused: jest.fn(() => false),
    getActiveMarkdownView: jest.fn(() => view),
    refreshActiveFocusContextPreview: jest.fn(),
  };
  const coordinator = new RetainedSelectionRuntimeCoordinator(host);

  return {
    coordinator,
    editor,
    host,
    view,
  };
}

describe('RetainedSelectionRuntimeCoordinator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('polls the active editor until disposed without double-registering intervals', () => {
    const { coordinator, host, view, editor } = createHarness();

    coordinator.startPolling();
    coordinator.startPolling();
    jest.advanceTimersByTime(250);

    expect(host.refreshActiveFocusContextPreview).toHaveBeenCalledTimes(2);
    expect(host.refreshActiveFocusContextPreview).toHaveBeenNthCalledWith(1, view, editor);
    expect(host.refreshActiveFocusContextPreview).toHaveBeenNthCalledWith(2, view, editor);

    coordinator.dispose();
    jest.advanceTimersByTime(250);

    expect(host.refreshActiveFocusContextPreview).toHaveBeenCalledTimes(2);
  });

  it('primes the active editor and enables handoff retention on composer pointer down', () => {
    const { coordinator, host, view, editor } = createHarness();

    coordinator.handleComposerPointerDown();

    expect(host.refreshActiveFocusContextPreview).toHaveBeenCalledWith(view, editor);
    expect(coordinator.shouldRetainPreviewDuringTransition()).toBe(true);
  });

  it('refreshes immediately on focus in and defers focus out refresh', () => {
    const { coordinator, host } = createHarness();

    coordinator.handleComposerFocusIn();
    coordinator.handleComposerFocusOut();

    expect(host.refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);

    jest.runOnlyPendingTimers();

    expect(host.refreshActiveFocusContextPreview).toHaveBeenCalledTimes(2);
  });
});
