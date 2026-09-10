import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import {
  type ContextUsageSnapshot,
  createEmptyTabContextState,
  getConversationBackendSessionId,
  type StreamChunk,
  type TabContextState,
} from '../../../core/types';
import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
  shouldEmitLogFingerprint,
} from '../../../shared';
import type { TabId } from '../tabs/types';
import type {
  ModelSelectorKnownModelInfo,
  ModelSelectorSelection,
} from '../ui/modelSelector/types';
import { ContextUsageService } from './ContextUsageService';

const logger = createLogger('ActiveTabContextUsageCoordinator');

interface ActiveTabContextUsageConversation {
  id: string;
  backend?: string;
  backendSessionId?: string;
  openCodeSessionId?: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastContextUsage?: ContextUsageSnapshot;
}

export type ForegroundCompactionAvailabilityStatus =
  | 'available'
  | 'unavailable'
  | 'invalid-thread'
  | 'busy';

export interface ForegroundCompactionAvailability {
  status: ForegroundCompactionAvailabilityStatus;
  threadId?: string;
}

export type ForegroundCompactionActionStatus =
  | 'verified'
  | 'unavailable'
  | 'invalid-thread'
  | 'busy'
  | 'failed'
  | 'malformed'
  | 'timed-out';

export interface ForegroundCompactionActionResult {
  status: ForegroundCompactionActionStatus | 'stale';
  acknowledged: boolean;
  runtimeVerified: boolean;
  started: boolean;
  completed: boolean;
  tokenUsageObserved: boolean;
  threadId?: string;
  errorReason?: string;
}

export interface ForegroundCompactionActionOptions {
  timeoutMs?: number;
  acknowledgementTimeoutMs?: number;
  /** Modal-owned target identity; prevents dispatching a newly active tab's thread. */
  expectedSessionId?: string;
  expectedThreadId?: string;
  expectedTabId?: TabId | null;
  onAccepted?: () => void;
}

export interface ForegroundCompactionControl {
  visible: boolean;
  tabId: TabId | null;
  sessionId: string | null;
  threadId: string | null;
  title: string | null;
  availability: ForegroundCompactionAvailability | null;
}

export interface ActiveTabContextUsageCoordinatorHost {
  hasActiveTab(): boolean;
  getCurrentConversation(): ActiveTabContextUsageConversation | null;
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ResolvedModelSelection;
  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null;
  getActiveTabContextUsage(): TabContextState | null;
  setActiveTabContextUsage(contextUsage: TabContextState): void;
  renderContextUsageIndicator(state: TabContextState | null): void;
  getSessionContextUsageSnapshot(sessionId: string): Promise<ContextUsageSnapshot | null>;
  hasTab(tabId: string): boolean;
  getTabContextUsage(tabId: TabId | null): TabContextState | null;
  setTabContextUsage(tabId: TabId | null, contextUsage: TabContextState): void;
  getActiveTabId(): TabId | null;
  openContextUsageDetailsModal(contextState: TabContextState | null): void;
  persistContextUsageSnapshot(tabId: TabId | null, snapshot: ContextUsageSnapshot): Promise<void>;
  /** Adds local cost provenance after a backend emits an authoritative token snapshot. */
  enrichContextUsageSnapshot?(snapshot: ContextUsageSnapshot, tabId?: TabId | null): ContextUsageSnapshot;
  onPricingCatalogUpdated?(listener: () => void): { dispose(): void } | undefined;
  getContextUsageTabIds?(): Array<TabId | null>;
  getForegroundCompactionAvailability(
    sessionId: string,
  ): ForegroundCompactionAvailability;
  compactForegroundThread(
    sessionId: string,
    options?: ForegroundCompactionActionOptions,
  ): Promise<ForegroundCompactionActionResult>;
}

export class ActiveTabContextUsageCoordinator {
  private pricingSubscription: { dispose(): void } | undefined;
  private readonly pricingListeners = new Set<(tabId: TabId | null, state: TabContextState) => void>();
  private readonly lastPersistedAtBySession = new Map<string, number>();
  private readonly pendingSnapshotsBySession = new Map<
    string,
    { tabId: TabId | null; snapshot: ContextUsageSnapshot; timer: number | null }
  >();

