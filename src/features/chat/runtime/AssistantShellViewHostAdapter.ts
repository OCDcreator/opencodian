import type { ChatMessage } from '../../../core/types';
import type { TabId } from '../tabs';
import {
  type AssistantNoticeRenderHost,
  renderAssistantPlaceholderAsNotice,
} from './AssistantNoticeRenderer';
import {
  AssistantShellRenderer,
  type AssistantShellRendererHost,
  type AssistantShellTimestampOptions,
} from './AssistantShellRenderer';
import { PersistedAssistantFooterFinalizer } from './PersistedAssistantFooterFinalizer';
import type {
  SendPipelineShellPort,
  SendPipelineStreamElements,
} from './SendPipelineTypes';

export interface AssistantShellViewHostAdapterHost extends AssistantShellRendererHost {
  renderNoticeCard(container: HTMLElement, message: ChatMessage): Promise<void>;
}

export class AssistantShellViewHostAdapter {
  private readonly shellRenderer: AssistantShellRenderer;
  private readonly persistedFooterFinalizer: PersistedAssistantFooterFinalizer;

  constructor(private readonly host: AssistantShellViewHostAdapterHost) {
    this.shellRenderer = new AssistantShellRenderer(host);
    this.persistedFooterFinalizer = new PersistedAssistantFooterFinalizer(this.shellRenderer);
  }

  createAssistantMessageElement(
    tabId: TabId | null = this.host.getActiveTabId(),
    hiddenUntilVisible = false,
  ): SendPipelineStreamElements {
    return this.shellRenderer.createAssistantMessageElement(tabId, hiddenUntilVisible);
  }

  revealStreamingAssistantMessageElement(tabId: TabId | null = this.host.getActiveTabId()): HTMLElement | null {
    return this.shellRenderer.revealStreamingAssistantMessageElement(tabId);
  }

  addTimestampWithCopyButton(options: AssistantShellTimestampOptions): void {
    this.shellRenderer.addTimestampWithCopyButton(options);
  }

  finalizePersistedFooter(messageEl: HTMLElement, message: ChatMessage): void {
    this.persistedFooterFinalizer.finalizeFooter(messageEl, message);
  }

  renderAssistantPlaceholderAsNotice(options: {
    messageEl: HTMLElement;
    noticeMessage: ChatMessage;
    reason?: string;
  }): Promise<void> {
    return renderAssistantPlaceholderAsNotice({
      host: this.createAssistantNoticeRenderHost(),
      ...options,
    });
  }

  createSendPipelineShellPort(): SendPipelineShellPort {
    return {
      createAssistantMessageElement: (tabId, hiddenUntilVisible) =>
        this.createAssistantMessageElement(tabId, hiddenUntilVisible),
      revealStreamingAssistantMessageElement: (tabId) =>
        this.revealStreamingAssistantMessageElement(tabId),
      renderAssistantPlaceholderAsNotice: (messageEl, noticeMessage, reason) =>
        this.renderAssistantPlaceholderAsNotice({ messageEl, noticeMessage, reason }),
      addTimestampWithCopyButton: (options) => this.addTimestampWithCopyButton(options),
    };
  }

  private createAssistantNoticeRenderHost(): AssistantNoticeRenderHost {
    return {
      addTimestampWithCopyButton: (options) => this.addTimestampWithCopyButton(options),
      renderNoticeCard: (container, message) => this.host.renderNoticeCard(container, message),
      setStreamingAssistantMessageVisibility: (messageEl, visible, reason) => {
        this.host.setStreamingAssistantMessageVisibility(messageEl, visible, reason);
      },
    };
  }
}
