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
    await this.conversationTransitionBridge.prepareLoadedConversationTransition(id);

    const conversation = await this.conversationLoadRuntimeBridge.resolveConversation(id, {
      reloadIfMissing: true,
    });
    if (!conversation) {
      return;
    }

    const transitionContext = this.conversationTransitionBridge.captureLoadedConversationTransition(
      Boolean(options.preserveScrollPosition),
    );
    const { activeTabId } = transitionContext;

    this.tabConversationActivationBridge.applyLoadedConversationActivation(
      activeTabId,
      conversation,
    );
    this.conversationTransitionBridge.beginLoadedConversationTransition(transitionContext);

    try {
      const messages = await this.conversationLoadRuntimeBridge.loadConversationMessages(
        conversation,
        activeTabId,
        this.buildConversationLoadRuntimeOptions(options),
      );
      await this.conversationHydrationOutcomeBridge.applyLoadedConversationOutcome(
        activeTabId,
        conversation,
        messages,
      );
      this.conversationTransitionBridge.restoreLoadedConversationTransition(transitionContext);
      await this.tabViewActivationBridge.applyLoadedConversationHydrationTail();
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
