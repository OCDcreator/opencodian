import type { Conversation } from '../../../../src/core/types';
import { BackgroundTaskInlinePanelRenderer } from '../../../../src/features/chat/runtime/BackgroundTaskInlinePanelRenderer';
import type { BackgroundTaskSegment } from '../../../../src/features/chat/services/BackgroundTaskTimelineService';

function createSegment(anchorKey: string): BackgroundTaskSegment {
  return {
    anchorKey,
    anchorTimestamp: Date.now(),
    modeTag: 'search-mode',
    launches: [],
    completed: [],
    pending: [],
    sawAllTasksComplete: false,
    waitingForFollowUp: false,
    completionEvents: [],
  };
}

function createHarness() {
  const anchorOneBody = document.body.createDiv({ cls: 'opencodian-turn-body' });
  const anchorTwoBody = document.body.createDiv({ cls: 'opencodian-turn-body' });
  const staleBody = document.body.createDiv({ cls: 'opencodian-turn-body' });
  const stalePanel = staleBody.createDiv({ cls: 'opencodian-background-task-inline' });

  const runtime = {
    backgroundTaskIndicatorEl: stalePanel as HTMLElement | null,
    backgroundTaskInlineEls: new Map<string, HTMLElement>([
      ['stale-anchor', stalePanel],
    ]),
    turnBodyByAnchorKey: new Map<string, HTMLElement>([
      ['anchor-1', anchorOneBody],
      ['anchor-2', anchorTwoBody],
      ['stale-anchor', staleBody],
    ]),
    backgroundTaskActiveAnchorKey: 'anchor-2',
  };
  const renderMarkdownInto = jest.fn(async (container: HTMLElement, markdown: string) => {
    container.setText(`markdown:${markdown}`);
  });
  const segmentOne = createSegment('anchor-1');
  const segmentTwo = {
    ...createSegment('anchor-2'),
    launches: [{ launchId: 'launch-1', taskId: 'bg_1', description: 'Search docs' }],
    pending: [{ launchId: 'launch-1', taskId: 'bg_1', description: 'Search docs' }],
    waitingForFollowUp: true,
  };
  const timelineService = {
    collectInlineSegments: jest.fn((_conversation?: Conversation | null) => [segmentOne, segmentTwo]),
    getInlineCopy: jest.fn((segment: BackgroundTaskSegment) => (
      segment.anchorKey === 'anchor-1'
        ? {
          title: 'Preparing',
          body: 'Preparing body',
        }
        : {
          title: 'Running',
          body: 'Running body',
          detail: '1/1',
          tasksMarkdown: '- Search docs',
        }
    )),
  };
  const renderer = new BackgroundTaskInlinePanelRenderer(timelineService as never, {
    getActiveTabId: () => 'tab-1',
    getTabRuntimeState: () => runtime,
    renderMarkdownInto,
  });

  return {
    anchorOneBody,
    anchorTwoBody,
    renderer,
    renderMarkdownInto,
    runtime,
    stalePanel,
    timelineService,
  };
}

describe('BackgroundTaskInlinePanelRenderer', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders inline panels, removes stale mounts, and updates the active indicator element', async () => {
    const {
      anchorOneBody,
      anchorTwoBody,
      renderer,
      renderMarkdownInto,
      runtime,
      stalePanel,
      timelineService,
    } = createHarness();

    await renderer.render({ messages: [] } as Conversation, 'tab-1');

    expect(timelineService.collectInlineSegments).toHaveBeenCalledWith({ messages: [] }, 'tab-1');
    expect(stalePanel.isConnected).toBe(false);
    expect(runtime.backgroundTaskInlineEls.has('stale-anchor')).toBe(false);
    expect(runtime.backgroundTaskInlineEls.size).toBe(2);
    expect(anchorOneBody.lastElementChild).toBe(runtime.backgroundTaskInlineEls.get('anchor-1') ?? null);
    expect(anchorTwoBody.lastElementChild).toBe(runtime.backgroundTaskInlineEls.get('anchor-2') ?? null);
    expect(runtime.backgroundTaskIndicatorEl).toBe(runtime.backgroundTaskInlineEls.get('anchor-2'));
    expect(runtime.backgroundTaskInlineEls.get('anchor-1')?.querySelector('.opencodian-chat-notice-title')?.textContent)
      .toBe('Preparing');
    expect(runtime.backgroundTaskInlineEls.get('anchor-2')?.querySelector('.opencodian-chat-notice-meta')?.textContent)
      .toBe('1/1');
    expect(runtime.backgroundTaskInlineEls.get('anchor-2')?.querySelector('.opencodian-chat-notice-icon svg')?.getAttribute('data-icon'))
      .toBe('loader');
    expect(renderMarkdownInto).toHaveBeenNthCalledWith(
      1,
      expect.any(HTMLElement),
      'Preparing body',
    );
    expect(renderMarkdownInto).toHaveBeenNthCalledWith(
      2,
      expect.any(HTMLElement),
      'Running body',
    );
    expect(renderMarkdownInto).toHaveBeenNthCalledWith(
      3,
      expect.any(HTMLElement),
      '- Search docs',
    );
  });

  it('clears mounted inline panels for the target tab', () => {
    const {
      renderer,
      runtime,
    } = createHarness();

    const existingPanel = document.body.createDiv({ cls: 'opencodian-background-task-inline' });
    runtime.backgroundTaskIndicatorEl = existingPanel;
    runtime.backgroundTaskInlineEls.set('anchor-1', existingPanel);

    renderer.clear('tab-1');

    expect(existingPanel.isConnected).toBe(false);
    expect(runtime.backgroundTaskIndicatorEl).toBeNull();
    expect(runtime.backgroundTaskInlineEls.size).toBe(0);
  });
});