  constructor(private readonly host: ActiveTabContextUsageCoordinatorHost) {}

  connectPricingUpdates(): void {
    this.pricingSubscription?.dispose();
    this.pricingSubscription = this.host.onPricingCatalogUpdated?.(() => this.refreshUnavailableCosts());
    this.refreshUnavailableCosts();
  }

  onPricingUpdated(listener: (tabId: TabId | null, state: TabContextState) => void): { dispose(): void } {
    this.pricingListeners.add(listener);
    return { dispose: () => { this.pricingListeners.delete(listener); } };
  }

  dispose(): void {
    this.pricingSubscription?.dispose();
    this.pricingSubscription = undefined;
    this.pricingListeners.clear();
    for (const pending of this.pendingSnapshotsBySession.values()) {
      if (pending.timer !== null) window.clearTimeout(pending.timer);
      void this.host.persistContextUsageSnapshot(pending.tabId, pending.snapshot)
        .catch((error) => logger.warn('Final context snapshot persistence failed', error));
    }
    this.pendingSnapshotsBySession.clear();
    this.lastPersistedAtBySession.clear();
  }

  private refreshUnavailableCosts(): void {
    const tabIds = this.host.getContextUsageTabIds?.() ?? [this.host.getActiveTabId()];
    for (const tabId of tabIds) {
      const state = this.host.getTabContextUsage(tabId);
      if (!this.host.hasTab(tabId ?? '') || !state) continue;
      const enriched = this.priceSnapshotCost(tabId, state);
      // Price readiness must not change token truth or the conversation activity time.
      const next = enriched ? { ...state, totalCost: enriched.totalCost, costDetails: enriched.costDetails ?? null } : state;
      if (enriched) {
        this.commitTabState(tabId, next);
        this.scheduleSnapshotPersistence(tabId, enriched);
      }
      for (const listener of this.pricingListeners) {
        try { listener(tabId, next); } catch (error) { logger.warn('Pricing view update failed', error); }
      }
    }
  }

  priceSnapshotCost(tabId: TabId | null, state: TabContextState): ContextUsageSnapshot | null {
    if (typeof state.totalCost === 'number' || (!state.preciseTokens && !state.billingUsage)) return null;
    const snapshot = ContextUsageService.createUsageSnapshot(state);
    if (!snapshot) return null;
    const enriched = this.enrichSnapshot(snapshot, state, tabId);
    return typeof enriched.totalCost === 'number' ? enriched : null;
  }

  syncIdentity(): void {
    if (!this.host.hasActiveTab()) {
      this.host.renderContextUsageIndicator(null);
      return;
    }

    const conversation = this.host.getCurrentConversation();
    this.commitState(this.restorePersistedSnapshot(this.createIdentityState(conversation), conversation));
    this.refreshUnavailableCosts();
  }

  private createIdentityState(
    conversation: ActiveTabContextUsageConversation | null,
  ): TabContextState {
    const currentModel = this.host.getCurrentSessionModel();
    const resolution = this.host.getCurrentSessionModelResolution();
    const modelInfo = this.host.findKnownModelInfo(currentModel);
    return ContextUsageService.syncStateIdentity(
      this.getCurrentState(),
      {
        provider: currentModel?.provider ?? null,
        providerName:
          modelInfo?.providerName
          ?? resolution.providerName
          ?? currentModel?.provider
          ?? null,
        model: currentModel?.model ?? null,
        modelName:
          modelInfo?.modelName
          ?? resolution.modelName
          ?? currentModel?.model
          ?? null,
        contextWindow: modelInfo?.contextWindow ?? resolution.contextWindow,
      },
      {
        sessionId: conversation ? getConversationBackendSessionId(conversation) ?? null : null,
        sessionTitle: conversation?.title ?? null,
        createdAt: conversation?.createdAt ?? null,
        updatedAt: conversation?.updatedAt ?? null,
      },
    );

  }

  private restorePersistedSnapshot(
    identityState: TabContextState,
    conversation: ActiveTabContextUsageConversation | null,
  ): TabContextState {
    const restoredSnapshot = conversation?.lastContextUsage;
    return restoredSnapshot
      && !identityState.preciseTokens
      && restoredSnapshot.sessionId === (conversation ? getConversationBackendSessionId(conversation) ?? null : null)
      ? ContextUsageService.applyUsageSnapshot(identityState, restoredSnapshot)
      : identityState;
  }

