import { App, Modal } from 'obsidian';

import type { ContextBreakdownSegment, Conversation, TabContextState } from '../../../core/types';
import { getLocale, t } from '../../../i18n';
import { ContextUsageService } from '../services/ContextUsageService';

export interface ContextRawMessageItem {
  id: string;
  role: string;
  createdAt: number | null;
  payload: string;
}

export class ContextDetailModal extends Modal {
  private isClosed = false;
  private static readonly MODAL_CLASS = 'opencodian-context-detail-modal';
  private static readonly CONTENT_CLASS = 'opencodian-context-detail-modal-content';

  constructor(
    app: App,
    options: {
      conversation: Conversation | null;
      contextState: TabContextState | null;
      systemPrompt?: string | null;
      rawMessageLoader?: () => Promise<ContextRawMessageItem[]>;
    },
  ) {
    super(app);
    this.conversation = options.conversation;
    this.contextState = options.contextState;
    this.systemPrompt = options.systemPrompt;
    this.rawMessageLoader = options.rawMessageLoader;
  }

  private readonly conversation: Conversation | null;
  private readonly contextState: TabContextState | null;
  private readonly systemPrompt?: string | null;
  private readonly rawMessageLoader?: () => Promise<ContextRawMessageItem[]>;

  onOpen(): void {
    this.isClosed = false;
    this.modalEl.addClass(ContextDetailModal.MODAL_CLASS);
    this.contentEl.addClass(ContextDetailModal.CONTENT_CLASS);
    const { contentEl } = this;
    const summary = ContextUsageService.summarize(this.contextState);
    const tokens = ContextUsageService.getDisplayTokenBreakdown(this.contextState);
    const breakdown = ContextUsageService.getContextBreakdown(
      this.contextState,
      this.conversation?.messages ?? [],
      this.systemPrompt,
    );
    const createdAt = this.contextState?.createdAt ?? this.conversation?.createdAt ?? null;
    const updatedAt = this.contextState?.updatedAt ?? this.conversation?.updatedAt ?? null;

    contentEl.empty();
    contentEl.createEl('h2', { text: t('context.usage.title') });

    if (summary.isUnavailable) {
      contentEl.createDiv({
        cls: 'opencodian-context-modal-empty',
        text: t('context.usage.noData'),
      });
      return;
    }

    const gridEl = contentEl.createDiv({ cls: 'opencodian-context-modal-grid' });
    const messageCount = this.conversation?.messages.length ?? 0;
    const userMessageCount = this.conversation?.messages.filter((message) => message.role === 'user').length ?? 0;
    const assistantMessageCount = this.conversation?.messages.filter((message) => message.role === 'assistant').length ?? 0;
    const sessionTitle = this.conversation?.title
      || this.contextState?.sessionTitle
      || t('chat.history.untitled');

    this.renderRow(gridEl, t('context.usage.session'), sessionTitle);
    this.renderRow(
      gridEl,
      t('context.usage.provider'),
      this.contextState?.providerName ?? this.contextState?.provider ?? '-',
    );
    this.renderRow(
      gridEl,
      t('context.usage.model'),
      this.contextState?.modelName ?? this.contextState?.model ?? '-',
    );
    this.renderRow(gridEl, t('context.usage.messages'), ContextUsageService.formatNumber(messageCount));
    this.renderRow(gridEl, t('context.usage.userMessages'), ContextUsageService.formatNumber(userMessageCount));
    this.renderRow(gridEl, t('context.usage.assistantMessages'), ContextUsageService.formatNumber(assistantMessageCount));
    this.renderRow(gridEl, t('context.usage.totalTokens'), ContextUsageService.formatNumber(tokens.total));
    this.renderRow(gridEl, t('context.usage.usage'), `${summary.percentage}%`);
    if (summary.isCompacting) {
      this.renderRow(gridEl, t('context.usage.status'), t('context.usage.compacting'));
    }
    this.renderRow(gridEl, t('context.usage.contextLimit'), ContextUsageService.formatNumber(summary.contextWindow));
    this.renderRow(
      gridEl,
      t('context.usage.inputTokens'),
      ContextUsageService.formatNumber(tokens.input),
    );
    this.renderRow(
      gridEl,
      t('context.usage.outputTokens'),
      ContextUsageService.formatNumber(tokens.output),
    );
    this.renderRow(
      gridEl,
      t('context.usage.reasoningTokens'),
      ContextUsageService.formatNumber(tokens.reasoning),
    );
    this.renderRow(
      gridEl,
      t('context.usage.cacheTokens'),
      `${ContextUsageService.formatNumber(tokens.cacheRead)} / ${ContextUsageService.formatNumber(tokens.cacheWrite)}`,
    );
    this.renderRow(
      gridEl,
      t('context.usage.cost'),
      ContextUsageService.formatCurrency(this.contextState?.totalCost),
    );
    this.renderRow(
      gridEl,
      t('context.usage.createdAt'),
      this.formatTimestamp(createdAt),
    );
    this.renderRow(
      gridEl,
      t('context.usage.lastActivity'),
      this.formatTimestamp(updatedAt),
    );

    if (breakdown.length > 0) {
      this.renderBreakdown(contentEl, breakdown);
    }

    const rawMessagesSectionEl = contentEl.createDiv({ cls: 'opencodian-context-raw-messages' });
    rawMessagesSectionEl.createDiv({
      cls: 'opencodian-context-raw-messages-title',
      text: t('context.rawMessages.title'),
    });
    const rawMessagesBodyEl = rawMessagesSectionEl.createDiv({
      cls: 'opencodian-context-raw-messages-body',
    });
    rawMessagesBodyEl.createDiv({
      cls: 'opencodian-context-raw-messages-state is-loading',
      text: t('context.rawMessages.loading'),
    });
    void this.loadRawMessages(rawMessagesBodyEl);

    if (!this.contextState?.preciseTokens) {
      contentEl.createDiv({
        cls: 'opencodian-context-modal-note',
        text: t('context.usage.estimated'),
      });
    }

    contentEl.createDiv({
      cls: 'opencodian-context-modal-note',
      text: t('context.breakdown.note'),
    });
  }

