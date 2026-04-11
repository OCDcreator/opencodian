import type { TabId } from '../tabs';

export interface StreamingInlineCardRuntimeState {
  streamingMessageEl: HTMLElement | null;
}

export interface StreamingInlineCardRendererHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): StreamingInlineCardRuntimeState | null;
  revealStreamingAssistantMessageElement(tabId: TabId | null): HTMLElement | null;
}

export class StreamingInlineCardRenderer {
  constructor(private readonly host: StreamingInlineCardRendererHost) {}

  createStreamingInlineCard(
    className: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): HTMLElement | null {
    const messageEl = this.host.getTabRuntimeState(tabId)?.streamingMessageEl ?? null;
    if (!messageEl) {
      return null;
    }

    const cardEl = document.createElement('div');
    cardEl.className = className;
    this.insertCard(messageEl, cardEl);
    this.host.revealStreamingAssistantMessageElement(tabId);
    return cardEl;
  }

  private insertCard(messageEl: HTMLElement, cardEl: HTMLElement): void {
    const lastToolCall = messageEl.querySelector('.streaming-tool-call:last-of-type');
    if (lastToolCall?.parentNode) {
      lastToolCall.parentNode.insertBefore(cardEl, lastToolCall.nextSibling);
      return;
    }

    const contentEl = messageEl.querySelector('.opencodian-message-content');
    if (contentEl) {
      contentEl.appendChild(cardEl);
      return;
    }

    messageEl.appendChild(cardEl);
  }
}
