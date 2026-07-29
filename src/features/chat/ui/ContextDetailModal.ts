import { App, Modal } from 'obsidian';

import type { ContextBreakdownSegment, Conversation, TabContextState } from '../../../core/types';
import { getLocale, t } from '../../../i18n';
import { ContextUsageService } from '../services/ContextUsageService';
import {
  ContextCompactionActionController,
  type ContextDetailModalCompactionCoordinator,
} from './ContextCompactionActionController';

export interface ContextRawMessageItem {
  id: string;
  role: string;
  createdAt: number | null;
  payload: string;
}

export type { ContextDetailModalCompactionCoordinator } from './ContextCompactionActionController';

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
      compactionCoordinator?: ContextDetailModalCompactionCoordinator;
    },
  ) {
    super(app);
    this.conversation = options.conversation;
    this.contextState = options.contextState;
    this.systemPrompt = options.systemPrompt;
    this.rawMessageLoader = options.rawMessageLoader;
    this.compactionController = options.compactionCoordinator
      ? new ContextCompactionActionController(options.compactionCoordinator, () => this.isClosed)
      : undefined;
  }

  private readonly conversation: Conversation | null;
  private readonly contextState: TabContextState | null;
  private readonly systemPrompt?: string | null;
  private readonly rawMessageLoader?: () => Promise<ContextRawMessageItem[]>;
  private readonly compactionController?: ContextCompactionActionController;

  onOpen(): void {
    this.isClosed = false;
    this.compactionController?.dispose();
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
    const hasCumulativeTokens = this.hasCumulativeTokens();
    const currentContext = this.contextState?.openCodeCurrentContext;

    contentEl.empty();
    contentEl.createEl('h2', { text: t('context.usage.title') });

    if (summary.isUnavailable && !this.hasSessionDetails()) {
      contentEl.createDiv({
        cls: 'opencodian-context-modal-empty',
        text: t('context.usage.noData'),
      });
      this.compactionController?.render(contentEl);
      return;
    }

    this.renderUsageGrid(contentEl, {
      summary,
      tokens,
      hasCumulativeTokens,
      currentContext,
      createdAt,
      updatedAt,
    });

    if (breakdown.length > 0) {
      this.renderBreakdown(contentEl, breakdown);
    }

    this.renderRawMessagesSection(contentEl);

    if (!this.contextState?.preciseTokens && hasCumulativeTokens) {
      contentEl.createDiv({
        cls: 'opencodian-context-modal-note',
        text: t('context.usage.estimated'),
      });
    }

    contentEl.createDiv({
      cls: 'opencodian-context-modal-note',
      text: t('context.breakdown.note'),
    });
    this.compactionController?.render(contentEl);
  }

  onClose(): void {
    this.isClosed = true;
    this.contentEl.empty();
    this.contentEl.removeClass(ContextDetailModal.CONTENT_CLASS);
    this.modalEl.removeClass(ContextDetailModal.MODAL_CLASS);
    this.compactionController?.dispose();
  }

  private renderUsageGrid(
    contentEl: HTMLElement,
    options: {
      summary: ReturnType<typeof ContextUsageService.summarize>;
      tokens: ReturnType<typeof ContextUsageService.getDisplayTokenBreakdown>;
      hasCumulativeTokens: boolean;
      currentContext: TabContextState['openCodeCurrentContext'];
      createdAt: number | null;
      updatedAt: number | null;
    },
  ): void {
    const gridEl = contentEl.createDiv({ cls: 'opencodian-context-modal-grid' });
    const { currentContext, hasCumulativeTokens, summary, tokens } = options;
    const messageCounts = this.getMessageCounts();
    const identity = this.getContextIdentity(currentContext);
    const usageValues = this.getUsageValues(summary, tokens, hasCumulativeTokens);

    this.renderRow(gridEl, t('context.usage.session'), this.getSessionTitle());
    this.renderRow(gridEl, t('context.usage.provider'), identity.provider);
    this.renderRow(gridEl, t('context.usage.model'), identity.model);
    if (this.contextState?.costDetails?.endpoint) {
      this.renderRow(gridEl, t('context.usage.pricingEndpoint'), this.contextState.costDetails.endpoint);
    }
    this.renderRow(gridEl, t('context.usage.messages'), ContextUsageService.formatNumber(messageCounts.all));
    this.renderRow(gridEl, t('context.usage.userMessages'), ContextUsageService.formatNumber(messageCounts.user));
    this.renderRow(gridEl, t('context.usage.assistantMessages'), ContextUsageService.formatNumber(messageCounts.assistant));
    this.renderRow(gridEl, t('context.usage.totalTokens'), usageValues.total);
    this.renderRow(gridEl, t('context.usage.usage'), usageValues.usage);
    if (summary.isCompacting) {
      this.renderRow(gridEl, t('context.usage.status'), t('context.usage.compacting'));
    }
    this.renderRow(gridEl, t('context.usage.contextLimit'), usageValues.contextLimit);
    this.renderRow(gridEl, t('context.usage.inputTokens'), usageValues.input);
    this.renderRow(gridEl, t('context.usage.outputTokens'), usageValues.output);
    this.renderRow(gridEl, t('context.usage.reasoningTokens'), usageValues.reasoning);
    this.renderRow(gridEl, t('context.usage.cacheTokens'), usageValues.cache);
    this.renderRow(gridEl, t('context.usage.cost'), ContextUsageService.formatCurrency(this.contextState?.totalCost));
    this.renderRow(gridEl, t('context.usage.costSource'), this.formatCostDetails());
    this.renderRow(gridEl, t('context.usage.createdAt'), this.formatTimestamp(options.createdAt));
    this.renderRow(gridEl, t('context.usage.lastActivity'), this.formatTimestamp(options.updatedAt));
  }

  private renderRawMessagesSection(contentEl: HTMLElement): void {
    const sectionEl = contentEl.createDiv({ cls: 'opencodian-context-raw-messages' });
    sectionEl.createDiv({
      cls: 'opencodian-context-raw-messages-title',
      text: t('context.rawMessages.title'),
    });
    const bodyEl = sectionEl.createDiv({ cls: 'opencodian-context-raw-messages-body' });
    bodyEl.createDiv({
      cls: 'opencodian-context-raw-messages-state is-loading',
      text: t('context.rawMessages.loading'),
    });
    void this.loadRawMessages(bodyEl);
  }

  private getSessionTitle(): string {
    return this.conversation?.title
      || this.contextState?.sessionTitle
      || t('chat.history.untitled');
  }

  private getContextIdentity(
    currentContext: TabContextState['openCodeCurrentContext'],
  ): { provider: string; model: string } {
    if (currentContext !== undefined) {
      return {
        provider: currentContext?.providerName ?? currentContext?.providerId ?? '-',
        model: currentContext?.modelName ?? currentContext?.modelId ?? '-',
      };
    }

    return {
      provider: this.contextState?.providerName ?? this.contextState?.provider ?? '-',
      model: this.contextState?.modelName ?? this.contextState?.model ?? '-',
    };
  }

  private getMessageCounts(): { all: number; user: number; assistant: number } {
    const messages = this.conversation?.messages ?? [];
    return {
      all: messages.length,
      user: messages.filter((message) => message.role === 'user').length,
      assistant: messages.filter((message) => message.role === 'assistant').length,
    };
  }

  private getUsageValues(
    summary: ReturnType<typeof ContextUsageService.summarize>,
    tokens: ReturnType<typeof ContextUsageService.getDisplayTokenBreakdown>,
    hasCumulativeTokens: boolean,
  ): {
    total: string;
    usage: string;
    contextLimit: string;
    input: string;
    output: string;
    reasoning: string;
    cache: string;
  } {
    const currentUsage = summary.isUnavailable ? '-' : `${summary.percentage}%`;
    const contextLimit = summary.isUnavailable ? '-' : ContextUsageService.formatNumber(summary.contextWindow);
    return {
      total: this.formatCumulativeTokenCount(tokens.total, hasCumulativeTokens),
      usage: currentUsage,
      contextLimit,
      input: this.formatCumulativeTokenCount(tokens.input, hasCumulativeTokens),
      output: this.formatCumulativeTokenCount(tokens.output, hasCumulativeTokens),
      reasoning: this.formatCumulativeTokenCount(tokens.reasoning, hasCumulativeTokens),
      cache: hasCumulativeTokens
        ? `${ContextUsageService.formatNumber(tokens.cacheRead)} / ${this.formatOptionalTokenCount(tokens.cacheWrite)}`
        : '-',
    };
  }

  private renderRow(containerEl: HTMLElement, label: string, value: string): void {
    const rowEl = containerEl.createDiv({ cls: 'opencodian-context-modal-row' });
    rowEl.createDiv({ cls: 'opencodian-context-modal-label', text: label });
    rowEl.createDiv({ cls: 'opencodian-context-modal-value', text: value });
  }

  private formatOptionalTokenCount(value: number | null): string {
    return typeof value === 'number' ? ContextUsageService.formatNumber(value) : '-';
  }

  private formatCumulativeTokenCount(value: number, hasCumulativeTokens: boolean): string {
    return hasCumulativeTokens ? ContextUsageService.formatNumber(value) : '-';
  }

  private hasCumulativeTokens(): boolean {
    if (
      this.contextState?.openCodeCurrentContext !== undefined
      || this.contextState?.openCodeHasCumulativeTokens !== undefined
    ) {
      return this.contextState.openCodeHasCumulativeTokens === true;
    }

    return true;
  }

  private hasSessionDetails(): boolean {
    const isOpenCodeDualMetric = this.contextState?.openCodeCurrentContext !== undefined
      || this.contextState?.openCodeHasCumulativeTokens !== undefined;
    return isOpenCodeDualMetric && (
      this.hasCumulativeTokens()
      || typeof this.contextState?.totalCost === 'number'
    );
  }

  private formatCostDetails(): string {
    const details = this.contextState?.costDetails;
    if (!details || details.source === 'unavailable') {
      return t('context.usage.costUnavailable');
    }

    const source = details.source === 'backend-reported'
      ? t('context.usage.costSourceReported')
      : details.source === 'user-override'
        ? t('context.usage.costSourceOverride')
        : t('context.usage.costSourceModelsDev');
    const completeness = details.completeness === 'partial'
      ? t('context.usage.costPartial')
      : t('context.usage.costComplete');
    const tier = details.usesBaseTier ? t('context.usage.costBaseTier') : '';
    return [source, completeness, tier].filter(Boolean).join(' · ');
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