  onClose(): void {
    this.isClosed = true;
    this.contentEl.empty();
    this.contentEl.removeClass(ContextDetailModal.CONTENT_CLASS);
    this.modalEl.removeClass(ContextDetailModal.MODAL_CLASS);
  }

  private renderRow(containerEl: HTMLElement, label: string, value: string): void {
    const rowEl = containerEl.createDiv({ cls: 'opencodian-context-modal-row' });
    rowEl.createDiv({ cls: 'opencodian-context-modal-label', text: label });
    rowEl.createDiv({ cls: 'opencodian-context-modal-value', text: value });
  }

  private renderBreakdown(containerEl: HTMLElement, segments: ContextBreakdownSegment[]): void {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-context-breakdown' });
    sectionEl.createDiv({
      cls: 'opencodian-context-breakdown-title',
      text: t('context.breakdown.title'),
    });

    const barEl = sectionEl.createDiv({ cls: 'opencodian-context-breakdown-bar' });
    for (const segment of segments) {
      const segmentEl = barEl.createDiv({
        cls: `opencodian-context-breakdown-segment is-${segment.key}`,
      });
      segmentEl.style.width = `${segment.width}%`;
      segmentEl.setAttribute(
        'aria-label',
        `${this.getBreakdownLabel(segment.key)} ${ContextUsageService.formatPercent(segment.percent, 1)}`,
      );
      segmentEl.setAttribute(
        'title',
        `${this.getBreakdownLabel(segment.key)}: ${ContextUsageService.formatPercent(segment.percent, 1)} (${ContextUsageService.formatNumber(segment.tokens)})`,
      );
    }

    const legendEl = sectionEl.createDiv({ cls: 'opencodian-context-breakdown-legend' });
    for (const segment of segments) {
      const itemEl = legendEl.createDiv({ cls: 'opencodian-context-breakdown-item' });
      itemEl.createDiv({
        cls: `opencodian-context-breakdown-swatch is-${segment.key}`,
      });
      itemEl.createDiv({
        cls: 'opencodian-context-breakdown-name',
        text: this.getBreakdownLabel(segment.key),
      });
      itemEl.createDiv({
        cls: 'opencodian-context-breakdown-percent',
        text: ContextUsageService.formatPercent(segment.percent, 1),
      });
      itemEl.createDiv({
        cls: 'opencodian-context-breakdown-tokens',
        text: ContextUsageService.formatNumber(segment.tokens),
      });
    }
  }

  private async loadRawMessages(containerEl: HTMLElement): Promise<void> {
    if (!this.rawMessageLoader) {
      this.renderRawMessageState(containerEl, 'empty');
      return;
    }

    try {
      const items = await this.rawMessageLoader();
      if (this.isClosed) {
        return;
      }

      if (items.length === 0) {
        this.renderRawMessageState(containerEl, 'empty');
        return;
      }

      this.renderRawMessages(containerEl, items);
    } catch {
      if (this.isClosed) {
        return;
      }
      this.renderRawMessageState(containerEl, 'error');
    }
  }

  private renderRawMessages(containerEl: HTMLElement, items: ContextRawMessageItem[]): void {
    containerEl.empty();

    for (const item of items) {
      const detailsEl = containerEl.createEl('details', {
        cls: 'opencodian-context-raw-message',
      });
      const summaryEl = detailsEl.createEl('summary', {
        cls: 'opencodian-context-raw-message-summary',
      });
      summaryEl.createDiv({
        cls: 'opencodian-context-raw-message-summary-main',
        text: `${item.role} • ${item.id}`,
      });
      summaryEl.createDiv({
        cls: 'opencodian-context-raw-message-summary-time',
        text: this.formatTimestamp(item.createdAt),
      });

      const contentEl = detailsEl.createDiv({
        cls: 'opencodian-context-raw-message-content',
      });
      const preEl = contentEl.createEl('pre', {
        cls: 'opencodian-context-raw-message-pre',
      });
      preEl.createEl('code', {
        cls: 'opencodian-context-raw-message-code',
        text: item.payload,
      });
    }
  }

  private renderRawMessageState(containerEl: HTMLElement, state: 'empty' | 'error'): void {
    containerEl.empty();
    containerEl.createDiv({
      cls: `opencodian-context-raw-messages-state is-${state}`,
      text: t(state === 'empty' ? 'context.rawMessages.empty' : 'context.rawMessages.error'),
    });
  }

  private getBreakdownLabel(key: ContextBreakdownSegment['key']): string {
    return t(`context.breakdown.${key}` as const);
  }

  private formatTimestamp(value: number | null): string {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
      return '-';
    }

    const locale = getLocale() === 'zh' ? 'zh-CN' : 'en-US';
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value));
    } catch {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    }
  }
}