  async refreshFromServer(): Promise<void> {
    const conversation = this.host.getCurrentConversation();
    const expectedConversationId = conversation?.id ?? null;
    const expectedSessionId = conversation ? getConversationBackendSessionId(conversation) ?? null : null;
    const expectedBackend = conversation?.backend ?? 'opencode';
    const startedAt = getPerformanceTimestampMs();
    let requestElapsedMs: number | null = null;
    const report = (outcome: string, snapshot?: ContextUsageSnapshot | null): void => {
      this.logRefreshFromServerOutcome({
        outcome, startedAt, conversationId: expectedConversationId,
        sessionId: expectedSessionId, requestElapsedMs, snapshot,
      });
    };
    if (
      !expectedConversationId
      || !expectedSessionId
      || !['opencode', 'claude-code', 'codex', 'pi'].includes(expectedBackend)
      || !this.host.hasActiveTab()
    ) {
      report('skipped');
      return;
    }

    const requestStartedAt = getPerformanceTimestampMs();
    const snapshot = await this.host.getSessionContextUsageSnapshot(expectedSessionId);
    requestElapsedMs = getPerformanceTimestampMs() - requestStartedAt;
    const currentConversation = this.host.getCurrentConversation();
    if (
      !snapshot
      || currentConversation?.id !== expectedConversationId
      || (currentConversation ? getConversationBackendSessionId(currentConversation) ?? null : null) !== expectedSessionId
      || !this.host.hasActiveTab()
    ) {
      report(snapshot ? 'stale' : 'empty', snapshot);
      return;
    }

    const enrichedSnapshot = this.enrichSnapshot(snapshot, this.getCurrentState());
    this.commitState(ContextUsageService.applyUsageSnapshot(this.getCurrentState(), enrichedSnapshot));
    report('committed', enrichedSnapshot);
  }

  private getCurrentState(): TabContextState {
    return this.host.getActiveTabContextUsage() ?? createEmptyTabContextState();
  }

  private commitState(contextUsage: TabContextState): void {
    this.host.setActiveTabContextUsage(contextUsage);
    this.host.renderContextUsageIndicator(contextUsage);
  }

  private commitTabState(tabId: TabId | null, state: TabContextState): void {
    this.host.setTabContextUsage(tabId, state);
    if (tabId === this.host.getActiveTabId()) this.host.renderContextUsageIndicator(state);
  }

  beginTabContextUsageStream(tabId: TabId | null): void {
    if (!this.host.hasTab(tabId ?? '')) {
      return;
    }

    const nextState = ContextUsageService.beginStream(
      this.host.getTabContextUsage(tabId) ?? createEmptyTabContextState(),
    );
    this.commitTabState(tabId, nextState);
  }

  completeTabContextUsageStream(tabId: TabId | null): void {
    if (!this.host.hasTab(tabId ?? '')) {
      return;
    }

    const nextState = ContextUsageService.completeStream(
      this.host.getTabContextUsage(tabId) ?? createEmptyTabContextState(),
    );
    this.commitTabState(tabId, nextState);
  }

  applyUsageChunkToTab(
    tabId: TabId | null,
    chunk: Extract<StreamChunk, { type: 'usage' }>,
  ): void {
    if (!this.host.hasTab(tabId ?? '')) {
      return;
    }

    let nextState = ContextUsageService.applyUsageChunk(
      this.host.getTabContextUsage(tabId) ?? createEmptyTabContextState(),
      chunk,
    );
    if (chunk.billingUsage) {
      nextState = ContextUsageService.applyBillingUsage(nextState, chunk.billingUsage);
      const usageSnapshot = ContextUsageService.createUsageSnapshot(nextState);
      if (usageSnapshot) {
        const estimatedSnapshot = this.enrichSnapshot(usageSnapshot, nextState, tabId);
        nextState = ContextUsageService.applyCostSnapshot(nextState, estimatedSnapshot);
        this.scheduleSnapshotPersistence(tabId, estimatedSnapshot);
      }
    }
    this.commitTabState(tabId, nextState);
  }

