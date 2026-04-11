import type { TabId } from '../tabs';
import type { SendPipelineStreamElements } from './SendPipelineTypes';

export interface AssistantShellRuntimeState {
  streamingMessageEl: HTMLElement | null;
  streamingContentEl: HTMLElement | null;
}

export interface AssistantShellRendererHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): AssistantShellRuntimeState | null;
  ensureTurnBody(tabId: TabId | null): HTMLElement | null;
  shouldAutoScroll(tabId: TabId | null): boolean;
  scheduleSettledScrollToBottomIfNeeded(shouldScroll: boolean, tabId: TabId | null): void;
  setStreamingAssistantMessageVisibility(
    messageEl: HTMLElement,
    visible: boolean,
    reason: string,
  ): void;
  initializeAssistantCopyButton(copyBtn: HTMLElement, content: string): void;
}

export interface AssistantShellTimestampOptions {
  messageEl: HTMLElement;
  timestamp: number;
  content?: string;
  modelId?: string;
  statusLabel?: string;
}

export class AssistantShellRenderer {
  constructor(private readonly host: AssistantShellRendererHost) {}

  createAssistantMessageElement(
    tabId: TabId | null = this.host.getActiveTabId(),
    hiddenUntilVisible = false,
  ): SendPipelineStreamElements {
    const messageEl = this.host.ensureTurnBody(tabId)?.createDiv({
      cls: 'opencodian-message opencodian-message--assistant is-streaming',
    });

    if (!messageEl) {
      const fallback = document.createElement('div');
      return { messageEl: fallback, contentEl: fallback };
    }

    const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    this.ensureAssistantTimestampRow(messageEl, true);
    this.host.setStreamingAssistantMessageVisibility(
      messageEl,
      !hiddenUntilVisible,
      hiddenUntilVisible ? 'create-streaming-shell-hidden' : 'create-streaming-shell-visible',
    );

    const runtime = this.host.getTabRuntimeState(tabId);
    if (runtime) {
      runtime.streamingMessageEl = messageEl;
      runtime.streamingContentEl = contentEl;
    }

    return { messageEl, contentEl };
  }

  revealStreamingAssistantMessageElement(tabId: TabId | null = this.host.getActiveTabId()): HTMLElement | null {
    const messageEl = this.host.getTabRuntimeState(tabId)?.streamingMessageEl ?? null;
    if (!messageEl) {
      return null;
    }

    const wasHidden = messageEl.hidden;
    this.host.setStreamingAssistantMessageVisibility(messageEl, true, 'reveal-streaming-shell');

    if (wasHidden && this.host.getActiveTabId() === tabId) {
      this.host.scheduleSettledScrollToBottomIfNeeded(this.host.shouldAutoScroll(tabId), tabId);
    }

    return messageEl;
  }

  addTimestampWithCopyButton(options: AssistantShellTimestampOptions): void {
    const {
      messageEl,
      timestamp,
      content,
      modelId,
      statusLabel,
    } = options;
    const timeRow = this.ensureAssistantTimestampRow(messageEl);
    const fragment = document.createDocumentFragment();

    const timeStr = new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const timeTextEl = document.createElement('span');
    timeTextEl.className = 'opencodian-message-time-text';
    timeTextEl.textContent = timeStr;
    fragment.appendChild(timeTextEl);

    if (modelId) {
      const modelEl = document.createElement('span');
      modelEl.className = 'opencodian-message-model-id';
      modelEl.textContent = `· ${modelId}`;
      fragment.appendChild(modelEl);
    }

    if (statusLabel) {
      const statusEl = document.createElement('span');
      statusEl.className = 'opencodian-message-time-status is-warning';
      statusEl.textContent = statusLabel;
      fragment.appendChild(statusEl);
    }
    if (content) {
      const copyBtn = document.createElement('span');
      copyBtn.className = 'opencodian-copy-btn-inline';
      this.host.initializeAssistantCopyButton(copyBtn, content);
      fragment.appendChild(copyBtn);
    }

    timeRow.replaceChildren(fragment);
    timeRow.classList.remove('is-pending');
    if (messageEl.classList.contains('is-streaming')) {
      messageEl.style.animation = 'none';
      messageEl.removeClass('is-streaming');
    }
    this.host.setStreamingAssistantMessageVisibility(messageEl, true, 'finalize-streaming-shell');
  }

  ensureAssistantTimestampRow(messageEl: HTMLElement, reserveSpace = false): HTMLElement {
    const existingRow = messageEl.querySelector('.opencodian-message-time-row');
    const timeRow = existingRow instanceof HTMLElement
      ? existingRow
      : messageEl.createDiv({ cls: 'opencodian-message-time-row' });

    timeRow.classList.toggle('is-pending', reserveSpace);
    return timeRow;
  }
}
