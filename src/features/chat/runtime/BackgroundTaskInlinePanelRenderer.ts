import { setIcon } from 'obsidian';

import type { Conversation } from '../../../core/types';
import type {
  BackgroundTaskSegment,
  BackgroundTaskTimelineService,
} from '../services/BackgroundTaskTimelineService';
import type { TabId } from '../tabs';

type BackgroundTaskInlineTimelinePort = Pick<
  BackgroundTaskTimelineService,
  'collectInlineSegments' | 'getInlineCopy'
>;

export interface BackgroundTaskInlinePanelRuntimeState {
  backgroundTaskIndicatorEl: HTMLElement | null;
  backgroundTaskInlineEls: Map<string, HTMLElement>;
  turnBodyByAnchorKey: Map<string, HTMLElement>;
  backgroundTaskActiveAnchorKey: string | null;
}

export interface BackgroundTaskInlinePanelRendererHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskInlinePanelRuntimeState | null;
  renderMarkdownInto(container: HTMLElement, markdown: string): Promise<void>;
}

export class BackgroundTaskInlinePanelRenderer {
  constructor(
    private readonly timelineService: BackgroundTaskInlineTimelinePort,
    private readonly host: BackgroundTaskInlinePanelRendererHost,
  ) {}

  clear(tabId: TabId | null = this.host.getActiveTabId()): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.backgroundTaskIndicatorEl?.remove();
    runtime.backgroundTaskIndicatorEl = null;
    for (const element of runtime.backgroundTaskInlineEls.values()) {
      element.remove();
    }
    runtime.backgroundTaskInlineEls.clear();
  }

  async render(
    conversation: Conversation | null = null,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const segments = this.timelineService.collectInlineSegments(conversation, tabId);
    const activeKeys = new Set(segments.map((segment) => segment.anchorKey));

    for (const [anchorKey, element] of runtime.backgroundTaskInlineEls.entries()) {
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
      await this.renderSegment(segment, runtime);
    }
  }

  private async renderSegment(
    segment: BackgroundTaskSegment,
    runtime: BackgroundTaskInlinePanelRuntimeState,
  ): Promise<void> {
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

    if (copy.detail) {
      bodyEl.createDiv({
        cls: 'opencodian-chat-notice-meta',
        text: copy.detail,
      });
    }

    if (copy.tasksMarkdown) {
      const tasksEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-task-list' });
      await this.host.renderMarkdownInto(tasksEl, copy.tasksMarkdown);
    }

    if (runtime.backgroundTaskActiveAnchorKey === segment.anchorKey) {
      runtime.backgroundTaskIndicatorEl = panelEl;
    }
  }
}
