import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
} from '../../../shared';
import type { ConversationHydrationOutcomePort } from '../runtime/ConversationHydrationOutcomeBridge';
import type {
  ConversationLoadRuntimeOptions,
  ConversationLoadRuntimePort,
} from '../runtime/ConversationLoadRuntimeBridge';
import type { ConversationTransitionPort } from '../runtime/ConversationTransitionBridge';
import type { TabConversationActivationBridge } from '../runtime/TabConversationActivationBridge';
import type { TabViewActivationBridge } from '../runtime/TabViewActivationBridge';
import type { TabData, TabId } from '../tabs';

export interface LoadConversationOptions {
  forceServerSync?: boolean;
  preserveScrollPosition?: boolean;
}

interface ConversationViewStateTabManager {
  getTab(tabId: TabId): TabData | null;
  getActiveTab(): TabData | null;
}

export interface ConversationViewStateHost {
  getTabManager(): ConversationViewStateTabManager | null;
}

export type TabConversationActivationPort = Pick<
  TabConversationActivationBridge,
  | 'applyEmptyTabActivation'
  | 'applyLoadedConversationActivation'
  | 'applyStreamingConversationActivation'
>;

export type TabViewActivationPort =
  Pick<
    TabViewActivationBridge,
    'applyActivationPreflight' | 'applyLoadedConversationHydrationTail'
  >;

interface ConversationViewStateServiceDependencies {
  host: ConversationViewStateHost;
  tabConversationActivationBridge: TabConversationActivationPort;
  tabViewActivationBridge: TabViewActivationPort;
  conversationHydrationOutcomeBridge: ConversationHydrationOutcomePort;
  conversationTransitionBridge: ConversationTransitionPort;
  conversationLoadRuntimeBridge: ConversationLoadRuntimePort;
}

const logger = createLogger('ConversationViewStateService');

export class ConversationViewStateService {
  private readonly host: ConversationViewStateHost;
  private readonly tabConversationActivationBridge: TabConversationActivationPort;
  private readonly tabViewActivationBridge: TabViewActivationPort;
  private readonly conversationHydrationOutcomeBridge: ConversationHydrationOutcomePort;
  private readonly conversationTransitionBridge: ConversationTransitionPort;
  private readonly conversationLoadRuntimeBridge: ConversationLoadRuntimePort;
  /**
   * Per-tab load generation. Every new `loadConversation` for a tab bumps the
   * tab's generation; a stale load checks its captured generation (and that
   * its target tab is still the active tab) after every await so it can never
   * activate, render, restore scroll, or run the hydration tail for a
   * conversation the user has already navigated away from.
   */
  private readonly loadGenerationByTab = new Map<TabId, number>();

  constructor({
    host,
    tabConversationActivationBridge,
    tabViewActivationBridge,
    conversationHydrationOutcomeBridge,
    conversationTransitionBridge,
    conversationLoadRuntimeBridge,
  }: ConversationViewStateServiceDependencies) {
    this.host = host;
    this.tabConversationActivationBridge = tabConversationActivationBridge;
    this.tabViewActivationBridge = tabViewActivationBridge;
    this.conversationHydrationOutcomeBridge = conversationHydrationOutcomeBridge;
    this.conversationTransitionBridge = conversationTransitionBridge;
    this.conversationLoadRuntimeBridge = conversationLoadRuntimeBridge;
  }

  async activateTab(tabId: TabId): Promise<void> {
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return;
    }

    const tab = tabManager.getTab(tabId);
    if (!tab) {
      return;
    }

    this.tabViewActivationBridge.applyActivationPreflight(tabId);

    if (tab.conversationId) {
      if (tab.isStreaming) {
        const streamingConversationId = tab.conversationId;
        const conversation = await this.conversationLoadRuntimeBridge.resolveConversation(
          streamingConversationId,
        );
        if (
          !conversation
          || tabManager.getActiveTab()?.id !== tabId
          || tabManager.getTab(tabId)?.conversationId !== streamingConversationId
        ) {
          // The user switched away while the streaming conversation resolved.
          return;
        }

        this.tabConversationActivationBridge.applyStreamingConversationActivation(
          tabId,
          conversation,
        );
        return;
      }

      await this.loadConversation(tab.conversationId, {
        preserveScrollPosition: true,
      });
      return;
    }

