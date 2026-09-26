import { setIcon } from 'obsidian';

import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import type {
  BackgroundTaskSegment,
  BackgroundTaskTimelineService,
} from '../services/BackgroundTaskTimelineService';
import type { TabId } from '../tabs';

type BackgroundTaskInlineTimelinePort = Pick<
  BackgroundTaskTimelineService,
  'collectInlineSegments' | 'getInlineCopy'
>;

const NATIVE_TASK_STATUS_ICONS: Record<string, string> = {
  running: 'loader',
  completed: 'circle-check',
  cancelled: 'circle-slash',
  stopped: 'circle-slash',
  failed: 'circle-x',
  interrupted: 'circle-alert',
};

function nativeTaskStatusLabel(status: string): string {
  switch (status) {
    case 'running': return t('chat.zcode.backgroundTask.running');
    case 'completed': return t('chat.zcode.backgroundTask.completed');
    case 'cancelled': return t('chat.zcode.backgroundTask.cancelled');
    case 'stopped': return t('chat.zcode.backgroundTask.stopped');
    case 'failed': return t('chat.zcode.backgroundTask.failed');
    case 'interrupted': return t('chat.zcode.backgroundTask.interrupted');
    default: return t('chat.zcode.backgroundTask.unknown');
  }
}

export interface BackgroundTaskInlinePanelRuntimeState {
  backgroundTaskIndicatorEl: HTMLElement | null;
  backgroundTaskInlineEls: Map<string, HTMLElement>;
  turnBodyByAnchorKey: Map<string, HTMLElement>;
  backgroundTaskActiveAnchorKey: string | null;
}

export interface BackgroundTaskInlinePanelRenderOptions {
  /** Captured pane/conversation lease for async markdown work. */
  isCurrent?: () => boolean;
}

export interface BackgroundTaskInlinePanelRendererHost {
  getActiveTabId(): TabId | null;
  getConversationForTab?(tabId: TabId): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskInlinePanelRuntimeState | null;
  renderMarkdownInto(container: HTMLElement, markdown: string): Promise<void>;
  getMessagesContainer(tabId: TabId | null): HTMLElement | null;
  readZCodeTasks(sessionId: string): Promise<Array<{ taskId: string; status: string; description: string; cancellable: boolean }>>;
  cancelZCodeTask(sessionId: string, taskId: string): Promise<boolean>;
}

export class BackgroundTaskInlinePanelRenderer {
  private readonly renderGenerationByRuntime = new WeakMap<object, number>();
  private readonly panelGenerationByElement = new WeakMap<HTMLElement, number>();
  private readonly nativeTaskTimers = new Map<TabId, number>();
  private readonly nativeTaskReads = new Set<TabId>();
  private disposed = false;

  constructor(
    private readonly timelineService: BackgroundTaskInlineTimelinePort,
    private readonly host: BackgroundTaskInlinePanelRendererHost,
  ) {}

  clear(tabId: TabId | null = this.host.getActiveTabId()): void {
    if (tabId) {
      const timer = this.nativeTaskTimers.get(tabId);
      if (timer !== undefined) window.clearInterval(timer);
      this.nativeTaskTimers.delete(tabId);
      this.host.getMessagesContainer(tabId)?.querySelector('.opencodian-zcode-native-tasks')?.remove();
    }
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    this.renderGenerationByRuntime.set(
      runtime,
      (this.renderGenerationByRuntime.get(runtime) ?? 0) + 1,
    );
    runtime.backgroundTaskIndicatorEl?.remove();
    runtime.backgroundTaskIndicatorEl = null;
    for (const element of runtime.backgroundTaskInlineEls.values()) {
      element.remove();
    }
    runtime.backgroundTaskInlineEls.clear();
  }

  private discardPanel(
    anchorKey: string,
    runtime: BackgroundTaskInlinePanelRuntimeState,
    panelEl: HTMLElement,
    renderGeneration: number,
  ): void {
    if (this.panelGenerationByElement.get(panelEl) !== renderGeneration) {
      return;
    }
    if (runtime.backgroundTaskInlineEls.get(anchorKey) === panelEl) {
      runtime.backgroundTaskInlineEls.delete(anchorKey);
    }
    if (runtime.backgroundTaskIndicatorEl === panelEl) {
      runtime.backgroundTaskIndicatorEl = null;
    }
    panelEl.remove();
  }