  applyContextUsageSnapshotToTab(
    tabId: TabId | null,
    snapshot: ContextUsageSnapshot,
  ): void {
    if (!this.host.hasTab(tabId ?? '')) {
      return;
    }

    const currentState = this.host.getTabContextUsage(tabId) ?? createEmptyTabContextState();
    const enrichedSnapshot = this.enrichSnapshot(snapshot, currentState, tabId);
    const nextState = ContextUsageService.applyUsageSnapshot(
      currentState,
      enrichedSnapshot,
    );
    this.commitTabState(tabId, nextState);
    this.scheduleSnapshotPersistence(tabId, enrichedSnapshot);
  }

  openContextUsageDetails(): void {
    this.refreshUnavailableCosts();
    const contextState = this.host.getActiveTabContextUsage() ?? null;
    this.host.openContextUsageDetailsModal(contextState);
  }

  getForegroundCompactionControl(): ForegroundCompactionControl {
    const conversation = this.host.getCurrentConversation();
    if (!this.host.hasActiveTab() || !conversation || (conversation.backend ?? 'opencode') !== 'codex') {
      return {
        visible: false,
        tabId: this.host.getActiveTabId(),
        sessionId: null,
        threadId: null,
        title: null,
        availability: null,
      };
    }

    const sessionId = getConversationBackendSessionId(conversation) ?? null;
    const availability = sessionId
      ? this.host.getForegroundCompactionAvailability(sessionId)
      : { status: 'invalid-thread' as const };
    return {
      visible: true,
      tabId: this.host.getActiveTabId(),
      sessionId,
      threadId: availability.threadId ?? null,
      title: conversation.title || null,
      availability,
    };
  }

  async compactForegroundThread(
    options: ForegroundCompactionActionOptions = {},
  ): Promise<ForegroundCompactionActionResult> {
    const expectedIdentity = this.captureForegroundCompactionIdentity();
    const control = this.getForegroundCompactionControl();
    if (
      (options.expectedSessionId !== undefined && options.expectedSessionId !== control.sessionId)
      || (options.expectedThreadId !== undefined && options.expectedThreadId !== control.threadId)
      || (options.expectedTabId !== undefined && options.expectedTabId !== control.tabId)
      || !this.isCurrentForegroundCompactionIdentity(expectedIdentity)
    ) {
      return {
        status: 'stale',
        acknowledged: false,
        runtimeVerified: false,
        started: false,
        completed: false,
        tokenUsageObserved: false,
        ...(options.expectedThreadId ? { threadId: options.expectedThreadId } : {}),
      };
    }
    if (!control.visible || !control.sessionId) {
      return this.createForegroundCompactionActionResult('invalid-thread');
    }
    if (control.availability && control.availability.status !== 'available') {
      return this.createForegroundCompactionActionResult(control.availability.status, {
        threadId: control.threadId ?? undefined,
      });
    }

    const result = await this.host.compactForegroundThread(control.sessionId, {
      timeoutMs: options.timeoutMs,
      acknowledgementTimeoutMs: options.acknowledgementTimeoutMs,
      onAccepted: () => {
        if (this.isCurrentForegroundCompactionIdentity(expectedIdentity)) {
          options.onAccepted?.();
        }
      },
    });
    if (!this.isCurrentForegroundCompactionIdentity(expectedIdentity)) {
      return { ...result, status: 'stale' };
    }

    if (result.status === 'verified' && result.runtimeVerified) {
      await this.refreshFromServer();
      if (!this.isCurrentForegroundCompactionIdentity(expectedIdentity)) {
        return { ...result, status: 'stale' };
      }
    }
    return result;
  }

  refreshContextUsageIndicator(): void {
    const state = this.host.getActiveTabContextUsage() ?? null;
    this.host.renderContextUsageIndicator(state);
  }

  private captureForegroundCompactionIdentity() {
    const conversation = this.host.getCurrentConversation();
    return {
      tabId: this.host.getActiveTabId(),
      conversationId: conversation?.id ?? null,
      sessionId: conversation ? getConversationBackendSessionId(conversation) ?? null : null,
      backend: conversation?.backend ?? 'opencode',
    };
  }

