import type {
  ChatMessage,
  ContentBlock,
  ToolCallInfo,
} from '../../../core/types';
import { t } from '../../../i18n';
import {
  isInternalStructuredOutputTool,
  resolveToolExecutionStatus,
} from '../../../shared';
import type { MarkdownRenderService } from '../../../utils/markdown';
import {
  ThinkingBlockRenderer,
  ToolCallRenderer,
} from '../../../utils/streaming';
import type { TabId } from '../tabs';
import {
  AssistantErrorRenderer,
  type AssistantStreamErrorRenderOptions,
} from './AssistantErrorRenderer';
import { AssistantFooterRenderer } from './AssistantFooterRenderer';
import {
  type AssistantNoticeRenderHost,
  renderAssistantPlaceholderAsNotice,
  renderPersistedAssistantNotice,
} from './AssistantNoticeRenderer';
import {
  renderAssistantPlainTextFallbackContent,
} from './AssistantPlainTextFallbackRenderer';
import {
  AssistantShellRenderer,
  type AssistantShellRendererHost,
  type AssistantShellTimestampOptions,
} from './AssistantShellRenderer';
import {
  renderAssistantStructuredContent,
} from './AssistantStructuredContentRenderer';
import {
  buildQuestionResolutionCardRenderPlan,
} from './QuestionResolutionCardRenderer';
import type {
  SendPipelineShellPort,
  SendPipelineStreamElements,
} from './SendPipelineTypes';

export interface AssistantShellViewHostAdapterHost extends AssistantShellRendererHost {
  renderNoticeCard(container: HTMLElement, message: ChatMessage): Promise<void>;
  shouldRenderQuestionResolutionCards(): boolean;
  suppressActiveLayoutAutoScrollOnce(): void;
  openTaskToolSession(sessionId: string, toolCall?: Pick<ToolCallInfo, 'input'> | null): Promise<void>;
  getMarkdownService(): MarkdownRenderService | null;
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

  async renderMessageBody(content: HTMLElement, message: ChatMessage): Promise<void> {
    return this.renderAssistantMessageBody(content, message);
  }

  async renderPersistedAssistantMessage(options: {
    message: ChatMessage;
    tabId?: TabId | null;
  }): Promise<HTMLElement> {
    const { message, tabId } = options;
    if (message.displayStyle === 'notice') {
      return this.renderPersistedAssistantNoticeMessage({
        noticeMessage: message,
        tabId,
      });
    }

    const { messageEl, contentEl } = this.shellRenderer.createPersistedAssistantMessageElement({
      message,
      tabId,
    });

    await this.renderAssistantMessageBody(contentEl, message);
    this.footerRenderer.finalizePersistedFooter(messageEl, message);
    return messageEl;
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

  private async renderAssistantMessageBody(
    content: HTMLElement,
    message: ChatMessage,
  ): Promise<void> {
    if (message.summary && message.summaryKind === 'compaction') {
      const summaryMetaEl = content.createDiv({ cls: 'opencodian-omo-injection-header' });
      summaryMetaEl.createSpan({
        cls: 'opencodian-omo-injection-badge',
        text: t('chat.compaction.reportBadge'),
      });
    }

    const questionResolutionRenderPlan = buildQuestionResolutionCardRenderPlan({
      contentBlocks: message.contentBlocks,
      questionResolution: message.questionResolution,
      shouldRenderQuestionResolutionCard: this.host.shouldRenderQuestionResolutionCards(),
    });

    if (questionResolutionRenderPlan.hasContentBlocks) {
      await renderAssistantStructuredContent({
        containerEl: content,
        questionResolutionRenderPlan,
        renderContentBlock: async (containerEl, block) => {
          await this.renderContentBlock(containerEl, block);
        },
      });
    } else {
      await renderAssistantPlainTextFallbackContent({
        containerEl: content,
        messageContent: message.content,
        markdownService: this.host.getMarkdownService(),
        questionResolutionRenderPlan,
      });
    }
  }

  getAssistantBodySignature(message: ChatMessage): string {
    return JSON.stringify({
      displayStyle: message.displayStyle ?? null,
      summary: message.summary ?? null,
      content: message.content,
      omo: message.omo ?? null,
      questionResolution: message.questionResolution ? {
        requestId: message.questionResolution.request.id,
        status: message.questionResolution.status,
        answers: message.questionResolution.answers ?? null,
      } : null,
      contentBlocks: (message.contentBlocks ?? []).map((block) => ({
        type: block.type,
        text: block.text ?? null,
        thinking: block.thinking ?? null,
        durationSeconds: block.durationSeconds ?? null,
        toolId: block.toolId ?? null,
        toolName: block.toolName ?? null,
        toolKind: block.toolKind ?? null,
        toolInput: block.toolInput ?? null,
        toolMetadata: block.toolMetadata ?? null,
        toolStatus: block.toolStatus ?? null,
        toolResult: block.toolResult ?? null,
        toolResultVisibility: block.toolResultVisibility ?? null,
        subagentId: block.subagentId ?? null,
        subagentMode: block.subagentMode ?? null,
      })),
    });
  }

  private async renderContentBlock(container: HTMLElement, block: ContentBlock): Promise<void> {
    const markdownService = this.host.getMarkdownService();
    if (!markdownService) return;

    switch (block.type) {
      case 'thinking':
        if (block.thinking) {
          const thinkingRenderer = new ThinkingBlockRenderer(markdownService, {
            collapsedByDefault: true,
            showTimer: false,
            onCollapsibleToggle: () => this.host.suppressActiveLayoutAutoScrollOnce(),
          });
          thinkingRenderer.renderStored(container, block.thinking, block.durationSeconds);
        }
        break;

      case 'tool_use':
        if (isInternalStructuredOutputTool(block.toolName)) {
          break;
        }

        if (block.toolName && block.toolId) {
          const toolRenderer = new ToolCallRenderer({
            onCollapsibleToggle: () => this.host.suppressActiveLayoutAutoScrollOnce(),
            onOpenToolSession: (sessionId, toolCall) => {
              void this.host.openTaskToolSession(sessionId, toolCall);
            },
          });
          const toolCall: ToolCallInfo = {
            id: block.toolId,
            name: block.toolName,
            kind: block.toolKind,
            input: block.toolInput || {},
            toolMetadata: block.toolMetadata,
            status: this.getStoredToolStatus(block),
            result: block.toolResult,
            resultVisibility: block.toolResultVisibility,
          };
          toolRenderer.render(container, toolCall);
        }
        break;

      case 'tool_result':
        break;

      case 'text':
      default:
        if (block.text) {
          const textEl = container.createDiv({ cls: 'opencodian-message-text' });
          await markdownService.render(textEl, block.text);
        }
        break;
    }
  }

  private getStoredToolStatus(block: ContentBlock): ToolCallInfo['status'] {
    return resolveToolExecutionStatus({
      toolName: block.toolName,
      storedStatus: block.toolStatus,
      result: block.toolResult,
    });
  }
}
