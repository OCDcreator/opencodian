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
    getMessagesContainer: () => document.body,
    readZCodeTasks: async () => [],
    cancelZCodeTask: async () => false,
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

// eslint-disable-next-line max-lines-per-function -- Renderer scenarios share the same DOM and timeline harness.
describe('BackgroundTaskInlinePanelRenderer', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('shows a native ZCode task and cancels the same taskId from its visible button', async () => {
    const tasks = [{ taskId: 'exec_original', status: 'running', description: 'Background Bash', cancellable: true }];
    const readZCodeTasks = jest.fn(async () => tasks);
    const cancelZCodeTask = jest.fn(async () => {
      tasks[0].status = 'cancelled';
      tasks[0].cancellable = false;
      return true;
    });
    const timeline = { collectInlineSegments: () => [], getInlineCopy: jest.fn() };
    const renderer = new BackgroundTaskInlinePanelRenderer(timeline as never, {
      getActiveTabId: () => 'tab-1',
      getTabRuntimeState: () => ({
        backgroundTaskIndicatorEl: null, backgroundTaskInlineEls: new Map(),
        turnBodyByAnchorKey: new Map(), backgroundTaskActiveAnchorKey: null,
      }),
      renderMarkdownInto: async () => {},
      getMessagesContainer: () => document.body,
      readZCodeTasks,
      cancelZCodeTask,
    });
    await renderer.render({ backend: 'zcode', backendSessionId: 'sess_original', messages: [] } as Conversation, 'tab-1');
    const row = document.body.querySelector<HTMLElement>('[data-task-id="exec_original"]');
    expect(row?.dataset.taskStatus).toBe('running');
    row?.querySelector('button')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(cancelZCodeTask).toHaveBeenCalledWith('sess_original', 'exec_original');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.querySelector<HTMLElement>('[data-task-id="exec_original"]')?.dataset.taskStatus).toBe('cancelled');
    renderer.clear('tab-1');
  });

  it('separates a native task title, status and long identity into readable card regions', async () => {
    const taskId = 'exec_c72450d0-2528-4cd3-93ce-cc0012d685a6';
    const tasks = [{ taskId, status: 'cancelled', description: 'Run delayed background task', cancellable: false }];
    const renderer = new BackgroundTaskInlinePanelRenderer({
      collectInlineSegments: () => [], getInlineCopy: jest.fn(),
    } as never, {
      getActiveTabId: () => 'tab-1', getTabRuntimeState: () => null,
      renderMarkdownInto: async () => {}, getMessagesContainer: () => document.body,
      readZCodeTasks: async () => tasks, cancelZCodeTask: async () => false,
    });
    await renderer.watchNativeTasks({ backend: 'zcode', backendSessionId: 'sess_card', messages: [] } as Conversation, 'tab-1');
    const card = document.body.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    expect(card?.querySelector('.opencodian-zcode-task-title')?.textContent).toBe('Run delayed background task');
    expect(card?.querySelector('.opencodian-zcode-task-status')?.textContent).toBe('Canceled');
    expect(card?.querySelector('.opencodian-zcode-task-id')?.textContent).toBe(taskId);
    expect(card?.querySelector('.opencodian-zcode-task-icon svg')).not.toBeNull();
    expect(card?.querySelector('button')).toBeNull();
    tasks[0].status = 'interrupted';
    await renderer.watchNativeTasks({ backend: 'zcode', backendSessionId: 'sess_card', messages: [] } as Conversation, 'tab-1');
    const interrupted = document.body.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    expect(interrupted?.querySelector('.opencodian-zcode-task-status')?.textContent)
      .toBe('Connection lost; status unconfirmed');
    expect(interrupted?.querySelector('button')).toBeNull();
    tasks[0].status = 'stopped';
    await renderer.watchNativeTasks({ backend: 'zcode', backendSessionId: 'sess_card', messages: [] } as Conversation, 'tab-1');
    expect(document.body.querySelector<HTMLElement>(`[data-task-id="${taskId}"] .opencodian-zcode-task-status`)?.textContent)
      .toBe('Stopped');
    renderer.disposeNativeTaskWatch();
  });

  it('discovers a task after an initially empty native read without manual rendering', async () => {
    jest.useFakeTimers();
    try {
      const jobs: Array<{ taskId: string; status: string; description: string; cancellable: boolean }> = [];
      const renderer = new BackgroundTaskInlinePanelRenderer({
        collectInlineSegments: () => [], getInlineCopy: jest.fn(),
      } as never, {
        getActiveTabId: () => 'tab-1',
        getTabRuntimeState: () => null,
        renderMarkdownInto: async () => {},
        getMessagesContainer: () => document.body,
        readZCodeTasks: async () => jobs,
        cancelZCodeTask: async () => false,
      });
      const conversation = { backend: 'zcode', backendSessionId: 'sess_watch', messages: [] } as Conversation;
      await renderer.watchNativeTasks(conversation, 'tab-1');
      expect(document.body.querySelector('[data-task-id]')).toBeNull();
      jobs.push({ taskId: 'exec_later', status: 'running', description: 'Later Bash', cancellable: true });
      await jest.advanceTimersByTimeAsync(3_000);
      expect(document.body.querySelector<HTMLElement>('[data-task-id="exec_later"]')?.dataset.taskStatus).toBe('running');
      renderer.clear('tab-1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries after connection loss and replaces an interrupted card with native readback', async () => {
    jest.useFakeTimers();
    try {
      const taskId = 'exec_reconnected';
      let connected = true;
      let status = 'running';
      const conversation = { backend: 'zcode', backendSessionId: 'sess_reconnected', messages: [] } as Conversation;
      const renderer = new BackgroundTaskInlinePanelRenderer({
        collectInlineSegments: () => [], getInlineCopy: jest.fn(),
      } as never, {
        getActiveTabId: () => 'tab-1', getConversationForTab: () => conversation,
        getTabRuntimeState: () => null,
        renderMarkdownInto: async () => {}, getMessagesContainer: () => document.body,
        readZCodeTasks: async () => {
          if (!connected) throw new Error('connection lost');
          return [{ taskId, status, description: 'Recovered Bash', cancellable: status === 'running' }];
        },
        cancelZCodeTask: async () => false,
      });
      await renderer.watchNativeTasks(conversation, 'tab-1');
      connected = false;
      await jest.advanceTimersByTimeAsync(3_000);
      expect(document.body.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)?.dataset.taskStatus).toBe('interrupted');
      connected = true;
      status = 'completed';
      await jest.advanceTimersByTimeAsync(3_000);
      expect(document.body.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)?.dataset.taskStatus).toBe('completed');
      renderer.clear('tab-1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps at most one native task read in flight for a tab', async () => {
    let release!: (jobs: Array<{ taskId: string; status: string; description: string; cancellable: boolean }>) => void;
    const pending = new Promise<Array<{ taskId: string; status: string; description: string; cancellable: boolean }>>((resolve) => {
      release = resolve;
    });
    const readZCodeTasks = jest.fn(() => pending);
    const renderer = new BackgroundTaskInlinePanelRenderer({
      collectInlineSegments: () => [], getInlineCopy: jest.fn(),
    } as never, {
      getActiveTabId: () => 'tab-1', getTabRuntimeState: () => null,
      renderMarkdownInto: async () => {}, getMessagesContainer: () => document.body,
      readZCodeTasks, cancelZCodeTask: async () => false,
    });
    const conversation = { backend: 'zcode', backendSessionId: 'sess_watch', messages: [] } as Conversation;
    const first = renderer.watchNativeTasks(conversation, 'tab-1');
    await renderer.watchNativeTasks(conversation, 'tab-1');
    expect(readZCodeTasks).toHaveBeenCalledTimes(1);
    release([]);
    await first;
    renderer.disposeNativeTaskWatch();
  });

  it('uses the tab-owned session when a late activation supplies another conversation', async () => {
    const tabA = document.body.createDiv();
    const tabB = document.body.createDiv();
    const conversationA = { backend: 'zcode', backendSessionId: 'sess_A', messages: [] } as Conversation;
    const conversationB = { backend: 'zcode', backendSessionId: 'sess_B', messages: [] } as Conversation;
    const readZCodeTasks = jest.fn(async (sessionId: string) => [{
      taskId: sessionId === 'sess_A' ? 'exec_A' : 'exec_B',
      status: 'running', description: sessionId, cancellable: true,
    }]);
    const renderer = new BackgroundTaskInlinePanelRenderer({
      collectInlineSegments: () => [], getInlineCopy: jest.fn(),
    } as never, {
      getActiveTabId: () => 'tab-A', getTabRuntimeState: () => null,
      renderMarkdownInto: async () => {},
      getMessagesContainer: (tabId) => tabId === 'tab-A' ? tabA : tabB,
      getConversationForTab: (tabId) => tabId === 'tab-A' ? conversationA : conversationB,
      readZCodeTasks, cancelZCodeTask: async () => false,
    });
    await renderer.watchNativeTasks(conversationB, 'tab-A');
    expect(readZCodeTasks).toHaveBeenCalledWith('sess_A');
    expect(tabA.querySelector('[data-task-id="exec_A"]')).not.toBeNull();
    expect(tabA.querySelector('[data-task-id="exec_B"]')).toBeNull();
    renderer.disposeNativeTaskWatch();
  });

  it('does not paint a native task read after the tab changes sessions', async () => {
    const container = document.body.createDiv();
    const conversationA = { backend: 'zcode', backendSessionId: 'sess_A', messages: [] } as Conversation;
    const conversationB = { backend: 'zcode', backendSessionId: 'sess_B', messages: [] } as Conversation;
    let current = conversationA;
    let release!: (tasks: Array<{ taskId: string; status: string; description: string; cancellable: boolean }>) => void;
    const firstRead = new Promise<Array<{ taskId: string; status: string; description: string; cancellable: boolean }>>((resolve) => {
      release = resolve;
    });
    const readZCodeTasks = jest.fn((sessionId: string) => sessionId === 'sess_A'
      ? firstRead
      : Promise.resolve([{ taskId: 'exec_B', status: 'running', description: 'B', cancellable: true }]));
    const renderer = new BackgroundTaskInlinePanelRenderer({
      collectInlineSegments: () => [], getInlineCopy: jest.fn(),
    } as never, {
      getActiveTabId: () => 'tab-1', getTabRuntimeState: () => null,
      getConversationForTab: () => current,
      renderMarkdownInto: async () => {}, getMessagesContainer: () => container,
      readZCodeTasks, cancelZCodeTask: async () => false,
    });
    const oldWatch = renderer.watchNativeTasks(conversationA, 'tab-1');
    current = conversationB;
    release([{ taskId: 'exec_A', status: 'running', description: 'A', cancellable: true }]);
    await oldWatch;
    expect(container.querySelector('[data-task-id="exec_A"]')).toBeNull();
    await renderer.watchNativeTasks(conversationA, 'tab-1');
    expect(readZCodeTasks).toHaveBeenLastCalledWith('sess_B');
    expect(container.querySelector('[data-task-id="exec_B"]')).not.toBeNull();
    renderer.disposeNativeTaskWatch();
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

  it('removes a panel created before body markdown when the lease expires during await', async () => {
    const {
      anchorOneBody,
      renderer,
      renderMarkdownInto,
      runtime,
    } = createHarness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let current = true;
    renderMarkdownInto.mockImplementationOnce(async (container: HTMLElement, markdown: string) => {
      container.setText(`markdown:${markdown}`);
      current = false;
      await gate;
    });

    const renderPromise = renderer.render(null, 'tab-1', { isCurrent: () => current });
    while (renderMarkdownInto.mock.calls.length < 1) {
      await Promise.resolve();
    }
    const panel = runtime.backgroundTaskInlineEls.get('anchor-1');
    expect(panel?.parentElement).toBe(anchorOneBody);
    expect(panel?.querySelector('.opencodian-chat-notice-text')).not.toBeNull();

    release();
    await renderPromise;

    expect(runtime.backgroundTaskInlineEls.has('anchor-1')).toBe(false);
    expect(panel?.isConnected).toBe(false);
  });

  it('removes a half-rendered panel when the lease expires during tasks markdown', async () => {
    const {
      renderer,
      renderMarkdownInto,
      runtime,
    } = createHarness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let callCount = 0;
    let current = true;
    renderMarkdownInto.mockImplementation(async (container: HTMLElement, markdown: string) => {
      callCount += 1;
      container.setText(`markdown:${markdown}`);
      if (callCount === 3) {
        current = false;
        await gate;
      }
    });

    const renderPromise = renderer.render(null, 'tab-1', { isCurrent: () => current });
    while (callCount < 3) {
      await Promise.resolve();
    }
    const panel = runtime.backgroundTaskInlineEls.get('anchor-2');
    expect(panel).toBeDefined();
    expect(panel?.isConnected).toBe(true);

    release();
    await renderPromise;

    expect(runtime.backgroundTaskInlineEls.has('anchor-2')).toBe(false);
    expect(panel?.isConnected).toBe(false);
  });

  it('does not let an older overlapping render discard the newer panel', async () => {
    const { renderer, renderMarkdownInto, runtime } = createHarness();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let callCount = 0;
    renderMarkdownInto.mockImplementation(async (container: HTMLElement, markdown: string) => {
      callCount += 1;
      container.setText(`markdown:${markdown}`);
      if (callCount === 1) {
        await firstGate;
      }
    });

    const first = renderer.render(null, 'tab-1', { isCurrent: () => true });
    while (callCount < 1) {
      await Promise.resolve();
    }
    const second = renderer.render(null, 'tab-1', { isCurrent: () => true });
    releaseFirst();
    await Promise.all([first, second]);

    const panel = runtime.backgroundTaskInlineEls.get('anchor-1');
    expect(panel?.isConnected).toBe(true);
    expect(panel?.querySelector('.opencodian-chat-notice-text')?.textContent).toBe(
      'markdown:Preparing body',
    );
  });
});
