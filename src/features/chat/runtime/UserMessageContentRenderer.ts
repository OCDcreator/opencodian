import type { ChatMessage, CompactionDividerMeta } from '../../../core/types';
import { t } from '../../../i18n';
import { type CollapsibleState,setupCollapsible } from '../rendering/collapsible';
import { openImagePreview } from '../ui/ImagePreviewOverlay';
import {
  applyUserMessageTextHighlightSpans,
  extractUserMessageTextHighlightSpans,
  prepareUserMessageMarkdownForDisplay,
} from '../userMessageDisplay';

export interface UserMessageContentRendererHost {
  getRenderUserMarkupAsCodeBlocks(): boolean;
  hasCompactionCapability(): boolean;
  renderMarkdownInto(container: HTMLElement, markdown: string): Promise<void>;
  scheduleActiveSettledScrollToBottomIfNeeded(): void;
  openContextAttachment(path: string): void;
}

export class UserMessageContentRenderer {
  constructor(private readonly host: UserMessageContentRendererHost) {}

  renderCompactionDivider(messageEl: HTMLElement, divider: CompactionDividerMeta): void {
    if (!this.host.hasCompactionCapability()) {
      return;
    }

    const lineEl = messageEl.createDiv({ cls: 'opencodian-compaction-divider-line' });

    if (divider.live) {
      messageEl.addClass('opencodian-compaction-divider--live');
      lineEl.textContent = t('chat.compaction.divider.live');
      return;
    }

    const badgeEl = lineEl.createSpan({ cls: 'opencodian-compaction-divider-badge' });
    badgeEl.textContent = divider.auto
      ? t('chat.compaction.divider.autoLabel')
      : t('chat.compaction.divider.manualLabel');

    lineEl.appendText(t('chat.compaction.divider.completed'));

    if (divider.overflow) {
      const overflowEl = lineEl.createSpan({ cls: 'opencodian-compaction-divider-badge is-overflow' });
      overflowEl.textContent = t('chat.compaction.divider.overflow');
    }
  }

  async renderUserMessageContent(container: HTMLElement, message: ChatMessage): Promise<string> {
    const visibleText = this.getVisibleUserMessageText(message);
    if (visibleText) {
      const textEl = container.createDiv({ cls: 'opencodian-message-text' });
      const renderUserMarkupAsCodeBlocks = this.host.getRenderUserMarkupAsCodeBlocks();
      const displayText = renderUserMarkupAsCodeBlocks
        ? prepareUserMessageMarkdownForDisplay(visibleText)
        : visibleText;
      await this.host.renderMarkdownInto(textEl, displayText);
      this.applyInlineInvocationHighlights(textEl, visibleText, message.parts);
      const collapseToggleEl = container.createEl('button');
      const collapsibleState: CollapsibleState = {
        isExpanded: false,
        isCollapsible: false,
      };
      setupCollapsible({
        wrapperEl: container,
        headerEl: collapseToggleEl,
        contentEl: textEl,
        state: collapsibleState,
        options: {
          showMoreLabel: t('chat.action.showMore'),
          showLessLabel: t('chat.action.showLess'),
        },
        onToggle: () => this.host.scheduleActiveSettledScrollToBottomIfNeeded(),
      });
    }

    if (message.images && message.images.length > 0) {
      this.renderUserMessageImages(container, message.images);
    }

    if (message.contextAttachments && message.contextAttachments.length > 0) {
      this.renderUserContextAttachments(container, message.contextAttachments);
    }

    if (message.omo?.kind === 'user-injection') {
      await this.renderOmoUserInjection(container, message);
    }

    return visibleText;
  }

  private applyInlineInvocationHighlights(
    textEl: HTMLElement,
    visibleText: string,
    parts: ChatMessage['parts'],
  ): void {
    applyUserMessageTextHighlightSpans(
      textEl,
      visibleText,
      extractUserMessageTextHighlightSpans(visibleText, parts),
    );
  }