  private isCurrentForegroundCompactionIdentity(expected: ReturnType<ActiveTabContextUsageCoordinator['captureForegroundCompactionIdentity']>): boolean {
    if (!this.host.hasActiveTab() || this.host.getActiveTabId() !== expected.tabId) {
      return false;
    }
    const conversation = this.host.getCurrentConversation();
    return conversation?.id === expected.conversationId
      && (conversation.backend ?? 'opencode') === expected.backend
      && (conversation ? getConversationBackendSessionId(conversation) ?? null : null) === expected.sessionId;
  }

  private createForegroundCompactionActionResult(
    status: ForegroundCompactionActionStatus,
    details: Partial<Omit<ForegroundCompactionActionResult, 'status' | 'runtimeVerified'>> = {},
  ): ForegroundCompactionActionResult {
    return {
      status,
      acknowledged: details.acknowledged ?? false,
      runtimeVerified: false,
      started: details.started ?? false,
      completed: details.completed ?? false,
      tokenUsageObserved: details.tokenUsageObserved ?? false,
      ...(details.threadId ? { threadId: details.threadId } : {}),
      ...(details.errorReason ? { errorReason: details.errorReason } : {}),
    };
  }

  private scheduleSnapshotPersistence(tabId: TabId | null, snapshot: ContextUsageSnapshot): void {
    const sessionId = snapshot.sessionId;
    const existing = this.pendingSnapshotsBySession.get(sessionId);
    if (existing) {
      existing.tabId = tabId;
      existing.snapshot = snapshot;
      return;
    }

    const elapsed = Date.now() - (this.lastPersistedAtBySession.get(sessionId) ?? 0);
    const delay = Math.max(0, 1000 - elapsed);
    const pending = { tabId, snapshot, timer: null as number | null };
    pending.timer = window.setTimeout(() => {
      const latest = this.pendingSnapshotsBySession.get(sessionId);
      this.pendingSnapshotsBySession.delete(sessionId);
      if (!latest) {
        return;
      }
      this.lastPersistedAtBySession.set(sessionId, Date.now());
      void this.host.persistContextUsageSnapshot(latest.tabId, latest.snapshot);
    }, delay);
    this.pendingSnapshotsBySession.set(sessionId, pending);
  }

  private enrichSnapshot(
    snapshot: ContextUsageSnapshot,
    state?: TabContextState | null,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): ContextUsageSnapshot {
    const billingUsage = snapshot.billingUsage ?? state?.billingUsage;
    const enrichedInput = billingUsage ? { ...snapshot, billingUsage } : snapshot;
    return this.host.enrichContextUsageSnapshot?.(enrichedInput, tabId) ?? enrichedInput;
  }

  private logRefreshFromServerOutcome({
    outcome,
    startedAt,
    conversationId,
    sessionId,
    requestElapsedMs,
    snapshot,
  }: {
    outcome: string;
    startedAt: number;
    conversationId: string | null;
    sessionId: string | null;
    requestElapsedMs: number | null;
    snapshot?: ContextUsageSnapshot | null;
  }): void {
    const fingerprint = {
      outcome,
      conversationId,
      sessionId,
      updatedAt: snapshot?.updatedAt ?? null,
      compactingAt: snapshot?.compactingAt ?? null,
      inputTokens: snapshot?.inputTokens ?? null,
      outputTokens: snapshot?.outputTokens ?? null,
      reasoningTokens: snapshot?.reasoningTokens ?? null,
      cacheReadTokens: snapshot?.cacheReadTokens ?? null,
      cacheWriteTokens: snapshot?.cacheWriteTokens ?? null,
      totalTokens: snapshot?.totalTokens ?? null,
      totalCost: snapshot?.totalCost ?? null,
    };

    if (!shouldEmitLogFingerprint('context-usage.refreshFromServer', fingerprint)) {
      return;
    }

    logger.debug(
      `[context-usage] refreshFromServer ${outcome} in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)}`,
      {
        conversationId,
        sessionId,
        ...(requestElapsedMs === null ? {} : { request: formatDurationMs(requestElapsedMs) }),
      },
    );
  }
}
