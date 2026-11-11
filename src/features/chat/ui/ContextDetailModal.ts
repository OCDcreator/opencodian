import { App, Modal } from 'obsidian';

import type { ContextBreakdownSegment, ContextUsageSnapshot, Conversation, TabContextState } from '../../../core/types';
import { getLocale, t } from '../../../i18n';
import { ContextUsageService } from '../services/context/ContextUsageService';
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

/**
 * Structural ledger row supplied by the chat diagnostics coordinator (the
 * canonical shape lives in the DSH trace owner; this modal reads it
 * structurally, like ContextRawMessageItem). Metadata only — no raw prompt or
 * tool content ever reaches this surface.
 */
export interface ContextDshLedgerItem {
  timestamp: string;
  timeSource?: 'backend' | 'client';
  name: string;
  detail?: string;
  durationMs?: number;
  durationKind?: 'client-round-trip' | 'transport' | 'observed-tool-span';
  severity?: string;
}

export interface ContextDshLedger {
  entries: ContextDshLedgerItem[];
  /** True when the trace hit its capture budget and later events were not recorded. */
  limited?: boolean;
  timing: {
    lastTurnClientRoundTripMs?: number;
    observedTurnCount: number;
    eventCount: number;
    lastEventAt?: string;
  };
}

export type { ContextDetailModalCompactionCoordinator } from './ContextCompactionActionController';
type SnapshotCost = Pick<ContextUsageSnapshot, 'totalCost' | 'costDetails'>;

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
      /**
       * DSH-only ledger loader. The caller captures the backend session id at
       * open time and returns a function, so a later tab switch can never
       * bleed another session's events into this modal. Omitted for every
       * non-DSH backend; any read failure renders the honest empty state.
       */
      dshTraceLedgerLoader?: () => Promise<ContextDshLedger | null>;
      compactionCoordinator?: ContextDetailModalCompactionCoordinator;
      subscribeToPricingUpdates?: (listener: (state: TabContextState) => void) => { dispose(): void };
      priceSnapshotCost?: (state: TabContextState) => SnapshotCost | null;
    },
  ) {
    super(app);
    this.conversation = options.conversation;
    this.contextState = options.contextState;
    this.systemPrompt = options.systemPrompt;
    this.rawMessageLoader = options.rawMessageLoader;
    this.dshTraceLedgerLoader = options.dshTraceLedgerLoader;
    this.subscribeToPricingUpdates = options.subscribeToPricingUpdates;
    this.priceSnapshotCost = options.priceSnapshotCost;
    this.compactionController = options.compactionCoordinator
      ? new ContextCompactionActionController(options.compactionCoordinator, () => this.isClosed)
      : undefined;
  }

  private readonly conversation: Conversation | null;
  private contextState: TabContextState | null;
  private readonly subscribeToPricingUpdates?: (listener: (state: TabContextState) => void) => { dispose(): void };
  private pricingSubscription?: { dispose(): void };
  private readonly priceSnapshotCost?: (state: TabContextState) => SnapshotCost | null;
  private costValueEl: HTMLElement | null = null;
  private costSourceEl: HTMLElement | null = null;
  private readonly systemPrompt?: string | null;
  private readonly rawMessageLoader?: () => Promise<ContextRawMessageItem[]>;
  private readonly dshTraceLedgerLoader?: () => Promise<ContextDshLedger | null>;
  private readonly compactionController?: ContextCompactionActionController;

  onOpen(): void {
    this.isClosed = false;
    this.pricingSubscription?.dispose();
    this.pricingSubscription = this.subscribeToPricingUpdates?.((state) => {
      if (this.isClosed || !this.contextState || state.sessionId !== this.contextState.sessionId) return;
      const cost = this.priceSnapshotCost?.(this.contextState);
      if (!cost) return;
      this.contextState = { ...this.contextState, totalCost: cost.totalCost, costDetails: cost.costDetails ?? null };
      this.costValueEl?.setText(ContextUsageService.formatCurrency(cost.totalCost));
      this.costSourceEl?.setText(this.formatCostDetails());
    });
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

    // Never early-return past the DSH ledger section when a loader exists.
    if (summary.isUnavailable && !this.hasSessionDetails() && !this.dshTraceLedgerLoader) {
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

    if (this.dshTraceLedgerLoader) {
      this.renderDshLedgerSection(contentEl);
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
    this.pricingSubscription?.dispose();
    this.pricingSubscription = undefined;
    this.costValueEl = null;
    this.costSourceEl = null;
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
    this.costValueEl = this.renderRow(gridEl, t('context.usage.cost'), ContextUsageService.formatCurrency(this.contextState?.totalCost));
    this.costSourceEl = this.renderRow(gridEl, t('context.usage.costSource'), this.formatCostDetails());
    this.renderRow(gridEl, t('context.usage.createdAt'), this.formatTimestamp(options.createdAt));
    this.renderRow(gridEl, t('context.usage.lastActivity'), this.formatTimestamp(options.updatedAt));
  }

  /**
   * Renders the DSH event ledger section. The loader is captured for the
   * session open at modal-open time; the section fills in place with three
   * honest terminal states: failed/unreadable → "unavailable", valid but
   * empty → "empty", budget-limited → an extra "limited" note. Reuses the
   * raw-messages classes for styling.
   */
  private renderDshLedgerSection(contentEl: HTMLElement): void {
    const sectionEl = contentEl.createDiv({ cls: 'opencodian-context-raw-messages opencodian-context-dsh-ledger' });
    sectionEl.createDiv({
      cls: 'opencodian-context-raw-messages-title',
      text: t('context.dshLedger.title'),
    });
    const bodyEl = sectionEl.createDiv({ cls: 'opencodian-context-raw-messages-body' });
    bodyEl.createDiv({
      cls: 'opencodian-context-raw-messages-state is-loading',
      text: t('context.rawMessages.loading'),
    });
    void this.loadDshLedger(bodyEl);
  }

  private async loadDshLedger(containerEl: HTMLElement): Promise<void> {
    let ledger: ContextDshLedger | null = null;
    try {
      ledger = (await this.dshTraceLedgerLoader?.()) ?? null;
    } catch {
      ledger = null;
    }
    if (this.isClosed) return;
    this.renderDshLedger(containerEl, ledger);
  }

  private renderDshLedger(containerEl: HTMLElement, ledger: ContextDshLedger | null): void {
    containerEl.empty();
    if (ledger?.limited) {
      containerEl.createDiv({
        cls: 'opencodian-context-modal-note',
        text: t('context.dshLedger.limited'),
      });
    }
    if (!ledger || ledger.entries.length === 0) {
      // A null read means nothing could be read at all — not "no events yet".
      containerEl.createDiv({
        cls: 'opencodian-context-raw-messages-state is-empty',
        text: t(ledger ? 'context.dshLedger.empty' : 'context.dshLedger.unavailable'),
      });
      return;
    }
    const timingEl = containerEl.createDiv({ cls: 'opencodian-context-modal-grid opencodian-context-dsh-ledger-timing' });
    for (const [label, value] of [
      [t('context.dshLedger.timing.turns'), ContextUsageService.formatNumber(ledger.timing.observedTurnCount)],
      [t('context.dshLedger.timing.lastRoundTrip'), ledger.timing.lastTurnClientRoundTripMs !== undefined
        ? `${this.formatDuration(ledger.timing.lastTurnClientRoundTripMs)} · ${t('context.dshLedger.roundTrip')}`
        : '-'],
      [t('context.dshLedger.timing.lastEvent'), this.formatIsoTimestamp(ledger.timing.lastEventAt)],
    ]) this.renderRow(timingEl, label, value);
    for (const entry of ledger.entries) {
      this.createMessageContent(
        containerEl,
        `${this.formatIsoTimestamp(entry.timestamp)} · ${entry.name}`,
        this.describeLedgerEntry(entry),
        'opencodian-context-raw-message opencodian-context-dsh-ledger-row',
      ).createDiv({
        cls: 'opencodian-context-raw-message-pre',
        text: [entry.detail, this.durationText(entry), this.timeSourceText(entry)].filter(Boolean).join('\n') || '-',
      });
    }
    containerEl.createDiv({
      cls: 'opencodian-context-modal-note',
      text: t('context.dshLedger.note'),
    });
  }

  private describeLedgerEntry(entry: ContextDshLedgerItem): string {
    const parts = [entry.detail, this.durationText(entry)].filter(Boolean);
    return parts.join(' · ') || this.timeSourceText(entry) || '';
  }

  private durationText(entry: ContextDshLedgerItem): string {
    if (typeof entry.durationMs !== 'number' || !Number.isFinite(entry.durationMs)) return '';
    const kindLabel = entry.durationKind === 'observed-tool-span'
      ? t('context.dshLedger.toolSpan')
      : t('context.dshLedger.roundTrip');
    return `${this.formatDuration(entry.durationMs)} (${kindLabel})`;
  }

  private timeSourceText(entry: ContextDshLedgerItem): string {
    return entry.timeSource === 'backend' ? t('context.dshLedger.time.backend') : t('context.dshLedger.time.client');
  }

  private formatDuration(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`;
    return `${Math.round(value)}ms`;
  }

  private formatIsoTimestamp(value: string | undefined): string {
    if (!value) return '-';
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return value;
    return this.formatTimestamp(parsed);
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

    // ZCode's per-turn billing identity comes from the native model request.
    // The tab selector may already point at a different model for the next
    // turn, so it must not relabel the usage from the last completed turn.
    if (this.conversation?.backend === 'zcode' && this.contextState?.billingUsage?.modelId) {
      return {
        provider: this.contextState.billingUsage.providerId ?? '-',
        model: this.contextState.billingUsage.modelId,
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
    const hasBreakdown = hasCumulativeTokens && this.contextState?.tokenBreakdownAvailable !== false;
    return {
      total: this.formatCumulativeTokenCount(tokens.total, hasCumulativeTokens),
      usage: currentUsage,
      contextLimit,
      input: this.formatCumulativeTokenCount(tokens.input, hasBreakdown),
      output: this.formatCumulativeTokenCount(tokens.output, hasBreakdown),
      reasoning: this.formatCumulativeTokenCount(tokens.reasoning, hasBreakdown),
      cache: hasBreakdown
        ? `${ContextUsageService.formatNumber(tokens.cacheRead)} / ${this.formatOptionalTokenCount(tokens.cacheWrite)}`
        : '-',
    };
  }

  private renderRow(containerEl: HTMLElement, label: string, value: string): HTMLElement {
    const rowEl = containerEl.createDiv({ cls: 'opencodian-context-modal-row' });
    rowEl.createDiv({ cls: 'opencodian-context-modal-label', text: label });
    return rowEl.createDiv({ cls: 'opencodian-context-modal-value', text: value });
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
      if (this.isClosed) return;
      if (items.length === 0) this.renderRawMessageState(containerEl, 'empty');
      else this.renderRawMessages(containerEl, items);
    } catch {
      if (!this.isClosed) this.renderRawMessageState(containerEl, 'error');
    }
  }

  private renderRawMessages(containerEl: HTMLElement, items: ContextRawMessageItem[]): void {
    containerEl.empty();

    for (const item of items) {
      const preEl = this.createMessageContent(
        containerEl, `${item.role} • ${item.id}`, this.formatTimestamp(item.createdAt),
      ).createEl('pre', { cls: 'opencodian-context-raw-message-pre' });
      preEl.createEl('code', { cls: 'opencodian-context-raw-message-code', text: item.payload });
    }
  }

  private createMessageContent(
    containerEl: HTMLElement,
    mainText: string,
    timeText: string,
    rowClass = 'opencodian-context-raw-message',
  ): HTMLElement {
    const detailsEl = containerEl.createEl('details', { cls: rowClass });
    const summaryEl = detailsEl.createEl('summary', { cls: 'opencodian-context-raw-message-summary' });
    summaryEl.createDiv({ cls: 'opencodian-context-raw-message-summary-main', text: mainText });
    summaryEl.createDiv({ cls: 'opencodian-context-raw-message-summary-time', text: timeText });
    return detailsEl.createDiv({ cls: 'opencodian-context-raw-message-content' });
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