  private renderUserMessageImages(
    container: HTMLElement,
    images: NonNullable<ChatMessage['images']>,
  ): void {
    const galleryEl = container.createDiv({ cls: 'opencodian-user-image-gallery' });

    for (const image of images) {
      const wrapperEl = galleryEl.createEl('button', {
        cls: 'opencodian-user-image-wrapper',
        attr: {
          type: 'button',
          'aria-label': t('chat.image.openPreview'),
        },
      });
      const src = `data:${image.mediaType};base64,${image.data}`;
      wrapperEl.createEl('img', {
        cls: 'opencodian-user-image-thumb',
        attr: {
          src,
          alt: image.filename ?? t('chat.image.untitledImage'),
        },
      });
      wrapperEl.addEventListener('click', () => {
        openImagePreview({
          src,
          alt: image.filename ?? t('chat.image.untitledImage'),
        });
      });
    }
  }

  private renderUserContextAttachments(
    container: HTMLElement,
    attachments: NonNullable<ChatMessage['contextAttachments']>,
  ): void {
    const listEl = container.createDiv({ cls: 'opencodian-user-context-list' });

    for (const attachment of attachments) {
      const openBtn = listEl.createEl('button', {
        cls: 'opencodian-user-context-chip opencodian-composer-context-chip is-attached',
        text: attachment.label,
        attr: {
          type: 'button',
          title: attachment.path,
          'aria-label': `${this.getContextKindLabel(attachment.kind)}: ${attachment.label}`,
        },
      });
      openBtn.dataset.contextKind = attachment.kind;
      if (attachment.kind === 'selection') {
        openBtn.addClass('is-selection');
      }
      openBtn.addEventListener('click', () => {
        this.host.openContextAttachment(attachment.path);
      });
    }
  }

  private async renderOmoUserInjection(container: HTMLElement, message: ChatMessage): Promise<void> {
    if (message.omo?.kind !== 'user-injection') {
      return;
    }

    const panelEl = container.createDiv({ cls: 'opencodian-omo-injection' });
    const headerEl = panelEl.createDiv({ cls: 'opencodian-omo-injection-header' });
    headerEl.createSpan({
      cls: 'opencodian-omo-injection-badge',
      text: this.getOmoModeBadgeLabel(message.omo.modeTag),
    });
    headerEl.createSpan({
      cls: 'opencodian-omo-injection-title',
      text: t('chat.omo.injected.title'),
    });

    const summaryEl = panelEl.createDiv({ cls: 'opencodian-omo-injection-summary' });
    await this.host.renderMarkdownInto(summaryEl, this.getOmoInjectionSummary(message));

    const rawWrapperEl = panelEl.createDiv({ cls: 'opencodian-omo-raw-block' });
    rawWrapperEl.createDiv({
      cls: 'opencodian-omo-raw-label',
      text: t('chat.omo.injected.rawLabel'),
    });
    const rawContentEl = rawWrapperEl.createEl('pre', {
      cls: 'opencodian-omo-raw-content',
      text: message.omo.injectedPrompt,
    });
    const rawToggleEl = rawWrapperEl.createEl('button');
    const rawState: CollapsibleState = {
      isExpanded: false,
      isCollapsible: false,
    };
    setupCollapsible({
      wrapperEl: rawWrapperEl,
      headerEl: rawToggleEl,
      contentEl: rawContentEl,
      state: rawState,
      options: {
        collapsedHeight: 96,
        showMoreLabel: t('chat.omo.injected.showRaw'),
        showLessLabel: t('chat.omo.injected.hideRaw'),
      },
      onToggle: () => this.host.scheduleActiveSettledScrollToBottomIfNeeded(),
    });
  }

  private getVisibleUserMessageText(message: ChatMessage): string {
    return message.omo?.kind === 'user-injection'
      ? message.omo.originalText
      : message.content;
  }

  private getContextKindLabel(kind: NonNullable<ChatMessage['contextAttachments']>[number]['kind']): string {
    switch (kind) {
      case 'current_note':
        return t('chat.context.kind.currentNote');
      case 'selection':
        return t('chat.context.kind.selection');
      default:
        return t('chat.context.kind.file');
    }
  }

  private getOmoModeBadgeLabel(modeTag: string): string {
    switch (modeTag) {
      case 'search-mode':
        return t('chat.omo.mode.search');
      case 'analyze-mode':
        return t('chat.omo.mode.analyze');
      default:
        return t('chat.omo.mode.custom');
    }
  }

  private getOmoInjectionSummary(message: ChatMessage): string {
    if (message.omo?.kind !== 'user-injection') {
      return '';
    }

    const headline = message.omo.headline || t('chat.omo.injected.defaultHeadline');
    return t('chat.omo.injected.summary', { headline });
  }
}
