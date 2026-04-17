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
}

export interface ConversationViewStateHost {
  getTabManager(): ConversationViewStateTabManager | null;
}

type TabConversationActivationPort = Pick<
  TabConversationActivationBridge,
  | 'applyEmptyTabActivation'
  | 'applyLoadedConversationActivation'
  | 'applyStreamingConversationActivation'
>;

type TabViewActivationPort =
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
        const conversation = await this.conversationLoadRuntimeBridge.resolveConversation(
          tab.conversationId,
        );
        if (!conversation) {
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

    const conversation = await measureStep('resolveConversation', () => this.conversationLoadRuntimeBridge.resolveConversation(id, {
      reloadIfMissing: true,
    }));
    if (!conversation) {
      return;
    }

    const transitionContext = await measureStep(
      'captureLoadedConversationTransition',
      () => this.conversationTransitionBridge.captureLoadedConversationTransition(
        Boolean(options.preserveScrollPosition),
      ),
    );
    const { activeTabId } = transitionContext;

    await measureStep('applyLoadedConversationActivation', () => {
      this.tabConversationActivationBridge.applyLoadedConversationActivation(
        activeTabId,
        conversation,
      );
    });
    await measureStep('beginLoadedConversationTransition', () => {
      this.conversationTransitionBridge.beginLoadedConversationTransition(transitionContext);
    });

    try {
      const messages = await measureStep(
        'loadConversationMessages',
        () => this.conversationLoadRuntimeBridge.loadConversationMessages(
          conversation,
          activeTabId,
          this.buildConversationLoadRuntimeOptions(options),
        ),
      );
      await measureStep(
        'applyLoadedConversationOutcome',
        () => this.conversationHydrationOutcomeBridge.applyLoadedConversationOutcome(
          activeTabId,
          conversation,
          messages,
        ),
      );
      await measureStep('restoreLoadedConversationTransition', () => {
        this.conversationTransitionBridge.restoreLoadedConversationTransition(transitionContext);
      });
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

  private buildConversationLoadRuntimeOptions(
    options: LoadConversationOptions,
  ): ConversationLoadRuntimeOptions {
    return {
      forceServerSync: options.forceServerSync,
    };
  }
}