  async render(
    conversation: Conversation | null = null,
    tabId: TabId | null = this.host.getActiveTabId(),
    options: BackgroundTaskInlinePanelRenderOptions = {},
  ): Promise<void> {
    if (options.isCurrent && !options.isCurrent()) {
      return;
    }
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }
    const renderGeneration = (this.renderGenerationByRuntime.get(runtime) ?? 0) + 1;
    this.renderGenerationByRuntime.set(runtime, renderGeneration);
    const isRenderCurrent = (): boolean =>
      (!options.isCurrent || options.isCurrent())
      && this.renderGenerationByRuntime.get(runtime) === renderGeneration;

    const segments = this.timelineService.collectInlineSegments(conversation, tabId);
    const activeKeys = new Set(segments.map((segment) => segment.anchorKey));

    for (const [anchorKey, element] of runtime.backgroundTaskInlineEls.entries()) {
      if (!isRenderCurrent()) {
        return;
      }
      if (activeKeys.has(anchorKey)) {
        continue;
      }

      element.remove();
      runtime.backgroundTaskInlineEls.delete(anchorKey);
      if (runtime.backgroundTaskIndicatorEl === element) {
        runtime.backgroundTaskIndicatorEl = null;
      }
    }

    for (const segment of segments) {
      await this.renderSegment(segment, runtime, renderGeneration, isRenderCurrent);
      if (!isRenderCurrent()) {
        return;
      }
    }
    await this.renderNativeTasks(conversation, tabId);
  }

  /** Start native task readback when a ZCode conversation becomes active. */
  async watchNativeTasks(conversation: Conversation | null, tabId: TabId | null): Promise<void> {
    await this.renderNativeTasks(conversation, tabId);
  }

  disposeNativeTaskWatch(): void {
    this.disposed = true;
    for (const timer of this.nativeTaskTimers.values()) window.clearInterval(timer);
    this.nativeTaskTimers.clear();
  }

  private async renderNativeTasks(conversation: Conversation | null, tabId: TabId | null): Promise<void> {
    if (!tabId || this.disposed || this.nativeTaskReads.has(tabId)) return;
    this.nativeTaskReads.add(tabId);
    try {
      await this.readAndRenderNativeTasks(
        this.host.getConversationForTab ? this.host.getConversationForTab(tabId) : conversation,
        tabId,
      );
    } finally {
      this.nativeTaskReads.delete(tabId);
    }
  }

  private async readAndRenderNativeTasks(conversation: Conversation | null, tabId: TabId): Promise<void> {
    const oldTimer = this.nativeTaskTimers.get(tabId);
    if (oldTimer !== undefined) window.clearInterval(oldTimer);
    this.nativeTaskTimers.delete(tabId);
    const container = this.host.getMessagesContainer(tabId);
    const oldPanel = container?.querySelector<HTMLElement>('.opencodian-zcode-native-tasks');
    const sessionId = conversation?.backend === 'zcode' ? conversation.backendSessionId : null;
    if (!container || !sessionId) {
      oldPanel?.remove();
      return;
    }
    let tasks: Awaited<ReturnType<BackgroundTaskInlinePanelRendererHost['readZCodeTasks']>>;
    try {
      tasks = await this.host.readZCodeTasks(sessionId);
    } catch {
      tasks = [...(oldPanel?.querySelectorAll<HTMLElement>('[data-task-id]') ?? [])].map((row) => ({
        taskId: row.dataset.taskId ?? '',
        status: row.dataset.taskStatus === 'running' ? 'interrupted' : row.dataset.taskStatus ?? 'unknown',
        description: row.dataset.taskDescription ?? '',
        cancellable: false,
      }));
    }
    if (this.disposed) return;
    const currentConversation = this.host.getConversationForTab?.(tabId);
    if (this.host.getConversationForTab && currentConversation?.backendSessionId !== sessionId) {
      this.scheduleNativeTaskRefresh(currentConversation ?? null, tabId);
      return;
    }
    oldPanel?.remove();
    if (tasks.length === 0) {
      this.scheduleNativeTaskRefresh(conversation, tabId);
      return;
    }
    const panel = container.createDiv({ cls: 'opencodian-zcode-native-tasks' });
    panel.dataset.sessionId = sessionId;
    for (const task of tasks) {
      const row = panel.createDiv({ cls: 'opencodian-chat-notice-card is-info is-background-task is-inline' });
      row.dataset.taskId = task.taskId;
      row.dataset.taskStatus = task.status;
      row.dataset.taskDescription = task.description;
      const status = nativeTaskStatusLabel(task.status);
      const iconEl = row.createDiv({ cls: 'opencodian-chat-notice-icon opencodian-zcode-task-icon' });
      iconEl.setAttribute('aria-hidden', 'true');
      setIcon(iconEl, NATIVE_TASK_STATUS_ICONS[task.status] ?? 'circle-help');
      const bodyEl = row.createDiv({ cls: 'opencodian-chat-notice-body opencodian-zcode-task-body' });
      const headerEl = bodyEl.createDiv({ cls: 'opencodian-zcode-task-header' });
      headerEl.createSpan({
        cls: 'opencodian-chat-notice-title opencodian-zcode-task-title',
        text: task.description || t('chat.backgroundTask.noDescription'),
      });
      headerEl.createSpan({ cls: 'opencodian-zcode-task-status', text: status });
      bodyEl.createEl('code', {
        cls: 'opencodian-zcode-task-id',
        text: task.taskId,
        attr: { title: task.taskId },
      });
      if (task.status === 'running' && task.cancellable) {
        const actionsEl = bodyEl.createDiv({ cls: 'opencodian-zcode-task-actions' });
        const cancel = actionsEl.createEl('button', {
          cls: 'opencodian-chat-notice-action-btn',
          text: t('chat.zcode.backgroundTask.cancel'),
          attr: { type: 'button' },
        });
        cancel.addEventListener('click', () => {
          cancel.disabled = true;
          void this.host.cancelZCodeTask(sessionId, task.taskId).catch(() => false).finally(() => {
            void this.renderNativeTasks(conversation, tabId);
          });
        });
      }
    }
    // A connection loss must keep a bounded retry alive: the same tab can
    // reconnect later and gain a native terminal readback for this task.
    this.scheduleNativeTaskRefresh(conversation, tabId);
  }

  private scheduleNativeTaskRefresh(conversation: Conversation | null, tabId: TabId): void {
    this.nativeTaskTimers.set(tabId, window.setInterval(() => {
      if (this.host.getActiveTabId() === tabId) {
        void this.renderNativeTasks(
          this.host.getConversationForTab ? this.host.getConversationForTab(tabId) : conversation,
          tabId,
        );
      }
    }, 3_000));
  }

  private async renderSegment(
    segment: BackgroundTaskSegment,
    runtime: BackgroundTaskInlinePanelRuntimeState,
    renderGeneration: number,
    isRenderCurrent: () => boolean,
  ): Promise<void> {
    if (!isRenderCurrent()) {
      return;
    }
    const parentEl = runtime.turnBodyByAnchorKey.get(segment.anchorKey);
    if (!parentEl?.isConnected) {
      return;
    }

    let panelEl = runtime.backgroundTaskInlineEls.get(segment.anchorKey);
    if (!panelEl || !panelEl.isConnected) {
      panelEl = parentEl.createDiv({
        cls: 'opencodian-background-task-inline',
      });
      panelEl.dataset.anchorKey = segment.anchorKey;
      runtime.backgroundTaskInlineEls.set(segment.anchorKey, panelEl);
    }
    this.panelGenerationByElement.set(panelEl, renderGeneration);

    if (panelEl.parentElement !== parentEl || panelEl !== parentEl.lastElementChild) {
      parentEl.appendChild(panelEl);
    }

    panelEl.empty();

    const cardEl = panelEl.createDiv({ cls: 'opencodian-chat-notice-card is-info is-background-task is-inline' });
    const iconEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-icon opencodian-chat-notice-icon--background-task' });
    setIcon(iconEl, 'loader');

    const bodyEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-body' });
    const copy = this.timelineService.getInlineCopy(segment);
    bodyEl.createDiv({
      cls: 'opencodian-chat-notice-title',
      text: copy.title,
    });

    const textEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-text' });
    await this.host.renderMarkdownInto(textEl, copy.body);

    if (!isRenderCurrent()) {
      this.discardPanel(segment.anchorKey, runtime, panelEl, renderGeneration);
      return;
    }

    if (copy.detail) {
      bodyEl.createDiv({
        cls: 'opencodian-chat-notice-meta',
        text: copy.detail,
      });
    }

    if (copy.tasksMarkdown) {
      const tasksEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-task-list' });
      await this.host.renderMarkdownInto(tasksEl, copy.tasksMarkdown);
      if (!isRenderCurrent()) {
        this.discardPanel(segment.anchorKey, runtime, panelEl, renderGeneration);
        return;
      }
    }

    if (runtime.backgroundTaskActiveAnchorKey === segment.anchorKey) {
      runtime.backgroundTaskIndicatorEl = panelEl;
    }
  }
}