    this.tabConversationActivationBridge.applyEmptyTabActivation(tabId);
  }

  async loadConversation(
    id: string,
    options: LoadConversationOptions = {},
  ): Promise<void> {
    const tabManager = this.host.getTabManager();
    const requestTabId = tabManager?.getActiveTab()?.id ?? null;
    const generation = this.bumpLoadGeneration(requestTabId);
    const isCurrent = (expectedConversationId?: string) =>
      this.isConversationLoadCurrent(requestTabId, generation, expectedConversationId);

    const startedAt = getPerformanceTimestampMs();
    const stepSummaries: string[] = [];
    const measureStep = async <T>(step: string, operation: () => Promise<T> | T): Promise<T> => {
      const stepStartedAt = getPerformanceTimestampMs();
      try {
        return await Promise.resolve(operation());
      } finally {
        const elapsedMs = getPerformanceTimestampMs() - stepStartedAt;
        stepSummaries.push(`${step}=${formatDurationMs(elapsedMs)}`);
        logger.debug(`[conversation-load] ${step} completed in ${formatDurationMs(elapsedMs)}`, {
          conversationId: id,
        });
      }
    };

    await measureStep(
      'prepareLoadedConversationTransition',
      () => this.conversationTransitionBridge.prepareLoadedConversationTransition(id),
    );
    if (!isCurrent()) {
      return;
    }

    const conversation = await measureStep('resolveConversation', () => this.conversationLoadRuntimeBridge.resolveConversation(id, {
      reloadIfMissing: true,
    }));
    if (!conversation || !isCurrent()) {
      return;
    }

    const transitionContext = await measureStep(
      'captureLoadedConversationTransition',
      () => this.conversationTransitionBridge.captureLoadedConversationTransition(
        Boolean(options.preserveScrollPosition),
      ),
    );
    const { activeTabId } = transitionContext;
    if (!isCurrent() || (requestTabId !== null && activeTabId !== requestTabId)) {
      // The capture raced a tab switch; never activate into a tab we did not
      // pin at request time.
      return;
    }

    await measureStep('applyLoadedConversationActivation', () => {
      this.tabConversationActivationBridge.applyLoadedConversationActivation(
        activeTabId,
        conversation,
      );
    });
    await measureStep('beginLoadedConversationTransition', () => {
      this.conversationTransitionBridge.beginLoadedConversationTransition(transitionContext);
    });

    if (!this.isConversationLoadCurrent(requestTabId, generation, id)) {
      this.conversationTransitionBridge.abortLoadedConversationTransition(transitionContext);
      return;
    }

    try {
      const messages = await measureStep(
        'loadConversationMessages',
        () => this.conversationLoadRuntimeBridge.loadConversationMessages(
          conversation,
          activeTabId,
          this.buildConversationLoadRuntimeOptions(options),
        ),
      );
      if (!isCurrent(id)) {
        this.conversationTransitionBridge.abortLoadedConversationTransition(transitionContext);
        return;
      }
      await measureStep(
        'applyLoadedConversationOutcome',
        () => this.conversationHydrationOutcomeBridge.applyLoadedConversationOutcome(
          activeTabId,
          conversation,
          messages,
          { shouldContinueRender: isCurrent },
        ),
      );
      if (!isCurrent(id)) {
        this.conversationTransitionBridge.abortLoadedConversationTransition(transitionContext);
        return;
      }
      await measureStep('restoreLoadedConversationTransition', () => {
        this.conversationTransitionBridge.restoreLoadedConversationTransition(transitionContext);
      });
      if (!isCurrent(id)) {
        return;
      }
      await measureStep(
        'applyLoadedConversationHydrationTail',
        () => this.tabViewActivationBridge.applyLoadedConversationHydrationTail(),
      );
      logger.info(
        `[conversation-load] loaded ${id} (${messages.length} messages) in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)} | ${stepSummaries.join(', ')}`,
      );
    } finally {
      this.conversationTransitionBridge.endLoadedConversationTransition(transitionContext);
    }
  }

  private bumpLoadGeneration(tabId: TabId | null): number {
    if (!tabId) {
      return 0;
    }

    const nextGeneration = (this.loadGenerationByTab.get(tabId) ?? 0) + 1;
    this.loadGenerationByTab.set(tabId, nextGeneration);
    return nextGeneration;
  }

  private isConversationLoadCurrent(
    tabId: TabId | null,
    generation: number,
    expectedConversationId?: string,
  ): boolean {
    if (!tabId) {
      return true;
    }

    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return true;
    }

    if ((this.loadGenerationByTab.get(tabId) ?? 0) !== generation) {
      return false;
    }

    // A load pinned its target tab at request time; once the active tab moves
    // on, this load must never activate/render/restore into the new tab.
    if ((tabManager.getActiveTab()?.id ?? null) !== tabId) {
      return false;
    }

    return expectedConversationId === undefined
      || tabManager.getTab(tabId)?.conversationId === expectedConversationId;
  }

  private buildConversationLoadRuntimeOptions(
    options: LoadConversationOptions,
  ): ConversationLoadRuntimeOptions {
    return {
      forceServerSync: options.forceServerSync,
    };
  }
}
