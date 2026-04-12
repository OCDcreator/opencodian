import {
  AssistantErrorRenderer,
  type AssistantStreamErrorRenderOptions,
} from './AssistantErrorRenderer';
import type { ChatMessage } from '../../../core/types';
import type { TabId } from '../tabs';
import { AssistantFooterRenderer } from './AssistantFooterRenderer';
import {
  type AssistantNoticeRenderHost,
  renderPersistedAssistantNotice,
  renderAssistantPlaceholderAsNotice,
} from './AssistantNoticeRenderer';
import {
  AssistantShellRenderer,
  type AssistantShellRendererHost,
  type AssistantShellTimestampOptions,
} from './AssistantShellRenderer';
import type {
  SendPipelineShellPort,
  SendPipelineStreamElements,
} from './SendPipelineTypes';

export interface AssistantShellViewHostAdapterHost extends AssistantShellRendererHost {
  renderNoticeCard(container: HTMLElement, message: ChatMessage): Promise<void>;
}

export class AssistantShellViewHostAdapter {
  private readonly shellRenderer: AssistantShellRenderer;
  private readonly footerRenderer: AssistantFooterRenderer;
  private readonly errorRenderer: AssistantErrorRenderer;

  constructor(private readonly host: AssistantShellViewHostAdapterHost) {
    this.shellRenderer = new AssistantShellRenderer(host);
    this.footerRenderer = new AssistantFooterRenderer(this.shellRenderer);
    this.errorRenderer = new AssistantErrorRenderer(this.footerRenderer);
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
    this.footerRenderer.finalizePersistedFooter(messageEl, message);
  }

  finalizeNoticeFooter(messageEl: HTMLElement, message: Pick<ChatMessage, 'timestamp' | 'modelId'>): void {
    this.footerRenderer.finalizeNoticeFooter(messageEl, message);
  }

  finalizePseudoStreamFooter(
    messageEl: HTMLElement,
    message: Pick<ChatMessage, 'content' | 'timestamp' | 'modelId'>,
  ): void {
    this.footerRenderer.finalizePseudoStreamFooter(messageEl, message);
  }

  async renderPersistedAssistantNoticeMessage(options: {
    noticeMessage: ChatMessage;
    tabId?: TabId | null;
  }): Promise<HTMLElement> {
    const { noticeMessage, tabId } = options;
    const { messageEl, contentEl } = this.shellRenderer.createPersistedAssistantMessageElement({
      message: noticeMessage,
      tabId,
      additionalClasses: ['opencodian-message--notice'],
    });

    await this.renderPersistedAssistantNotice({
      messageEl,
      contentEl,
      noticeMessage,
    });

    return messageEl;
  }

  renderStreamError(options: AssistantStreamErrorRenderOptions): void {
    this.errorRenderer.renderStreamError(options);
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
      finalizeNoticeFooter: (messageEl, message) => this.finalizeNoticeFooter(messageEl, message),
      renderNoticeCard: (container, message) => this.host.renderNoticeCard(container, message),
      setStreamingAssistantMessageVisibility: (messageEl, visible, reason) => {
        this.host.setStreamingAssistantMessageVisibility(messageEl, visible, reason);
      },
    };
  }

  private renderPersistedAssistantNotice(options: {
    messageEl: HTMLElement;
    contentEl: HTMLElement;
    noticeMessage: ChatMessage;
  }): Promise<void> {
    return renderPersistedAssistantNotice({
      host: this.createAssistantNoticeRenderHost(),
      ...options,
    });
  }
}
